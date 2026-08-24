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
import { getQuestionDifficulty, recordQuestionOutcome, type QuestionDifficultyEstimate } from '../matchmaking/questionDifficulty.ts';
import { recordTelemetry } from '../matchmaking/telemetry.ts';
import { recordBotRoundOutcome } from '../matchmaking/botTelemetry.ts';
import type { BotDifficultyDirectorOutput } from '../matchmaking/botDifficultyDirector.ts';
import { defaultSkillProfile, updateSkillAfterMatch, type SkillRoundSignal } from '../matchmaking/skillRating.ts';
import { assessFarmRisk, recordOpponentHistory } from '../matchmaking/antiFarm.ts';
import { getTrophyEconomyState } from '../matchmaking/trophyEconomy.ts';
import { trophyRiskMultipliers } from '../matchmaking/trophyRisk.ts';
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
// İlk yanlış cevabın cezası: bu kadar bekleyip BİR hak daha (wrongretry kuralı).
const WRONG_RETRY_MS = 5_000;
const MAX_PLAYERS = 2;
const WIN_TARGET = 3; // first to this many round wins takes the match
// Result screen pause: one visible 10→0 countdown, then the next round
// auto-starts (both players pressing "Hazır" skips the wait).
const INTER_ROUND_MS = 10_000;
const RECONNECT_GRACE_MS = 12_000;
type ForfeitReason = 'leave' | 'cheat' | 'disconnect';

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// A player's link to the outside world: a real WebSocket client, or a bot.
export interface Transport {
  send(msg: ServerMsg): void;
  readonly isBot: boolean;
  readonly exposeBotToClient?: boolean;
  readonly botArchetype?: string;
  readonly botProfileId?: string;
  readonly botSkill?: number;
  readonly botSkillMean?: number;
  readonly botSkillUncertainty?: number;
  getLastGuessDelayMs?(): number;
  getLastCognitiveState?(): string | null;
  getLastQuestionDifficultyScore?(): number | null;
  getLastDecision?(): { cognitiveState: string; reactionDelayMs: number; willAnswer: boolean; shouldMistake: boolean; shouldTimeout: boolean } | null;
  getBotDifficultyDirector?(): BotDifficultyDirectorOutput | null;
  // İstemcinin bildirdiği yetenek bayrakları (ws/server.ts kayıt sırasında yazar).
  // 'wrongopen': yanlış cevapta turun açık kalmasını ve yeni mesajları anlar.
  caps?: string[];
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
  skillMean?: number;
  skillUncertainty?: number;
  skillMatchesPlayed?: number;
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
  // Players whose guess is currently being verified. This prevents one player
  // from double-submitting, without locking the opponent's input.
  pendingGuesses?: Set<string>;
  passedBy?: Set<string>; // players who chose to pass this round
  // wrongopen kuralı: bu turda yanlış yazıp hakkı biten oyuncular. Yanlış cevap
  // turu YAKMAZ (kasıtlı yanlışla tur kilitleme istismarını kapatır) — yazan
  // susturulur, rakip kalan sürede cevaplayabilir.
  burned?: Set<string>;
  // wrongretry (kullanıcı kuralı 2026-08-11): İLK yanlış oyuncuyu yakmaz —
  // 5 sn ceza penceresi sonrası BİR hakkı daha vardır. playerId → ikinci
  // hakkın açıldığı an (epoch ms). Kayıtlıysa ve İKİNCİ yanlış gelirse
  // (ya da şartlar tutmazsa) oyuncu burned'e düşer.
  wrongRetryAt?: Map<string, number>;
  guessEndsAt?: number; // tahmin süresinin bittiği an — yeniden kurulan zamanlayıcı için
  guessStartedAt?: number;
  question?: QuestionDifficultyEstimate;
  skillSignalRecorded?: Set<string>;
  wrongAttempts?: Map<string, number>;
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
  // Hybrid matchmaking fallback botları dereceli maç hissini korur; klasik
  // create_solo pratik botları bu bayrağı açmaz ve eski XP-only davranışta kalır.
  rankedBotRewards = false;
  private players = new Map<string, Player>();
  status: RoomStatus = 'lobby';
  private round: Round | null = null;
  private roundNumber = 0; // tracks rounds for role alternation
  private timers: NodeJS.Timeout[] = [];
  private onEmpty: (code: string) => void;
  private matchOver = false; // true once a player reaches WIN_TARGET
  private rematchBy: string | null = null;
  private matchStartedAt = 0; // startMatch anı (ms) — maç süresi istatistiği için
  private matchId: string = randomUUID();
  private nextMatchId: string | null = null;
  private settlementStarted = false;
  private matchTelemetryClosed = false;
  private readyPlayers = new Set<string>();
  private matchRounds: MatchRound[] = [];
  private skillRoundSignals = new Map<string, SkillRoundSignal[]>();
  private lastTrophyDeltaByUser = new Map<string, number>();
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

  assignNextMatchId(matchId: string): void {
    this.nextMatchId = matchId;
    this.matchId = matchId;
  }

