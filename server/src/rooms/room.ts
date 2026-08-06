import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import {
  verifyGuess,
  verifyCountryTeamGuess,
  verifyLetterTeamGuess,
  searchClubs,
  commonPlayersDetailed,
  commonPlayersCountryTeam,
  commonPlayersLetterTeam,
  hasPlayersCountryTeam,
  hasPlayersLetterTeam,
  pickCountryForClub,
  pickClubForCountry,
  randomClub,
  botPickFromPool,
  searchPlayers,
  randomPlayer,
  verifyPlayerPlayerGuess,
  commonClubs,
  hasCommonClubs,
} from '../game/verify.ts';
import { applyMatchResult, getUser, saveMatchHistory, type MatchRound } from '../game/rank.ts';
import { awardMatchXp } from '../game/level.ts';
import { isEmote } from '../game/emotes.ts';
import { log } from '../logger.ts';
import type {
  ClientMsg,
  ServerMsg,
  PlayerView,
  RoomStatus,
  RoomView,
  ClubRef,
  PlayerRef,
  RoundResult,
  Scope,
  GameMode,
  PickRole,
} from '../protocol.ts';

const COUNTDOWN_FROM = 3;
const PICK_MS = 10_000;
const GUESS_MS = 30_000;
const MAX_PLAYERS = 2;
const WIN_TARGET = 3; // first to this many round wins takes the match
const MAX_WRONG = 3; // 3 wrong answers → opponent wins the match
const INTER_ROUND_MS = 5_000; // pause on the result screen before the next round auto-starts
const READY_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 12_000;

// A player's link to the outside world: a real WebSocket client, or a bot.
export interface Transport {
  send(msg: ServerMsg): void;
  readonly isBot: boolean;
}

interface Player {
  id: string;
  name: string;
  transport: Transport;
  score: number;
  wrongCount: number; // wrong answers this match
  isHost: boolean;
  connected: boolean;
  userId?: string; // persistent account id, for awarding trophies
  trophies?: number;
  arena?: { name: string; icon: string; minTrophies: number };
  avatar?: string | null; // chosen profile-picture id
  level?: number; // eşleşme kartındaki seviye rozeti
  frame?: string | null; // takılı profil çerçevesi
}

interface Round {
  picks: Map<string, ClubRef>;
  // For country-team / letter-team: the non-team pick value
  countryPick?: string;   // the nationality picked (country-team)
  letterPick?: string;    // the letter picked (letter-team)
  // For player-player: each player's footballer pick
  playerAPick?: { id: number; name: string; imageUrl: string | null };
  playerBPick?: { id: number; name: string; imageUrl: string | null };
  teamA?: ClubRef;
  teamB?: ClubRef;
  answeredBy?: string;
  passedBy?: Set<string>; // players who chose to pass this round
  finished: boolean;
}

export class Room {
  readonly code: string;
  scope: Scope = { type: 'all' }; // which clubs are allowed (set at creation)
  gameMode: GameMode = 'team-team'; // game mode (set at creation)
  // Yalnız hızlı eşleşme (find_match) odaları kupa + XP verir. Arkadaş daveti
  // ve oda-kodu maçları dostluk maçıdır: iki hesap anlaşıp hükmen galibiyetle
  // XP/elmas kasamasın diye bu odalarda hiçbir ödül yazılmaz.
  ranked = false;
  private players = new Map<string, Player>();
  status: RoomStatus = 'lobby';
  private round: Round | null = null;
  private roundNumber = 0; // tracks rounds for role alternation
  private timers: NodeJS.Timeout[] = [];
  private onEmpty: (code: string) => void;
  private matchOver = false; // true once a player reaches WIN_TARGET
  private rematchBy: string | null = null;
  private readyPlayers = new Set<string>();
  private matchRounds: MatchRound[] = [];
  private recentBotPicks: number[] = []; // last bot team ids (no-repeat within 10)
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  // Maç boyunca seçilmiş takımlar/ülkeler — bir kez seçilen bir daha seçilemez
  // (maç bitene kadar). İstemci bunları karartıp devre dışı bırakır; sunucu da
  // tekrar seçimi reddeder. Her maç başında sıfırlanır.
  private usedClubIds = new Set<number>();
  private usedCountries = new Set<string>();

  constructor(code: string, onEmpty: (code: string) => void) {
    this.code = code;
    this.onEmpty = onEmpty;
  }

