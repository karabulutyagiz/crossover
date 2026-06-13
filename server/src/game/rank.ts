import { pool } from '../db/pool.ts';
import { emotePrice, isFreeEmote, isVisualEmote, MAX_EQUIPPED } from './emotes.ts';
import { validateUsername } from './username.ts';

// ---- Trophy arenas (Clash Royale style) ----
export interface Arena {
  name: string;
  minTrophies: number;
  icon: string; // emoji
}

export const ARENAS: Arena[] = [
  { name: 'Mahalle Sahası',    minTrophies: 0,    icon: '🏟️' },
  { name: 'Amatör Lig',        minTrophies: 200,  icon: '⚽' },
  { name: 'Profesyonel Lig',   minTrophies: 500,  icon: '🥉' },
  { name: 'Şampiyonlar Ligi',  minTrophies: 1000, icon: '🥈' },
  { name: 'Efsaneler Arası',   minTrophies: 2000, icon: '🥇' },
  { name: 'Dünya Kupası',      minTrophies: 3500, icon: '🏆' },
  { name: 'GOAT',              minTrophies: 5000, icon: '🐐' },
];

export function getArena(trophies: number): Arena {
  for (let i = ARENAS.length - 1; i >= 0; i--) {
    if (trophies >= ARENAS[i]!.minTrophies) return ARENAS[i]!;
  }
  return ARENAS[0]!;
}

// Trophy gain/loss scales by arena — higher arenas are harder to climb.
// [win, loss] per arena index
const TROPHY_TABLE: [number, number][] = [
  [+30, -10],   // Mahalle Sahası     — easy climb, gentle losses
  [+28, -14],   // Amatör Lig         — still forgiving
  [+25, -18],   // Profesyonel Lig    — balanced
  [+22, -22],   // Şampiyonlar Ligi   — win/loss equal, grind starts
  [+20, -26],   // Efsaneler Arası    — losses hurt more
  [+18, -30],   // Dünya Kupası       — punishing, every loss stings
  [+15, -35],   // GOAT               — brutal, only the best stay
];

function trophyDelta(trophies: number, won: boolean): number {
  const arena = getArena(trophies);
  const idx = ARENAS.indexOf(arena);
  const [win, loss] = TROPHY_TABLE[idx] ?? TROPHY_TABLE[0]!;
  return won ? win : loss;
}

export interface UserProfile {
  id: string;
  displayName: string;
  gameCenterId: string | null;
  trophies: number;
  diamonds: number;
  wins: number;
  losses: number;
  ownedEmotes: string[];
  equippedEmotes: string[]; // visual emotes in the match loadout (max 3)
  usernameSet: boolean;
  socialPackUntil: string | null; // ISO date or null
  arena: Arena;
}

// ---- User CRUD ----

export async function findOrCreateUser(
  gameCenterId: string | null,
  displayName: string,
): Promise<UserProfile> {
  // If Game Center ID provided, try to find existing user
  if (gameCenterId) {
    const { rows } = await pool.query<DbUser>(
      'SELECT * FROM users WHERE game_center_id = $1',
      [gameCenterId],
    );
    if (rows[0]) return toProfile(rows[0]);
  }

  // Create new user
  const { rows } = await pool.query<DbUser>(
    `INSERT INTO users (display_name, game_center_id)
     VALUES ($1, $2)
     RETURNING *`,
    [displayName, gameCenterId],
  );
  return toProfile(rows[0]!);
}

// Find (or create) a user by their Apple/Google identity. The subject id is the
// stable per-provider account key; we never store passwords or tokens.
export async function findOrCreateUserByProvider(
  provider: 'apple' | 'google' | 'facebook',
  sub: string,
  email: string | null,
  displayName: string,
): Promise<UserProfile> {
  const col =
    provider === 'apple' ? 'apple_sub' : provider === 'google' ? 'google_sub' : 'facebook_sub';
  const found = await pool.query<DbUser>(`SELECT * FROM users WHERE ${col} = $1`, [sub]);
  if (found.rows[0]) return toProfile(found.rows[0]);
  const { rows } = await pool.query<DbUser>(
    `INSERT INTO users (display_name, ${col}, email) VALUES ($1, $2, $3) RETURNING *`,
    [displayName.trim() || 'Oyuncu', sub, email],
  );
  return toProfile(rows[0]!);
}