  currentMatchId(): string {
    return this.matchId;
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
    skillMean?: number,
    skillUncertainty?: number,
    skillMatchesPlayed?: number,
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
      skillMean,
      skillUncertainty,
      skillMatchesPlayed,
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

  // Admin paneli için anlık oda özeti: durum + bağlı (canlı) insan ve bot sayısı.
  liveSnapshot(): { status: RoomStatus; humans: number; bots: number } {
    let humans = 0;
    let bots = 0;
    for (const p of this.players.values()) {
      if (p.transport.isBot) bots++;
      else if (p.connected) humans++;
    }
    return { status: this.status, humans, bots };
  }

  // Admin paneli için ayrıntılı canlı maç kartı: oda kodu, durum ve oyuncular
  // (isim + kalıcı hesap id + kupa + skor). "Kim kime karşı oynuyor" görünsün diye.
  matchInfo(): {
    code: string;
    status: RoomStatus;
    gameMode: GameMode;
    bot: boolean;
    ranked: boolean;
    humans: number;
    players: { name: string; userId: string | null; trophies: number | null; score: number; connected: boolean; isBot: boolean; skillMean?: number | null; skillUncertainty?: number | null; botArchetype?: string | null; botCognitiveState?: string | null }[];
  } {
    const players = [...this.players.values()].map((p) => ({
      name: p.name,
      userId: p.userId ?? null,
      trophies: p.trophies ?? null,
      score: p.score,
      connected: p.connected,
      isBot: p.transport.isBot,
      skillMean: p.skillMean ?? p.transport.botSkillMean ?? null,
      skillUncertainty: p.skillUncertainty ?? p.transport.botSkillUncertainty ?? null,
      botArchetype: p.transport.botArchetype ?? null,
      botCognitiveState: p.transport.getLastCognitiveState?.() ?? null,
    }));
    return {
      code: this.code,
      status: this.status,
      gameMode: this.gameMode,
      bot: players.some((p) => p.isBot),
      ranked: this.ranked,
      humans: players.filter((p) => !p.isBot).length,
      players,
    };
  }

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
  explicitLeave(playerId: string, reason: Extract<ForfeitReason, 'leave' | 'cheat'> = 'leave'): void {
    const timer = this.disconnectTimers.get(playerId);
    if (timer) { clearTimeout(timer); this.disconnectTimers.delete(playerId); }
    this.finalizeClose(playerId, reason);
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
        this.finalizeClose(playerId, 'disconnect');
      }, RECONNECT_GRACE_MS);
      this.disconnectTimers.set(playerId, timer);
      log.warn('player_disconnect_grace', { room: this.code, playerId, userId: p.userId, status: this.status });
      return;
    }
    this.finalizeClose(playerId, 'disconnect');
  }

  private finalizeClose(playerId: string, reason: ForfeitReason = 'disconnect'): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.clearTimers();

    // Maç BİTTİYSE (matchOver) çıkış normal ayrılıştır — hükmen yolu yalnız
    // maç hâlâ sürerken çalışır. (Önceden: maç sonu ekranından çıkan herkes
    // "kaçtı" sayılıp kalan oyuncuya İKİNCİ bir galibiyet ödülü yazılıyordu.)
    const wasInMatch = this.status !== 'lobby' && !this.matchOver;
    const hasBot = p.transport.isBot || [...this.players.values()].some((pl) => pl.id !== playerId && pl.transport.isBot);
    const forfeitOpponent = [...this.players.values()].find((pl) => pl.id !== playerId);

    if (wasInMatch && hasBot && this.ranked && this.rankedBotRewards && !p.transport.isBot && p.userId) {
      const bot = [...this.players.values()].find((pl) => pl.id !== playerId && pl.transport.isBot);
      void (async () => {
        try {
          if (!(await this.claimSettlement('bot_forfeit'))) return;
          const playerSkill = this.playerSkillFor(p);
          const botSkill = this.playerSkillFor(bot);
          const leaverRes = await applyMatchResult(p.userId!, false, {
            leaver: true,
            opponentTrophies: bot?.trophies ?? null,
            playerSkillMean: playerSkill.skillMean,
            playerSkillUncertainty: playerSkill.skillUncertainty,
            opponentSkillMean: botSkill.skillMean,
            opponentSkillUncertainty: botSkill.skillUncertainty,
            matchId: this.matchId,
            opponentRef: bot?.name ?? 'bot',
            opponentType: 'BOT',
            ledgerReason: 'bot_forfeit_loss',
            ledgerMetadata: { forfeitReason: reason },
          });
          await recordOpponentHistory({ matchId: this.matchId, playerId: p.userId!, opponentType: 'BOT', winnerId: null, won: false, trophyDelta: leaverRes.delta, durationSecs: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0 });
          const xpRes = await awardMatchXp(p.userId!, false, false);
          await updateSkillAfterMatch(p.userId!, p.trophies ?? leaverRes.profile.trophies, {
            opponentType: 'BOT',
            opponentSkillMean: botSkill.skillMean,
            opponentSkillUncertainty: botSkill.skillUncertainty,
            won: false,
            scoreFor: p.score,
            scoreAgainst: bot?.score ?? WIN_TARGET,
            rounds: this.skillRoundSignals.get(p.id) ?? [],
          }).catch((err) => log.warn('skill_update_failed', { matchId: this.matchId, userId: p.userId, error: err instanceof Error ? err.message : String(err) }));
          try {
            p.transport.send({ type: 'trophy_update', trophies: leaverRes.profile.trophies, delta: leaverRes.delta, arena: leaverRes.profile.arena, diamonds: leaverRes.profile.diamonds, highestArenaRewarded: leaverRes.profile.highestArenaRewarded, shielded: leaverRes.shielded, winStreak: leaverRes.profile.winStreak, bestStreak: leaverRes.profile.bestStreak, lostStreak: leaverRes.profile.lostStreak });
            if (xpRes) p.transport.send({ type: 'xp_update', ...xpRes });
          } catch { /* socket may already be gone */ }
          recordTelemetry({
            eventName: 'match_finished',
            matchId: this.matchId,
            roomCode: this.code,
            playerId: p.userId,
            opponentType: 'BOT',
            payload: {
              matchResult: 'loss',
              forfeitReason: reason,
              playerSkillMean: playerSkill.skillMean,
              opponentSkillMean: botSkill.skillMean,
              expectedWinProbability: leaverRes.expectedWinProbability,
              trophyDelta: leaverRes.delta,
              scoreFor: p.score,
              scoreAgainst: bot?.score ?? WIN_TARGET,
              durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0,
              ...this.matchQualityPayload(p, bot ?? forfeitOpponent),
            },
          });
          log.info('match_completed', { matchId: this.matchId, opponentType: 'BOT', result: reason === 'cheat' ? 'cheat_forfeit_loss' : 'forfeit_loss', forfeitReason: reason, durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0, botArchetype: bot?.transport.botArchetype, botSkill: bot?.transport.botSkill });
          await this.saveForfeitHistory(p, bot ?? forfeitOpponent, false);
        } catch (err) {
          log.error('settlement_error', { matchId: this.matchId, reason: 'bot_forfeit', error: err instanceof Error ? err.message : String(err) });
        }
      })();
    }

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
      this.broadcast({ type: 'opponent_left', forfeit: true, forfeitReason: reason === 'cheat' ? 'cheat' : undefined });
      // Award trophies: winner wins, leaver loses. Yalnız dereceli maçta —
      // dostluk maçındaki hükmen sonuç görsel kalır, ödül yazılmaz.
      if (!this.ranked) { this.broadcastState(); return; }
      void (async () => {
        try {
          if (!(await this.claimSettlement('human_forfeit'))) return;
          if (winner.userId) {
            const winnerSkill = this.playerSkillFor(winner);
            const leaverSkill = this.playerSkillFor(p);
            const { profile, delta, arenaReward, expectedWinProbability } = await applyMatchResult(winner.userId, true, {
              opponentTrophies: p.trophies ?? null,
              playerSkillMean: winnerSkill.skillMean,
              playerSkillUncertainty: winnerSkill.skillUncertainty,
              opponentSkillMean: leaverSkill.skillMean,
              opponentSkillUncertainty: leaverSkill.skillUncertainty,
              matchId: this.matchId,
              opponentId: p.userId ?? null,
              opponentType: 'HUMAN',
              ledgerReason: 'human_forfeit_win',
              ledgerMetadata: { forfeitReason: reason },
            });
            await recordOpponentHistory({ matchId: this.matchId, playerId: winner.userId, opponentId: p.userId ?? null, opponentType: 'HUMAN', winnerId: winner.userId, won: true, trophyDelta: delta, durationSecs: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0 });
            winner.transport.send({ type: 'trophy_update', trophies: profile.trophies, delta, arena: profile.arena, diamonds: profile.diamonds, arenaReward, highestArenaRewarded: profile.highestArenaRewarded, winStreak: profile.winStreak, bestStreak: profile.bestStreak });
            const xpRes = await awardMatchXp(winner.userId, true, false);
            if (xpRes) winner.transport.send({ type: 'xp_update', ...xpRes });
            await updateSkillAfterMatch(winner.userId, winner.trophies ?? profile.trophies, {
              opponentType: 'HUMAN',
              opponentSkillMean: leaverSkill.skillMean,
              opponentSkillUncertainty: leaverSkill.skillUncertainty,
              won: true,
              scoreFor: winner.score,
              scoreAgainst: p.score,
              rounds: this.skillRoundSignals.get(winner.id) ?? [],
            }).catch((err) => log.warn('skill_update_failed', { matchId: this.matchId, userId: winner.userId, error: err instanceof Error ? err.message : String(err) }));
            recordTelemetry({
              eventName: 'match_finished',
              matchId: this.matchId,
              roomCode: this.code,
              playerId: winner.userId,
              opponentId: p.userId ?? null,
              opponentType: 'HUMAN',
              payload: {
                matchResult: 'win',
                forfeitReason: reason,
                playerSkillMean: winnerSkill.skillMean,
                opponentSkillMean: leaverSkill.skillMean,
                expectedWinProbability,
                trophyDelta: delta,
                scoreFor: winner.score,
                scoreAgainst: p.score,
                durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0,
                ...this.matchQualityPayload(winner, p),
              },
            });
          }
          if (p.userId) {
            // Terk eden mağlubiyeti: kuşanılmış kalkan varsa bu dereceli maçta
            // geçerli sayılır ve kupa kaybını emer.
            const leaverSkill = this.playerSkillFor(p);
            const winnerSkill = this.playerSkillFor(winner);
            const leaverRes = await applyMatchResult(p.userId, false, {
              leaver: true,
              opponentTrophies: winner.trophies ?? null,
              playerSkillMean: leaverSkill.skillMean,
              playerSkillUncertainty: leaverSkill.skillUncertainty,
              opponentSkillMean: winnerSkill.skillMean,
              opponentSkillUncertainty: winnerSkill.skillUncertainty,
              matchId: this.matchId,
              opponentId: winner.userId ?? null,
              opponentType: 'HUMAN',
              ledgerReason: 'human_forfeit_loss',
              ledgerMetadata: { forfeitReason: reason },
            });
            await recordOpponentHistory({ matchId: this.matchId, playerId: p.userId, opponentId: winner.userId ?? null, opponentType: 'HUMAN', winnerId: winner.userId ?? null, won: false, trophyDelta: leaverRes.delta, durationSecs: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0 });
            await awardMatchXp(p.userId, false, false); // ayrılan: mağlubiyet XP'si
            await updateSkillAfterMatch(p.userId, p.trophies ?? leaverRes.profile.trophies, {
              opponentType: 'HUMAN',
              opponentSkillMean: winnerSkill.skillMean,
              opponentSkillUncertainty: winnerSkill.skillUncertainty,
              won: false,
              scoreFor: p.score,
              scoreAgainst: winner.score,
              rounds: this.skillRoundSignals.get(p.id) ?? [],
            }).catch((err) => log.warn('skill_update_failed', { matchId: this.matchId, userId: p.userId, error: err instanceof Error ? err.message : String(err) }));
            // Bilinçli çıkışta istemci soketi ~1.2sn açık tutar: kupa düşüşü
            // (delta<0) ana menüde animasyonla gösterilir. Soket kapandıysa
            // sessizce düşer — sonraki girişte profil zaten günceldir.
            try {
              p.transport.send({ type: 'trophy_update', trophies: leaverRes.profile.trophies, delta: leaverRes.delta, arena: leaverRes.profile.arena, diamonds: leaverRes.profile.diamonds, highestArenaRewarded: leaverRes.profile.highestArenaRewarded, shielded: leaverRes.shielded, winStreak: leaverRes.profile.winStreak, bestStreak: leaverRes.profile.bestStreak, lostStreak: leaverRes.profile.lostStreak });
            } catch { /* socket gone */ }
            recordTelemetry({
              eventName: 'match_finished',
              matchId: this.matchId,
              roomCode: this.code,
              playerId: p.userId,
              opponentId: winner.userId ?? null,
              opponentType: 'HUMAN',
              payload: {
                matchResult: 'loss',
                forfeitReason: reason,
                playerSkillMean: leaverSkill.skillMean,
                opponentSkillMean: winnerSkill.skillMean,
                expectedWinProbability: leaverRes.expectedWinProbability,
                trophyDelta: leaverRes.delta,
                scoreFor: p.score,
                scoreAgainst: winner.score,
                durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0,
                ...this.matchQualityPayload(p, winner),
              },
            });
          }
          log.info('match_completed', { matchId: this.matchId, opponentType: 'HUMAN', result: reason === 'cheat' ? 'cheat_forfeit' : 'forfeit', forfeitReason: reason, durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0 });
          await this.saveForfeitHistory(p, winner, true);
        } catch (err) {
          log.error('settlement_error', { matchId: this.matchId, reason: 'human_forfeit', error: err instanceof Error ? err.message : String(err) });
        }
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
    this.matchId = this.nextMatchId ?? randomUUID();
    this.nextMatchId = null;
    this.settlementStarted = false;
    this.matchTelemetryClosed = false;
    this.roundNumber = 0;
    this.matchRounds = [];
    this.skillRoundSignals.clear();
    this.lastTrophyDeltaByUser.clear();
    this.usedClubIds.clear();
    this.usedCountries.clear();
    this.recentBotPicks = [];
    this.matchStartedAt = Date.now(); // maç süresi ölçümü (admin istatistikleri)
    for (const p of this.players.values()) { p.score = 0; p.wrongCount = 0; }
    const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
    const bot = [...this.players.values()].find((p) => p.transport.isBot);
    for (const p of this.players.values()) {
      recordTelemetry({
        eventName: 'match_started',
        matchId: this.matchId,
        roomCode: this.code,
        playerId: p.userId ?? null,
        opponentType: hasBot ? 'BOT' : 'HUMAN',
        payload: {
          opponentType: hasBot ? 'BOT' : 'HUMAN',
          playerSkillMean: p.skillMean,
          playerSkillUncertainty: p.skillUncertainty,
          playerTrophies: p.trophies,
          gameMode: this.gameMode,
          botProfileId: bot?.transport.botProfileId,
          botArchetype: bot?.transport.botArchetype,
          botSkill: bot?.transport.botSkill,
          botSkillMean: bot?.transport.botSkillMean,
          botCompetitiveState: stringOrNull(bot?.transport.getBotDifficultyDirector?.()?.competitiveState),
          botCompetitiveEnjoymentScore: finiteNumber(bot?.transport.getBotDifficultyDirector?.()?.competitiveEnjoymentScore),
          botFrustrationRiskScore: finiteNumber(bot?.transport.getBotDifficultyDirector?.()?.frustrationRiskScore),
        },
      });
    }
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

  private shouldLockUsedForRound(result: RoundResult): boolean {
    if (this.gameMode === 'player-player') return false;
    // Only a direct double-pass on a truly empty crossover stays reusable.
    if (result.reason !== 'passed') return true;
    if ((this.round?.wrongAttempts?.size ?? 0) > 0) return true;
    return result.commonPlayers.length > 0;
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
    this.round.guessStartedAt = Date.now();
    this.round.guessEndsAt = endsAt;
    this.broadcast({ type: 'guess_phase', endsAt });
    void this.ensureRoundQuestion().then((question) => {
      if (!question || !this.round || this.round.finished) return;
      recordTelemetry({
        eventName: 'round_started',
        matchId: this.matchId,
        roomCode: this.code,
        opponentType: [...this.players.values()].some((p) => p.transport.isBot) ? 'BOT' : 'HUMAN',
        payload: {
          roundNumber: this.roundNumber + 1,
          gameMode: this.gameMode,
          questionKey: question.questionKey,
          questionDifficulty: question.difficultyScore,
          validAnswerCount: question.validAnswerCount,
          answerPopularity: question.answerPopularity,
        },
      });
    }).catch((err) => log.warn('question_difficulty_failed', { room: this.code, matchId: this.matchId, error: err instanceof Error ? err.message : String(err) }));
    const t = setTimeout(() => this.endRoundTimeout(), GUESS_MS);
    this.timers.push(t);
  }

  private async ensureRoundQuestion(): Promise<QuestionDifficultyEstimate | null> {
    if (!this.round?.teamA || !this.round.teamB) return null;
    if (this.round.question) return this.round.question;
    const extra = this.gameMode === 'country-team' ? this.round.countryPick : this.gameMode === 'letter-team' ? this.round.letterPick : null;
    const q = await getQuestionDifficulty(this.gameMode, this.round.teamA.id, this.round.teamB.id, extra ?? null);
    if (this.round?.teamA?.id === q.teamAId || this.round?.teamA) this.round.question = q;
    return q;
  }

  // Turu yeniden açtıktan sonra, 'wrongopen' BİLMEYEN istemcileri taze bir
  // guess_phase ile yeniden senkronlar.
  //
  // NEDEN (kullanıcı raporu 2026-08-13: "bazen çalışıyor bazen çalışmıyor"):
  // Kural eskiden RAKİBİN istemcisi wrong_guess'i anlıyorsa açılıyordu; eski
  // sürümlü biriyle eşleşince sessizce kapanıyordu. Oyuncu açısından bu, kendi
  // yaptığı bir şeye değil KİMİNLE eşleştiğine bağlı olduğu için rastgele
  // görünüyordu. Artık kural HERKESTE açık: eski istemci wrong_guess'i
  // anlamasa da guess_phase'i anlar (ilk günden beri protokolde) ve o mesaj
  // `locked`ı temizleyip girişi yeniden açar. Aynı tur, aynı bitiş anı.
  //
  // Yalnız hâlâ hakkı olanlara gönderilir: yanmış oyuncular ve ceza penceresindeki
  // RAKİPLER hariç — onların kilitli kalması DOĞRU. CAPS'SİZ YAZAN DAHİL edilir:
  // ikinci hakkı server-authoritative'tir (kullanıcı raporu 2026-08-19) ve eski
  // istemcinin arayüzünü yeniden açması için guess_phase'e ihtiyacı vardır.
  // Güncel istemcilere gönderilmez: onlar wrong_guess'i zaten işliyor ve
  // guess_phase, gösterdikleri "rakip yanlış yazdı" ipucunu/ceza sayacını sıfırlardı.
  private resyncLegacyClientsAfterWrong(guesserId: string): void {
    const endsAt = this.round?.guessEndsAt;
    if (!endsAt) return;
    const now = Date.now();
    for (const p of this.players.values()) {
      if (p.transport.isBot) continue;
      if (this.round?.burned?.has(p.id)) continue;
      // Ceza (wrongretry cooldown) penceresindeki RAKİP oyuncuya GÖNDERİLMEZ:
      // guess_phase sayacı sıfırlar, ona "yazabilirsin" görüntüsü verirdi;
      // sunucu yine reddederdi ama yanıltıcı olurdu. YAZAN oyuncu bu kuralın
      // DIŞINDADIR: o az önce yeni hak kazanmıştır ve eski istemci arayüzünü
      // yeniden açmak için guess_phase'e ihtiyaç duyar (wrong_guess'i anlamaz).
      const retryAt = this.round?.wrongRetryAt?.get(p.id);
      if (p.id !== guesserId && retryAt != null && now < retryAt) continue;
      // wrongopen anlayan istemciler wrong_guess'i zaten işliyor; guess_phase,
      // gösterdikleri "rakip yanlış yazdı" ipucunu/ceza sayacını sıfırlardı.
      if (p.transport.caps?.includes('wrongopen')) continue;
      p.transport.send({ type: 'guess_phase', endsAt });
    }
  }

  private handleGuess(playerId: string, text: string): void {
    if (this.status !== 'guess' || !this.round || this.round.finished) return;
    if (this.round.pendingGuesses?.has(playerId)) return;
    if (this.round.burned?.has(playerId)) {
      this.players.get(playerId)?.transport.send({ type: 'guess_denied', reason: 'burned' });
      return;
    }
    // İkinci hakkın 5 sn cezası dolmadan gelen deneme SUNUCUDA reddedilir —
    // arayüz kilidi istemcide olsa da kural buradan geçer (hile korumalı).
    const retryAt = this.round.wrongRetryAt?.get(playerId);
    if (retryAt != null && Date.now() < retryAt) {
      this.players.get(playerId)?.transport.send({ type: 'guess_denied', reason: 'cooldown' });
      return;
    }
    if (this.round.passedBy?.has(playerId)) return; // you already passed this round
    (this.round.pendingGuesses ??= new Set()).add(playerId);
    void this.evaluate(playerId, text);
  }

  // Yanlış cevap sonrası turu yeniden açar: yazan susturulur, kilit kalkar,
  // kalan süre için zamanlayıcı yeniden kurulur.
  //   'open'       → tur açık kaldı, rakip deneyebilir (sonuç YAYINLANMAZ)
  //   'all_burned' → herkes yandı, tur 'all_wrong' ile bitirilmeli
  //   'closed'     → kural kapalı / süre dibi — eski davranış (tur biter)
  private reopenAfterWrong(playerId: string, guess: string): 'open' | 'all_burned' | 'closed' {
    if (!this.round) return 'closed';
    const p = this.players.get(playerId);
    const remaining = (this.round.guessEndsAt ?? 0) - Date.now();
    // Süre dibindeyse (rakibe gerçekçi bir şans kalmadıysa) eski davranış kalsın.
    // Not: artık istemci sürümüne BAKILMAZ — eski istemciler aşağıda taze bir
    // guess_phase ile senkronlanır (bkz. resyncLegacyClientsAfterWrong).
    if (remaining < 2_000) return 'closed';
    // İKİNCİ HAK (kullanıcı kuralı 2026-08-11): İLK yanlışta oyuncu yanmaz —
    // WRONG_RETRY_MS ceza penceresi sonrası bir hakkı daha olur. Şartlar:
    // bot değildir (bot ikinci kez denemez) ve sürede cezadan sonra gerçekçi
    // pay vardır. İstemci SÜRÜMÜNE BAKILMAZ: hak server-authoritative'dir —
    // eski/caps'siz bir istemci de aynı hakkı alır (kullanıcı raporu 2026-08-19:
    // yanlış cevap sonrası "aksiyon yok" tuzağı, kuralın caps'e bağlı olmasından
    // doğuyordu; bu yüzden davranış telefona/build'e göre değişiyordu). Eski
    // istemcinin arayüzü resyncLegacyClientsAfterWrong ile taze guess_phase
    // alarak yeniden açılır. İkinci yanlış — ya da şartlar tutmayan ilk yanlış
    // (bot / süre dibi) — kesin susturur (eski kural).
    const firstWrong = !this.round.wrongRetryAt?.has(playerId);
    const canRetry = firstWrong
      && !p?.transport.isBot
      && remaining > WRONG_RETRY_MS + 1_500;
    let retryAt: number | undefined;
    if (canRetry) {
      retryAt = Date.now() + WRONG_RETRY_MS;
      (this.round.wrongRetryAt ??= new Map()).set(playerId, retryAt);
    } else {
      (this.round.burned ??= new Set()).add(playerId);
    }
    this.round.pendingGuesses?.delete(playerId);
    const wrongs = this.round.wrongAttempts ??= new Map();
    wrongs.set(playerId, (wrongs.get(playerId) ?? 0) + 1);
    this.broadcast({
      type: 'wrong_guess',
      byId: playerId,
      byName: p?.name ?? '',
      guess: '',
      wrongCount: p?.wrongCount ?? 0,
      retryAt,
    });
    const responseTimeMs = this.round.guessStartedAt ? Math.max(0, Date.now() - this.round.guessStartedAt) : null;
    recordTelemetry({
      eventName: 'player_answered',
      matchId: this.matchId,
      roomCode: this.code,
      playerId: p?.userId ?? null,
      opponentType: p?.transport.isBot ? 'BOT' : 'HUMAN',
      payload: {
        actorType: p?.transport.isBot ? 'BOT' : 'HUMAN',
        matchOpponentType: [...this.players.values()].some((x) => x.transport.isBot) ? 'BOT' : 'HUMAN',
        questionKey: this.round.question?.questionKey,
        responseTimeMs,
        correct: false,
        guess,
        cognitiveState: p?.transport.getLastCognitiveState?.() ?? undefined,
        matchScore: this.scorePayload(),
      },
    });
    if ((this.round.burned?.size ?? 0) >= this.players.size) return 'all_burned';
    // Eski istemciler wrong_guess'i yok sayar ve guess_locked yüzünden kilitli
    // kalırdı — taze guess_phase onları aynı turda yeniden açar.
    this.resyncLegacyClientsAfterWrong(playerId);
    return 'open';
  }

  // A player passes. If every player passes, the round is voided (no points)
  // and play moves on to a fresh team pick.
  private handlePass(playerId: string): void {
    if (this.status !== 'guess' || !this.round || this.round.finished) return;
    if (this.round.pendingGuesses?.has(playerId)) return;
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
    const round = this.round;

    // ---- player-player mode: guess is a club name ----
    if (this.gameMode === 'player-player' && this.round.playerAPick && this.round.playerBPick) {
      const ppv = await verifyPlayerPlayerGuess(this.round.playerAPick.id, this.round.playerBPick.id, text);
      const clubs = await commonClubs(this.round.playerAPick.id, this.round.playerBPick.id, 5);
      const common: { name: string; imageUrl: string | null }[] = clubs.map((c) => ({ name: c.name, imageUrl: c.logoUrl }));

      if (this.round !== round || !this.round || this.round.finished) return;
      this.round.pendingGuesses?.delete(playerId);

      const p = this.players.get(playerId);
      if (ppv.correct && p) {
        p.score += 1;
      } else if (!ppv.correct && p) {
        // İkinci-hak (retry) yanlışı toplam yanlış sayacına işlenmez.
        const isRetryWrong = this.round.wrongRetryAt?.has(playerId) ?? false;
        if (!isRetryWrong) p.wrongCount += 1;
        // wrongopen: yanlış turu yakmaz — yazan susturulur, rakip devam eder.
        const r = this.reopenAfterWrong(playerId, text);
        if (r === 'open') return;
        if (r === 'all_burned') {
          this.finishRound({
            correct: false, reason: 'all_wrong', autocorrected: false,
            answeredById: null, answeredByName: null, guess: '',
            teamA: this.round.teamA, teamB: this.round.teamB,
            matchedPlayerName: null, matchedPlayerImageUrl: null,
            spellsA: [], spellsB: [], allClubs: [], commonPlayers: common,
          });
          return;
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

    if (this.round !== round || !this.round || this.round.finished) return;
    this.round.pendingGuesses?.delete(playerId);

    const p = this.players.get(playerId);
    if (v.correct && p) {
      p.score += 1;
    } else if (!v.correct && p) {
      // Retry yanlışı toplam yanlış sayacına işlenmez.
      const isRetryWrong = this.round.wrongRetryAt?.has(playerId) ?? false;
      if (!isRetryWrong) p.wrongCount += 1;
      // wrongopen: yanlış turu yakmaz — yazan susturulur, rakip devam eder.
      const r = this.reopenAfterWrong(playerId, text);
      if (r === 'open') return;
      if (r === 'all_burned') {
        this.finishRound({
          correct: false, reason: 'all_wrong', autocorrected: false,
          answeredById: null, answeredByName: null, guess: '',
          teamA: v.teamA, teamB: v.teamB,
          matchedPlayerName: null, matchedPlayerImageUrl: null,
          spellsA: [], spellsB: [], allClubs: [], commonPlayers: common,
        });
        return;
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
    const question = this.round.question;
    const answeredBy = result.answeredById ? this.players.get(result.answeredById) : undefined;
    const responseTimeMs = result.answeredById && this.round.guessStartedAt ? Math.max(0, Date.now() - this.round.guessStartedAt) : null;
    this.round.finished = true;
    this.clearTimers();
    this.status = 'result';
    if (this.shouldLockUsedForRound(result)) this.markUsedForRound();
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

    this.recordRoundOutcome(result, question ?? null, answeredBy ?? null, responseTimeMs);

    if (!this.matchOver) {
      // One 10s countdown shown immediately (10 → 0). At 0 the next round starts
      // automatically; if both players press "Hazır" sooner, it advances right away.
      this.readyPlayers = new Set();
      const endsAt = Date.now() + INTER_ROUND_MS;
      this.broadcast({ type: 'waiting_ready' });
      this.broadcast({ type: 'ready_countdown', endsAt });
      const t = setTimeout(() => {
        if (this.status === 'result' && !this.matchOver) this.beginCountdown();
      }, INTER_ROUND_MS);
      this.timers.push(t);
    } else {
      const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
      if (!hasBot || this.rankedBotRewards) {
        if (this.ranked) void this.settleMatch(winner!, hasBot ? 'bot_match_complete' : 'match_complete');
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
          opp.userId ?? null, opp.name, oppUser?.trophies ?? opp.trophies ?? 0,
          p.score, opp.score,
          p.score > opp.score,
          this.gameMode,
          [...myRounds, ...oppRounds],
          this.matchStartedAt ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000)) : 0,
          this.countsForProfileStats(),
        );
      } catch { /* DB error — skip silently */ }
    }
  }

  private countsForProfileStats(): boolean {
    const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
    return this.ranked && (!hasBot || this.rankedBotRewards);
  }

  private async saveForfeitHistory(leaver: Player, opponent: Player | undefined, saveOpponentRow: boolean): Promise<void> {
    if (!opponent || !this.countsForProfileStats()) return;
    const duration = this.matchStartedAt ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000)) : 0;
    const rounds = this.matchRounds.map((r) => ({
      teamA: r.teamA, teamALogo: r.teamALogo,
      teamB: r.teamB, teamBLogo: r.teamBLogo,
      player: r.player, playerImageUrl: r.playerImageUrl,
      answeredBy: r.answeredBy,
      mode: r.mode, country: r.country, letter: r.letter,
    }));
    try {
      const leaverUser = leaver.userId ? await getUser(leaver.userId) : null;
      const opponentUser = opponent.userId ? await getUser(opponent.userId) : null;
      if (leaver.userId && !leaver.transport.isBot) {
        await saveMatchHistory(
          leaver.userId, leaver.name, leaverUser?.trophies ?? 0,
          opponent.userId ?? null, opponent.name, opponentUser?.trophies ?? opponent.trophies ?? 0,
          leaver.score, WIN_TARGET,
          false,
          this.gameMode,
          rounds,
          duration,
          true,
        );
      }
      if (saveOpponentRow && opponent.userId && !opponent.transport.isBot) {
        await saveMatchHistory(
          opponent.userId, opponent.name, opponentUser?.trophies ?? 0,
          leaver.userId ?? null, leaver.name, leaverUser?.trophies ?? leaver.trophies ?? 0,
          WIN_TARGET, leaver.score,
          true,
          this.gameMode,
          rounds,
          duration,
          true,
        );
      }
    } catch (err) {
      log.warn('match_history_forfeit_failed', { matchId: this.matchId, room: this.code, error: err instanceof Error ? err.message : String(err) });
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
  private async settleMatch(winner: Player, reason: string): Promise<void> {
    if (!(await this.claimSettlement(reason))) return;
    await this.updateTrophies(winner);
  }

  private async updateTrophies(winner: Player): Promise<void> {
    const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
    const bot = [...this.players.values()].find((p) => p.transport.isBot);
    const trophyDeltas: { userId: string; delta: number; expectedWinProbability?: number }[] = [];
    for (const p of this.players.values()) {
      if (p.transport.isBot || !p.userId) continue;
      const won = p.id === winner.id;
      // Rakibin MAÇ BAŞI kupası: dinamik delta (CR usulü) farka göre hesaplanır.
      const opp = [...this.players.values()].find((x) => x.id !== p.id);
      try {
        const playerSkill = this.playerSkillFor(p);
        const opponentSkill = this.playerSkillFor(opp);
        const opponentType = hasBot ? 'BOT' : 'HUMAN';
        const durationSecs = this.matchStartedAt ? Math.max(0, Math.round((Date.now() - this.matchStartedAt) / 1000)) : 0;
        const [farmRisk, economy] = await Promise.all([
          assessFarmRisk({ playerId: p.userId, opponentId: opp?.userId ?? null, opponentType, playerWon: won }).catch((err) => {
            log.warn('farm_risk_settlement_failed', { matchId: this.matchId, userId: p.userId, error: err instanceof Error ? err.message : String(err) });
            return { score: 0, level: 'LOW' as const, pairRewardMultiplier: 1, botRewardMultiplier: 1, repeatedPairCount24h: 0, botExposureCount: 0, reasons: [] };
          }),
          getTrophyEconomyState().catch((err) => {
            log.warn('economy_state_failed', { matchId: this.matchId, error: err instanceof Error ? err.message : String(err) });
            return { state: 'HEALTHY' as const, botInjectionToday: 0, trophiesCreatedToday: 0, trophiesDestroyedToday: 0, dailyInflation: 0, botBudgetRemaining: 0, botRewardMultiplier: 1 };
          }),
        ]);
        const multipliers = trophyRiskMultipliers({ opponentType, farm: farmRisk, economy });
        const { profile, delta, arenaReward, shielded, expectedWinProbability } = await applyMatchResult(p.userId, won, {
          opponentTrophies: opp?.trophies ?? null,
          playerSkillMean: playerSkill.skillMean,
          playerSkillUncertainty: playerSkill.skillUncertainty,
          opponentSkillMean: opponentSkill.skillMean,
          opponentSkillUncertainty: opponentSkill.skillUncertainty,
          matchId: this.matchId,
          opponentId: opp?.userId ?? null,
          opponentRef: opp?.transport.isBot ? opp.name : null,
          opponentType,
          antiFarmMultiplier: multipliers.antiFarmMultiplier,
          botEconomyMultiplier: multipliers.botEconomyMultiplier,
          farmRiskScore: farmRisk.score,
          farmRiskLevel: farmRisk.level,
          economyState: economy.state,
          ledgerMetadata: {
            reasons: multipliers.reasons,
            scoreFor: p.score,
            scoreAgainst: opp?.score ?? 0,
            gameMode: this.gameMode,
          },
        });
        await recordOpponentHistory({
          matchId: this.matchId,
          playerId: p.userId,
          opponentId: opp?.userId ?? null,
          opponentType,
          winnerId: winner.userId ?? null,
          won,
          trophyDelta: delta,
          durationSecs,
          answerPattern: this.answerPatternFor(p, opp),
        });
        trophyDeltas.push({ userId: p.userId, delta, expectedWinProbability });
        this.lastTrophyDeltaByUser.set(p.userId, delta);
        p.transport.send({
          type: 'trophy_update',
          trophies: profile.trophies,
          delta,
          arena: profile.arena,
          diamonds: profile.diamonds,
          arenaReward,
          highestArenaRewarded: profile.highestArenaRewarded,
          shielded,
          winStreak: profile.winStreak,
          bestStreak: profile.bestStreak,
          lostStreak: profile.lostStreak,
        });
        // Seviye XP'si — kupadan bağımsız, kaybeden de kazanır
        const xpRes = await awardMatchXp(p.userId, won, false);
        if (xpRes) p.transport.send({ type: 'xp_update', ...xpRes });
        const updatedSkill = await updateSkillAfterMatch(p.userId, p.trophies ?? profile.trophies, {
          opponentType: hasBot ? 'BOT' : 'HUMAN',
          opponentSkillMean: opponentSkill.skillMean,
          opponentSkillUncertainty: opponentSkill.skillUncertainty,
          won,
          scoreFor: p.score,
          scoreAgainst: opp?.score ?? 0,
          rounds: this.skillRoundSignals.get(p.id) ?? [],
        });
        p.skillMean = updatedSkill.skillMean;
        p.skillUncertainty = updatedSkill.skillUncertainty;
        p.skillMatchesPlayed = updatedSkill.matchesPlayed;
      } catch (err) {
        log.error('settlement_error', { matchId: this.matchId, userId: p.userId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const matchResult = hasBot ? (winner.transport.isBot ? 'loss' : 'win') : 'completed';
    log.info('match_completed', {
      matchId: this.matchId,
      opponentType: hasBot ? 'BOT' : 'HUMAN',
      result: matchResult,
      matchResult,
      durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0,
      botArchetype: bot?.transport.botArchetype,
      botSkill: bot?.transport.botSkill,
    });
    this.recordMatchFinishedTelemetry(winner, hasBot, trophyDeltas);
  }

  private playerSkillFor(p: Player | undefined): { skillMean: number; skillUncertainty: number; matchesPlayed: number } {
    if (!p) return { skillMean: 1000, skillUncertainty: 240, matchesPlayed: 0 };
    if (p.transport.isBot) {
      return {
        skillMean: p.transport.botSkillMean ?? Math.round(760 + (p.transport.botSkill ?? 0.5) * 920),
        skillUncertainty: p.transport.botSkillUncertainty ?? 120,
        matchesPlayed: 100,
      };
    }
    if (typeof p.skillMean === 'number') {
      return { skillMean: p.skillMean, skillUncertainty: p.skillUncertainty ?? 220, matchesPlayed: p.skillMatchesPlayed ?? 0 };
    }
    const fallback = defaultSkillProfile(p.userId ?? p.id, p.trophies ?? 0);
    return { skillMean: fallback.skillMean, skillUncertainty: fallback.skillUncertainty, matchesPlayed: 0 };
  }

  private answerPatternFor(player: Player, opponent: Player | undefined): Record<string, unknown> {
    const signals = this.skillRoundSignals.get(player.id) ?? [];
    const responseTimes = signals.map((s) => s.responseTimeMs).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const avgResponse = responseTimes.length ? Math.round(responseTimes.reduce((sum, n) => sum + n, 0) / responseTimes.length) : null;
    return {
      rounds: signals.length,
      answered: signals.filter((s) => s.answered).length,
      correct: signals.filter((s) => s.correct).length,
      mistakes: signals.filter((s) => s.mistake).length,
      timeouts: signals.filter((s) => s.timedOut).length,
      avgResponseTimeMs: avgResponse,
      scoreFor: player.score,
      scoreAgainst: opponent?.score ?? 0,
      scoreDifference: player.score - (opponent?.score ?? 0),
      closeMatch: Math.abs(player.score - (opponent?.score ?? 0)) <= 1,
      blowout: Math.abs(player.score - (opponent?.score ?? 0)) >= 3,
      opponentIsBot: opponent?.transport.isBot ?? false,
      botSkill: opponent?.transport.botSkill ?? null,
      botSkillMean: opponent?.transport.botSkillMean ?? null,
      gameMode: this.gameMode,
    };
  }

  private matchQualityPayload(player: Player, opponent: Player | undefined): Record<string, unknown> {
    const scoreAgainst = opponent?.score ?? 0;
    const scoreMargin = player.score - scoreAgainst;
    const absMargin = Math.abs(scoreMargin);
    const competitiveQualityScore = Math.max(0, Math.min(1, 1 - Math.max(0, absMargin - 1) / Math.max(1, WIN_TARGET - 1)));
    const director = opponent?.transport.isBot ? opponent.transport.getBotDifficultyDirector?.() ?? null : null;
    return {
      scoreMargin,
      closeMatch: absMargin <= 1,
      blowout: absMargin >= WIN_TARGET,
      competitiveQualityScore: Number(competitiveQualityScore.toFixed(4)),
      botCompetitiveState: stringOrNull(director?.competitiveState),
      botCompetitiveEnjoymentScore: finiteNumber(director?.competitiveEnjoymentScore),
      botFrustrationRiskScore: finiteNumber(director?.frustrationRiskScore),
      botMomentumScore: finiteNumber(director?.momentumScore),
      botBlowoutRisk: finiteNumber(director?.blowoutRisk),
      botTargetCompetitiveProbability: finiteNumber(director?.targetCompetitiveProbability),
    };
  }

  private recordMatchFinishedTelemetry(winner: Player, hasBot: boolean, deltas: { userId: string; delta: number; expectedWinProbability?: number }[]): void {
    if (this.matchTelemetryClosed) return;
    this.matchTelemetryClosed = true;
    const players = [...this.players.values()];
    for (const p of players) {
      if (p.transport.isBot || !p.userId) continue;
      const opp = players.find((x) => x.id !== p.id);
      const d = deltas.find((x) => x.userId === p.userId);
      recordTelemetry({
        eventName: 'match_finished',
        matchId: this.matchId,
        roomCode: this.code,
        playerId: p.userId,
        opponentId: opp?.userId ?? null,
        opponentType: hasBot ? 'BOT' : 'HUMAN',
        payload: {
          matchResult: p.id === winner.id ? 'win' : 'loss',
          opponentType: hasBot ? 'BOT' : 'HUMAN',
          playerSkillMean: p.skillMean,
          playerSkillUncertainty: p.skillUncertainty,
          opponentSkillMean: this.playerSkillFor(opp).skillMean,
          botSkill: opp?.transport.botSkill,
          playerTrophies: p.trophies,
          opponentTrophies: opp?.trophies,
          expectedWinProbability: d?.expectedWinProbability,
          trophyDelta: d?.delta,
          scoreFor: p.score,
          scoreAgainst: opp?.score ?? 0,
          durationSec: this.matchStartedAt ? Math.round((Date.now() - this.matchStartedAt) / 1000) : 0,
          gameMode: this.gameMode,
          ...this.matchQualityPayload(p, opp),
        },
      });
    }
  }

  private recordRoundOutcome(
    result: RoundResult,
    question: QuestionDifficultyEstimate | null,
    answeredBy: Player | null,
    responseTimeMs: number | null,
  ): void {
    if (!this.round) return;
    const hasBot = [...this.players.values()].some((p) => p.transport.isBot);
    const botPlayer = [...this.players.values()].find((p) => p.transport.isBot) ?? null;
    const botDecision = botPlayer?.transport.getLastDecision?.() as Record<string, unknown> | null | undefined;
    const recorded = this.round.skillSignalRecorded ??= new Set<string>();
    for (const p of this.players.values()) {
      const playerAnswered = result.answeredById === p.id;
      const timedOut = result.reason === 'timeout' && !result.answeredById;
      const correct = playerAnswered && result.correct;
      const mistake = playerAnswered && !result.correct;
      const signal: SkillRoundSignal = {
        difficultyScore: question?.difficultyScore ?? p.transport.getLastQuestionDifficultyScore?.() ?? 0.5,
        correct,
        answered: playerAnswered,
        responseTimeMs: playerAnswered ? responseTimeMs : null,
        timedOut,
        mistake: mistake || (this.round.wrongAttempts?.has(p.id) ?? false),
        mode: this.gameMode,
        answerPopularity: question?.answerPopularity,
      };
      if (!p.transport.isBot && p.userId) {
        const list = this.skillRoundSignals.get(p.id) ?? [];
        list.push(signal);
        this.skillRoundSignals.set(p.id, list);
      }
      if (question && !recorded.has(`${question.questionKey}:${p.id}`)) {
        recorded.add(`${question.questionKey}:${p.id}`);
        void recordQuestionOutcome({
          questionKey: question.questionKey,
          mode: this.gameMode,
          teamAId: question.teamAId,
          teamBId: question.teamBId,
          extraKey: question.extraKey,
          opponentType: p.transport.isBot ? 'BOT' : 'HUMAN',
          answered: playerAnswered,
          correct,
          timedOut,
          responseTimeMs: playerAnswered ? responseTimeMs : null,
          playerSkillMean: p.skillMean ?? null,
        }).catch((err) => log.warn('question_outcome_failed', { room: this.code, error: err instanceof Error ? err.message : String(err) }));
      }
    }
    if (answeredBy) {
      recordTelemetry({
        eventName: 'player_answered',
        matchId: this.matchId,
        roomCode: this.code,
        playerId: answeredBy.userId ?? null,
        opponentType: answeredBy.transport.isBot ? 'BOT' : 'HUMAN',
        payload: {
          actorType: answeredBy.transport.isBot ? 'BOT' : 'HUMAN',
          matchOpponentType: hasBot ? 'BOT' : 'HUMAN',
          questionKey: question?.questionKey,
          questionDifficulty: question?.difficultyScore,
          responseTimeMs,
          correct: result.correct,
          botCognitiveState: answeredBy.transport.getLastCognitiveState?.() ?? undefined,
          matchScore: this.scorePayload(),
        },
      });
      if (answeredBy.transport.isBot) {
        recordTelemetry({
          eventName: 'bot_decision_created',
          matchId: this.matchId,
          roomCode: this.code,
          opponentType: 'BOT',
          payload: {
            questionKey: question?.questionKey,
            botSkill: answeredBy.transport.botSkill,
            botSkillMean: answeredBy.transport.botSkillMean,
            botCognitiveState: answeredBy.transport.getLastCognitiveState?.() ?? undefined,
            chosenReactionDelay: answeredBy.transport.getLastGuessDelayMs?.(),
            decision: answeredBy.transport.getLastDecision?.(),
          },
        });
      }
    }
    recordTelemetry({
      eventName: 'round_finished',
      matchId: this.matchId,
      roomCode: this.code,
      opponentType: hasBot ? 'BOT' : 'HUMAN',
      payload: {
        questionKey: question?.questionKey,
        questionDifficulty: question?.difficultyScore,
        answeredById: result.answeredById,
        answeredByBot: answeredBy?.transport.isBot ?? false,
        correct: result.correct,
        reason: result.reason,
        responseTimeMs,
        score: this.scorePayload(),
      },
    });
    if (hasBot) {
      recordBotRoundOutcome({
        matchId: this.matchId,
        roomCode: this.code,
        roundNumber: this.roundNumber,
        gameMode: this.gameMode,
        questionKey: question?.questionKey,
        questionDifficulty: question?.difficultyScore,
        answerPopularity: question?.answerPopularity,
        validAnswerCount: question?.validAnswerCount,
        botId: botPlayer?.transport.botProfileId ?? null,
        botSkill: botPlayer?.transport.botSkill ?? null,
        botSkillMean: botPlayer?.transport.botSkillMean ?? null,
        decision: botDecision ?? null,
        answeredByBot: answeredBy?.transport.isBot ?? false,
        answeredByHuman: Boolean(answeredBy && !answeredBy.transport.isBot),
        correct: result.correct,
        reason: result.reason,
        responseTimeMs,
        score: this.scorePayload(),
      });
    }
  }

  private scorePayload(): { players: { name: string; score: number; isBot: boolean }[] } {
    return { players: [...this.players.values()].map((p) => ({ name: p.name, score: p.score, isBot: p.transport.isBot })) };
  }

  private async claimSettlement(reason: string): Promise<boolean> {
    if (this.settlementStarted) {
      log.warn('duplicate_settlement_prevented', { matchId: this.matchId, reason, room: this.code });
      return false;
    }
    this.settlementStarted = true;
    try {
      await pool.query(
        `INSERT INTO match_settlements(match_id, room_code, reason) VALUES($1, $2, $3)`,
        [this.matchId, this.code, reason],
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23505') {
        log.warn('duplicate_settlement_prevented', { matchId: this.matchId, reason, room: this.code, source: 'db' });
        return false;
      }
      // Backward-compatible deploy safety: if the additive migration was not run
      // yet, keep the in-memory guard active rather than blocking live matches.
      if (code !== '42P01') throw err;
      log.warn('settlement_table_missing', { matchId: this.matchId, room: this.code });
    }
    log.info('match_settlement_started', { matchId: this.matchId, reason, room: this.code, ranked: this.ranked, rankedBotRewards: this.rankedBotRewards });
    return true;
  }

  // ---- rematch ----
  private requestRematch(playerId: string): void {
    if (this.status !== 'result' || !this.matchOver) return;
    if (this.rematchBy && this.rematchBy !== playerId) {
      const p = this.players.get(playerId);
      recordTelemetry({ eventName: 'rematch_accepted', matchId: this.matchId, roomCode: this.code, playerId: p?.userId ?? null, opponentType: [...this.players.values()].some((x) => x.transport.isBot) ? 'BOT' : 'HUMAN' });
      return this.startMatch();
    }
    this.rematchBy = playerId;
    const p = this.players.get(playerId);
    this.sendTo(playerId, { type: 'rematch_waiting' });
    recordTelemetry({ eventName: 'rematch_offered', matchId: this.matchId, roomCode: this.code, playerId: p?.userId ?? null, opponentType: [...this.players.values()].some((x) => x.transport.isBot) ? 'BOT' : 'HUMAN' });
    for (const [id, other] of this.players) {
      if (id === playerId) continue;
      other.transport.send({ type: 'rematch_requested', byId: playerId, byName: p?.name ?? '' });
    }
  }

  private respondRematch(playerId: string, accept: boolean): void {
    if (!this.rematchBy || this.rematchBy === playerId) return;
    if (accept) {
      const p = this.players.get(playerId);
      recordTelemetry({ eventName: 'rematch_accepted', matchId: this.matchId, roomCode: this.code, playerId: p?.userId ?? null, opponentType: [...this.players.values()].some((x) => x.transport.isBot) ? 'BOT' : 'HUMAN' });
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
      isBot: p.transport.isBot,
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
