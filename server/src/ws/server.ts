import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { RoomManager } from '../rooms/manager.ts';
import { BotPlayer } from '../rooms/bot.ts';
import { listScopes, listNationalities } from '../game/verify.ts';
import {
  findOrCreateUser, findOrCreateUserByProvider, createGuestUser, getUser, changeDisplayName,
  grantDevEmotesIfNeeded, claimOutageGift,
  setUsername, buyEmote, setEquippedEmotes, setAvatar, setSelectedFrame, buyAvatar, touchLastSeen, getLeaderboard, grantAdReward, usePower, getModeStats, getRankedProfileStats, buyPremiumRoad, buyPower, getLeaderboardBotProfile, getBotPressureProfile,
  listFriends, listFriendRequests, sendFriendRequest, respondFriendRequest,
  removeFriend, searchUsers, getMatchHistory, deleteAccount, recordPlaySession, getArena,
  type UserProfile,
} from '../game/rank.ts';
import { verifyAppleToken, verifyGoogleToken, verifyFacebookToken } from '../game/auth.ts';
import { isFreeEmote } from '../game/emotes.ts';
import { claimLevelReward } from '../game/level.ts';
import { censorMessage } from '../game/username.ts';
import {
  blockUser, unblockUser, listBlocked, isBlockedBetween, reportContent, deleteOwnMessage, acceptTerms,
  isIdentifiedAccount,
} from '../game/moderation.ts';
import { androidIapReady, firstDiamondDoubleAvailable, verifyApplePurchase, verifyGooglePurchase } from '../game/iap.ts';
import { buyCosmetic, equipCosmetic, storeCatalog, toCosmeticLoadout } from '../game/cosmetics.ts';
import { getAdminStats } from '../game/admin.ts';
import { checkLogin, issueToken, verifyToken } from '../game/adminAuth.ts';
import { registerPushToken, sendPushToUsers, startPushCrons } from '../game/push.ts';
import { pool } from '../db/pool.ts';
import { log } from '../logger.ts';
import { config } from '../config.ts';
import { validateClientMsg } from './validateClientMsg.ts';
import { MatchmakingOrchestrator, randomBotFallbackDelayMs, shouldUseBotFallback, type HybridMatchmakingConfig, type MatchmakingState } from '../matchmaking/policy.ts';
import { selectBotProfileForSkill, type BotProfile } from '../matchmaking/botProfiles.ts';
import { defaultSkillProfile, getOrCreateSkillProfile, type SkillProfile } from '../matchmaking/skillRating.ts';
import { getTrophyVelocity } from '../matchmaking/trophyIntegrity.ts';
import { getOpponentKpis, recordTelemetry } from '../matchmaking/telemetry.ts';
import { liveOpsConfig, progressionSegment } from '../matchmaking/liveOpsConfig.ts';
import { candidateScore, estimateQueueHealth, type QueueHealth } from '../matchmaking/queueHealth.ts';
import { assessFarmRisk, recordBotExposure } from '../matchmaking/antiFarm.ts';
import { botAvailabilityMultiplier, getTrophyEconomyState } from '../matchmaking/trophyEconomy.ts';
import { recordDecisionTrace } from '../matchmaking/decisionTrace.ts';
import { botProfileSnapshot, recordBotMatchProfile } from '../matchmaking/botTelemetry.ts';
import type { Room, Transport } from '../rooms/room.ts';
import type { MessageView, ConversationView } from '../protocol.ts';
import type { ClientMsg, GameMode, ProfileView, ServerMsg } from '../protocol.ts';
import { getLiveStoreVersions, storeVersionIsNewer, type StorePlatform } from '../storeVersions.ts';
import { buyDailyOffer, computeDailyOffer, currentOfferWindow, dailyOfferClaimed } from '../game/dailyOffer.ts';
import { getDailyState, startDaily as startDailyCrossover, submitDailyGuess } from '../game/dailyCrossover.ts';
import { redeemReferral } from '../game/referrals.ts';
import { toProfileView } from '../game/profileView.ts';
import { buySpecialPower, equipSpecialPower, isSpecialPowerId } from '../game/specialPowers.ts';
import { listTournaments, getTournamentState, joinTournament, leaveTournament, pendingTournamentMatchesFor, markMatchPlaying, reportTournamentResult, tournamentMemberIds } from '../game/tournaments.ts';
import { getLeagueState } from '../game/weeklyLeague.ts';
import { getDailyCareer, guessDailyCareer } from '../game/dailyCareer.ts';
import { claimQuest, getDailyQuests } from '../game/dailyQuests.ts';

// Guideline 1.2: no anonymous posting. Any path that creates content another
// user sees requires a verified Apple/Google/Facebook identity — a guest can
// play everything, but cannot message or add friends.
const GUEST_BLOCKED_MSG = 'Mesajlaşmak için Apple veya Google ile giriş yap';
// Kural ihlali askısı (users.banned_at): banlı hesap HİÇBİR kimlik yolundan
// (register/auth/resume/oda kurma) oturum açamaz — ban yalnız DB'de bir bayrak
// olarak durmasın, bağlantı katmanında fiilen uygulansın.
const BANNED_MSG = 'Hesabın kural ihlali nedeniyle askıya alındı';
const __dirname = dirname(fileURLToPath(import.meta.url));
const adminHtml = (() => {
  try { return readFileSync(join(__dirname, '../../admin/index.html'), 'utf8'); }
  catch { return null; }
})();

function clientPlatform(value: string | null): StorePlatform | null {
  return value === 'ios' || value === 'android' ? value : null;
}

function clientBuild(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface ConnCtx {
  room: Room;
  playerId: string;
  userProfile?: UserProfile;
}

/** Build a ProfileView from a UserProfile (used in all profile-sending paths). */

function wsTransport(ws: WebSocket): Transport {
  return {
    isBot: false,
    send: (msg: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

interface QueueEntry {
  requestId?: string;
  state?: MatchmakingState;
  assigned?: boolean;
  timers?: Set<ReturnType<typeof setTimeout>>;
  fallbackAt?: number;
  botProfile?: BotProfile;
  skillProfile?: SkillProfile;
  transport: Transport;
  ws: WebSocket;
  name: string;
  userId?: string;
  userProfile?: UserProfile;
  options?: import('../protocol.ts').GameOptions;
  setCtx: (c: ConnCtx) => void;
  since: number; // kuyruğa giriş anı — bekledikçe kupa bandı genişler
  lastQueueHealth?: QueueHealth;
  lastCandidateScore?: number;
}

const SOCIAL_PACK_REQUIRED = 'Bu mod için Sosyal Paket aktif olmalı';
// Dostluk daveti GÖNDERMEK paket ister; KABUL etmek istemez (2026-08-26).
const FRIENDLY_INVITE_NEEDS_PACK = 'Dostluk maçı daveti göndermek için Sosyal Paket gerekir';
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_MESSAGES = 90;
const RATE_MAX_TYPING = 120; // separate lane: exempt-from-main-cap typing still can't flood
function hybridCfg(): HybridMatchmakingConfig {
  return config.matchmaking;
}

function sameScope(a: import('../protocol.ts').Scope | undefined, b: import('../protocol.ts').Scope | undefined): boolean {
  const aa = a ?? { type: 'all' as const };
  const bb = b ?? { type: 'all' as const };
  return aa.type === bb.type && ('value' in aa ? aa.value : '') === ('value' in bb ? bb.value : '');
}

function clearQueueTimers(entry: QueueEntry): void {
  for (const t of entry.timers ?? []) clearTimeout(t);
  entry.timers?.clear();
}

function removeQueueEntry(queue: QueueEntry[], entry: QueueEntry): void {
  const idx = queue.indexOf(entry);
  if (idx >= 0) queue.splice(idx, 1);
}

function cancelQueueEntry(queue: QueueEntry[], entry: QueueEntry, reason: string): void {
  if (entry.assigned) return;
  entry.assigned = true;
  entry.state = 'CANCELLED';
  clearQueueTimers(entry);
  removeQueueEntry(queue, entry);
  log.info('matchmaking_cancelled', { requestId: entry.requestId, userId: entry.userProfile?.id ?? entry.userId, reason, durationMs: Date.now() - entry.since });
}

function reserveQueueEntry(queue: QueueEntry[], entry: QueueEntry): boolean {
  if (entry.assigned || entry.state === 'CANCELLED' || entry.ws.readyState !== entry.ws.OPEN) return false;
  entry.assigned = true;
  entry.state = 'OPPONENT_RESERVED';
  clearQueueTimers(entry);
  removeQueueEntry(queue, entry);
  return true;
}

function remoteIp(req: import('node:http').IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]!.trim();
}

function isSocialPackMode(mode: GameMode | undefined): boolean {
  // XOX (Futbol XOX) da Sosyal Paket'e bağlı: dereceli (find_match), oda (create_room)
  // ve katılım (join_room) canUseMode üzerinden bunu kontrol eder — paketi olmayan
  // dereceli XOX oynayamaz (kullanıcı kararı 2026-08-28). Arkadaş daveti zaten ayrıca gated.
  return mode === 'country-team' || mode === 'letter-team' || mode === 'xox';
}

function hasActiveSocialPack(profile: UserProfile | undefined): boolean {
  return Boolean(profile?.socialPackUntil && new Date(profile.socialPackUntil).getTime() > Date.now());
}

function canUseMode(profile: UserProfile | undefined, mode: GameMode | undefined): boolean {
  return !isSocialPackMode(mode) || hasActiveSocialPack(profile);
}

// A friend match invite awaiting the invitee's response. Holds the inviter's
// connection bits so we can drop both players into a shared room on accept.
interface PendingInvite {
  fromUserId: string;
  toUserId: string;
  fromName: string;
  transport: Transport;
  ws: WebSocket;
  userProfile?: UserProfile;
  options?: import('../protocol.ts').GameOptions;
  setCtx: (c: ConnCtx) => void;
  timer: ReturnType<typeof setTimeout>;
}

// Track online users for real-time friend notifications.
const onlineUsers = new Map<string, Set<WebSocket>>(); // userId → all open sockets

// ---- wrongopen caps KÖPRÜSÜ ----
// Maç soketleri taze açılır ve ilk mesajları find_match/create_room/create_solo/
// join_room'dur — register buradan geçmediği için istemcinin kayıtta duyurduğu
// yetenek bayrakları maç soketine hiç ulaşmıyordu ve wrongopen kuralı dereceli
// maçlarda HİÇ açılmıyordu (yalnız presence soketini kullanan arkadaş davetleri
// çalışıyordu). Çözüm iki katman: (1) bu dört mesaj artık caps taşıyabilir,
// (2) taşımıyorsa hesabın EN SON kimlik-bildiren soketinde duyurduğu bayraklar
// buradan maç soketine kopyalanır — güncel istemciler OTA beklemeden korunur.
// Kimlik mesajı caps'siz gelirse önbellek [] ile EZİLİR: eski build'e dönen bir
// hesap yanlışlıkla "wrongopen anlıyor" sayılıp arayüzü kilitlenmesin.
const userCaps = new Map<string, string[]>(); // userId → son duyurulan caps

/** Kimlik-bildiren soket (register/guest/auth/resume): duyurulan caps'i kaydet. */
function recordCaps(transport: Transport, profileId: string): void {
  userCaps.set(profileId, transport.caps ?? []);
}

/** Bağlantı-kuran maç soketi: caps bildirmediyse hesabın son duyurusunu taşı. */
function bridgeCaps(transport: Transport, profile: UserProfile | undefined): void {
  if (!profile) return;
  if (transport.caps) { userCaps.set(profile.id, transport.caps); return; }
  const cached = userCaps.get(profile.id);
  if (cached && cached.length > 0) transport.caps = cached;
}

async function sendPendingSupportMessages(userId: string, transport: { send: (m: ServerMsg) => void }): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: string; title: string | null; body: string }>(
      'SELECT id, title, body FROM support_messages WHERE user_id = $1 AND seen = false ORDER BY created_at ASC LIMIT 5',
      [userId],
    );
    for (const r of rows) transport.send({ type: 'support_message', id: r.id, title: r.title, body: r.body });
  } catch { /* tablo yoksa / DB hatası — sessiz */ }
}

function addOnline(userId: string, ws: WebSocket): void {
  let set = onlineUsers.get(userId);
  if (!set) { set = new Set(); onlineUsers.set(userId, set); }
  set.add(ws);
  void touchLastSeen(userId);
}
function removeOnline(userId: string, ws: WebSocket): void {
  void touchLastSeen(userId);
  const set = onlineUsers.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) onlineUsers.delete(userId);
}