// One-time username pick after sign-in. Validates format + profanity, enforces
// case-insensitive uniqueness, then sets display_name and marks username_set.
export async function setUsername(
  userId: string,
  username: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const v = validateUsername(username);
  if (!v.ok) return { ok: false, error: v.error ?? 'Geçersiz kullanıcı adı' };
  const name = username.trim();
  const taken = await pool.query(
    `SELECT 1 FROM users WHERE lower(display_name) = lower($1) AND username_set = true AND id <> $2 LIMIT 1`,
    [name, userId],
  );
  if (taken.rows[0]) return { ok: false, error: 'Bu kullanıcı adı alınmış' };
  try {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET display_name = $2, username_set = true WHERE id = $1 RETURNING *`,
      [userId, name],
    );
    if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
    return { ok: true, profile: toProfile(rows[0]) };
  } catch {
    // unique index race → someone took it a moment ago
    return { ok: false, error: 'Bu kullanıcı adı alınmış' };
  }
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const { rows } = await pool.query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] ? toProfile(rows[0]) : null;
}

export async function applyMatchResult(
  userId: string,
  won: boolean,
): Promise<{ profile: UserProfile; delta: number }> {
  // Read current trophies to determine arena-specific delta
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');
  const delta = trophyDelta(user.trophies, won);

  const { rows } = await pool.query<DbUser>(
    `UPDATE users
     SET trophies = GREATEST(0, trophies + $2),
         wins = wins + (CASE WHEN $3 THEN 1 ELSE 0 END),
         losses = losses + (CASE WHEN $3 THEN 0 ELSE 1 END)
     WHERE id = $1
     RETURNING *`,
    [userId, delta, won],
  );
  return { profile: toProfile(rows[0]!), delta };
}

export async function changeDisplayName(
  userId: string,
  newName: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const COST = 100; // diamonds
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (user.diamonds < COST) return { ok: false, error: `Yetersiz elmas (${user.diamonds}/${COST})` };

  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET display_name = $2, diamonds = diamonds - $3
     WHERE id = $1 AND diamonds >= $3
     RETURNING *`,
    [userId, newName.trim(), COST],
  );
  if (!rows[0]) return { ok: false, error: 'Yetersiz elmas' };
  return { ok: true, profile: toProfile(rows[0]) };
}

// Buy a premium emote: charge diamonds once and append it to owned_emotes.
// The whole thing is one atomic UPDATE guarded on balance + not-already-owned,
// so double taps or races can never double-charge.
export async function buyEmote(
  userId: string,
  emoteId: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const price = emotePrice(emoteId);
  if (price === null) return { ok: false, error: 'Geçersiz ifade' };
  if (isFreeEmote(emoteId)) return { ok: false, error: 'Bu ifade zaten herkeste' };

  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (user.ownedEmotes.includes(emoteId)) return { ok: false, error: 'Bu ifadeye zaten sahipsin' };
  if (user.diamonds < price) return { ok: false, error: `Yetersiz elmas (${user.diamonds}/${price})` };

  const { rows } = await pool.query<DbUser>(
    `UPDATE users
        SET diamonds = diamonds - $2,
            owned_emotes = array_append(owned_emotes, $3)
      WHERE id = $1 AND diamonds >= $2 AND NOT ($3 = ANY(owned_emotes))
      RETURNING *`,
    [userId, price, emoteId],
  );
  if (!rows[0]) return { ok: false, error: 'Satın alma başarısız' };
  return { ok: true, profile: toProfile(rows[0]) };
}

// Set the player's equipped visual-emote loadout (max 3). Keeps only valid
// visual emote ids, dedupes, and caps at MAX_EQUIPPED.
export async function setEquippedEmotes(
  userId: string,
  ids: string[],
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const clean = [...new Set(ids)].filter(isVisualEmote).slice(0, MAX_EQUIPPED);
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET equipped_emotes = $2 WHERE id = $1 RETURNING *`,
    [userId, clean],
  );
  if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: toProfile(rows[0]) };
}

// ---- Leaderboard ----

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: Arena;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { rows } = await pool.query<DbUser>(
    `SELECT * FROM users ORDER BY trophies DESC, wins DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    displayName: r.display_name,
    trophies: r.trophies,
    wins: r.wins,
    losses: Number(r.losses),
    arena: getArena(r.trophies),
  }));
}

// ---- Friends ----

export interface FriendView {
  userId: string;
  displayName: string;
  trophies: number;
  arena: Arena;
  online: boolean; // set by the caller (ws layer tracks connections)
}

export interface FriendRequestView {
  requestId: string;
  fromId: string;
  fromName: string;
  createdAt: string;
}