  // ---- membership ----
  addPlayer(
    name: string,
    transport: Transport,
    asHost: boolean,
    userId?: string,
    trophies?: number,
    arena?: { name: string; icon: string; minTrophies: number },
    avatar?: string | null,
    level?: number,
    frame?: string | null,
  ): { ok: true; id: string } | { ok: false; error: string } {
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: 'Room is full' };
    const id = randomUUID();
    this.players.set(id, {
      id,
      name: name.trim() || 'Player',
      transport,
      score: 0,
      wrongCount: 0,
      isHost: asHost,
      connected: true,
      userId,
      trophies,
      arena,
      avatar: avatar ?? null,
      level,
      frame: frame ?? null,
    });
    this.broadcastState();
    return { ok: true, id };
  }

  // The club the OTHER (human) player has picked this round, if any — used so the
  // bot can prefer a pool team that crosses over with it.
  otherTeamPick(playerId: string): number | null {
    if (!this.round) return null;
    for (const [pid, club] of this.round.picks) {
      if (pid !== playerId) return Number(club.id);
    }
    return null;
  }

  // Bot'un VERİ-GÜDÜMLÜ ülke-takım seçimi için oda-içi durum erişimcileri: bot,
  // insanın bu turdaki seçimine UYUMLU (ortak-oyunculu) bir eş seçebilsin ve maç
  // boyu kullanılmışları dışlayabilsin diye. (Ülke seçimi tur-başına tek değerdir.)
  roundCountryPick(): string | null { return this.round?.countryPick ?? null; }
  usedCountriesList(): string[] { return [...this.usedCountries]; } // normalize (küçük harf)
  usedClubIdsList(): number[] { return [...this.usedClubIds]; }

  // Update a player's avatar mid-match (by persistent userId) and push fresh state
  // so the opponent sees the new profile picture instantly.
  setAvatarFor(userId: string, avatar: string | null): void {
    let changed = false;
    for (const p of this.players.values()) {
      if (p.userId === userId && p.avatar !== avatar) { p.avatar = avatar; changed = true; }
    }
    if (changed) this.broadcastState();
  }

  // Çerçeve değişimini maç ortasında rakibe anında yansıt (set_avatar ile aynı desen).
  setFrameFor(userId: string, frame: string | null): void {
    let changed = false;
    for (const p of this.players.values()) {
      if (p.userId === userId && p.frame !== frame) { p.frame = frame; changed = true; }
    }
    if (changed) this.broadcastState();
  }

  resumePlayer(userId: string, transport: Transport): { ok: true; id: string } | { ok: false; error: string } {
    for (const p of this.players.values()) {
      if (p.userId !== userId) continue;
      const timer = this.disconnectTimers.get(p.id);
      if (timer) clearTimeout(timer);
      this.disconnectTimers.delete(p.id);
      p.transport = transport;
      p.connected = true;
      this.broadcastState();
      return { ok: true, id: p.id };
    }
    return { ok: false, error: 'Maça geri dönülemedi' };
  }

  // Explicit, DELIBERATE exit (X button / background-forfeit): no reconnect
  // grace — the opponent must see the forfeit INSTANTLY ("anlık multiplayer").
  // The socket close that follows finds the player already gone (no-op).
  explicitLeave(playerId: string): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(playerId); }
    this.finalizeClose(playerId);
  }

  handleClose(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.status !== 'lobby' && !p.transport.isBot) {
      p.connected = false;
      this.broadcastState();
      const prev = this.disconnectTimers.get(playerId);
      if (prev) clearTimeout(prev);
      const timer = setTimeout(() => {
        this.disconnectTimers.delete(playerId);
        this.finalizeClose(playerId);
      }, RECONNECT_GRACE_MS);
      this.disconnectTimers.set(playerId, timer);
      log.warn('player_disconnect_grace', { room: this.code, playerId, userId: p.userId, status: this.status });
      return;
    }
    this.finalizeClose(playerId);
  }

  private finalizeClose(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.clearTimers();

    // Maç BİTTİYSE (matchOver) çıkış normal ayrılıştır — hükmen yolu yalnız
    // maç hâlâ sürerken çalışır. (Önceden: maç sonu ekranından çıkan herkes
    // "kaçtı" sayılıp kalan oyuncuya İKİNCİ bir galibiyet ödülü yazılıyordu.)
    const wasInMatch = this.status !== 'lobby' && !this.matchOver;
    const hasBot = p.transport.isBot || [...this.players.values()].some((pl) => pl.id !== playerId && pl.transport.isBot);

    this.players.delete(playerId);

    const humansLeft = [...this.players.values()].some((pl) => !pl.transport.isBot);
    if (this.players.size === 0 || !humansLeft) {
      this.players.clear();
      this.clearDisconnectTimers();
      this.onEmpty(this.code);
      return;
    }

    // If the player left during an active match (not lobby), the remaining
    // player wins 3-0 by forfeit and trophies are updated.
    if (wasInMatch && !hasBot) {
      const winner = [...this.players.values()][0]!;
      winner.score = WIN_TARGET;
      this.matchOver = true;
      this.status = 'result';
      this.broadcast({ type: 'opponent_left', forfeit: true });
      // Award trophies: winner wins, leaver loses. Yalnız dereceli maçta —
      // dostluk maçındaki hükmen sonuç görsel kalır, ödül yazılmaz.
      if (!this.ranked) { this.broadcastState(); return; }
      void (async () => {
        try {
          if (winner.userId) {
            const { profile, delta, arenaReward } = await applyMatchResult(winner.userId, true, { opponentTrophies: p.trophies ?? null });
            winner.transport.send({ type: 'trophy_update', trophies: profile.trophies, delta, arena: profile.arena, diamonds: profile.diamonds, arenaReward, winStreak: profile.winStreak, bestStreak: profile.bestStreak });
            const xpRes = await awardMatchXp(winner.userId, true, false);
            if (xpRes) winner.transport.send({ type: 'xp_update', ...xpRes });
          }
          if (p.userId) {
            // Terk eden mağlubiyeti: kalkan onu KORUMAZ (leaver bayrağı)
            const leaverRes = await applyMatchResult(p.userId, false, { leaver: true, opponentTrophies: winner.trophies ?? null });
            await awardMatchXp(p.userId, false, false); // ayrılan: mağlubiyet XP'si
            // Bilinçli çıkışta istemci soketi ~1.2sn açık tutar: kupa düşüşü
            // (delta<0) ana menüde animasyonla gösterilir. Soket kapandıysa
            // sessizce düşer — sonraki girişte profil zaten günceldir.
            try {
              p.transport.send({ type: 'trophy_update', trophies: leaverRes.profile.trophies, delta: leaverRes.delta, arena: leaverRes.profile.arena, diamonds: leaverRes.profile.diamonds, winStreak: leaverRes.profile.winStreak, bestStreak: leaverRes.profile.bestStreak });
            } catch { /* socket gone */ }
          }
        } catch { /* DB error — skip silently */ }
      })();
      this.broadcastState();
    } else {
      this.status = 'lobby';
      this.round = null;
      this.matchOver = false;
      this.rematchBy = null;
      this.broadcast({ type: 'opponent_left' });
      this.broadcastState();
    }
  }

  // ---- role assignment for non-team-team modes ----
  // Returns which role each player has this round. Roles swap every round.
  // Player order is stable (Map insertion order).
  private pickRoles(): Map<string, PickRole> {
    const ids = [...this.players.keys()];
    const roles = new Map<string, PickRole>();
    if (this.gameMode === 'team-team') {
      for (const id of ids) roles.set(id, 'team');
      return roles;
    }
    if (this.gameMode === 'player-player') {
      for (const id of ids) roles.set(id, 'player');
      return roles;
    }
    const nonTeamRole: PickRole = this.gameMode === 'country-team' ? 'country' : 'letter';
    // Even rounds: first player picks non-team, second picks team.
    // Odd rounds: swap.
    const firstPicksNonTeam = this.roundNumber % 2 === 0;
    roles.set(ids[0]!, firstPicksNonTeam ? nonTeamRole : 'team');
    roles.set(ids[1]!, firstPicksNonTeam ? 'team' : nonTeamRole);
    return roles;
  }

  // ---- message routing ----
  handle(playerId: string, msg: ClientMsg): void {
    switch (msg.type) {
      case 'start':
        return this.start(playerId);
      case 'pick_team':
        return this.handlePick(playerId, msg.clubId);
      case 'pick_country':
        return this.handlePickCountry(playerId, msg.country);
      case 'pick_letter':
        return this.handlePickLetter(playerId, msg.letter);
      case 'submit_guess':
        return this.handleGuess(playerId, msg.text);
      case 'pass':
        return this.handlePass(playerId);
      case 'ready':
        return this.handleReady(playerId);
      case 'play_again':
        return this.requestRematch(playerId);
      case 'rematch_response':
        return this.respondRematch(playerId, msg.accept);
      case 'send_emote':
        return this.relayEmote(playerId, msg.emoteId);
      case 'pick_player':
        return this.handlePickPlayer(playerId, msg.playerId);
      case 'search_players':
        return void this.handleSearchPlayers(playerId, msg.q);
      case 'search_clubs':
        return void this.handleSearch(playerId, msg.reqId, msg.q);
      default:
        this.sendTo(playerId, { type: 'error', message: 'Unexpected message' });
    }
  }

  // ---- game flow ----
  private start(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p?.isHost) return this.sendTo(playerId, { type: 'error', message: 'Only the host can start' });
    if (this.players.size < MAX_PLAYERS)
      return this.sendTo(playerId, { type: 'error', message: 'Need 2 players to start' });
    if (this.status !== 'lobby' && this.status !== 'result')
      return this.sendTo(playerId, { type: 'error', message: 'Game already in progress' });
    this.startMatch();
  }

  private startMatch(): void {
    this.matchOver = false;
    this.rematchBy = null;
    this.roundNumber = 0;
    this.matchRounds = [];
    this.usedClubIds.clear();
    this.usedCountries.clear();
    this.recentBotPicks = [];
    for (const p of this.players.values()) { p.score = 0; p.wrongCount = 0; }
    this.beginCountdown();
  }

  private static normCountry(c: string): string { return c.trim().toLowerCase(); }

  private beginCountdown(): void {
    this.clearTimers();
    this.round = { picks: new Map(), finished: false };
    this.status = 'countdown';
    this.broadcastState();

    let n = COUNTDOWN_FROM;
    this.broadcast({ type: 'countdown', n });
    const tick = setInterval(() => {
      n -= 1;
      if (n > 0) {
        this.broadcast({ type: 'countdown', n });
      } else {
        clearInterval(tick);
        this.beginPick();
      }
    }, 1000);
    this.timers.push(tick);
  }

  private beginPick(): void {
    this.status = 'pick';
    this.broadcastState();
    const endsAt = Date.now() + PICK_MS;
    const roles = this.pickRoles();
    // Send each player their specific pickRole + this match's already-used teams/
    // countries so the client can darken and disable them.
    const usedClubIds = [...this.usedClubIds];
    const usedCountries = [...this.usedCountries];
    for (const [id, role] of roles) {
      this.sendTo(id, { type: 'pick_phase', endsAt, pickRole: role, usedClubIds, usedCountries });
    }
    const t = setTimeout(() => this.autoPickRemaining(), PICK_MS);
    this.timers.push(t);
  }

  // Ülke-takım: eksik seçim(ler)i VERİ-GÜDÜMLÜ tamamla. Bot, karşı tarafın seçtiğine
  // göre GARANTİLİ ortak-oyunculu bir eş seçer (takıma → oynanabilir milliyet, ülkeye
  // → o milliyetten oyuncusu olan takım). İkisi de idle ise uyumlu bir çift üretir.
  // Milliyet değerleri DB'deki GERÇEK p.nationality string'leridir (ör. 'Türkiye') —
  // artık 'Turkey' gibi uyuşmayan sabitler yok. Böylece "oyuncu var ama tur atlandı"
  // hatası tamamen imkânsızlaşır.
  private async resolveCountryTeamAutoPicks(): Promise<void> {
    if (!this.round) return;
    const roles = this.pickRoles();
    const teamId = [...roles.entries()].find(([, r]) => r === 'team')?.[0];
    const countryId = [...roles.entries()].find(([, r]) => r === 'country')?.[0];
    if (!teamId || !countryId) return;
    const usedCountriesLower = [...this.usedCountries];

    // 1) Takım seçilmemişse: ülke seçiliyse O ÜLKEDEN oyuncusu olan takım, değilse genel bot seçimi
    if (!this.round.picks.has(teamId)) {
      const avoid = [...this.recentBotPicks, ...this.usedClubIds];
      let club = this.round.countryPick
        ? await pickClubForCountry(this.round.countryPick, avoid)
        : null;
      if (!club) {
        club = this.scope.type === 'all' ? await botPickFromPool('medium', null, avoid) : await randomClub(this.scope, 'medium');
        for (let tries = 0; club && this.usedClubIds.has(club.id) && tries < 8; tries++) club = await randomClub(this.scope, 'medium');
      }
      if (club) {
        this.round.picks.set(teamId, club);
        if (this.scope.type === 'all') { this.recentBotPicks.push(club.id); if (this.recentBotPicks.length > 10) this.recentBotPicks.shift(); }
        this.broadcast({ type: 'team_picked', playerId: teamId });
      }
    }

    // 2) Ülke seçilmemişse: SEÇİLEN TAKIMA oynanabilir (ortak-oyunculu) bir milliyet seç
    if (!this.round.countryPick) {
      const teamPick = this.round.picks.get(teamId);
      this.round.countryPick = await pickCountryForClub(teamPick ? Number(teamPick.id) : null, usedCountriesLower);
      this.broadcast({ type: 'team_picked', playerId: countryId });
    }
  }

  private async autoPickRemaining(): Promise<void> {
    if (this.status !== 'pick' || !this.round) return;
    // Ülke-takımı veri-güdümlü çöz (asla yanlış tur atlamaz), diğer modlar aşağıdaki genel akış.
    if (this.gameMode === 'country-team') {
      await this.resolveCountryTeamAutoPicks();
      if (this.allPicked()) this.beginReveal();
      return;
    }
    const roles = this.pickRoles();
    for (const [id, role] of roles) {
      if (this.round.picks.has(id) || (role === 'country' && this.round.countryPick) || (role === 'letter' && this.round.letterPick)) continue;
      if (role === 'player') {
        // player-player: auto-pick if this player hasn't picked yet
        const isFirst = !this.round.playerAPick;
        if (isFirst && this.round.playerAPick) continue;
        if (!isFirst && this.round.playerBPick) continue;
        const p = await randomPlayer('medium');
        if (p) {
          if (isFirst) this.round.playerAPick = p;
          else this.round.playerBPick = p;
          this.broadcast({ type: 'team_picked', playerId: id });
        }
        continue;
      }
      if (role === 'team') {
        // Bot picks from the fixed MEDIUM pool (online matches have no difficulty),
        // preferring a crossover with the human's team. League-scoped rooms keep the
        // old popularity picker so the pick stays inside the chosen league.
        const humanPick = [...this.round.picks.values()][0];
        // Bot da bu maçta kullanılmış takımlardan kaçınır
        const avoid = [...this.recentBotPicks, ...this.usedClubIds];
        let club = this.scope.type === 'all'
          ? await botPickFromPool('medium', humanPick ? Number(humanPick.id) : null, avoid)
          : await randomClub(this.scope, 'medium');
        // Scoped oda picker'ı exclude almadığından kullanılmışa denk gelirse birkaç kez yeniden dene
        for (let tries = 0; club && this.usedClubIds.has(club.id) && tries < 8; tries++) {
          club = await randomClub(this.scope, 'medium');
        }
        if (club) {
          if (this.scope.type === 'all') {
            this.recentBotPicks.push(club.id);
            if (this.recentBotPicks.length > 10) this.recentBotPicks.shift();
          }
          this.round.picks.set(id, club);
          this.broadcast({ type: 'team_picked', playerId: id });
        }
      } else if (role === 'country') {
        // Auto-pick a RANDOM popular footballing nation, kullanılmışlar hariç.
        const popular = ['Turkey', 'Brazil', 'France', 'Argentina', 'Germany', 'Spain', 'Italy', 'Portugal', 'Netherlands', 'England'];
        const avail = popular.filter((c) => !this.usedCountries.has(Room.normCountry(c)));
        const pick = (avail.length ? avail : popular)[Math.floor(Math.random() * (avail.length ? avail.length : popular.length))]!;
        this.round.countryPick = pick;
        this.broadcast({ type: 'team_picked', playerId: id });
      } else if (role === 'letter') {
        // Auto-pick a random letter
        const letters = 'ABCDEFGHIJKLMNOPRSTUVYZ';
        this.round.letterPick = letters[Math.floor(Math.random() * letters.length)]!;
        this.broadcast({ type: 'team_picked', playerId: id });
      }
    }
    if (this.allPicked()) this.beginReveal();
  }

  // Check if all players have made their pick
  private allPicked(): boolean {
    if (!this.round) return false;
    if (this.gameMode === 'player-player') {
      return Boolean(this.round.playerAPick && this.round.playerBPick);
    }
    const roles = this.pickRoles();
    for (const [id, role] of roles) {
      if (role === 'team' && !this.round.picks.has(id)) return false;
      if (role === 'country' && !this.round.countryPick) return false;
      if (role === 'letter' && !this.round.letterPick) return false;
    }
    return true;
  }

  private handlePick(playerId: string, clubId: number): void {
    if (this.status !== 'pick' || !this.round) return;
    const roles = this.pickRoles();
    if (roles.get(playerId) !== 'team') return; // wrong role
    if (this.round.picks.has(playerId)) return;
    // Bu maçta zaten seçilmiş takım yeniden seçilemez
    if (this.usedClubIds.has(clubId)) {
      return this.sendTo(playerId, { type: 'error', message: 'Bu takım bu maçta zaten seçildi' });
    }
    void this.lockPick(playerId, clubId);
  }

  private handlePickCountry(playerId: string, country: string): void {
    if (this.status !== 'pick' || !this.round) return;
    const roles = this.pickRoles();
    if (roles.get(playerId) !== 'country') return;
    if (this.round.countryPick) return; // already picked
    // Bu maçta zaten seçilmiş ülke yeniden seçilemez
    if (this.usedCountries.has(Room.normCountry(country))) {
      return this.sendTo(playerId, { type: 'error', message: 'Bu ülke bu maçta zaten seçildi' });
    }
    this.round.countryPick = country;
    this.broadcast({ type: 'team_picked', playerId });
    if (this.allPicked()) this.beginReveal();
  }

  private handlePickLetter(playerId: string, letter: string): void {
    if (this.status !== 'pick' || !this.round) return;
    const roles = this.pickRoles();
    if (roles.get(playerId) !== 'letter') return;
    if (this.round.letterPick) return;
    this.round.letterPick = letter.toUpperCase().charAt(0);
    this.broadcast({ type: 'team_picked', playerId });
    if (this.allPicked()) this.beginReveal();
  }

  private handlePickPlayer(playerId: string, playerQID: number): void {
    if (this.status !== 'pick' || !this.round) return;
    const roles = this.pickRoles();
    if (roles.get(playerId) !== 'player') return;
    void this.lockPickPlayer(playerId, playerQID);
  }

  private async lockPickPlayer(playerId: string, playerQID: number): Promise<void> {
    const player = await this.playerById(playerQID);
    if (!player) return this.sendTo(playerId, { type: 'error', message: 'Unknown player' });
    if (!this.round || this.status !== 'pick') return;
    // First pick goes to A, second to B
    if (!this.round.playerAPick) {
      this.round.playerAPick = player;
    } else if (!this.round.playerBPick) {
      this.round.playerBPick = player;
    } else {
      return; // both already picked
    }
    this.broadcast({ type: 'team_picked', playerId });
    if (this.allPicked()) this.beginReveal();
  }

  private async handleSearchPlayers(playerId: string, q: string): Promise<void> {
    const players = await searchPlayers(q, 30);
    this.sendTo(playerId, { type: 'player_results', players });
  }

  private async lockPick(playerId: string, clubId: number): Promise<void> {
    const club = await this.clubById(clubId);
    if (!club) return this.sendTo(playerId, { type: 'error', message: 'Unknown club' });
    if (!this.round || this.status !== 'pick' || this.round.picks.has(playerId)) return;
    this.round.picks.set(playerId, club);
    this.broadcast({ type: 'team_picked', playerId });
    if (this.allPicked()) this.beginReveal();
  }

  // A round can only be revealed if every required pick is present. When a player
  // vanishes mid-pick, pickRoles()/picks lose entries and the reveal would deref
  // `undefined` — which USED TO throw an uncaught exception and crash the whole
  // process, dropping every player in every room. `revealPicksReady()` below is
  // the gate that stops us getting here; this is the recovery when we do.
  private bailRound(reason: string): void {
    log.warn('round_bail', { room: this.code, mode: this.gameMode, reason, players: this.players.size, status: this.status });
    this.clearTimers();
    const humansLeft = [...this.players.values()].some((pl) => !pl.transport.isBot);
    if (this.players.size === 0 || !humansLeft) {
      this.players.clear();
      this.clearDisconnectTimers();
      this.onEmpty(this.code);
      return;
    }
    // Someone is still here — don't strand them on a frozen pick screen. Reset to
    // lobby (same shape as the opponent-left path) so they can start a new match.
    this.status = 'lobby';
    this.round = null;
    this.matchOver = false;
    this.rematchBy = null;
    this.broadcast({ type: 'opponent_left' });
    this.broadcastState();
  }

  // Bu turda açığa çıkan takım/ülkeleri maç-boyu "kullanıldı" kümesine işler.
  // player-player modu takım/ülke içermez — atlanır.
  private markUsedForRound(): void {
    if (!this.round) return;
    if (this.gameMode === 'player-player') return;
    for (const club of this.round.picks.values()) {
      if (club?.id) this.usedClubIds.add(club.id);
    }
    if (this.round.countryPick) this.usedCountries.add(Room.normCountry(this.round.countryPick));
  }

  // Reveal için gereken TÜM pick'ler yerinde mi? (beginReveal'in non-null erişimleri
  // için ön-koşul.) allPicked() rol-bazlı sayar; bu ise beginReveal'in GERÇEKTEN
  // okuyacağı slot'ları (ids[0]/ids[1], team pick + ülke/harf) birebir doğrular.
  private revealPicksReady(): boolean {
    if (!this.round) return false;
    if (this.gameMode === 'player-player') {
      return Boolean(this.round.playerAPick && this.round.playerBPick);
    }
    if (this.gameMode === 'team-team') {
      const ids = [...this.players.keys()];
      return ids.length >= 2 && this.round.picks.has(ids[0]!) && this.round.picks.has(ids[1]!);
    }
    // country-team / letter-team: bir 'team' rolü seçili + ülke/harf değeri mevcut
    const teamId = [...this.pickRoles().entries()].find(([, r]) => r === 'team')?.[0];
    if (!teamId || !this.round.picks.has(teamId)) return false;
    if (this.gameMode === 'country-team') return Boolean(this.round.countryPick);
    return Boolean(this.round.letterPick); // letter-team
  }

  private beginReveal(): void {
    if (!this.round) return;
    // GÜVENLİK: disconnect/reconnect yarışında bir pick eksik kalırsa aşağıdaki
    // non-null (`!`) erişimler undefined döndürüp süreci çökertirdi (tüm maçlar
    // düşer → "internet yok"). Eksikse sessizce çık — round, disconnect temizliğiyle
    // (finalizeClose) veya bir sonraki döngüde toparlanır.
    if (!this.revealPicksReady()) {
      log.warn('reveal_missing_picks', { room: this.code, mode: this.gameMode, status: this.status });
      return;
    }
    this.markUsedForRound();

    if (this.gameMode === 'player-player') {
      const playerA = this.round.playerAPick;
      const playerB = this.round.playerBPick;
      if (!playerA || !playerB) return this.bailRound('missing player pick');
      const pseudoA: ClubRef = { id: playerA.id, name: playerA.name, logoUrl: playerA.imageUrl };
      const pseudoB: ClubRef = { id: playerB.id, name: playerB.name, logoUrl: playerB.imageUrl };
      this.round.teamA = pseudoA;
      this.round.teamB = pseudoB;
      this.status = 'reveal';
      this.broadcastState();
      this.broadcast({ type: 'reveal_teams', teamA: pseudoA, teamB: pseudoB, mode: 'player-player' });
      void this.afterRevealPlayerPlayer(playerA, playerB);
    } else if (this.gameMode === 'team-team') {
      // Original behavior: both picks are teams
      const ids = [...this.players.keys()];
      const a = ids[0] != null ? this.round.picks.get(ids[0]) : undefined;
      const b = ids[1] != null ? this.round.picks.get(ids[1]) : undefined;
      if (!a || !b) return this.bailRound('missing team pick');
      this.round.teamA = a;
      this.round.teamB = b;
      this.status = 'reveal';
      this.broadcastState();
      this.broadcast({ type: 'reveal_teams', teamA: a, teamB: b, mode: 'team-team' });
      void this.afterRevealTeamTeam(a, b);
    } else if (this.gameMode === 'country-team') {
      const country = this.round.countryPick;
      // Find the team pick (the player with role 'team')
      const roles = this.pickRoles();
      const teamPlayerId = [...roles.entries()].find(([, r]) => r === 'team')?.[0];
      const club = teamPlayerId != null ? this.round.picks.get(teamPlayerId) : undefined;
      if (!country || !club) return this.bailRound('missing country/team pick');
      const pseudoCountry: ClubRef = { id: 0, name: country, logoUrl: null };
      this.round.teamA = pseudoCountry;
      this.round.teamB = club;
      this.status = 'reveal';
      this.broadcastState();
      this.broadcast({ type: 'reveal_teams', teamA: pseudoCountry, teamB: club, mode: 'country-team', country });
      void this.afterRevealCountryTeam(club, country);
    } else {
      // letter-team
      const letter = this.round.letterPick;
      const roles = this.pickRoles();
      const teamPlayerId = [...roles.entries()].find(([, r]) => r === 'team')?.[0];
      const club = teamPlayerId != null ? this.round.picks.get(teamPlayerId) : undefined;
      if (!letter || !club) return this.bailRound('missing letter/team pick');
      const pseudoLetter: ClubRef = { id: 0, name: letter, logoUrl: null };
      this.round.teamA = pseudoLetter;
      this.round.teamB = club;
      this.status = 'reveal';
      this.broadcastState();
      this.broadcast({ type: 'reveal_teams', teamA: pseudoLetter, teamB: club, mode: 'letter-team', letter });
      void this.afterRevealLetterTeam(club, letter);
    }
  }

  // ---- after-reveal checks per mode ----

  private async afterRevealTeamTeam(a: ClubRef, b: ClubRef): Promise<void> {
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (!a || !b) return; // güvenlik: eksik pick ile çağrılırsa çökme yerine sessizce çık
    if (a.id === b.id) {
      const t = setTimeout(() => this.skipSameTeam(), 2200);
      this.timers.push(t);
      return;
    }
    const common = await commonPlayersDetailed(a.id, b.id, 5);
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (common.length === 0) {
      const t = setTimeout(() => this.skipNoCommon(), 2200);
      this.timers.push(t);
    } else {
      const t = setTimeout(() => this.beginGuess(), 2000);
      this.timers.push(t);
    }
  }

  private async afterRevealCountryTeam(club: ClubRef, country: string): Promise<void> {
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    const has = await hasPlayersCountryTeam(club.id, country);
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (!has) {
      const t = setTimeout(() => this.skipNoCommon(), 2200);
      this.timers.push(t);
    } else {
      const t = setTimeout(() => this.beginGuess(), 2000);
      this.timers.push(t);
    }
  }

  private async afterRevealLetterTeam(club: ClubRef, letter: string): Promise<void> {
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    const has = await hasPlayersLetterTeam(club.id, letter);
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (!has) {
      const t = setTimeout(() => this.skipNoCommon(), 2200);
      this.timers.push(t);
    } else {
      const t = setTimeout(() => this.beginGuess(), 2000);
      this.timers.push(t);
    }
  }

  private async afterRevealPlayerPlayer(
    playerA: { id: number; name: string; imageUrl: string | null },
    playerB: { id: number; name: string; imageUrl: string | null },
  ): Promise<void> {
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    const has = await hasCommonClubs(playerA.id, playerB.id);
    if (!this.round || this.round.finished || this.status !== 'reveal') return;
    if (!has) {
      const t = setTimeout(() => this.skipNoCommon(), 2200);
      this.timers.push(t);
    } else {
      const t = setTimeout(() => this.beginGuess(), 2000);
      this.timers.push(t);
    }
  }

  private skipSameTeam(): void {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    this.finishRound({
      correct: false,
      reason: 'same_team',
      autocorrected: false,
      answeredById: null,
      answeredByName: null,
      guess: '',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: null,
      matchedPlayerImageUrl: null,
      spellsA: [],
      spellsB: [],
      allClubs: [],
      commonPlayers: [],
    });
  }

  private skipNoCommon(): void {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    this.finishRound({
      correct: false,
      reason: 'no_common',
      autocorrected: false,
      answeredById: null,
      answeredByName: null,
      guess: '',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: null,
      matchedPlayerImageUrl: null,
      spellsA: [],
      spellsB: [],
      allClubs: [],
      commonPlayers: [],
    });
  }

  private beginGuess(): void {
    if (!this.round) return;
    this.status = 'guess';
    this.broadcastState();
    const endsAt = Date.now() + GUESS_MS;
    this.broadcast({ type: 'guess_phase', endsAt });
    const t = setTimeout(() => this.endRoundTimeout(), GUESS_MS);
    this.timers.push(t);
  }

  private handleGuess(playerId: string, text: string): void {
    if (this.status !== 'guess' || !this.round || this.round.finished) return;
    if (this.round.answeredBy) return;
    if (this.round.passedBy?.has(playerId)) return; // you already passed this round
    this.round.answeredBy = playerId;
    const p = this.players.get(playerId);
    this.broadcast({ type: 'guess_locked', byId: playerId, byName: p?.name ?? '' });
    void this.evaluate(playerId, text);
  }

  // A player passes. If every player passes, the round is voided (no points)
  // and play moves on to a fresh team pick.
  private handlePass(playerId: string): void {
    if (this.status !== 'guess' || !this.round || this.round.finished) return;
    if (this.round.answeredBy) return; // someone already buzzed in
    if (!this.round.passedBy) this.round.passedBy = new Set();
    if (this.round.passedBy.has(playerId)) return;
    this.round.passedBy.add(playerId);
    const p = this.players.get(playerId);
    this.broadcast({ type: 'pass_locked', byId: playerId, byName: p?.name ?? '' });
    if (this.round.passedBy.size >= this.players.size) void this.skipPassed();
  }

  private async skipPassed(): Promise<void> {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    // Reveal who actually played for both (the answer) so both players learn it.
    let common: { name: string; imageUrl: string | null }[];
    if (this.gameMode === 'player-player' && this.round.playerAPick && this.round.playerBPick) {
      const clubs = await commonClubs(this.round.playerAPick.id, this.round.playerBPick.id, 5);
      common = clubs.map((c) => ({ name: c.name, imageUrl: c.logoUrl }));
    } else if (this.gameMode === 'country-team' && this.round.countryPick) {
      common = await commonPlayersCountryTeam(this.round.teamB.id, this.round.countryPick, 5);
    } else if (this.gameMode === 'letter-team' && this.round.letterPick) {
      common = await commonPlayersLetterTeam(this.round.teamB.id, this.round.letterPick, 5);
    } else {
      common = await commonPlayersDetailed(this.round.teamA.id, this.round.teamB.id, 5);
    }
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return; // ended mid-await
    this.finishRound({
      correct: false,
      reason: 'passed',
      autocorrected: false,
      answeredById: null,
      answeredByName: null,
      guess: '',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: null,
      matchedPlayerImageUrl: null,
      spellsA: [],
      spellsB: [],
      allClubs: [],
      commonPlayers: common,
    });
  }

  private async evaluate(playerId: string, text: string): Promise<void> {
    if (!this.round?.teamA || !this.round.teamB) return;
    this.clearTimers();

    // ---- player-player mode: guess is a club name ----
    if (this.gameMode === 'player-player' && this.round.playerAPick && this.round.playerBPick) {
      const ppv = await verifyPlayerPlayerGuess(this.round.playerAPick.id, this.round.playerBPick.id, text);
      const clubs = await commonClubs(this.round.playerAPick.id, this.round.playerBPick.id, 5);
      const common: { name: string; imageUrl: string | null }[] = clubs.map((c) => ({ name: c.name, imageUrl: c.logoUrl }));

      const p = this.players.get(playerId);
      if (ppv.correct && p) {
        p.score += 1;
      } else if (!ppv.correct && p) {
        p.wrongCount += 1;
        if (p.wrongCount >= MAX_WRONG) {
          const opponent = [...this.players.values()].find((o) => o.id !== p.id);
          if (opponent) opponent.score = WIN_TARGET;
        }
      }

      this.finishRound({
        correct: ppv.correct,
        reason: ppv.correct ? 'both' : 'no_match',
        autocorrected: ppv.autocorrected,
        answeredById: playerId,
        answeredByName: p?.name ?? null,
        guess: text,
        teamA: this.round.teamA,
        teamB: this.round.teamB,
        matchedPlayerName: null,
        matchedPlayerImageUrl: null,
        matchedClubName: ppv.matchedClubName,
        matchedClubLogo: ppv.matchedClubLogo,
        spellsA: ppv.spellsA,
        spellsB: ppv.spellsB,
        allClubs: [],
        commonPlayers: common,
      });
      return;
    }

    let v;
    let common: { name: string; imageUrl: string | null }[];

    if (this.gameMode === 'country-team' && this.round.countryPick) {
      v = await verifyCountryTeamGuess(this.round.teamB.id, this.round.countryPick, text);
      common = await commonPlayersCountryTeam(this.round.teamB.id, this.round.countryPick, 5);
    } else if (this.gameMode === 'letter-team' && this.round.letterPick) {
      v = await verifyLetterTeamGuess(this.round.teamB.id, this.round.letterPick, text);
      common = await commonPlayersLetterTeam(this.round.teamB.id, this.round.letterPick, 5);
    } else {
      v = await verifyGuess(this.round.teamA.id, this.round.teamB.id, text);
      common = await commonPlayersDetailed(this.round.teamA.id, this.round.teamB.id, 5);
    }

    const p = this.players.get(playerId);
    if (v.correct && p) {
      p.score += 1;
    } else if (!v.correct && p) {
      p.wrongCount += 1;
      if (p.wrongCount >= MAX_WRONG) {
        const opponent = [...this.players.values()].find((o) => o.id !== p.id);
        if (opponent) opponent.score = WIN_TARGET;
      }
    }

    this.finishRound({
      correct: v.correct,
      reason: v.reason,
      autocorrected: v.autocorrected,
      answeredById: playerId,
      answeredByName: p?.name ?? null,
      guess: text,
      teamA: v.teamA,
      teamB: v.teamB,
      matchedPlayerName: v.matchedPlayer?.name ?? null,
      matchedPlayerImageUrl: v.matchedPlayer?.imageUrl ?? null,
      spellsA: v.spellsA,
      spellsB: v.spellsB,
      allClubs: v.allClubs,
      commonPlayers: common,
    });
  }

  private endRoundTimeout(): void {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;
    void this.endRoundTimeoutAsync();
  }

  private async endRoundTimeoutAsync(): Promise<void> {
    if (!this.round || this.round.finished || !this.round.teamA || !this.round.teamB) return;

    let common: { name: string; imageUrl: string | null }[];
    if (this.gameMode === 'player-player' && this.round.playerAPick && this.round.playerBPick) {
      const clubs = await commonClubs(this.round.playerAPick.id, this.round.playerBPick.id, 5);
      common = clubs.map((c) => ({ name: c.name, imageUrl: c.logoUrl }));
    } else if (this.gameMode === 'country-team' && this.round.countryPick) {
      common = await commonPlayersCountryTeam(this.round.teamB.id, this.round.countryPick, 5);
    } else if (this.gameMode === 'letter-team' && this.round.letterPick) {
      common = await commonPlayersLetterTeam(this.round.teamB.id, this.round.letterPick, 5);
    } else {
      common = await commonPlayersDetailed(this.round.teamA.id, this.round.teamB.id, 5);
    }

    this.finishRound({
      correct: false,
      reason: 'timeout',
      autocorrected: false,
      answeredById: null,
      answeredByName: null,
      guess: '',
      teamA: this.round.teamA,
      teamB: this.round.teamB,
      matchedPlayerName: null,
      matchedPlayerImageUrl: null,
      spellsA: [],
      spellsB: [],
      allClubs: [],
      commonPlayers: common,
    });
  }

  private finishRound(result: RoundResult): void {
    if (!this.round) return;
    this.round.finished = true;
    this.clearTimers();
    this.status = 'result';
    this.roundNumber += 1;

    // Collect winning round info (only rounds where someone scored)
    if (result.correct && result.answeredById) {
      // player-player: the "answer" is a club, not a player
      const playerName = this.gameMode === 'player-player'
        ? (result.matchedClubName ?? '')
        : (result.matchedPlayerName ?? '');
      const playerImage = this.gameMode === 'player-player'
        ? (result.matchedClubLogo ?? null)
        : (result.matchedPlayerImageUrl ?? null);
      if (playerName) {
        this.matchRounds.push({
          teamA: result.teamA.name,
          teamALogo: result.teamA.logoUrl,
          teamB: result.teamB.name,
          teamBLogo: result.teamB.logoUrl,
          player: playerName,
          playerImageUrl: playerImage,
          answeredBy: result.answeredByName ?? '',
          mode: this.gameMode,
          country: this.gameMode === 'country-team' ? this.round?.countryPick : undefined,
          letter: this.gameMode === 'letter-team' ? this.round?.letterPick : undefined,
        });
      }
    }

    const winner = [...this.players.values()].find((p) => p.score >= WIN_TARGET) ?? null;
    this.matchOver = Boolean(winner);

    this.broadcast({
      type: 'result',
      result,
      players: this.playerViews(),
      matchOver: this.matchOver,
      winnerId: winner?.id ?? null,
      winnerName: winner?.name ?? null,
      target: WIN_TARGET,
    });
    this.broadcastState();

    if (!this.matchOver) {
      // One 10s countdown shown immediately (10 → 0). At 0 the next round starts
      // automatically; if both players press "Hazır" sooner, it advances right away.
      this.readyPlayers = new Set();
      const endsAt = Date.now() + 10_000;
      this.broadcast({ type: 'waiting_ready' });
      this.broadcast({ type: 'ready_countdown', endsAt });
      const t = setTimeout(() => {
        if (this.status === 'result' && !this.matchOver) this.beginCountdown();
      }, 10_000);
      this.timers.push(t);
    } else {
      const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
      if (!hasBot) {
        if (this.ranked) void this.updateTrophies(winner!);
        // dostluk maçı (davet / oda kodu): kupa da XP de yok
      } else {
        // Bot maçı: kupa yok ama SEVİYE XP'si var (yarım puan, günlük tavanlı)
        void (async () => {
          for (const p of this.players.values()) {
            if (p.transport.isBot || !p.userId) continue;
            try {
              const xpRes = await awardMatchXp(p.userId, p.id === winner!.id, true);
              if (xpRes) p.transport.send({ type: 'xp_update', ...xpRes });
            } catch { /* DB error — skip silently */ }
          }
        })();
      }
      void this.saveHistory();
    }
  }

  private async saveHistory(): Promise<void> {
    const players = [...this.players.values()];
    if (players.length < 2) return;
    const [a, b] = players;
    for (const p of players) {
      if (p.transport.isBot || !p.userId) continue;
      const opp = p === a ? b! : a!;
      const mapRound = (r: MatchRound) => ({
        teamA: r.teamA, teamALogo: r.teamALogo,
        teamB: r.teamB, teamBLogo: r.teamBLogo,
        player: r.player, playerImageUrl: r.playerImageUrl,
        answeredBy: r.answeredBy,
        mode: r.mode, country: r.country, letter: r.letter,
      });
      const myRounds = this.matchRounds.filter((r) => r.answeredBy === p.name).map(mapRound);
      const oppRounds = this.matchRounds.filter((r) => r.answeredBy === opp.name).map(mapRound);
      try {
        const pUser = await getUser(p.userId);
        const oppUser = opp.userId ? await getUser(opp.userId) : null;
        await saveMatchHistory(
          p.userId, p.name, pUser?.trophies ?? 0,
          opp.userId ?? null, opp.name, oppUser?.trophies ?? 0,
          p.score, opp.score,
          p.score > opp.score,
          this.gameMode,
          [...myRounds, ...oppRounds],
        );
      } catch { /* DB error — skip silently */ }
    }
  }

  // ---- ready system ----
  private handleReady(playerId: string): void {
    if (this.status !== 'result' || this.matchOver) return;
    this.readyPlayers.add(playerId);
    this.broadcast({ type: 'player_ready' as any, playerId });
    if (this.readyPlayers.size >= this.players.size) {
      this.clearTimers();
      this.beginCountdown();
    }
  }

  // ---- trophy updates ----
  private async updateTrophies(winner: Player): Promise<void> {
    for (const p of this.players.values()) {
      if (p.transport.isBot || !p.userId) continue;
      const won = p.id === winner.id;
      // Rakibin MAÇ BAŞI kupası: dinamik delta (CR usulü) farka göre hesaplanır.
      const opp = [...this.players.values()].find((x) => x.id !== p.id);
      try {
        const { profile, delta, arenaReward, shielded } = await applyMatchResult(p.userId, won, { opponentTrophies: opp?.trophies ?? null });
        p.transport.send({
          type: 'trophy_update',
          trophies: profile.trophies,
          delta,
          arena: profile.arena,
          diamonds: profile.diamonds,
          arenaReward,
          shielded,
          winStreak: profile.winStreak,
          bestStreak: profile.bestStreak,
        });
        // Seviye XP'si — kupadan bağımsız, kaybeden de kazanır
        const xpRes = await awardMatchXp(p.userId, won, false);
        if (xpRes) p.transport.send({ type: 'xp_update', ...xpRes });
      } catch {
        // DB error — skip silently
      }
    }
  }

  // ---- rematch ----
  private requestRematch(playerId: string): void {
    if (this.status !== 'result' || !this.matchOver) return;
    if (this.rematchBy && this.rematchBy !== playerId) return this.startMatch();
    this.rematchBy = playerId;
    const p = this.players.get(playerId);
    this.sendTo(playerId, { type: 'rematch_waiting' });
    for (const [id, other] of this.players) {
      if (id === playerId) continue;
      other.transport.send({ type: 'rematch_requested', byId: playerId, byName: p?.name ?? '' });
    }
  }

  private respondRematch(playerId: string, accept: boolean): void {
    if (!this.rematchBy || this.rematchBy === playerId) return;
    if (accept) {
      this.startMatch();
    } else {
      this.sendTo(this.rematchBy, { type: 'rematch_declined' });
      this.rematchBy = null;
    }
  }

  private relayEmote(playerId: string, emoteId: string): void {
    if (!isEmote(emoteId)) return;
    this.broadcast({ type: 'emote', fromId: playerId, emoteId });
  }

  private async handleSearch(playerId: string, reqId: string, q: string): Promise<void> {
    const clubs = await searchClubs(q, this.scope, 60);
    this.sendTo(playerId, { type: 'club_results', reqId, clubs });
  }

  // ---- helpers ----
  private async clubById(id: number): Promise<ClubRef | null> {
    const { rows } = await pool.query<{ id: string; name: string; logo_url: string | null }>(
      'SELECT id, name, logo_url FROM clubs WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: Number(r.id), name: r.name, logoUrl: r.logo_url } : null;
  }

  private async playerById(id: number): Promise<{ id: number; name: string; imageUrl: string | null } | null> {
    const { rows } = await pool.query<{ id: string; name: string; image_url: string | null }>(
      'SELECT id, name, image_url FROM players WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: Number(r.id), name: r.name, imageUrl: r.image_url } : null;
  }

  private playerViews(): PlayerView[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      wrongCount: p.wrongCount,
      isHost: p.isHost,
      connected: p.connected,
      trophies: p.trophies,
      arena: p.arena,
      avatar: p.avatar,
      level: p.level,
      frame: p.frame ?? null,
    }));
  }

  private toView(youId: string): RoomView {
    return { code: this.code, status: this.status, players: this.playerViews(), youId };
  }

  private broadcastState(): void {
    for (const p of this.players.values()) p.transport.send({ type: 'room_state', room: this.toView(p.id) });
  }

  private broadcast(msg: ServerMsg): void {
    for (const p of this.players.values()) p.transport.send(msg);
  }

  private sendTo(playerId: string, msg: ServerMsg): void {
    this.players.get(playerId)?.transport.send(msg);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private clearDisconnectTimers(): void {
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.disconnectTimers.clear();
  }

  get size(): number {
    return this.players.size;
  }
}