function sendToUser(userId: string, msg: ServerMsg): void {
  const set = onlineUsers.get(userId);
  if (!set) return;
  const data = JSON.stringify(msg);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

async function ensureProfileLoaded(
  current: UserProfile | undefined,
  userId: string | undefined,
  ws: WebSocket,
): Promise<UserProfile | undefined> {
  if (current || !userId) return current;
  const profile = await getUser(userId).catch(() => null);
  if (!profile) return current;
  // Banlı profil online sayılmaz; çağıran yol bannedAt'e bakıp isteği reddeder.
  if (profile.bannedAt) return profile;
  addOnline(profile.id, ws);
  return profile;
}

/** Banlı hesabı reddet — true dönerse çağıran yol isteği İPTAL etmelidir. */
function rejectIfBanned(profile: UserProfile | undefined, transport: Transport): boolean {
  if (!profile?.bannedAt) return false;
  transport.send({ type: 'error', message: BANNED_MSG });
  return true;
}

/** Build a friends_list message with online status. */
async function getFriendsData(userId: string): Promise<ServerMsg & { type: 'friends_list' }> {
  const [rawFriends, requests] = await Promise.all([
    listFriends(userId),
    listFriendRequests(userId),
  ]);
  const friends = rawFriends.map((f) => ({
    ...f,
    online: onlineUsers.has(f.userId),
  }));
  return { type: 'friends_list', friends, requests };
}

export function startServer(port: number): Server {
  const manager = new RoomManager();
  startPushCrons();
  const matchQueue: QueueEntry[] = [];
  const orchestrator = new MatchmakingOrchestrator(hybridCfg());
  const pendingInvites = new Map<string, PendingInvite>(); // `${fromUserId}:${toUserId}`
  // Turnuva maçı 'hazırım' bekleme odası: matchId → hazır diyen oyuncular.
  // İKİSİ de hazır deyince oda kurulur (dostluk-daveti kalıbının aynısı).
  const tournamentReadyWaits = new Map<string, Map<string, { name: string; transport: Transport; profile: UserProfile; setCtx: (c: ConnCtx) => void }>>();

  async function broadcastTournamentState(tid: string): Promise<void> {
    const st = await getTournamentState(tid, null);
    if (!st) return;
    for (const uid of await tournamentMemberIds(tid)) {
      sendToUser(uid, { type: 'tournament_state', tournament: { ...st, youJoined: st.players.some((pl) => pl.userId === uid) } });
    }
  }

  /** Oynanabilir (iki taraf da çevrimiçi) turnuva maçlarına 'maçın hazır' teklifi. */
  async function offerTournamentMatches(tid: string): Promise<void> {
    const st = await getTournamentState(tid, null);
    if (!st || st.status !== 'live') return;
    const nameOf = new Map(st.players.map((pl) => [pl.userId, pl.name]));
    for (const m of st.matches) {
      if (m.winnerId || !m.aId || !m.bId || m.status === 'playing') continue;
      if (!onlineUsers.has(m.aId) || !onlineUsers.has(m.bId)) continue;
      const wait = tournamentReadyWaits.get(m.id);
      sendToUser(m.aId, { type: 'tournament_match_ready', tournamentId: tid, matchId: m.id, opponentName: nameOf.get(m.bId) ?? 'Rakip', tournamentName: st.name, youReady: Boolean(wait?.has(m.aId)), oppReady: Boolean(wait?.has(m.bId)) });
      sendToUser(m.bId, { type: 'tournament_match_ready', tournamentId: tid, matchId: m.id, opponentName: nameOf.get(m.aId) ?? 'Rakip', tournamentName: st.name, youReady: Boolean(wait?.has(m.bId)), oppReady: Boolean(wait?.has(m.aId)) });
    }
  }

  async function offerTournamentMatchesForUser(userId: string): Promise<void> {
    const pend = await pendingTournamentMatchesFor(userId).catch(() => []);
    for (const tid of new Set(pend.map((pm) => pm.tournamentId))) await offerTournamentMatches(tid);
  }
  const activeSearchByWs = new WeakMap<WebSocket, string>();
  const activeBotIds = new Set<string>();
  const activeBotDisplayNames = new Set<string>();

  function botDisplayNameKey(name: string): string {
    return name.trim().toLowerCase();
  }

  function reserveActiveBot(profile: BotProfile): boolean {
    const nameKey = botDisplayNameKey(profile.displayName);
    if (activeBotIds.has(profile.id) || activeBotDisplayNames.has(nameKey)) return false;
    activeBotIds.add(profile.id);
    activeBotDisplayNames.add(nameKey);
    return true;
  }

  function releaseActiveBot(profile: BotProfile): void {
    activeBotIds.delete(profile.id);
    activeBotDisplayNames.delete(botDisplayNameKey(profile.displayName));
  }

  function failQueuedSearch(entry: QueueEntry, event: string, message: string, extra: Record<string, unknown> = {}): void {
    entry.assigned = true;
    entry.state = 'FAILED';
    clearQueueTimers(entry);
    removeQueueEntry(matchQueue, entry);
    activeSearchByWs.delete(entry.ws);
    log.warn(event, {
      requestId: entry.requestId,
      userId: entry.userProfile?.id ?? entry.userId,
      searchDurationMs: Date.now() - entry.since,
      startingTrophies: entryTrophies(entry),
      ...extra,
    });
    try { entry.transport.send({ type: 'error', message }); } catch { /* ignore */ }
    try { entry.ws.close(); } catch { /* ignore */ }
  }

  function safeAutoStart(room: Room, playerId: string, source: string, requestId?: string): void {
    try {
      if (room.size === 2) room.handle(playerId, { type: 'start' });
    } catch (err) {
      log.error('room_autostart_failed', {
        source,
        requestId,
        room: room.code,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }

  function reservePair(a: QueueEntry, b: QueueEntry): boolean {
    if (a === b || a.assigned || b.assigned || a.ws.readyState !== a.ws.OPEN || b.ws.readyState !== b.ws.OPEN) {
      log.warn('duplicate_assignment_prevented', { a: a.requestId, b: b.requestId, reason: 'pair_reserve_failed' });
      return false;
    }
    a.assigned = true; b.assigned = true;
    a.state = 'OPPONENT_RESERVED'; b.state = 'OPPONENT_RESERVED';
    clearQueueTimers(a); clearQueueTimers(b);
    removeQueueEntry(matchQueue, a); removeQueueEntry(matchQueue, b);
    if (a.requestId) activeSearchByWs.delete(a.ws);
    if (b.requestId) activeSearchByWs.delete(b.ws);
    return true;
  }

  function entryMode(e: QueueEntry): GameMode { return e.options?.mode ?? 'team-team'; }
  function entryTrophies(e: QueueEntry): number { return e.userProfile?.trophies ?? 0; }
  function entryArenaKey(entry: QueueEntry): string {
    const arena = entry.userProfile?.arena ?? getArena(entryTrophies(entry));
    return `${arena.minTrophies}:${arena.name}`;
  }
  function sameArena(a: QueueEntry, b: QueueEntry): boolean {
    return entryArenaKey(a) === entryArenaKey(b);
  }
  function entrySkillMean(e: QueueEntry): number | undefined { return e.skillProfile?.skillMean; }
  function entrySkillUncertainty(e: QueueEntry): number | undefined { return e.skillProfile?.skillUncertainty; }

  async function farmRiskBetween(entry: QueueEntry, candidate: QueueEntry): Promise<number> {
    if (!entry.userProfile?.id || !candidate.userProfile?.id) return 0;
    try {
      const risk = await assessFarmRisk({ playerId: entry.userProfile.id, opponentId: candidate.userProfile.id, opponentType: 'HUMAN' });
      return risk.score;
    } catch (err) {
      log.warn('farm_risk_lookup_failed', { requestId: entry.requestId, error: err instanceof Error ? err.message : String(err) });
      return 0;
    }
  }

  async function findHumanPartner(entry: QueueEntry): Promise<QueueEntry | undefined> {
    if (config.matchmaking.debug.simulateNoOnlinePlayers || config.matchmaking.debug.forceBot) return undefined;
    const now = Date.now();
    const candidates: QueueEntry[] = [];
    for (const e of matchQueue) {
      if (e === entry || e.assigned || e.ws.readyState !== e.ws.OPEN) continue;
      const mode = entryMode(entry);
      const ok = entryMode(e) === mode
        && sameScope(e.options?.scope, entry.options?.scope)
        && sameArena(e, entry)
        && canUseMode(e.userProfile, mode)
        && orchestrator.compatibleHumans(
          { trophies: entryTrophies(e), skillMean: entrySkillMean(e), skillUncertainty: entrySkillUncertainty(e), elapsedMs: now - e.since },
          { trophies: entryTrophies(entry), skillMean: entrySkillMean(entry), skillUncertainty: entrySkillUncertainty(entry), elapsedMs: now - entry.since },
        );
      if (ok) candidates.push(e);
    }
    const snapshots = matchQueue
      .filter((e) => e !== entry && !e.assigned && e.ws.readyState === e.ws.OPEN && entryMode(e) === entryMode(entry) && sameScope(e.options?.scope, entry.options?.scope))
      .map((e) => ({ trophies: entryTrophies(e), skillMean: entrySkillMean(e), skillUncertainty: entrySkillUncertainty(e), elapsedMs: now - e.since }));
    const health = estimateQueueHealth({ trophies: entryTrophies(entry), skillMean: entrySkillMean(entry), skillUncertainty: entrySkillUncertainty(entry), elapsedMs: now - entry.since }, snapshots, now);
    entry.lastQueueHealth = health;
    let best: QueueEntry | undefined;
    let bestScore = -Infinity;
    for (const e of candidates) {
      const farmRisk = await farmRiskBetween(entry, e);
      const score = candidateScore(
        { trophies: entryTrophies(entry), skillMean: entrySkillMean(entry), skillUncertainty: entrySkillUncertainty(entry), elapsedMs: now - entry.since },
        { trophies: entryTrophies(e), skillMean: entrySkillMean(e), skillUncertainty: entrySkillUncertainty(e), elapsedMs: now - e.since, farmRisk },
        health,
      );
      if (score > bestScore) { best = e; bestScore = score; }
    }
    entry.lastCandidateScore = Number.isFinite(bestScore) ? bestScore : undefined;
    return best;
  }

  function hasPotentialHumanPartner(entry: QueueEntry): boolean {
    if (config.matchmaking.debug.simulateNoOnlinePlayers || config.matchmaking.debug.forceBot) return false;
    const mode = entryMode(entry);
    return matchQueue.some((e) => {
      if (e === entry || e.assigned || e.ws.readyState !== e.ws.OPEN) return false;
      return entryMode(e) === mode
        && sameScope(e.options?.scope, entry.options?.scope)
        && sameArena(e, entry)
        && canUseMode(e.userProfile, mode)
        && orchestrator.potentialHuman(
          { trophies: entryTrophies(e), skillMean: entrySkillMean(e), skillUncertainty: entrySkillUncertainty(e) },
          { trophies: entryTrophies(entry), skillMean: entrySkillMean(entry), skillUncertainty: entrySkillUncertainty(entry) },
        );
    });
  }

  function startHumanMatch(a: QueueEntry, b: QueueEntry): boolean {
    if (!reservePair(a, b)) return false;
    const room = manager.createRoom();
    const matchId = randomUUID();
    room.assignNextMatchId(matchId);
    room.ranked = true;
    if (a.options?.scope) room.scope = a.options.scope;
    room.gameMode = entryMode(a);
    a.state = 'MATCH_FOUND'; b.state = 'MATCH_FOUND';
    const resA = room.addPlayer(a.name, a.transport, true, a.userProfile?.id ?? a.userId, a.userProfile?.trophies, a.userProfile?.arena, a.userProfile?.avatar, a.userProfile?.level, a.userProfile?.selectedFrame, a.userProfile ? toCosmeticLoadout(a.userProfile) : undefined, a.skillProfile?.skillMean, a.skillProfile?.skillUncertainty, a.skillProfile?.matchesPlayed);
    const resB = room.addPlayer(b.name, b.transport, false, b.userProfile?.id ?? b.userId, b.userProfile?.trophies, b.userProfile?.arena, b.userProfile?.avatar, b.userProfile?.level, b.userProfile?.selectedFrame, b.userProfile ? toCosmeticLoadout(b.userProfile) : undefined, b.skillProfile?.skillMean, b.skillProfile?.skillUncertainty, b.skillProfile?.matchesPlayed);
    if (resA.ok) a.setCtx({ room, playerId: resA.id, userProfile: a.userProfile });
    if (resB.ok) b.setCtx({ room, playerId: resB.id, userProfile: b.userProfile });
    a.state = 'STARTING_MATCH'; b.state = 'STARTING_MATCH';
    const now = Date.now();
    log.info('human_match_found', {
      requestIdA: a.requestId, requestIdB: b.requestId,
      searchDurationMs: Math.max(now - a.since, now - b.since),
      startingTrophiesA: entryTrophies(a), startingTrophiesB: entryTrophies(b),
      arenaA: entryArenaKey(a), arenaB: entryArenaKey(b),
      trophyDifference: Math.abs(entryTrophies(a) - entryTrophies(b)),
      mode: room.gameMode,
    });
    recordTelemetry({
      eventName: 'human_opponent_found',
      matchId,
      roomCode: room.code,
      playerId: a.userProfile?.id ?? a.userId ?? null,
      opponentId: b.userProfile?.id ?? b.userId ?? null,
      opponentType: 'HUMAN',
      payload: {
        requestIdA: a.requestId,
        requestIdB: b.requestId,
        queueDuration: Math.max(now - a.since, now - b.since),
        playerSkillMean: a.skillProfile?.skillMean,
        opponentSkillMean: b.skillProfile?.skillMean,
        playerTrophies: entryTrophies(a),
        opponentTrophies: entryTrophies(b),
        playerArena: entryArenaKey(a),
        opponentArena: entryArenaKey(b),
        trophyDifference: Math.abs(entryTrophies(a) - entryTrophies(b)),
        skillDifference: Math.abs((a.skillProfile?.skillMean ?? 0) - (b.skillProfile?.skillMean ?? 0)),
        mode: room.gameMode,
      },
    });
    recordDecisionTrace({
      matchId,
      playerId: a.userProfile?.id ?? a.userId ?? null,
      queueStart: a.since,
      queueDurationMs: now - a.since,
      humanCandidatesFound: matchQueue.length + 1,
      selectedOpponentType: 'HUMAN',
      selectedOpponentId: b.userProfile?.id ?? b.userId ?? null,
      selectedOpponentMmr: b.skillProfile?.skillMean ?? null,
      playerMmr: a.skillProfile?.skillMean ?? null,
      mmrDifference: typeof a.skillProfile?.skillMean === 'number' && typeof b.skillProfile?.skillMean === 'number' ? Math.abs(a.skillProfile.skillMean - b.skillProfile.skillMean) : null,
      queueHealth: a.lastQueueHealth as unknown as Record<string, unknown>,
      formScore: a.skillProfile?.currentForm ?? null,
      matchQualityScore: a.lastCandidateScore ?? null,
      selectionReason: 'best_human_candidate',
    });
    // 900ms canlıda maç açılışını bozdu (2026-08-28 kullanıcı raporu: 'müsabaka
    // bulundu' tek tarafta, geri sayım buglu, 3'te donma, takım listesi boş) —
    // istemci geçiş hattı ~2sn'lik kuruluma göre yazılmış. 2000ms'e dönüldü.
    setTimeout(() => safeAutoStart(room, resA.ok ? resA.id : '', 'human_match', a.requestId), 2000);
    return true;
  }

  async function startBotMatch(entry: QueueEntry): Promise<boolean> {
    if (!reserveQueueEntry(matchQueue, entry)) {
      log.warn('duplicate_assignment_prevented', { requestId: entry.requestId, reason: 'bot_reserve_failed' });
      return false;
    }
    const playerTrophies = entryTrophies(entry);
    const live = liveOpsConfig();
    if (!live.killSwitches.botMatchmakingEnabled) {
      failQueuedSearch(entry, 'bot_matchmaking_disabled', 'Rakip bulunamadı, tekrar dene');
      return false;
    }
    const pressureProfile = entry.userProfile?.id
      ? await getBotPressureProfile(entry.userProfile.id).catch(() => ({ pressure: 0, relief: 0, botWins: 0, botGames: 0, recentWins: 0, recentGames: 0, winStreak: 0, trophyGain30m: 0, botWins30m: 0 }))
      : undefined;
    const skillProfile = entry.skillProfile ?? (entry.userProfile?.id
      ? await getOrCreateSkillProfile(entry.userProfile.id, playerTrophies).catch((err) => {
        log.warn('bot_skill_profile_fallback', {
          requestId: entry.requestId,
          userId: entry.userProfile?.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return defaultSkillProfile(entry.userProfile!.id, playerTrophies);
      })
      : undefined);
    const economyAtStart = await getTrophyEconomyState().catch(() => ({ state: 'HEALTHY' as const, botInjectionToday: 0, trophiesCreatedToday: 0, trophiesDestroyedToday: 0, dailyInflation: 0, botBudgetRemaining: 0, botRewardMultiplier: 0.5 }));
    const segmentAtStart = progressionSegment(playerTrophies, skillProfile?.matchesPlayed ?? 0);
    // KİMSE RAKİPSİZ KALMAZ (2026-08-27): segment/enflasyon oranı yalnız ERKEN
    // bot düşüşünü seyreltir (scheduleFallbackAttempt içinde); buraya gelen
    // istek — özellikle 15 sn güvenlik ağı — her koşulda bot alır. Eski sert
    // ret, insan likiditesi olmayan saatlerde 3500+ oyuncuyu tamamen rakipsiz
    // bırakıyordu.
    if (botAvailabilityMultiplier(segmentAtStart, economyAtStart) <= 0) {
      log.info('bot_availability_gate_bypassed', { requestId: entry.requestId, segment: segmentAtStart, economyState: economyAtStart.state });
    }
    const velocity = entry.userProfile?.id ? await getTrophyVelocity(entry.userProfile.id).catch(() => ({ pressure: 0 })) : { pressure: 0 };
    // Kimlik tekrar hafızasının kalıcı kaynağı bot_opponent_history: süreç içi
    // harita restart'ta boşalır ve instance'lar arası paylaşılmaz — aynı "Kaan"
    // restart sonrası aynı oyuncuya hemen tekrar çıkmasın.
    const recentBotIds = entry.userProfile?.id
      ? await pool.query<{ bot_id: string }>(
          `SELECT bot_id FROM bot_opponent_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
          [entry.userProfile.id, config.matchmaking.recentBotCooldown],
        ).then((r) => r.rows.map((x) => x.bot_id)).catch(() => [] as string[])
      : [];
    const mode = entryMode(entry);
    let botProfile: BotProfile | undefined;
    const botSeed = `${entry.requestId ?? entry.userId ?? entry.name}:${Date.now()}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = selectBotProfileForSkill({
        userKey: entry.userProfile?.id ?? entry.userId ?? entry.requestId ?? entry.name,
        playerTrophies,
        playerSkillMean: skillProfile?.skillMean ?? 1000,
        playerSkillUncertainty: skillProfile?.skillUncertainty ?? 350,
        playerMatchesPlayed: skillProfile?.matchesPlayed ?? 0,
        recentCooldown: config.matchmaking.recentBotCooldown,
        forcedArchetype: config.matchmaking.debug.botArchetype,
        forcedSkill: config.matchmaking.debug.botSkill,
        pressureProfile,
        velocityPressure: velocity.pressure,
        gameMode: mode,
        queueHealthScore: entry.lastQueueHealth?.queueHealthScore ?? null,
        accuracyEma: skillProfile?.overallAccuracy,
        responseTimeEmaMs: skillProfile?.medianCorrectResponseTimeMs ?? null,
        easyQuestionAccuracy: skillProfile?.easyQuestionAccuracy,
        mediumQuestionAccuracy: skillProfile?.mediumQuestionAccuracy,
        hardQuestionAccuracy: skillProfile?.hardQuestionAccuracy,
        currentForm: skillProfile?.currentForm,
        recentMatches: skillProfile?.recentMatches,
        recentBotExposure: pressureProfile?.botGames,
        blockedBotIds: activeBotIds,
        blockedBotDisplayNames: activeBotDisplayNames,
        recentBotIds,
        seed: attempt === 0 ? botSeed : `${botSeed}:${attempt}`,
      });
      if (reserveActiveBot(candidate)) {
        botProfile = candidate;
        break;
      }
    }
    if (!botProfile) {
      failQueuedSearch(entry, 'bot_identity_pool_exhausted', 'Rakip bulunamadı, tekrar dene', { activeBotCount: activeBotIds.size });
      return false;
    }
    entry.botProfile = botProfile;
    const room = manager.createRoom();
    room.onDispose(() => releaseActiveBot(botProfile));
    const matchId = randomUUID();
    room.assignNextMatchId(matchId);
    room.ranked = true;
    room.rankedBotRewards = true;
    if (entry.options?.scope) room.scope = entry.options.scope;
    room.gameMode = mode;
    log.info('bot_fallback_started', {
      requestId: entry.requestId,
      searchDurationMs: Date.now() - entry.since,
      startingTrophies: playerTrophies,
      arena: entry.userProfile?.arena.name,
      botArchetype: botProfile.behaviorArchetype,
      botSkill: Number(botProfile.skillRating.toFixed(3)),
      botDifficultyDirector: botProfile.difficultyDirector,
      botPressure: pressureProfile?.pressure,
      botRelief: pressureProfile?.relief,
      botWins: pressureProfile?.botWins,
      botGames: pressureProfile?.botGames,
      botWinStreak: pressureProfile?.winStreak,
      trophyGain30m: pressureProfile?.trophyGain30m,
      botWins30m: pressureProfile?.botWins30m,
      trophyDifference: botProfile.trophyRating - playerTrophies,
      playerSkillMean: skillProfile?.skillMean,
      playerSkillUncertainty: skillProfile?.skillUncertainty,
      botSkillMean: botProfile.skillMean,
    });
    recordTelemetry({
      eventName: 'bot_fallback_created',
      matchId,
      roomCode: room.code,
      playerId: entry.userProfile?.id ?? entry.userId ?? null,
      opponentType: 'BOT',
      payload: {
        requestId: entry.requestId,
        queueDuration: Date.now() - entry.since,
        playerSkillMean: skillProfile?.skillMean,
        playerSkillUncertainty: skillProfile?.skillUncertainty,
        botSkill: botProfile.skillRating,
        botSkillMean: botProfile.skillMean,
        botArchetype: botProfile.behaviorArchetype,
        botDifficulty: botProfile.difficulty,
        botProfile: botProfileSnapshot(botProfile),
        botDifficultyDirector: botProfile.difficultyDirector,
        playerTrophies,
        opponentTrophies: botProfile.trophyRating,
        trophyVelocityPressure: velocity.pressure,
        mode: room.gameMode,
      },
    });
    recordBotMatchProfile({
      matchId,
      roomCode: room.code,
      userId: entry.userProfile?.id ?? entry.userId ?? null,
      gameMode: room.gameMode,
      playerTrophies,
      playerSkillMean: skillProfile?.skillMean ?? null,
      playerSkillUncertainty: skillProfile?.skillUncertainty ?? null,
      playerMatchesPlayed: skillProfile?.matchesPlayed ?? null,
      profile: botProfile,
      queueDurationMs: Date.now() - entry.since,
      queueHealth: entry.lastQueueHealth as unknown as Record<string, unknown>,
      pressureProfile: pressureProfile as unknown as Record<string, unknown>,
      economyState: economyAtStart.state,
    });
    if (entry.userProfile?.id) {
      pool.query(
        `INSERT INTO bot_opponent_history (user_id, bot_id, bot_name, archetype, skill_mean)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.userProfile.id, botProfile.id, botProfile.displayName, botProfile.behaviorArchetype, botProfile.skillMean],
      ).catch(() => {});
    }
    const human = room.addPlayer(entry.name, entry.transport, true, entry.userProfile?.id ?? entry.userId, entry.userProfile?.trophies, entry.userProfile?.arena, entry.userProfile?.avatar, entry.userProfile?.level, entry.userProfile?.selectedFrame, entry.userProfile ? toCosmeticLoadout(entry.userProfile) : undefined, skillProfile?.skillMean, skillProfile?.skillUncertainty, skillProfile?.matchesPlayed);
    const bot = new BotPlayer({ difficulty: botProfile.difficulty, scope: room.scope, mode: room.gameMode, profile: botProfile, exposeBotToClient: false });
    const botRes = room.addPlayer(botProfile.displayName, bot, false, undefined, botProfile.trophyRating, botProfile.arena, botProfile.avatarId, botProfile.level, botProfile.frame, undefined, botProfile.skillMean, botProfile.skillUncertainty, 100);
    if (human.ok) entry.setCtx({ room, playerId: human.id, userProfile: entry.userProfile });
    if (botRes.ok) bot.bind(room, botRes.id);
    if (entry.userProfile?.id) {
      void recordBotExposure(entry.userProfile.id, botProfile.id, matchId, segmentAtStart);
    }
    entry.state = 'STARTING_MATCH';
    log.info('bot_match_started', {
      requestId: entry.requestId,
      searchDurationMs: Date.now() - entry.since,
      startingTrophies: playerTrophies,
      opponentTrophies: botProfile.trophyRating,
      botArchetype: botProfile.behaviorArchetype,
      botSkill: Number(botProfile.skillRating.toFixed(3)),
      mode: room.gameMode,
    });
    setTimeout(() => safeAutoStart(room, human.ok ? human.id : '', 'bot_match', entry.requestId), 2000);
    recordDecisionTrace({
      matchId,
      playerId: entry.userProfile?.id ?? entry.userId ?? null,
      queueStart: entry.since,
      queueDurationMs: Date.now() - entry.since,
      humanCandidatesFound: matchQueue.length,
      selectedOpponentType: 'BOT',
      selectedOpponentId: botProfile.id,
      selectedOpponentMmr: botProfile.skillMean,
      playerMmr: skillProfile?.skillMean ?? null,
      mmrDifference: typeof skillProfile?.skillMean === 'number' ? Math.abs(skillProfile.skillMean - botProfile.skillMean) : null,
      botSkill: botProfile.skillRating,
      queueHealth: entry.lastQueueHealth as unknown as Record<string, unknown>,
      formScore: skillProfile?.currentForm ?? null,
      frustrationRisk: botProfile.difficultyDirector?.frustrationRisk ?? null,
      farmRisk: botProfile.difficultyDirector?.intentionalLossRisk ?? null,
      trophyEconomyState: economyAtStart.state,
      matchQualityScore: botProfile.difficultyDirector?.estimatedPlayerWinProbability ?? null,
      selectionReason: botProfile.difficultyDirector?.enabled ? 'engagement_safe_difficulty_director' : 'queue_health_bot_fallback',
    });
    return true;
  }

  function enqueueHybrid(entry: QueueEntry): void {
    const cfg = hybridCfg();
    entry.state = 'SEARCHING_CLOSE';
    entry.timers ??= new Set();
    log.info('matchmaking_started', {
      requestId: entry.requestId,
      userId: entry.userProfile?.id ?? entry.userId,
      startingTrophies: entryTrophies(entry),
      arena: entry.userProfile?.arena.name,
      mode: entryMode(entry),
      botFallbackEnabled: config.matchmaking.botFallbackEnabled,
      botFallbackPercentage: config.matchmaking.botFallbackPercentage,
      skillMean: entry.skillProfile?.skillMean,
      skillUncertainty: entry.skillProfile?.skillUncertainty,
    });
    recordTelemetry({
      eventName: 'matchmaking_started',
      playerId: entry.userProfile?.id ?? entry.userId ?? null,
      payload: {
        requestId: entry.requestId,
        playerSkillMean: entry.skillProfile?.skillMean,
        playerSkillUncertainty: entry.skillProfile?.skillUncertainty,
        playerTrophies: entryTrophies(entry),
        mode: entryMode(entry),
        botFallbackEnabled: config.matchmaking.botFallbackEnabled,
      },
    });

    const fallbackDelayPlanned = randomBotFallbackDelayMs(cfg, matchQueue.length + 1);
    matchQueue.push(entry);
    // TAHMİNİ SÜRE (kullanıcı isteği 2026-08-27): söylenen saniye = gerçekte
    // olacak saniye. Bot düşüş anı + oda kurulumu (~0.9sn) + küçük pay; insan
    // daha erken gelirse tahminden ERKEN biter (asla geç değil). Ekran tavanı 8.
    entry.transport.send({ type: 'searching', etaSeconds: Math.min(8, Math.max(2, Math.ceil((fallbackDelayPlanned + 1200) / 1000))) });

    void findHumanPartner(entry).then((immediate) => {
      if (immediate && startHumanMatch(immediate, entry)) return;
    }).catch((err) => log.warn('initial_human_partner_lookup_failed', { requestId: entry.requestId, error: err instanceof Error ? err.message : String(err) }));

    const expandedTimer = setTimeout(() => {
      if (entry.assigned || entry.ws.readyState !== entry.ws.OPEN) return;
      entry.state = 'SEARCHING_EXPANDED';
      log.info('matchmaking_expanded', { requestId: entry.requestId, userId: entry.userProfile?.id ?? entry.userId, searchDurationMs: Date.now() - entry.since, range: cfg.expandedTrophyRange });
    }, cfg.realPlayerSearchWindowMs);
    entry.timers.add(expandedTimer);

    const fallbackDelay = fallbackDelayPlanned;
    entry.fallbackAt = entry.since + fallbackDelay;
    const scheduleFallbackAttempt = (delayMs: number) => {
      const t = setTimeout(() => {
        entry.timers?.delete(t);
        if (entry.assigned || entry.ws.readyState !== entry.ws.OPEN) return;
        void findHumanPartner(entry).then(async (partner) => {
          if (partner && startHumanMatch(partner, entry)) return;
          if (config.matchmaking.debug.forceHumanSearch || config.matchmaking.debug.simulateTimeout) return;
          if (!config.matchmaking.botFallbackEnabled && !config.matchmaking.debug.forceBot) return;
          if (!config.matchmaking.debug.forceBot && !shouldUseBotFallback(config.matchmaking.botFallbackPercentage)) return;

          const elapsedMs = Date.now() - entry.since;
          const potentialHuman = hasPotentialHumanPartner(entry);
          const live = liveOpsConfig();
          const economy = await getTrophyEconomyState().catch(() => ({ state: 'HEALTHY', botRewardMultiplier: 0.5, botBudgetRemaining: 0 }));
          const segment = progressionSegment(entryTrophies(entry), entry.skillProfile?.matchesPlayed ?? 0);
          const botAvailability = botAvailabilityMultiplier(segment, economy as any);
          const health = entry.lastQueueHealth ?? estimateQueueHealth({ trophies: entryTrophies(entry), skillMean: entrySkillMean(entry), skillUncertainty: entrySkillUncertainty(entry), elapsedMs }, matchQueue.map((e) => ({ trophies: entryTrophies(e), skillMean: entrySkillMean(e), skillUncertainty: entrySkillUncertainty(e), elapsedMs: Date.now() - e.since })));
          // botAvailability artık GERÇEK bir oran (2026-08-27): erken bot düşüşü
          // bu olasılıkla seyreltilir — yüksek segment + enflasyon baskısında bot
          // daha geç gelir, insan likiditesine şans tanınır. 0 bile olsa yalnız
          // erken düşüş ertelenir; 15 sn güvenlik ağı koşulsuz bot başlatır.
          // SERT TAVAN (2026-08-27, kullanıcı: 'insan şansım yoksa 3 saniyede
          // eşleştir'): ufukta insan YOKKEN erteleme zinciri (oran seyreltme +
          // kuyruk sağlığı) 2600ms'i aşamaz — bot hemen başlar.
          const forceBotNow = elapsedMs >= 2600 && !potentialHuman;
          const throttledByRatio = !forceBotNow && botAvailability < 1 && Math.random() >= Math.max(0, botAvailability);
          if (!forceBotNow && !config.matchmaking.debug.forceBot && (throttledByRatio || (health.queueHealthScore > live.matchmaking.queueHealthBotThreshold && elapsedMs < live.matchmaking.maxSearchMs))) {
            log.info('bot_fallback_deferred_by_queue_health', { requestId: entry.requestId, segment, queueHealth: health.queueHealthScore, botAvailability, throttledByRatio, retryMs: cfg.botFallbackRetryMs });
            scheduleFallbackAttempt(cfg.botFallbackRetryMs);
            return;
          }

          if (!config.matchmaking.debug.forceBot && orchestrator.shouldHoldForHuman(elapsedMs, potentialHuman)) {
            log.info('bot_fallback_deferred_for_human_liquidity', {
              requestId: entry.requestId,
              userId: entry.userProfile?.id ?? entry.userId,
              searchDurationMs: elapsedMs,
              retryMs: cfg.botFallbackRetryMs,
              potentialQueueDepth: matchQueue.length - 1,
            });
            scheduleFallbackAttempt(cfg.botFallbackRetryMs);
            return;
          }

          void startBotMatch(entry).catch((err) => {
            log.error('bot_match_start_failed', { requestId: entry.requestId, error: err instanceof Error ? err.message : String(err) });
            failQueuedSearch(entry, 'matchmaking_bot_start_failed', 'Rakip bulunamadı', { error: err instanceof Error ? err.message : String(err) });
          });
        }).catch((err) => log.warn('fallback_partner_lookup_failed', { requestId: entry.requestId, error: err instanceof Error ? err.message : String(err) }));
        return;
      }, Math.max(0, delayMs));
      entry.timers?.add(t);
    };
    scheduleFallbackAttempt(fallbackDelay);

    const timeoutTimer = setTimeout(() => {
      if (entry.assigned || entry.ws.readyState !== entry.ws.OPEN) return;
      void findHumanPartner(entry).then((partner) => {
        if (partner && startHumanMatch(partner, entry)) return;
        if (config.matchmaking.debug.forceHumanSearch || config.matchmaking.debug.simulateTimeout) {
          failQueuedSearch(entry, 'matchmaking_timeout', 'Rakip bulunamadı, tekrar dene');
          return;
        }
        log.warn('matchmaking_timeout_bot_safety', {
          requestId: entry.requestId,
          userId: entry.userProfile?.id ?? entry.userId,
          searchDurationMs: Date.now() - entry.since,
          startingTrophies: entryTrophies(entry),
        });
        void startBotMatch(entry).catch((err) => {
          log.error('bot_match_start_failed', { requestId: entry.requestId, reason: 'timeout_safety', error: err instanceof Error ? err.message : String(err) });
          failQueuedSearch(entry, 'matchmaking_timeout_bot_failed', 'Rakip bulunamadı, tekrar dene', { error: err instanceof Error ? err.message : String(err) });
        });
      }).catch((err) => failQueuedSearch(entry, 'matchmaking_timeout_lookup_failed', 'Rakip bulunamadı, tekrar dene', { error: err instanceof Error ? err.message : String(err) }));
      return;
    }, cfg.matchmakingTimeoutMs);
    entry.timers.add(timeoutTimer);
  }

  const http = createServer((req, res) => {
    const cors = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store', pragma: 'no-cache' };
    const path = (req.url ?? '').split('?')[0];
    const query = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    if (req.url === '/health') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, rooms: manager.count }));
      return;
    }
    if (path === '/config') {
      void (async () => {
        // ESKİ İSTEMCİ TESPİTİ (2026-08-29 ACİL): vc130 Android build'i /config'i
        // PARAMETRESİZ çağırıyor (platform alanı vc131'de eklendi), bu yüzden
        // sorgu parametresine bakan platform ayrımı onda çalışmaz. Bu istemciler
        // minIosBuild'i kendi versionCode'uyla kıyaslayıp kilitlendiği için
        // platformu User-Agent'tan da tespit ederiz: RN Android fetch okhttp
        // (Dalvik) UA'sı gönderir, iOS ise CFNetwork/Darwin.
        const ua = String(req.headers['user-agent'] ?? '');
        const uaLooksAndroid = /android|okhttp|dalvik/i.test(ua);
        const platform = clientPlatform(query.get('platform')) ?? (uaLooksAndroid ? 'android' as const : null);
        const version = query.get('version');
        const build = clientBuild(query.get('build'));
        const storeVersions = await getLiveStoreVersions();
        const platformStoreVersion = platform === 'android' ? storeVersions.androidVersion : platform === 'ios' ? storeVersions.iosVersion : null;
        // The forced-update gate is OPERATOR-controlled only (MIN_IOS_BUILD /
        // MIN_ANDROID_VERSION_CODE). It must NEVER be derived from the live
        // store version: the build number the client reports lives in the JS
        // bundle, so an OTA can make an up-to-date install report a number
        // below the store's — which locks every player out behind an "update"
        // screen that has no update to install (2026-08-25 outage: App Store
        // 1.0.2 shipped as native build 127 while its bundle still said 126,
        // and the auto-raised minimum turned that one-off drift into a
        // full lockout).
        const effectiveMinIosBuild = config.minIosBuild;
        const effectiveMinAndroidVersionCode = config.minAndroidVersionCode;
        const updateRequired = platform === 'android'
          ? build !== null && build < effectiveMinAndroidVersionCode
          : platform === 'ios'
            ? build !== null && build < effectiveMinIosBuild
            : false;
        // Informational only — lets the client show a soft "yeni sürüm var"
        // nudge without ever blocking play.
        const updateAvailable = platform === 'android'
          ? (build !== null && storeVersions.androidVersionCode !== null && build < storeVersions.androidVersionCode) || storeVersionIsNewer(version, platformStoreVersion)
          : platform === 'ios'
            ? storeVersionIsNewer(version, platformStoreVersion)
            : false;

        // ACİL DÜZELTME (2026-08-29): Android kapalı testindeki ESKİ istemci
        // (vc130) platform ayırmıyor ve `minIosBuild`'i KENDİ versionCode'uyla
        // karşılaştırıyordu → 130 < 148 → oyuna hiç giremiyor, üstelik "güncelle"
        // butonu iOS App Store'a atıyordu (platform-aware düzeltme vc131'de
        // geldi, o da yayınlanmadığı için ulaşamıyor: kısır döngü).
        // Android isteğine minIosBuild'i ZARARSIZ (1) göndeririz — iOS kapısı
        // (148) aynen korunur, Android kilidi anında açılır. OTA gerekmez.
        const reportedMinIosBuild = platform === 'android' ? 1 : effectiveMinIosBuild;
        res.writeHead(200, cors);
        res.end(JSON.stringify({
          maintenance: config.maintenanceMode,
          minIosBuild: reportedMinIosBuild,
          minAndroidVersionCode: effectiveMinAndroidVersionCode,
          latestIosVersion: storeVersions.iosVersion,
          latestIosBuild: storeVersions.iosBuildNumber,
          latestAndroidVersion: storeVersions.androidVersion,
          latestAndroidVersionCode: storeVersions.androidVersionCode,
          storeVersionSource: storeVersions.source,
          storeVersionCheckedAt: storeVersions.checkedAt,
          updateAvailable,
          updateRequired,
        }));
      })().catch((err) => {
        log.warn('config_response_failed', { error: err instanceof Error ? err.message : String(err) });
        if (!res.headersSent) res.writeHead(500, cors);
        res.end(JSON.stringify({ error: 'config_failed' }));
      });
      return;
    }
    if (req.url === '/monetization-config') {
      // androidIapReady: Google doğrulaması kurulu mu (service account). false
      // ise istemci Android'de satın almayı BAŞLATMAZ — para çekilip hak
      // verilememesi riskine karşı sert kapı (2026-08-29).
      void androidIapReady().then((ready) => {
      res.writeHead(200, cors);
      res.end(JSON.stringify({
        androidIapReady: ready,
        enabled: process.env.MONETIZATION_ENABLED !== '0',
        holdoutPercent: Number(process.env.MONETIZATION_HOLDOUT_PERCENT ?? '0'),
        maxSessionOffers: Number(process.env.MONETIZATION_MAX_SESSION_OFFERS ?? '1'),
        maxDailyOffers: Number(process.env.MONETIZATION_MAX_DAILY_OFFERS ?? '3'),
        globalCooldownMs: Number(process.env.MONETIZATION_GLOBAL_COOLDOWN_MS ?? String(8 * 60 * 1000)),
        socialPackCooldownMs: Number(process.env.SOCIAL_PACK_POPUP_COOLDOWN_MS ?? String(3 * 24 * 60 * 60 * 1000)),
        minSessionForSocialPackDiscovery: Number(process.env.SOCIAL_PACK_MIN_SESSION ?? '1'),
        minStreakLost: Number(process.env.STREAK_RESTORE_MIN_STREAK ?? '3'),
        largeTrophyLoss: Number(process.env.TROPHY_SHIELD_LARGE_LOSS ?? '20'),
        nearLevelXpRemaining: Number(process.env.XP_OFFER_NEAR_LEVEL_REMAINING ?? '180'),
        arenaProtectionDistance: Number(process.env.ARENA_PROTECTION_DISTANCE ?? '35'),
        maxSameOfferDismissals: Number(process.env.MONETIZATION_MAX_SAME_DISMISSALS ?? '2'),
        offers: {
          streakRestore: process.env.OFFER_STREAK_RESTORE !== '0',
          trophyShield: process.env.OFFER_TROPHY_SHIELD !== '0',
          xpBoost: process.env.OFFER_XP_BOOST !== '0',
          socialPackDiscovery: process.env.OFFER_SOCIAL_PACK_DISCOVERY !== '0',
        },
        // Reklam kurgusu (kullanıcı onayı 2026-08-29): geçiş reklamı yalnız
        // Sosyal Paketi OLMAYANA, N maçta bir, ilk maçlar muaf; ödüllü anlar
        // (kayıp sonrası / elmas yetersiz / günlük sandık) herkese açık.
        // interstitialEnabled=false başlar — AdMob'da geçiş birimleri açılıp
        // unit ID'ler env'e girilince '1' yapılır (OTA gerekmez).
        ads: {
          interstitialEnabled: process.env.ADS_INTERSTITIAL_ENABLED === '1',
          interstitialEveryMatches: Number(process.env.ADS_INTERSTITIAL_EVERY ?? '3'),
          interstitialGraceMatches: Number(process.env.ADS_INTERSTITIAL_GRACE ?? '5'),
          interstitialUnitIos: process.env.ADS_INTERSTITIAL_UNIT_IOS ?? null,
          interstitialUnitAndroid: process.env.ADS_INTERSTITIAL_UNIT_ANDROID ?? null,
          rewardedPostLoss: process.env.ADS_REWARDED_POST_LOSS !== '0',
          rewardedShortfall: process.env.ADS_REWARDED_SHORTFALL !== '0',
          dailyChest: process.env.ADS_DAILY_CHEST !== '0',
        },
      }));
      }).catch(() => {
        // Hazırlık sorgusu düşerse Android satın alma KAPALI varsayılır (güvenli taraf).
        res.writeHead(200, cors);
        res.end(JSON.stringify({ androidIapReady: false, enabled: process.env.MONETIZATION_ENABLED !== '0' }));
      });
      return;
    }
    if (path === '/feedback' && req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' });
      res.end();
      return;
    }
    if (path === '/feedback' && req.method === 'POST') {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 16_384) req.destroy();
      });
      req.on('end', async () => {
        try {
          const body = JSON.parse(raw || '{}') as Record<string, unknown>;
          const category = typeof body.category === 'string' ? body.category : '';
          const message = typeof body.message === 'string' ? body.message.trim() : '';
          if (!['suggestion', 'bug', 'gameplay', 'purchase', 'general'].includes(category) || message.length < 4 || message.length > 1200) {
            res.writeHead(400, cors);
            res.end(JSON.stringify({ error: 'invalid_feedback' }));
            return;
          }
          const playerId = typeof body.playerId === 'string' && body.playerId.length <= 80 ? body.playerId : null;
          const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]?.trim() ?? '';
          await pool.query(`CREATE TABLE IF NOT EXISTS player_feedback (
            id uuid PRIMARY KEY,
            category text NOT NULL,
            message text NOT NULL,
            player_id text,
            platform text,
            app_version text,
            build_number integer,
            os_version text,
            device_model text,
            context jsonb NOT NULL DEFAULT '{}'::jsonb,
            ip_hash text,
            created_at timestamptz NOT NULL DEFAULT now()
          )`);
          const recent = await pool.query(
            `SELECT count(*)::int AS count FROM player_feedback WHERE created_at > now() - interval '10 minutes' AND (player_id = $1 OR ip_hash = md5($2))`,
            [playerId ?? '', ip]
          );
          if (Number(recent.rows[0]?.count ?? 0) >= 3) {
            res.writeHead(429, cors);
            res.end(JSON.stringify({ error: 'rate_limited' }));
            return;
          }
          await pool.query(
            `INSERT INTO player_feedback (id, category, message, player_id, platform, app_version, build_number, os_version, device_model, context, ip_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,md5($11))`,
            [randomUUID(), category, message, playerId, body.platform ?? null, body.appVersion ?? null, Number(body.buildNumber ?? 0) || null, body.osVersion ?? null, body.deviceModel ?? null, JSON.stringify(body.context && typeof body.context === 'object' ? body.context : {}), ip]
          );
          log.info('player_feedback_received', { category, playerId, platform: body.platform, messageLength: message.length });
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          log.warn('player_feedback_failed', { error: err instanceof Error ? err.message : String(err) });
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: 'feedback_failed' }));
        }
      });
      return;
    }
    if ((path === '/admin' || path === '/admin/') && req.method === 'GET') {
      if (!adminHtml) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('Admin panel is not bundled in this server image.');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', pragma: 'no-cache' });
      res.end(adminHtml);
      return;
    }
    if (path === '/admin/api/opponent-kpis') {
      const auth = req.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!verifyToken(token)) {
        res.writeHead(401, cors);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      getOpponentKpis()
        .then((stats) => { res.writeHead(200, cors); res.end(JSON.stringify(stats)); })
        .catch((e) => {
          log.error('opponent_kpis_failed', { message: e instanceof Error ? e.message : String(e) });
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: 'server' }));
        });
      return;
    }
    if (req.url === '/scopes') {
      Promise.all([listScopes(), listNationalities()])
        .then(([scopes, nationalities]) => {
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ...scopes, nationalities }));
        })
        .catch(() => {
          res.writeHead(500, cors);
          res.end(JSON.stringify({ leagues: [], countries: [], nationalities: [] }));
        });
      return;
    }
    if (path === '/leaderboard') {
      getLeaderboard(50, query.get('userId') ?? undefined)
        .then((lb) => {
          res.writeHead(200, cors);
          res.end(JSON.stringify(lb));
        })
        .catch((err) => {
          log.error('leaderboard_failed', { error: err instanceof Error ? err.message : String(err) });
          res.writeHead(500, cors);
          res.end(JSON.stringify([]));
        });
      return;
    }
    // ---- Friends (over HTTP — no persistent socket on the Friends screen) ----

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST', 'access-control-allow-headers': 'content-type, authorization' });
      res.end();
      return;
    }

    // ---- Admin panel: e-posta + şifre girişi → imzalı oturum jetonu ----
    // Giriş: e-posta+şifre admin_users'a karşı doğrulanır, süreli imzalı jeton verilir.
    if (path === '/admin/api/login' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > 10_000) req.destroy(); });
      req.on('end', () => {
        void (async () => {
          let email = '';
          let password = '';
          try { const j = JSON.parse(body || '{}'); email = String(j.email ?? ''); password = String(j.password ?? ''); } catch { /* geçersiz gövde */ }
          const ok = await checkLogin(email, password);
          if (!ok) { res.writeHead(401, cors); res.end(JSON.stringify({ error: 'invalid' })); return; }
          res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, token: issueToken(email) }));
        })().catch(() => { res.writeHead(500, cors); res.end(JSON.stringify({ error: 'server' })); });
      });
      return;
    }
    // İstatistikler: yalnız geçerli (imzalı, süresi geçmemiş) oturum jetonuyla.
    if (path === '/admin/api/stats') {
      const auth = req.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!verifyToken(token)) {
        res.writeHead(401, cors);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      const liveRoom = manager.liveStats();
      const day = query.get('day') ?? undefined;
      getAdminStats({
        online: onlineUsers.size,
        queue: matchQueue.length,
        ...liveRoom,
        matches: manager.liveMatches(),         // kim kime karşı — ayrıntılı
        onlineUserIds: [...onlineUsers.keys()],  // isimler DB'den çözülür
      }, day)
        .then((stats) => { res.writeHead(200, cors); res.end(JSON.stringify(stats)); })
        .catch((e) => {
          log.error('admin_stats_failed', { message: e instanceof Error ? e.message : String(e) });
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: 'server' }));
        });
      return;
    }

    // Admin: oyuncu görüş/öneri/destek mesajları (uygulama Ayarlar → geri
    // bildirim formu buraya POST ediyor; panel bu uçtan okur).
    if (path === '/admin/api/feedback') {
      const fbAuth = req.headers['authorization'] ?? '';
      const fbToken = fbAuth.startsWith('Bearer ') ? fbAuth.slice(7) : '';
      if (!verifyToken(fbToken)) { res.writeHead(401, cors); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
      void (async () => {
        try {
          const { rows } = await pool.query(
            `SELECT f.id, f.category, f.message, f.platform, f.app_version, f.build_number, f.os_version, f.device_model, f.created_at, u.display_name\n               FROM player_feedback f LEFT JOIN users u ON u.id::text = f.player_id\n              ORDER BY f.created_at DESC LIMIT 200`,
          );
          res.writeHead(200, cors); res.end(JSON.stringify({ items: rows }));
        } catch {
          // player_feedback tablosu İLK geri bildirimde oluşur — henüz yoksa boş liste.
          res.writeHead(200, cors); res.end(JSON.stringify({ items: [] }));
        }
      })();
      return;
    }

    // Admin: force-close a stuck room (e.g., player waiting in lobby for 2h)
    if (path === '/admin/api/room/close' && req.method === 'POST') {
      const auth = req.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!verifyToken(token)) {
        res.writeHead(401, cors);
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        void (async () => {
          let code = '';
          try { const j = JSON.parse(body || '{}'); code = String(j.code ?? '').toUpperCase(); } catch { /* ignore */ }
          if (!code) { res.writeHead(400, cors); res.end(JSON.stringify({ error: 'code required' })); return; }
          const room = manager.get(code);
          if (!room) { res.writeHead(404, cors); res.end(JSON.stringify({ error: 'room not found' })); return; }
          // Disconnect all players (triggers cleanup via handleClose)
          for (const [playerId, player] of room['players']) {
            if (!player.transport.isBot) {
              room.handleClose(playerId);
            }
          }
          // Ensure room is removed from manager
          if (manager.get(code)) {
            room['onEmpty'](code);
          }
          log.info('admin_room_force_closed', { code });
          res.writeHead(200, cors);
          res.end(JSON.stringify({ ok: true, code }));
        })().catch((e) => {
          log.error('admin_room_close_failed', { message: e instanceof Error ? e.message : String(e) });
          res.writeHead(500, cors);
          res.end(JSON.stringify({ error: 'server' }));
        });
      });
      return;
    }

    // Friends are now managed over WebSocket (send_friend_request, list_friends, etc.)
    if (path === '/friends' || path === '/friends/add' || path === '/friends/remove') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ friends: [] }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  http.on('clientError', (err, socket) => {
    log.warn('http_client_error', { error: err.message });
    try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* ignore */ }
  });

  http.on('error', (err) => {
    log.error('http_server_error', { error: err.message, stack: err.stack });
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('error', (err) => {
    log.error('ws_server_error', { error: err.message, stack: err.stack });
  });

  wss.on('connection', (ws: WebSocket, req) => {
    // GECİKME (2026-08-27): Nagle kapatılır — oyun mesajları küçük ve seyrek;
    // Nagle + delayed-ACK etkileşimi tur olaylarına 40-200 ms görünmez tampon
    // gecikmesi ekleyebiliyor. Gerçek-zamanlı oyunda anında gönderim esastır.
    req.socket.setNoDelay(true);
    // WiFi DONMA FIX (kullanıcı raporu 2026-08-28): hücreselde akıcı, ev WiFi'sinde
    // mesajlar birikip 'bir anda' geliyordu — WiFi güç-tasarrufu boşta bağlantıyı
    // uykuya alıp paketleri tamponluyor. Sunucu her 4sn WS PING gönderir; RN/tarayıcı
    // protokol düzeyinde otomatik PONG'lar → İKİ yön de sıcak kalır, tampon çözülür.
    // Ayrıca ölü bağlantı (2 PING boyunca PONG yok) sonlandırılır.
    let wsAlive = true;
    ws.on('pong', () => { wsAlive = true; });
    const heartbeat = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (!wsAlive) { try { ws.terminate(); } catch { /* yut */ } return; }
      wsAlive = false;
      try { ws.ping(); } catch { /* yut */ }
    }, 4000);
    let ctx: ConnCtx | null = null;
    let userProfile: UserProfile | undefined;
    const transport = wsTransport(ws);
    const ip = remoteIp(req);
    let explicitLeavePending: 'leave' | 'cheat' | null = null;
    const connectedAt = Date.now(); // oturum süresi günlüğü (admin istatistikleri)
    let windowStart = Date.now();
    let messageCount = 0;
    let typingCount = 0;
    log.info('ws_connect', { ip });

    const reportSocketTaskFailure = (task: string, err: unknown): void => {
      log.error('ws_task_failed', {
        task,
        ip,
        userId: userProfile?.id,
        room: ctx?.room.code,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      try { transport.send({ type: 'error', message: 'Sunucu hatası, tekrar dene' }); } catch { /* ignore */ }
    };

    ws.on('message', (data) => {
      void (async () => {
      let currentType: string | undefined;
      try {
      const now = Date.now();
      if (now - windowStart > RATE_WINDOW_MS) { windowStart = now; messageCount = 0; typingCount = 0; }
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        messageCount += 1;
        if (messageCount > RATE_MAX_MESSAGES) return;
        log.warn('ws_invalid_json', { ip, userId: userProfile?.id });
        return;
      }
      const rawType = typeof raw === 'object' && raw !== null && !Array.isArray(raw) && typeof (raw as { type?: unknown }).type === 'string'
        ? (raw as { type: string }).type
        : undefined;
      currentType = rawType;
      // Rate limit BEFORE validation too: malformed messages must not bypass the
      // cap by returning early. Typing frames keep their separate lane by raw type.
      if (rawType === 'typing_start' || rawType === 'typing_stop') {
        typingCount += 1;
        if (typingCount > RATE_MAX_TYPING) return;
      } else {
        messageCount += 1;
        if (messageCount > RATE_MAX_MESSAGES) {
          log.warn('ws_rate_limited', { ip, userId: userProfile?.id });
          // Drop burst messages silently so the user never sees a flashing red
          // error or gets kicked for a brief burst of taps.
          return;
        }
      }
      const validated = validateClientMsg(raw);
      if (!validated.ok) {
        log.warn('ws_invalid_message', { ip, reason: validated.error, userId: userProfile?.id });
        return;
      }
      const msg = validated.msg;
      currentType = msg.type;

      // İstemci yetenek bayrakları: kayıt sınıfı VE bağlantı-kuran maç
      // mesajlarıyla gelir, transport'a işlenir; oda kuralları (ör. wrongopen)
      // bunlara bakar. Maç mesajları listede olmadığında dereceli maçlar caps'siz
      // kalıyordu — wrongopen kuralı sahada hiç açılmıyordu.
      if ((msg.type === 'register' || msg.type === 'guest' || msg.type === 'auth' || msg.type === 'resume_room'
           || msg.type === 'find_match' || msg.type === 'create_room' || msg.type === 'create_solo' || msg.type === 'join_room')
          && Array.isArray(msg.caps)) {
        transport.caps = msg.caps.filter((c): c is string => typeof c === 'string').slice(0, 8);
      }

      // Register creates/loads a user profile (can happen before or without a room).
      if (msg.type === 'register') {
        void (async () => {
          // NOT (2026-08-28): userId ile register kimlikli hesaplarda da MEŞRU —
          // istemci her açılışta kalıcı girişi register+userId ile yeniler (auth
          // yalnız İLK oturum açmada). Buraya kimlik-kilidi koymak tüm Apple/
          // Google kullanıcılarını dışarı kilitliyordu (geri alındı). userId'nin
          // herkese açık olması ayrı bir konu; çözümü opak public-id, hard blok değil.
          // Reuse the saved account if the client sent its userId (keeps trophies
          // across app launches); otherwise look up by Game Center id or create.
          const loaded =
            (msg.userId ? await getUser(msg.userId) : null) ??
            (await findOrCreateUser(msg.gameCenterId ?? null, msg.name));
          if (rejectIfBanned(loaded, transport)) return;
          const profile = await grantDevEmotesIfNeeded(loaded);
          userProfile = profile;
          addOnline(profile.id, ws);
          void sendPendingSupportMessages(profile.id, transport);
          void offerTournamentMatchesForUser(profile.id);
          recordCaps(transport, profile.id);
          transport.send({
            type: 'profile',
            profile: toProfileView(profile),
          });
        })().catch((err) => reportSocketTaskFailure('register', err));
        return;
      }

      // Sign in with Apple / Continue with Google: verify the provider's identity
      // token, then find or create the matching account.
      if (msg.type === 'auth') {
        void (async () => {
          try {
            const verified =
              msg.provider === 'apple'
                ? await verifyAppleToken(msg.token)
                : msg.provider === 'facebook'
                  ? await verifyFacebookToken(msg.token)
                  : await verifyGoogleToken(msg.token);
            const name =
              msg.name?.trim() || verified.name || verified.email?.split('@')[0] || 'Oyuncu';
            const linked = await findOrCreateUserByProvider(
              msg.provider,
              verified.sub,
              verified.email ?? null,
              name,
              msg.userId,
            );
            if (rejectIfBanned(linked, transport)) return;
            const profile = await grantDevEmotesIfNeeded(linked);
            userProfile = profile;
            addOnline(profile.id, ws);
            void sendPendingSupportMessages(profile.id, transport);
          void offerTournamentMatchesForUser(profile.id);
            recordCaps(transport, profile.id);
            transport.send({ type: 'profile', profile: toProfileView(profile) });
          } catch (err) {
            console.error(`[auth:${msg.provider}] verify failed:`, err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Giriş doğrulanamadı' });
          }
        })();
        return;
      }

      // Guest login: create a throwaway account with an auto-assigned "M"+9-digit
      // username (no provider, no username picker). The client persists the
      // returned userId and re-registers with it on later launches, so the same
      // guest account — and its progress — is restored.
      if (msg.type === 'guest') {
        void (async () => {
          try {
            const profile = await createGuestUser();
            userProfile = profile;
            addOnline(profile.id, ws);
            void sendPendingSupportMessages(profile.id, transport);
          void offerTournamentMatchesForUser(profile.id);
            recordCaps(transport, profile.id);
            transport.send({ type: 'profile', profile: toProfileView(profile) });
          } catch (err) {
            console.error('[guest] create failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Misafir girişi başarısız' });
          }
        })();
        return;
      }

      if (msg.type === 'change_name') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Register first' });
        void (async () => {
          const result = await changeDisplayName(userProfile!.id, msg.newName);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'name_changed',
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // One-time unique username pick after sign-in. Accept the account id from
      // the connection's profile OR the message (persisted login re-using userId).
      if (msg.type === 'set_username') {
        const uid = userProfile?.id ?? msg.userId;
        if (!uid) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setUsername(uid, msg.username);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'profile',
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // Buy a premium emote (needs the account, not a room).
      if (msg.type === 'buy_emote') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await buyEmote(userProfile!.id, msg.emoteId);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({
            type: 'emote_purchased',
            emoteId: msg.emoteId,
            profile: toProfileView(result.profile),
          });
        })();
        return;
      }

      // Equip up to 3 visual emotes into the match loadout.
      if (msg.type === 'equip_emotes') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setEquippedEmotes(userProfile!.id, msg.emoteIds);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Choose a profile picture. Updates the account, then pushes the change live
      // to the current match opponent and to every online friend so it shows
      // instantly without a refresh.
      if (msg.type === 'set_avatar') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setAvatar(userProfile!.id, msg.avatar ?? null);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
          // In a match → update the opponent's view of me immediately.
          if (ctx?.room) ctx.room.setAvatarFor(userProfile!.id, result.profile.avatar);
          // Online friends → refresh their friend list so my new picture appears.
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Profil çerçevesi tak/kaldır (seviye ödülü). Hesap güncellenir, sonra
      // maçtaki rakibe ve çevrimiçi arkadaşlara anında yansıtılır.
      if (msg.type === 'set_frame') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await setSelectedFrame(userProfile!.id, msg.frameId ?? null);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'profile', profile: toProfileView(result.profile) });
          if (ctx?.room) ctx.room.setFrameFor(userProfile!.id, result.profile.selectedFrame);
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Seviye Yolu kartına dokunuldu — ödülü tek seferlik ver, taze profili gönder.
      if (msg.type === 'claim_level_reward') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await claimLevelReward(userProfile!.id, msg.level, msg.track ?? 'free');
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          const fresh = await getUser(userProfile!.id);
          if (fresh) userProfile = fresh;
          transport.send({
            type: 'level_reward_claimed',
            level: result.claim.level,
            diamonds: result.claim.diamonds,
            emoteId: result.claim.emoteId,
            frameTier: result.claim.frameTier,
            powerId: result.claim.powerId,
            track: result.claim.track,
            profile: toProfileView(userProfile!),
          });
        })();
        return;
      }

      // Profil istatistikleri: seri rekoru + mod bazlı kazanma/kaybetme kırılımı.
      if (msg.type === 'get_my_stats') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const fresh = await getUser(userProfile!.id);
            if (fresh) userProfile = fresh;
            const stats = await getRankedProfileStats(userProfile!.id);
            transport.send({ type: 'my_stats', winStreak: userProfile!.winStreak, bestStreak: userProfile!.bestStreak, wins: stats.wins, losses: stats.losses, modes: stats.modes });
          } catch (err) {
            console.error('[get_my_stats] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'İstatistikler alınamadı' });
          }
        })();
        return;
      }

      // Premium Seviye Yolu satın alma — 1000 elmas, tek seferlik, atomik.
      if (msg.type === 'buy_premium_road') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await buyPremiumRoad(userProfile!.id);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'premium_road_purchased', profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[buy_premium_road] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Satın alma başarısız' });
          }
        })();
        return;
      }

      // Mağazadan güç satın alma — elmas düşer, envanter artar (atomik).
      if (msg.type === 'buy_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await buyPower(userProfile!.id, msg.powerId);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'power_purchased', powerId: msg.powerId, profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[buy_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Satın alma başarısız' });
          }
        })();
        return;
      }

      // Kişiye özel Günlük Fırsat — deterministik, 12 saat sabit, pencere
      // başına tek satın alma. Fiyat/aidiyet her zaman sunucuda doğrulanır.
      if (msg.type === 'get_daily_offer') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const claimed = await dailyOfferClaimed(userProfile!.id, currentOfferWindow().idx);
            transport.send({ type: 'daily_offer', offer: claimed ? null : computeDailyOffer(userProfile!) });
          } catch (err) {
            console.error('[daily_offer] failed:', err instanceof Error ? err.message : err);
          }
        })();
        return;
      }
      if (msg.type === 'buy_daily_offer') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await buyDailyOffer(userProfile!.id, msg.key);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'daily_offer_purchased', profile: toProfileView(result.profile), offer: result.offer });
          } catch (err) {
            console.error('[buy_daily_offer] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Fırsat satın alınamadı' });
          }
        })();
        return;
      }

      // ---- Davet ödülü (game/referrals.ts) ----
      if (msg.type === 'redeem_referral') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await redeemReferral(userProfile!.id, msg.code);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'referral_redeemed', profile: toProfileView(result.profile), referrerName: result.referrerName, reward: result.reward });
            // İki taraf da arkadaş listesini taze görsün (davet eden çevrimiçiyse anında düşer).
            const friends = await listFriends(userProfile!.id);
            for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
          } catch (err) {
            log.warn('redeem_referral_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) });
            transport.send({ type: 'error', message: 'Davet kodu kullanılamadı, tekrar dene' });
          }
        })();
        return;
      }

      // ---- Günün Crossover'ı (game/dailyCrossover.ts) ----
      // DONMA RAPORU (2026-08-29): istemci JS thread'inin bloklandığını ya da
      // önceki oturumun kirli kapandığını bildirir. Yalnız LOGLANIR — oyun
      // durumuna etkisi yoktur; amaç donmanın hangi ekranda olduğunu ölçmek.
      if (msg.type === 'freeze_report') {
        log.warn('client_freeze', {
          kind: msg.kind,
          screen: msg.screen,
          stalledMs: msg.stalledMs,
          userId: userProfile?.id ?? null,
        });
        return;
      }
      // GÜNLÜK GÖREVLER (2026-08-29): ilerleme maç kapanışında yazılır (room.ts);
      // burada yalnız okuma ve ödül toplama var.
      if (msg.type === 'get_daily_quests') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void getDailyQuests(userProfile.id)
          .then((quests) => transport.send({ type: 'daily_quests', quests }))
          .catch((err) => reportSocketTaskFailure('get_daily_quests', err));
        return;
      }
      if (msg.type === 'claim_quest') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        const qid = msg.questId;
        void (async () => {
          const res = await claimQuest(uid, qid);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          const fresh = await getUser(uid);
          if (fresh) userProfile = fresh;
          transport.send({
            type: 'quest_claimed', questId: qid, xp: res.xp, quests: res.quests,
            profile: fresh ? toProfileView(fresh) : undefined,
          });
        })().catch((err) => reportSocketTaskFailure('claim_quest', err));
        return;
      }
      // GÜNÜN KARİYERİ (2026-08-29): kulüp geçmişi tek tek açılır, futbolcu bilinir.
      if (msg.type === 'get_daily_career') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void getDailyCareer(userProfile.id)
          .then((state) => { if (state) transport.send({ type: 'daily_career', state }); })
          .catch((err) => reportSocketTaskFailure('get_daily_career', err));
        return;
      }
      if (msg.type === 'daily_career_guess') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        void (async () => {
          const res = await guessDailyCareer(uid, msg.text);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          if (res.profile) userProfile = res.profile;
          transport.send({
            type: 'daily_career_result',
            state: res.state,
            correct: res.correct,
            rewardGranted: res.rewardGranted,
            profile: res.profile ? toProfileView(res.profile) : undefined,
          });
        })().catch((err) => reportSocketTaskFailure('daily_career_guess', err));
        return;
      }
      if (msg.type === 'get_daily_crossover') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const state = await getDailyState(userProfile!.id);
            if (state) transport.send({ type: 'daily_crossover', state });
          } catch (err) {
            log.warn('daily_crossover_state_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) });
          }
        })();
        return;
      }
      if (msg.type === 'start_daily_crossover') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            await startDailyCrossover(userProfile!.id);
            const state = await getDailyState(userProfile!.id);
            if (state) transport.send({ type: 'daily_crossover', state });
          } catch (err) {
            log.warn('daily_crossover_start_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) });
          }
        })();
        return;
      }
      if (msg.type === 'daily_crossover_guess') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const outcome = await submitDailyGuess(userProfile!.id, msg.text);
            if (outcome.kind === 'wrong') {
              transport.send({ type: 'daily_crossover_wrong', guess: outcome.guess, suggestion: outcome.suggestion, attemptsLeft: outcome.attemptsLeft });
              return;
            }
            if (outcome.kind === 'finished') {
              // Ödül düştüyse taze profili de gönder — elmas rozeti anında güncellenir.
              const fresh = outcome.rewardGranted > 0 ? await getUser(userProfile!.id) : null;
              if (fresh) userProfile = fresh;
              transport.send({ type: 'daily_crossover_done', state: outcome.state, rewardGranted: outcome.rewardGranted, profile: fresh ? toProfileView(fresh) : undefined });
              return;
            }
            const state = await getDailyState(userProfile!.id);
            if (state) transport.send({ type: 'daily_crossover', state });
          } catch (err) {
            log.warn('daily_crossover_guess_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) });
            transport.send({ type: 'error', message: 'Tahmin gönderilemedi, tekrar dene' });
          }
        })();
        return;
      }

      // Kesinti telafisi: özür penceresindeki "AL". Hediye SADECE burada,
      // yani oyuncunun kendi isteğiyle tanımlanır; tek seferliktir.
      if (msg.type === 'claim_outage_gift') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await claimOutageGift(userProfile!.id);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'outage_gift_claimed', profile: toProfileView(result.profile), granted: result.granted });
          } catch (err) {
            console.error('[claim_outage_gift] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Hediye tanımlanamadı' });
          }
        })();
        return;
      }

      // Özel güç etkinleştirme: 2x XP jetonu (1 saat) ya da Kupa Kalkanı kuşan.
      if (msg.type === 'use_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          try {
            const result = await usePower(userProfile!.id, msg.powerId);
            if (!result.ok) return transport.send({ type: 'error', message: result.error });
            userProfile = result.profile;
            transport.send({ type: 'power_used', powerId: msg.powerId, profile: toProfileView(result.profile) });
          } catch (err) {
            console.error('[use_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Güç kullanılamadı' });
          }
        })();
        return;
      }

      // ---- Maç içi Özel Güçler: mağaza + kuşanma (maç dışı; maç içi kullanım
      // use_special_power ile odaya düşer). Fiyat/katalog sunucu config'inden.
      if (msg.type === 'buy_special_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const spBuyId = msg.powerId;
        if (!isSpecialPowerId(spBuyId)) return transport.send({ type: 'error', message: 'Bilinmeyen güç' });
        void (async () => {
          try {
            const res = await buySpecialPower(userProfile!.id, spBuyId, msg.qty ?? 1);
            if (!res.ok) return transport.send({ type: 'error', message: res.error });
            const fresh = await getUser(userProfile!.id);
            if (!fresh) return;
            userProfile = fresh;
            transport.send({ type: 'special_power_purchased', powerId: spBuyId, profile: toProfileView(fresh) });
          } catch (err) {
            console.error('[buy_special_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Satın alma başarısız, tekrar dene' });
          }
        })();
        return;
      }

      if (msg.type === 'equip_special_power') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        if (msg.powerId !== null && !isSpecialPowerId(msg.powerId)) return transport.send({ type: 'error', message: 'Bilinmeyen güç' });
        void (async () => {
          try {
            await equipSpecialPower(userProfile!.id, msg.powerId as never);
            const fresh = await getUser(userProfile!.id);
            if (!fresh) return;
            userProfile = fresh;
            transport.send({ type: 'special_power_equipped', powerId: msg.powerId, profile: toProfileView(fresh) });
          } catch (err) {
            console.error('[equip_special_power] failed:', err instanceof Error ? err.message : err);
            transport.send({ type: 'error', message: 'Kuşanma başarısız' });
          }
        })();
        return;
      }

      if (msg.type === 'buy_avatar') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await buyAvatar(userProfile!.id, msg.avatarId);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'avatar_purchased', avatarId: msg.avatarId, profile: toProfileView(result.profile) });
          if (ctx?.room) ctx.room.setAvatarFor(userProfile!.id, result.profile.avatar);
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      if (msg.type === 'get_store_catalog') {
        const catalog = storeCatalog();
        if (userProfile?.id) {
          // İlk-alım 2x rozeti kullanıcıya özel — katalog geri kalanı saf/statik.
          void firstDiamondDoubleAvailable(userProfile.id)
            .then((avail) => transport.send({ type: 'store_catalog', catalog: { ...catalog, firstDiamondDoubleAvailable: avail } }))
            .catch(() => transport.send({ type: 'store_catalog', catalog }));
        } else {
          transport.send({ type: 'store_catalog', catalog });
        }
        return;
      }

      if (msg.type === 'buy_cosmetic') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          const result = await buyCosmetic(userProfile!.id, msg.itemId, msg.idempotencyKey);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'cosmetic_purchased', itemId: msg.itemId, alreadyOwned: result.alreadyOwned, profile: toProfileView(result.profile) });
        })();
        return;
      }

      if (msg.type === 'equip_cosmetic') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await equipCosmetic(userProfile!.id, msg.itemId, msg.cosmeticType as any);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          const profileView = toProfileView(result.profile);
          transport.send({ type: 'cosmetic_equipped', itemId: msg.itemId, cosmeticType: msg.cosmeticType, profile: profileView });
          if (ctx?.room) ctx.room.setCosmeticsFor(userProfile!.id, toCosmeticLoadout(result.profile));
          const friends = await listFriends(userProfile!.id);
          for (const f of friends) sendToUser(f.userId, await getFriendsData(f.userId));
        })();
        return;
      }

      // Validate an Apple IAP receipt and grant diamonds (server-authoritative).
      if (msg.type === 'verify_purchase') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce kayıt ol' });
        void (async () => {
          // Platform-aware (2026-08-29): Android istemci purchaseToken + ürün
          // kimliği gönderir → Google Play API'sine sorulur. Alan yoksa eski
          // istemcidir; varsayılan iOS (Apple JWS) yolu korunur.
          const result = msg.platform === 'android'
            ? await verifyGooglePurchase(userProfile!.id, msg.receipt, msg.productId ?? '', msg.isSubscription === true)
            : await verifyApplePurchase(userProfile!.id, msg.receipt);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          userProfile = result.profile;
          transport.send({ type: 'diamonds_granted', granted: result.granted, profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Credit diamonds for watching a rewarded ad (server-capped, no client trust).
      // Uses its own ad_reward_result channel so it never resolves an in-flight IAP
      // verification (which keys off diamonds_granted).
      if (msg.type === 'grant_ad_reward') {
        if (!userProfile) return transport.send({ type: 'ad_reward_result', ok: false, error: 'Önce kayıt ol' });
        void (async () => {
          const result = await grantAdReward(userProfile!.id);
          if (!result.ok) return transport.send({ type: 'ad_reward_result', ok: false, error: result.error });
          userProfile = result.profile;
          transport.send({ type: 'ad_reward_result', ok: true, granted: result.granted, profile: toProfileView(result.profile) });
        })();
        return;
      }

      // Save this device's Expo push token for notifications. Needs a signed-in
      // account to attach the token to; silently ignored otherwise.
      if (msg.type === 'register_push') {
        if (!userProfile) return;
        void registerPushToken(userProfile.id, msg.token, msg.platform, msg.lang ?? 'tr')
          .catch((err) => log.warn('push_register_failed', { userId: userProfile?.id, error: err instanceof Error ? err.message : String(err) }));
        return;
      }

      // Permanently delete the signed-in account and all its data (App Store 5.1.1(v)),
      // then tear down the session so the client returns to the login screen.
      if (msg.type === 'ack_support_message') {
        if (userProfile && typeof msg.id === 'string') {
          void pool.query('UPDATE support_messages SET seen = true WHERE id = $1 AND user_id = $2', [msg.id, userProfile.id]).catch(() => {});
        }
        return;
      }

      // ═══ TURNUVALAR (2026-08-28) ═══
      // HAFTALIK LİG (2026-08-29): salt-okunur durum. Puan kazanımı maç
      // kapanışında (rank.ts) olur; burada yalnız tablo döner. Misafir hesap da
      // görebilsin diye giriş şartı yok — profilsizde boş tablo yerine hata.
      if (msg.type === 'get_league') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void getLeagueState(userProfile.id)
          .then((league) => transport.send({ type: 'league_state', league }))
          .catch((err) => reportSocketTaskFailure('get_league', err));
        return;
      }
      if (msg.type === 'list_tournaments') {
        void listTournaments(userProfile?.id ?? null)
          .then((items) => transport.send({ type: 'tournaments_list', items }))
          .catch((err) => reportSocketTaskFailure('list_tournaments', err));
        return;
      }
      if (msg.type === 'get_tournament') {
        void getTournamentState(msg.id, userProfile?.id ?? null)
          .then((t) => { if (t) transport.send({ type: 'tournament_state', tournament: t }); })
          .catch((err) => reportSocketTaskFailure('get_tournament', err));
        return;
      }
      if (msg.type === 'join_tournament') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        void (async () => {
          const res = await joinTournament(msg.id, uid);
          if (!res.ok) return transport.send({ type: 'error', message: res.error ?? 'Kayıt başarısız' });
          transport.send({ type: 'tournaments_list', items: await listTournaments(uid) });
          await broadcastTournamentState(msg.id);
          if (res.started) await offerTournamentMatches(msg.id);
        })().catch((err) => reportSocketTaskFailure('join_tournament', err));
        return;
      }
      if (msg.type === 'leave_tournament') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        void (async () => {
          const res = await leaveTournament(msg.id, uid);
          if (!res.ok) return transport.send({ type: 'error', message: res.error ?? 'Çıkılamadı' });
          transport.send({ type: 'tournaments_list', items: await listTournaments(uid) });
          await broadcastTournamentState(msg.id);
        })().catch((err) => reportSocketTaskFailure('leave_tournament', err));
        return;
      }
      if (msg.type === 'tournament_ready') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const readyProfile = userProfile;
        void (async () => {
          const { rows } = await pool.query<{ id: string; tournament_id: string; player_a: string | null; player_b: string | null; winner: string | null; status: string }>(
            `SELECT m.id, m.tournament_id, m.player_a, m.player_b, m.winner, m.status
               FROM tournament_matches m JOIN tournaments t ON t.id = m.tournament_id AND t.status = 'live'
              WHERE m.id = $1`, [msg.matchId],
          );
          const m = rows[0];
          if (!m || m.winner || m.status === 'playing') return transport.send({ type: 'error', message: 'Bu maç artık oynanamaz' });
          if (m.player_a !== readyProfile.id && m.player_b !== readyProfile.id) return transport.send({ type: 'error', message: 'Bu maçta değilsin' });
          const oppId = (m.player_a === readyProfile.id ? m.player_b : m.player_a)!;
          let wait = tournamentReadyWaits.get(m.id);
          if (!wait) { wait = new Map(); tournamentReadyWaits.set(m.id, wait); }
          wait.set(readyProfile.id, { name: readyProfile.displayName, transport, profile: readyProfile, setCtx: (c) => { ctx = c; } });
          const other = wait.get(oppId);
          if (!other) {
            // Rakip henüz hazır değil — iki tarafa da güncel hazır durumunu bildir.
            const st = await getTournamentState(m.tournament_id, null);
            const nameOf = new Map((st?.players ?? []).map((pl) => [pl.userId, pl.name]));
            transport.send({ type: 'tournament_match_ready', tournamentId: m.tournament_id, matchId: m.id, opponentName: nameOf.get(oppId) ?? 'Rakip', tournamentName: st?.name ?? '', youReady: true, oppReady: false });
            sendToUser(oppId, { type: 'tournament_match_ready', tournamentId: m.tournament_id, matchId: m.id, opponentName: readyProfile.displayName, tournamentName: st?.name ?? '', youReady: false, oppReady: true });
            return;
          }
          // ── İKİSİ DE HAZIR: oda kurulur (dostluk kalıbı; ranked=false, team-team) ──
          tournamentReadyWaits.delete(m.id);
          await markMatchPlaying(m.id);
          const room = manager.createRoom();
          room.gameMode = 'team-team';
          const matchId = m.id;
          const tid = m.tournament_id;
          let reported = false;
          const settle = (winnerUid: string | null) => {
            if (reported) return;
            reported = true;
            void (async () => {
              const res = await reportTournamentResult(matchId, winnerUid);
              if (!res) return;
              await broadcastTournamentState(res.tournamentId);
              if (res.finished && res.winnerUserId) {
                const st = await getTournamentState(res.tournamentId, null);
                sendToUser(res.winnerUserId, { type: 'tournament_over', tournamentId: res.tournamentId, youWon: true, placement: 1, prize: res.prizeFirst ?? 0, tournamentName: st?.name ?? '' });
                if (res.secondUserId) sendToUser(res.secondUserId, { type: 'tournament_over', tournamentId: res.tournamentId, youWon: false, placement: 2, prize: res.prizeSecond ?? 0, tournamentName: st?.name ?? '' });
              } else {
                await offerTournamentMatches(res.tournamentId);
              }
            })().catch((err) => log.error('tournament_settle_failed', { matchId, error: err instanceof Error ? err.message : String(err) }));
          };
          room.tournamentHook = settle;
          room.onDispose(() => { if (!reported) settle(null); }); // maç sonuçsuz dağıldı → pending'e dön
          const aSkill = await getOrCreateSkillProfile(other.profile.id, other.profile.trophies).catch(() => undefined);
          const bSkill = await getOrCreateSkillProfile(readyProfile.id, readyProfile.trophies).catch(() => undefined);
          const resA = room.addPlayer(other.name, other.transport, true, other.profile.id, other.profile.trophies, other.profile.arena, other.profile.avatar, other.profile.level, other.profile.selectedFrame, toCosmeticLoadout(other.profile), aSkill?.skillMean, aSkill?.skillUncertainty, aSkill?.matchesPlayed);
          const resB = room.addPlayer(readyProfile.displayName, transport, false, readyProfile.id, readyProfile.trophies, readyProfile.arena, readyProfile.avatar, readyProfile.level, readyProfile.selectedFrame, toCosmeticLoadout(readyProfile), bSkill?.skillMean, bSkill?.skillUncertainty, bSkill?.matchesPlayed);
          if (resA.ok) other.setCtx({ room, playerId: resA.id, userProfile: other.profile });
          if (resB.ok) ctx = { room, playerId: resB.id, userProfile: readyProfile };
          log.info('tournament_match_started', { tournamentId: tid, matchId, room: room.code });
          setTimeout(() => safeAutoStart(room, resA.ok ? resA.id : '', 'tournament_match'), 2000);
        })().catch((err) => reportSocketTaskFailure('tournament_ready', err));
        return;
      }
      if (msg.type === 'leave_match') {
        // Deliberate exit (X onayı / arka plan hükmeni): reconnect grace YOK —
        // rakip hükmen sonucu ANINDA görür. Ardından gelen soket kapanışı
        // oyuncuyu zaten silinmiş bulur (no-op).
        explicitLeavePending = msg.reason === 'cheat' ? 'cheat' : 'leave';
        if (ctx) { ctx.room.explicitLeave(ctx.playerId, explicitLeavePending); ctx = null; }
        return;
      }
      if (msg.type === 'delete_account') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const uid = userProfile.id;
        void (async () => {
          try {
            await deleteAccount(uid);
            if (ctx) { ctx.room.handleClose(ctx.playerId); ctx = null; }
            removeOnline(uid, ws);
            userProfile = undefined;
            transport.send({ type: 'account_deleted' });
          } catch (err) {
            log.warn('delete_account_failed', { userId: uid, error: err instanceof Error ? err.message : String(err) });
            transport.send({ type: 'error', message: 'Hesap silinemedi, tekrar dene' });
          }
        })();
        return;
      }

      // ---- Friend system (works with or without a room) ----
      if (msg.type === 'send_friend_request') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await sendFriendRequest(userProfile!.id, msg.targetCode, msg.targetUsername);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          transport.send({ type: 'friend_request_sent' });
          // Notify the target in real-time if they're online
          sendToUser(result.toUserId, {
            type: 'friend_request_received',
            requestId: '', // the receiver will refresh their list
            fromId: userProfile!.id,
            fromName: userProfile!.displayName,
          });
        })();
        return;
      }
      if (msg.type === 'respond_friend_request') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const result = await respondFriendRequest(userProfile!.id, msg.requestId, msg.accept);
          if (!result.ok) return transport.send({ type: 'error', message: result.error });
          transport.send({ type: 'friend_request_responded', requestId: msg.requestId, accepted: msg.accept });
          // Refresh my friend list…
          const myData = await getFriendsData(userProfile!.id);
          transport.send(myData);
          // …and push a fresh list to the original requester in real time so the
          // new friend appears for them instantly (no app restart needed).
          if (msg.accept) {
            const theirData = await getFriendsData(result.fromUserId);
            sendToUser(result.fromUserId, theirData);
          }
        })();
        return;
      }
      if (msg.type === 'list_friends') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const data = await getFriendsData(userProfile!.id);
          transport.send(data);
        })();
        return;
      }
      if (msg.type === 'search_users') {
        void (async () => {
          const users = await searchUsers(msg.query, userProfile?.id);
          transport.send({ type: 'user_search_results', users });
        })();
        return;
      }
      if (msg.type === 'remove_friend') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          await removeFriend(userProfile!.id, msg.friendId);
          transport.send({ type: 'friend_removed', friendId: msg.friendId });
          const data = await getFriendsData(userProfile!.id);
          transport.send(data);
          // Push a fresh list to the other person too — they lose the friend live.
          sendToUser(msg.friendId, await getFriendsData(msg.friendId));
        })();
        return;
      }
      if (msg.type === 'invite_friend_match') {
        // Futbol XOX daveti: davet edilen istemci modu tanımalı — eski sürüme
        // XOX odası acmak onu bos ekranda bırakır (caps kaydından denetlenir).
        if (msg.options?.mode === 'xox') {
          const inviteeCaps = userCaps.get(msg.friendId) ?? [];
          if (!inviteeCaps.includes('xox')) {
            transport.send({ type: 'error', message: 'Arkadaşının uygulama sürümü Futbol XOX desteklemiyor', public: true } as never);
            return;
          }
        }
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const requestedMode = msg.options?.mode ?? 'team-team';
        // Dostluk daveti: TAKIM-TAKIM modu paket İSTEMEZ (kullanıcı kararı
        // 2026-08-28) — herkes arkadaşıyla takım-takım oynayabilir. Ülke-Takım /
        // Harf-Takım / XOX hâlâ Sosyal Paket ister.
        if (requestedMode !== 'team-team' && !hasActiveSocialPack(userProfile)) return transport.send({ type: 'error', message: FRIENDLY_INVITE_NEEDS_PACK });
        const fromId = userProfile.id;
        const inviterProfile = userProfile;
        void (async () => {
          // Guideline 1.2: blocking must close match invites too. Blocking already
          // drops the friendship, but a stale client list could still fire one —
          // the server is what says no. Awaited: the invite must NOT be created
          // while the check is still in flight.
          if (await isBlockedBetween(fromId, msg.friendId)) {
            transport.send({ type: 'error', message: 'Bu kullanıcıya davet gönderemezsin' });
            return;
          }
          const key = `${fromId}:${msg.friendId}`;
          // Replace any prior pending invite to the same friend.
          const prev = pendingInvites.get(key);
          if (prev) clearTimeout(prev.timer);
          // Auto-expire after 30s so it can't hang forever.
          const timer = setTimeout(() => {
            if (pendingInvites.get(key)) {
              pendingInvites.delete(key);
              sendToUser(msg.friendId, { type: 'match_invite_cancelled' });
            }
          }, 30_000);
          pendingInvites.set(key, {
            fromUserId: fromId,
            toUserId: msg.friendId,
            fromName: inviterProfile.displayName,
            transport,
            ws,
            userProfile: inviterProfile,
            options: msg.options,
            setCtx: (c) => { ctx = c; },
            timer,
          });
          sendToUser(msg.friendId, {
            type: 'match_invite_received',
            fromId,
            fromName: inviterProfile.displayName,
            options: msg.options,
          });
        })();
        return;
      }
      if (msg.type === 'respond_match_invite') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const key = `${msg.fromId}:${userProfile.id}`;
        const inv = pendingInvites.get(key);
        if (!inv) { transport.send({ type: 'match_invite_cancelled' }); return; }
        clearTimeout(inv.timer);
        pendingInvites.delete(key);
        if (!msg.accept) {
          sendToUser(inv.fromUserId, { type: 'match_invite_declined', byId: userProfile.id });
          return;
        }
        if (ctx) {
          sendToUser(inv.fromUserId, { type: 'match_invite_declined', byId: userProfile.id });
          transport.send({ type: 'match_invite_cancelled' });
          return;
        }
        const requestedMode = inv.options?.mode ?? 'team-team';
        // İKİ TARAF DA paketli olmalı (kullanıcı kararı 2026-08-28): sosyal mod
        // (letter/country/xox) davetinde davet SAHİBİNİN paketi hâlâ aktif olmalı VE
        // KABUL EDEN de aktif pakete sahip olmalı. TAKIM-TAKIM modunda paket HİÇ aranmaz
        // (canUseMode team-team'de daima true). Önceden kabul eden paketsizken sosyal
        // moda girebiliyordu; açık kapatıldı.
        if (requestedMode !== 'team-team' && (!hasActiveSocialPack(inv.userProfile) || !canUseMode(userProfile, requestedMode))) {
          sendToUser(inv.fromUserId, { type: 'match_invite_declined', byId: userProfile.id });
          transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          return;
        }
        // Accepted — drop both players into a fresh room and auto-start.
        if (inv.ws.readyState !== inv.ws.OPEN) { transport.send({ type: 'match_invite_cancelled' }); return; }
        const room = manager.createRoom();
        if (inv.options?.scope) room.scope = inv.options.scope;
        room.gameMode = requestedMode;
        const invSkill = inv.userProfile?.id ? await getOrCreateSkillProfile(inv.userProfile.id, inv.userProfile.trophies).catch(() => undefined) : undefined;
        const mySkill = userProfile.id ? await getOrCreateSkillProfile(userProfile.id, userProfile.trophies).catch(() => undefined) : undefined;
        const resA = room.addPlayer(inv.fromName, inv.transport, true, inv.fromUserId, inv.userProfile?.trophies, inv.userProfile?.arena, inv.userProfile?.avatar, inv.userProfile?.level, inv.userProfile?.selectedFrame, inv.userProfile ? toCosmeticLoadout(inv.userProfile) : undefined, invSkill?.skillMean, invSkill?.skillUncertainty, invSkill?.matchesPlayed);
        const resB = room.addPlayer(userProfile.displayName, transport, false, userProfile.id, userProfile.trophies, userProfile.arena, userProfile.avatar, userProfile.level, userProfile.selectedFrame, toCosmeticLoadout(userProfile), mySkill?.skillMean, mySkill?.skillUncertainty, mySkill?.matchesPlayed);
        if (resA.ok) inv.setCtx({ room, playerId: resA.id, userProfile: inv.userProfile });
        if (resB.ok) ctx = { room, playerId: resB.id, userProfile };
        setTimeout(() => safeAutoStart(room, resA.ok ? resA.id : '', 'friend_match'), 2000);
        return;
      }
      if (msg.type === 'cancel_match_invite') {
        if (!userProfile) return;
        const key = `${userProfile.id}:${msg.toId}`;
        const inv = pendingInvites.get(key);
        if (inv) { clearTimeout(inv.timer); pendingInvites.delete(key); }
        sendToUser(msg.toId, { type: 'match_invite_cancelled' });
        return;
      }
      if (msg.type === 'get_user_profile') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const bot = getLeaderboardBotProfile(msg.userId);
          if (bot) {
            transport.send({
              type: 'user_profile',
              profile: { userId: bot.userId, displayName: bot.displayName, selectedAvatar: bot.avatar ?? '', trophies: bot.trophies, wins: bot.wins, losses: bot.losses, arena: bot.arena, avatar: bot.avatar, frame: bot.frame, isBot: true, modeStats: bot.modeStats },
            });
            return;
          }
          const u = await getUser(msg.userId);
          if (!u) return transport.send({ type: 'error', message: 'Kullanıcı bulunamadı' });
          const stats = await getRankedProfileStats(u.id);
          transport.send({
            type: 'user_profile',
            profile: {
              userId: u.id,
              displayName: u.displayName,
              selectedAvatar: u.selectedAvatar,
              trophies: u.trophies,
              wins: stats.wins,
              losses: stats.losses,
              arena: u.arena,
              avatar: u.avatar,
              frame: u.selectedFrame,
              bestStreak: u.bestStreak,
              modes: stats.modes,
              modeStats: stats.modes,
            },
          });
        })();
        return;
      }
      if (msg.type === 'list_match_history') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          const matches = await getMatchHistory(userProfile!.id);
          transport.send({ type: 'match_history_list', matches });
        })();
        return;
      }

      // ---- Direct Messages ----
      if (msg.type === 'send_message') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        const rawBody = (msg.body ?? '').trim();
        if (!rawBody || rawBody.length > 500) return;
        const body = censorMessage(rawBody);
        void (async () => {
          // Guideline 1.2 — no ANONYMOUS content. Enforced server-side, not just
          // in the UI: this is the exact finding App Review cited.
          if (!(await isIdentifiedAccount(userProfile!.id))) {
            transport.send({ type: 'error', message: GUEST_BLOCKED_MSG });
            return;
          }
          // Guideline 1.2 block gate. Checked in BOTH directions: a one-way check
          // would still let the person you blocked keep messaging you.
          if (await isBlockedBetween(userProfile!.id, msg.toUserId)) {
            transport.send({ type: 'error', message: 'Bu kullanıcıya mesaj gönderemezsin' });
            return;
          }
          const { rows } = await pool.query<{ id: string; created_at: string }>(
            `INSERT INTO messages (from_user, to_user, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
            [userProfile!.id, msg.toUserId, body],
          );
          const row = rows[0];
          if (!row) return;
          const mv: MessageView = {
            id: row.id,
            fromId: userProfile!.id,
            fromName: userProfile!.displayName,
            toId: msg.toUserId,
            body,
            createdAt: row.created_at,
          };
          // Send to sender as confirmation
          transport.send({ type: 'message_received', message: mv });
          // Send to recipient if online
          sendToUser(msg.toUserId, { type: 'message_received', message: mv });
          // Recipient has no live socket → push notification instead. Badge =
          // their unread DMs + pending friend requests, so the app icon count
          // matches what they'll see inside. Fire-and-forget: a push failure
          // must never affect message delivery.
          if (!onlineUsers.has(msg.toUserId)) {
            const sender = userProfile!;
            void (async () => {
              const { rows: cnt } = await pool.query<{ badge: string }>(
                `SELECT (SELECT COUNT(*) FROM messages WHERE to_user = $1 AND read_at IS NULL)
                      + (SELECT COUNT(*) FROM friend_requests WHERE to_user = $1) AS badge`,
                [msg.toUserId],
              );
              const preview = body.replace(/\s+/g, ' ').trim().slice(0, 100);
              await sendPushToUsers([msg.toUserId], {
                title: sender.displayName,
                body: preview,
                data: { kind: 'message', fromId: sender.id },
                badge: Number(cnt[0]?.badge ?? 0),
              });
            })().catch((err) => log.warn('push_message_failed', { toUserId: msg.toUserId, error: err instanceof Error ? err.message : String(err) }));
          }
        })();
        return;
      }
      if (msg.type === 'list_messages') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          // Guideline 1.2 engel kapısı — list_conversations'la tutarlı: engelli
          // biriyle geçmiş dökümü de açılamaz (iki yönlü). Boş liste döner ki
          // istemci sohbeti sessizce kapatabilsin.
          if (await isBlockedBetween(userProfile!.id, msg.withUserId)) {
            transport.send({ type: 'message_list', messages: [], withUserId: msg.withUserId });
            return;
          }
          const beforeClause = msg.before ? `AND m.created_at < $3` : '';
          const params: any[] = [userProfile!.id, msg.withUserId];
          if (msg.before) params.push(msg.before);
          const { rows } = await pool.query<{
            id: string; from_user: string; to_user: string; body: string; created_at: string; from_name: string; deleted_at: string | null;
          }>(
            `SELECT m.id, m.from_user, m.to_user, m.body, m.created_at, m.deleted_at, u.display_name as from_name
             FROM messages m
             JOIN users u ON u.id = m.from_user
             WHERE ((m.from_user = $1 AND m.to_user = $2) OR (m.from_user = $2 AND m.to_user = $1))
             ${beforeClause}
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 50`,
            params,
          );
          const messages: MessageView[] = rows.map(r => ({
            id: r.id,
            fromId: r.from_user,
            fromName: r.from_name,
            toId: r.to_user,
            // A removed message keeps its row (reports need the evidence) but its
            // text must never reach a client again.
            body: r.deleted_at ? '' : r.body,
            createdAt: r.created_at,
            ...(r.deleted_at ? { deleted: true } : {}),
          }));
          transport.send({ type: 'message_list', messages: messages.reverse(), withUserId: msg.withUserId });
        })();
        return;
      }
      if (msg.type === 'list_conversations') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          // Get distinct conversation partners with last message + unread count
          const { rows } = await pool.query<{
            partner_id: string; partner_name: string; partner_avatar: string | null; partner_frame: string | null; last_body: string; last_at: string; unread: string;
          }>(`
            WITH convos AS (
              SELECT
                CASE WHEN from_user = $1 THEN to_user ELSE from_user END AS partner_id,
                body, created_at,
                ROW_NUMBER() OVER (PARTITION BY LEAST(from_user, to_user), GREATEST(from_user, to_user) ORDER BY created_at DESC) AS rn
              FROM messages
              WHERE from_user = $1 OR to_user = $1
            )
            SELECT
              c.partner_id,
              u.display_name AS partner_name,
              COALESCE(u.avatar, u.selected_avatar) AS partner_avatar,
              u.selected_frame AS partner_frame,
              c.body AS last_body,
              c.created_at AS last_at,
              COALESCE((SELECT COUNT(*) FROM messages WHERE from_user = c.partner_id AND to_user = $1 AND read_at IS NULL), 0) AS unread
            FROM convos c
            JOIN users u ON u.id = c.partner_id
            WHERE c.rn = 1
              -- Guideline 1.2: a blocked person disappears from the inbox, in both
              -- directions. Without this the chat stays listed and looks reachable.
              AND NOT EXISTS (
                SELECT 1 FROM blocked_users b
                 WHERE (b.blocker_id = $1 AND b.blocked_id = c.partner_id)
                    OR (b.blocker_id = c.partner_id AND b.blocked_id = $1)
              )
            ORDER BY c.created_at DESC, c.partner_id ASC
            LIMIT 50
          `, [userProfile!.id]);
          const conversations = rows.map(r => ({
            userId: r.partner_id,
            displayName: r.partner_name,
            selectedAvatar: r.partner_avatar ?? undefined,
            online: onlineUsers.has(r.partner_id),
            lastMessage: r.last_body,
            lastMessageAt: r.last_at,
            unreadCount: Number(r.unread),
            avatar: r.partner_avatar ?? null,
            frame: r.partner_frame ?? null,
          }));
          transport.send({ type: 'conversation_list', conversations });
        })();
        return;
      }
      if (msg.type === 'mark_read') {
        if (!userProfile) return;
        void (async () => {
          await pool.query(
            `UPDATE messages SET read_at = now() WHERE from_user = $1 AND to_user = $2 AND read_at IS NULL`,
            [msg.fromUserId, userProfile!.id],
          );
          transport.send({ type: 'messages_marked_read', fromUserId: msg.fromUserId });
          // Notify the sender their messages were read
          sendToUser(msg.fromUserId, { type: 'messages_marked_read', fromUserId: userProfile!.id });
        })();
        return;
      }
      if (msg.type === 'typing_start' || msg.type === 'typing_stop') {
        if (!userProfile) return;
        const isTyping = msg.type === 'typing_start';
        void (async () => {
          // Engellenen kişiye "yazıyor…" sinyali de sızmasın — send_message'la
          // aynı iki yönlü kapı. (PK-indexli tek satır sorgu; typing hacmi için ucuz.)
          if (await isBlockedBetween(userProfile!.id, msg.toUserId)) return;
          sendToUser(msg.toUserId, { type: 'typing', fromUserId: userProfile!.id, isTyping });
        })();
        return;
      }

      // ---- User-generated-content safety (App Store guideline 1.2) ----
      if (msg.type === 'block_user') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        if (msg.userId === userProfile.id) return;
        void (async () => {
          await blockUser(userProfile!.id, msg.userId);
          transport.send({ type: 'user_blocked', userId: msg.userId });
          // Blocking removed the friendship — refresh both lists so neither side
          // is left showing a friend the server no longer has.
          transport.send(await getFriendsData(userProfile!.id));
          sendToUser(msg.userId, await getFriendsData(msg.userId));
        })().catch((err) => {
          log.warn('block_failed', { error: err instanceof Error ? err.message : String(err) });
          transport.send({ type: 'error', message: 'Kullanıcı engellenemedi' });
        });
        return;
      }
      if (msg.type === 'unblock_user') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          await unblockUser(userProfile!.id, msg.userId);
          transport.send({ type: 'user_unblocked', userId: msg.userId });
          transport.send({ type: 'blocked_list', users: await listBlocked(userProfile!.id) });
        })().catch(() => transport.send({ type: 'error', message: 'İşlem başarısız' }));
        return;
      }
      if (msg.type === 'list_blocked') {
        if (!userProfile) return;
        void (async () => {
          transport.send({ type: 'blocked_list', users: await listBlocked(userProfile!.id) });
        })().catch(() => {});
        return;
      }
      if (msg.type === 'report_content') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        if (msg.userId === userProfile.id) return;
        void (async () => {
          await reportContent(userProfile!.id, msg.userId, msg.reason ?? 'unspecified', msg.messageId);
          transport.send({ type: 'report_filed' });
        })().catch((err) => {
          log.warn('report_failed', { error: err instanceof Error ? err.message : String(err) });
          transport.send({ type: 'error', message: 'Şikâyet gönderilemedi' });
        });
        return;
      }
      if (msg.type === 'delete_message') {
        if (!userProfile) return transport.send({ type: 'error', message: 'Önce giriş yap' });
        void (async () => {
          // Look the recipient up BEFORE the soft-delete so we can tell them too —
          // "remove from the feed" has to clear the other side, not just my view.
          const { rows } = await pool.query<{ to_user: string }>(
            `SELECT to_user FROM messages WHERE id = $1 AND from_user = $2`,
            [msg.messageId, userProfile!.id],
          );
          const ok = await deleteOwnMessage(userProfile!.id, msg.messageId);
          if (!ok) return;
          transport.send({ type: 'message_deleted', messageId: msg.messageId });
          const to = rows[0]?.to_user;
          if (to) sendToUser(to, { type: 'message_deleted', messageId: msg.messageId });
        })().catch(() => transport.send({ type: 'error', message: 'Mesaj silinemedi' }));
        return;
      }
      if (msg.type === 'accept_terms') {
        if (!userProfile) return;
        void acceptTerms(userProfile.id).catch(() => {});
        return;
      }

      // First message must establish the connection (create / solo / join / find_match).
      if (!ctx) {
        if (config.maintenanceMode) {
          transport.send({ type: 'error', message: 'Bakım modundayız, birazdan tekrar dene' });
          return;
        }
        if (msg.type === 'resume_room') {
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Maç bulunamadı' });
          // Ban kontrolü ODAYA dokunmadan önce: resumePlayer transport'u değiştirir,
          // reddedilecek bir bağlantıya oda devretmek yarım kalmış durum bırakırdı.
          const u = await getUser(msg.userId).catch(() => null);
          if (rejectIfBanned(u ?? undefined, transport)) return;
          // Resume paket yeniden doğrulaması (kullanıcı kararı 2026-08-28): sosyal-mod
          // odasına paketi geçersizken (süresi bitmiş) yeniden bağlanıp rövanşla devam
          // engellenir. YALNIZ maç-arasında (lobby/result) uygulanır — aktif maça
          // (countdown/pick/reveal/guess/xox) reconnect'i bloklamak meşru maçı hükmen
          // kaybettirirdi; oradaki oyuncu zaten sonraki rövanşta kapıya takılır.
          if (u && !canUseMode(u, room.gameMode) && (room.status === 'lobby' || room.status === 'result')) {
            return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          }
          const resumed = room.resumePlayer(msg.userId, transport);
          if (!resumed.ok) return transport.send({ type: 'error', message: resumed.error });
          if (u) { userProfile = u; addOnline(u.id, ws); recordCaps(transport, u.id); }
          ctx = { room, playerId: resumed.id, userProfile: u ?? undefined };
          log.info('room_resumed', { room: msg.code, userId: msg.userId });
          return;
        }
        if (msg.type === 'find_match') {
          void (async () => {
            // Fresh match sockets may not have registered yet; load the canonical
            // server profile once so room membership and trophy updates never trust
            // a stale/spoofed client-sent user id over the authenticated account.
            userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
            // Banlıysa bağlantıda profil BIRAKILMAZ — sonraki mesajlar da profilsiz kalsın.
            if (rejectIfBanned(userProfile, transport)) { userProfile = undefined; return; }
            bridgeCaps(transport, userProfile); // wrongopen: presence soketindeki caps'i maç soketine taşı
            // Prefer the registered profile name; fall back to the name the client
            // sent with the request (the matchmaking socket may not have registered).
            const name = userProfile?.displayName ?? msg.name ?? 'Oyuncu';
            // Remove stale entries for this ws (if they spammed the button)
            for (let i = matchQueue.length - 1; i >= 0; i--) {
              if (matchQueue[i]!.ws === ws) cancelQueueEntry(matchQueue, matchQueue[i]!, 'replaced_by_new_find_match');
            }
            activeSearchByWs.delete(ws);
            // Try to pair with someone already waiting
            // Match by game mode AND arena: only pair players in the same arena
            const requestedMode = msg.options?.mode ?? 'team-team';
            if (!canUseMode(userProfile, requestedMode)) {
              transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
              return;
            }
            // Every quick-match request must go through the timer-backed queue.
            // The previous human-only path had no timeout/bot safety net, so stale
            // rollout flags could leave players searching indefinitely.
            const requestId = randomUUID();
            const skillProfile = userProfile?.id ? await getOrCreateSkillProfile(userProfile.id, userProfile.trophies).catch(() => undefined) : undefined;
            const entry: QueueEntry = {
              requestId,
              state: 'SEARCHING_CLOSE',
              assigned: false,
              timers: new Set(),
              transport,
              ws,
              name,
              userId: userProfile?.id ?? msg.userId,
              userProfile,
              skillProfile,
              options: msg.options,
              setCtx: (c) => { ctx = c; },
              since: Date.now(),
            };
            activeSearchByWs.set(ws, requestId);
            enqueueHybrid(entry);
            return;
          })().catch((err) => reportSocketTaskFailure('find_match', err));
          return;
        }

        if (msg.type === 'create_room') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          if (rejectIfBanned(userProfile, transport)) { userProfile = undefined; return; }
          bridgeCaps(transport, userProfile);
          if (!canUseMode(userProfile, msg.options?.mode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const skill = userProfile?.id ? await getOrCreateSkillProfile(userProfile.id, userProfile.trophies).catch(() => undefined) : undefined;
          const res = room.addPlayer(name, transport, true, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame, userProfile ? toCosmeticLoadout(userProfile) : undefined, skill?.skillMean, skill?.skillUncertainty, skill?.matchesPlayed);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          return;
        }
        if (msg.type === 'create_solo') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          if (rejectIfBanned(userProfile, transport)) { userProfile = undefined; return; }
          bridgeCaps(transport, userProfile);
          // Bota karşı da (kullanıcı kararı 2026-08-28): team-team HARİCİNDEKİ modlar
          // (country-team / letter-team / xox) Sosyal Paket ister — paketi olmayan
          // bota karşı da bu modları oynayamaz. Yalnız team-team her zaman serbest.
          if (!canUseMode(userProfile, msg.options?.mode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          const room = manager.createRoom();
          if (msg.options?.scope) room.scope = msg.options.scope;
          if (msg.options?.mode) room.gameMode = msg.options.mode;
          const name = userProfile?.displayName ?? msg.name;
          const skill = userProfile?.id ? await getOrCreateSkillProfile(userProfile.id, userProfile.trophies).catch(() => undefined) : undefined;
          const res = room.addPlayer(name, transport, true, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame, userProfile ? toCosmeticLoadout(userProfile) : undefined, skill?.skillMean, skill?.skillUncertainty, skill?.matchesPlayed);
          if (res.ok) ctx = { room, playerId: res.id, userProfile };
          const bot = new BotPlayer({ difficulty: msg.options?.difficulty, scope: room.scope, mode: room.gameMode });
          const botRes = room.addPlayer('Bot', bot, false);
          if (botRes.ok) bot.bind(room, botRes.id);
          return;
        }
        if (msg.type === 'join_room') {
          userProfile = await ensureProfileLoaded(userProfile, msg.userId, ws);
          if (rejectIfBanned(userProfile, transport)) { userProfile = undefined; return; }
          bridgeCaps(transport, userProfile);
          const room = manager.get(msg.code);
          if (!room) return transport.send({ type: 'error', message: 'Room not found' });
          if (!canUseMode(userProfile, room.gameMode)) return transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
          const name = userProfile?.displayName ?? msg.name;
          const skill = userProfile?.id ? await getOrCreateSkillProfile(userProfile.id, userProfile.trophies).catch(() => undefined) : undefined;
          const res = room.addPlayer(name, transport, false, userProfile?.id ?? msg.userId, userProfile?.trophies, userProfile?.arena, userProfile?.avatar, userProfile?.level, userProfile?.selectedFrame, userProfile ? toCosmeticLoadout(userProfile) : undefined, skill?.skillMean, skill?.skillUncertainty, skill?.matchesPlayed);
          if (!res.ok) return transport.send({ type: 'error', message: res.error });
          ctx = { room, playerId: res.id, userProfile };
          return;
        }
        return transport.send({ type: 'error', message: 'Create or join a room first' });
      }

      // send_emote sahiplik kapısı: oda katalog kontrolü yapar ama sahipliği
      // bilmez — modifiye bir istemci satın almadığı çıkartmayı rakibe
      // gönderemesin. Ücretsizler (hızlı sohbet + 4 yüz) herkese açık; gerisi
      // owned_emotes'ta olmalı. Sessiz düşürülür: meşru istemci UI'ı yalnız
      // sahip olunanları listeler, bu yola hiç girmez. (Botlar bu handler'dan
      // geçmez — oda içi bot emote'ları etkilenmez.)
      if (msg.type === 'send_emote'
          && !isFreeEmote(msg.emoteId)
          && !userProfile?.ownedEmotes.includes(msg.emoteId)) {
        return;
      }

      // Rövanş paket yeniden doğrulaması (kullanıcı kararı 2026-08-28): sosyal modda
      // (letter/country/xox) paketi süresi biten oyuncu "tekrar oyna" ile devam edemez —
      // giriş kapısı gibi tekrar denetle. userProfile.socialPackUntil sabit bir zaman
      // damgası; gerçek zaman ilerledikçe hasActiveSocialPack doğal olarak false döner,
      // bu yüzden bellekteki profille süre bitişini yakalar, DB'ye gerek yoktur.
      if ((msg.type === 'play_again' || msg.type === 'rematch_response') && !canUseMode(userProfile, ctx.room.gameMode)) {
        ctx.room.declineRematch(ctx.playerId); // bekleyen rakip askıda kalmasın diye reddedildi bilgisi gönder
        transport.send({ type: 'error', message: SOCIAL_PACK_REQUIRED });
        return;
      }

      ctx.room.handle(ctx.playerId, msg);
      } catch (err) {
        log.error('ws_message_failed', {
          ip,
          userId: userProfile?.id,
          room: ctx?.room.code,
          messageType: currentType,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        try { transport.send({ type: 'error', message: 'Sunucu hatası, tekrar dene' }); } catch { /* ignore */ }
      }
      })();
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      log.info('ws_close', { ip, userId: userProfile?.id, room: ctx?.room.code });
      recordTelemetry({
        eventName: 'session_exit',
        roomCode: ctx?.room.code,
        playerId: userProfile?.id ?? null,
        payload: {
          durationSec: Math.round((Date.now() - connectedAt) / 1000),
          hadRoom: Boolean(ctx),
          explicitLeave: Boolean(explicitLeavePending),
        },
      });
      // Oturum günlüğü: kimlik bağlanmış her bağlantının süresi yazılır
      // (ateşle-unut; 'error' sonrası da 'close' HER ZAMAN gelir → tek yazım).
      if (userProfile) recordPlaySession(userProfile.id, connectedAt).catch(() => {});
      // Remove from online users tracking — but only if THIS socket is the one
      // registered (a fresh reconnect may have already replaced it).
      if (userProfile) removeOnline(userProfile.id, ws);
      // Drop any pending match invites involving this socket.
      for (const [key, inv] of pendingInvites) {
        if (inv.ws === ws) {
          clearTimeout(inv.timer);
          pendingInvites.delete(key);
          sendToUser(inv.toUserId, { type: 'match_invite_cancelled' });
        }
      }
      // Remove from matchmaking queue if waiting
      for (let i = matchQueue.length - 1; i >= 0; i--) {
        if (matchQueue[i]!.ws === ws) cancelQueueEntry(matchQueue, matchQueue[i]!, 'socket_close');
      }
      activeSearchByWs.delete(ws);
      if (ctx) {
        if (explicitLeavePending) ctx.room.explicitLeave(ctx.playerId, explicitLeavePending);
        else ctx.room.handleClose(ctx.playerId);
      }
    });
    ws.on('error', () => {
      for (let i = matchQueue.length - 1; i >= 0; i--) {
        if (matchQueue[i]!.ws === ws) cancelQueueEntry(matchQueue, matchQueue[i]!, 'socket_error');
      }
      activeSearchByWs.delete(ws);
      if (ctx) {
        if (explicitLeavePending) ctx.room.explicitLeave(ctx.playerId, explicitLeavePending);
        else ctx.room.handleClose(ctx.playerId);
      }
      log.warn('ws_error', { ip, userId: userProfile?.id, room: ctx?.room.code });
    });
  });

  http.listen(port, () => {
    console.log(`Crossover server listening on :${port} (ws + /health)`);
  });
  return http;
}