// Resolve a user from what's typed into "Friend Code": either the 8-char code
// (first 8 chars of the UUID, as shown in the app) or an exact username.
async function resolveUserByCodeOrName(codeOrName: string): Promise<DbUser | null> {
  const c = codeOrName.trim();
  if (!c) return null;
  // Friend code = first 8 hex chars of the uuid.
  if (/^[0-9a-fA-F]{8}$/.test(c)) {
    const byCode = await pool.query<DbUser>(
      `SELECT * FROM users WHERE left(id::text, 8) = lower($1) LIMIT 2`,
      [c],
    );
    if (byCode.rows.length === 1) return byCode.rows[0]!;
    if (byCode.rows.length > 1) return null; // ambiguous code → fall through to name fails too
  }
  // Otherwise treat it as a username (case-insensitive).
  const byName = await pool.query<DbUser>(
    `SELECT * FROM users WHERE lower(display_name) = lower($1) AND username_set = true LIMIT 1`,
    [c],
  );
  return byName.rows[0] ?? null;
}

/** List accepted friends (online status set by caller). */
export async function listFriends(userId: string): Promise<Omit<FriendView, 'online'>[]> {
  const { rows } = await pool.query<DbUser>(
    `SELECT u.* FROM friendships f
       JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = $1
      ORDER BY u.trophies DESC, u.display_name ASC`,
    [userId],
  );
  return rows.map((r) => ({
    userId: r.id,
    displayName: r.display_name,
    trophies: r.trophies,
    arena: getArena(r.trophies),
  }));
}

/** List pending friend requests TO this user. */
export async function listFriendRequests(userId: string): Promise<FriendRequestView[]> {
  const { rows } = await pool.query<{ id: string; from_user: string; display_name: string; created_at: string }>(
    `SELECT fr.id, fr.from_user, u.display_name, fr.created_at
       FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user
      WHERE fr.to_user = $1
      ORDER BY fr.created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    requestId: r.id,
    fromId: r.from_user,
    fromName: r.display_name,
    createdAt: r.created_at,
  }));
}

/** Send a friend request. Returns the target user id or an error. */
export async function sendFriendRequest(
  fromUserId: string,
  targetCode?: string,
  targetUsername?: string,
): Promise<{ ok: true; toUserId: string; toName: string } | { ok: false; error: string }> {
  if (!fromUserId) return { ok: false, error: 'Önce giriş yap' };

  let target: { id: string; display_name: string } | null = null;
  if (targetCode) {
    const { rows } = await pool.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE lower(left(id::text, 8)) = lower($1)`,
      [targetCode],
    );
    target = rows[0] ?? null;
  } else if (targetUsername) {
    const { rows } = await pool.query<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE lower(display_name) = lower($1) AND username_set = true`,
      [targetUsername],
    );
    target = rows[0] ?? null;
  }
  if (!target) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (target.id === fromUserId) return { ok: false, error: 'Kendine istek gönderemezsin' };

  // Already friends?
  const already = await pool.query(
    `SELECT 1 FROM friendships WHERE user_id = $1 AND friend_id = $2`,
    [fromUserId, target.id],
  );
  if (already.rows[0]) return { ok: false, error: 'Zaten arkadaşsınız' };

  // Already pending?
  const pending = await pool.query(
    `SELECT 1 FROM friend_requests WHERE from_user = $1 AND to_user = $2`,
    [fromUserId, target.id],
  );
  if (pending.rows[0]) return { ok: false, error: 'İstek zaten gönderildi' };

  // If the target already sent US a request, auto-accept both ways
  const reverse = await pool.query(
    `SELECT id FROM friend_requests WHERE from_user = $1 AND to_user = $2`,
    [target.id, fromUserId],
  );
  if (reverse.rows[0]) {
    // Accept the reverse request (mutual add)
    await pool.query(`DELETE FROM friend_requests WHERE id = $1`, [reverse.rows[0].id]);
    await pool.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [fromUserId, target.id],
    );
    return { ok: true, toUserId: target.id, toName: target.display_name };
  }

  await pool.query(
    `INSERT INTO friend_requests (from_user, to_user) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [fromUserId, target.id],
  );
  return { ok: true, toUserId: target.id, toName: target.display_name };
}

/** Accept or reject a friend request. */
export async function respondFriendRequest(
  userId: string,
  requestId: string,
  accept: boolean,
): Promise<{ ok: true; fromUserId: string } | { ok: false; error: string }> {
  const { rows } = await pool.query<{ from_user: string; to_user: string }>(
    `SELECT from_user, to_user FROM friend_requests WHERE id = $1`,
    [requestId],
  );
  const req = rows[0];
  if (!req || req.to_user !== userId) return { ok: false, error: 'İstek bulunamadı' };

  await pool.query(`DELETE FROM friend_requests WHERE id = $1`, [requestId]);

  if (accept) {
    await pool.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [req.from_user, req.to_user],
    );
  }
  return { ok: true, fromUserId: req.from_user };
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  await pool.query(
    `DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, friendId],
  );
}

/** Search users by exact username match. */
export async function searchUsers(query: string): Promise<{ userId: string; displayName: string }[]> {
  if (!query || query.trim().length < 2) return [];
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users
      WHERE username_set = true AND lower(display_name) = lower($1)
      LIMIT 10`,
    [query.trim()],
  );
  return rows.map((r) => ({ userId: r.id, displayName: r.display_name }));
}

// ---- Matchmaking ----

export async function findMatch(
  userId: string,
  trophyRange = 200,
): Promise<UserProfile | null> {
  const user = await getUser(userId);
  if (!user) return null;
  const { rows } = await pool.query<DbUser>(
    `SELECT * FROM users
     WHERE id != $1
       AND trophies BETWEEN $2 AND $3
     ORDER BY random()
     LIMIT 1`,
    [userId, Math.max(0, user.trophies - trophyRange), user.trophies + trophyRange],
  );
  return rows[0] ? toProfile(rows[0]) : null;
}

// ---- Internals ----

interface DbUser {
  id: string;
  display_name: string;
  game_center_id: string | null;
  trophies: number;
  diamonds: number;
  wins: number;
  losses: number;
  owned_emotes: string[] | null;
  equipped_emotes: string[] | null;
  username_set: boolean | null;
  social_pack_until: string | null;
  created_at: string;
}

function toProfile(row: DbUser): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    gameCenterId: row.game_center_id,
    trophies: row.trophies,
    diamonds: row.diamonds,
    wins: row.wins,
    losses: row.losses,
    ownedEmotes: row.owned_emotes ?? [],
    equippedEmotes: row.equipped_emotes ?? [],
    usernameSet: row.username_set ?? false,
    socialPackUntil: row.social_pack_until ?? null,
    arena: getArena(row.trophies),
  };
}

// ---- Match History ----

export interface MatchRound {
  teamA: string;
  teamALogo: string | null;
  teamB: string;
  teamBLogo: string | null;
  player: string;      // the correct player name
  playerImageUrl: string | null;
  answeredBy: string;   // who answered this round
}

export interface MatchHistoryEntry {
  id: string;
  playerName: string;
  opponentName: string;
  playerScore: number;
  opponentScore: number;
  won: boolean;
  playerTrophies: number;
  opponentTrophies: number;
  gameMode: string;
  rounds: MatchRound[];
  playedAt: string;
}

export async function saveMatchHistory(
  playerId: string,
  playerName: string,
  playerTrophies: number,
  opponentId: string | null,
  opponentName: string,
  opponentTrophies: number,
  playerScore: number,
  opponentScore: number,
  won: boolean,
  gameMode: string,
  rounds: MatchRound[],
): Promise<void> {
  await pool.query(
    `INSERT INTO match_history (player_id, player_name, opponent_id, opponent_name, player_score, opponent_score,
       won, player_trophies, opponent_trophies, game_mode, rounds)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [playerId, playerName, opponentId, opponentName, playerScore, opponentScore, won,
     playerTrophies, opponentTrophies, gameMode, JSON.stringify(rounds)],
  );
}

export async function getMatchHistory(userId: string, limit = 30): Promise<MatchHistoryEntry[]> {
  const { rows } = await pool.query<{
    id: string; player_name: string; opponent_name: string; player_score: number; opponent_score: number;
    won: boolean; player_trophies: number; opponent_trophies: number;
    game_mode: string; rounds: string; played_at: string;
  }>(
    `SELECT id, player_name, opponent_name, player_score, opponent_score, won,
            player_trophies, opponent_trophies, game_mode, rounds, played_at
       FROM match_history
      WHERE player_id = $1
      ORDER BY played_at DESC
      LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    playerName: r.player_name,
    opponentName: r.opponent_name,
    playerScore: r.player_score,
    opponentScore: r.opponent_score,
    won: r.won,
    playerTrophies: r.player_trophies,
    opponentTrophies: r.opponent_trophies,
    gameMode: r.game_mode,
    rounds: typeof r.rounds === 'string' ? JSON.parse(r.rounds) : r.rounds ?? [],
    playedAt: r.played_at,
  }));
}
