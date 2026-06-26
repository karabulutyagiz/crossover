import { pool } from '../db/pool.ts';
import { emotePrice, isFreeEmote, isEquippableEmote, MAX_EQUIPPED, ALL_COLLECTIBLE_EMOTES } from './emotes.ts';
import { avatarPrice, canUseAvatar, DEFAULT_AVATAR_ID, isAvatar, isFreeAvatar } from './avatars.ts';
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
  { name: 'Dünya Klasmanı',    minTrophies: 3500, icon: '🏆' },
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

const ARENA_DIAMOND_REWARDS = [50, 100, 150, 200, 300, 500, 1000] as const;

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
  selectedAvatar: string;
  ownedAvatars: string[];
  ownedEmotes: string[];
  equippedEmotes: string[]; // visual emotes in the match loadout (max 3)
  usernameSet: boolean;
  socialPackUntil: string | null; // ISO date or null
  arena: Arena;
  avatar: string | null; // chosen profile-picture id (e.g. 'pp7') or null
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
  hintedUserId?: string,
): Promise<UserProfile> {
  const col =
    provider === 'apple' ? 'apple_sub' : provider === 'google' ? 'google_sub' : 'facebook_sub';
  const found = await pool.query<DbUser>(`SELECT * FROM users WHERE ${col} = $1`, [sub]);
  if (found.rows[0]) return toProfile(found.rows[0]);
  if (hintedUserId) {
    const hinted = await pool.query<DbUser>(
      `UPDATE users
       SET ${col} = $2,
           email = COALESCE($3, email)
       WHERE id = $1
         AND (${col} IS NULL OR ${col} = $2)
       RETURNING *`,
      [hintedUserId, sub, email],
    );
    if (hinted.rows[0]) return toProfile(hinted.rows[0]);
  }
  const { rows } = await pool.query<DbUser>(
    `INSERT INTO users (display_name, ${col}, email) VALUES ($1, $2, $3) RETURNING *`,
    [displayName.trim() || 'Oyuncu', sub, email],
  );
  return toProfile(rows[0]!);
}

// Guest account: no provider/credentials. Auto-assigns a unique username of the
// form "M" + a 9-digit number (e.g. M345678901) and marks it set, so guests skip
// the username picker. Persistence works exactly like any account — the client
// stores the returned userId and re-registers with it, so progress is kept as
// long as the device keeps its saved profile.
export async function createGuestUser(): Promise<UserProfile> {
  for (let attempt = 0; attempt < 12; attempt++) {
    // First digit 1-9 so it is a genuine 9-digit number (no leading zero).
    let digits = String(1 + Math.floor(Math.random() * 9));
    for (let i = 0; i < 8; i++) digits += Math.floor(Math.random() * 10);
    const username = `M${digits}`;
    const taken = await pool.query(
      'SELECT 1 FROM users WHERE lower(display_name) = lower($1) LIMIT 1',
      [username],
    );
    if (taken.rows.length) continue;
    try {
      const { rows } = await pool.query<DbUser>(
        `INSERT INTO users (display_name, username_set) VALUES ($1, true) RETURNING *`,
        [username],
      );
      return toProfile(rows[0]!);
    } catch (e) {
      // Lost a race to another guest on the same random number (the partial
      // unique index on lower(display_name) WHERE username_set fires) — re-roll.
      if ((e as { code?: string })?.code === '23505') continue;
      throw e;
    }
  }
  throw new Error('guest username generation exhausted');
}

// Owner/dev accounts that always have the full emote collection (incl. the
// not-for-sale animated emotes). Applied on every register/auth/guest load, so a
// freshly-created `bloodsucker` is topped up automatically too.
const DEV_ACCOUNTS = new Set(['yagiz', 'bloodsucker']);
export async function grantDevEmotesIfNeeded(profile: UserProfile): Promise<UserProfile> {
  if (!DEV_ACCOUNTS.has(profile.displayName.trim().toLowerCase())) return profile;
  const owned = new Set(profile.ownedEmotes);
  if (ALL_COLLECTIBLE_EMOTES.every((id) => owned.has(id))) return profile; // already complete
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET owned_emotes = $2 WHERE id = $1 RETURNING *`,
    [profile.id, [...ALL_COLLECTIBLE_EMOTES]],
  );
  return rows[0] ? toProfile(rows[0]) : profile;
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
): Promise<{ profile: UserProfile; delta: number; arenaReward: number }> {
  // Read current trophies to determine arena-specific delta
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');
  const delta = trophyDelta(user.trophies, won);
  const prevArenaIdx = ARENAS.findIndex((a) => a.name === user.arena.name);

  const { rows } = await pool.query<DbUser>(
    `WITH next_state AS (
       SELECT
         id,
         GREATEST(0, trophies + $2) AS next_trophies,
         wins,
         losses,
         COALESCE(highest_arena_rewarded, 0) AS highest_arena_rewarded
       FROM users
       WHERE id = $1
     ), reward_calc AS (
       SELECT
         id,
         next_trophies,
         wins,
         losses,
         highest_arena_rewarded,
         CASE
           WHEN next_trophies >= 5000 THEN 6
           WHEN next_trophies >= 3500 THEN 5
           WHEN next_trophies >= 2000 THEN 4
           WHEN next_trophies >= 1000 THEN 3
           WHEN next_trophies >= 500 THEN 2
           WHEN next_trophies >= 200 THEN 1
           ELSE 0
         END AS next_arena_idx
       FROM next_state
     )
     UPDATE users u
        SET trophies = r.next_trophies,
            wins = r.wins + (CASE WHEN $3 THEN 1 ELSE 0 END),
            losses = r.losses + (CASE WHEN $3 THEN 0 ELSE 1 END),
            diamonds = u.diamonds +
              CASE
                WHEN r.next_arena_idx > r.highest_arena_rewarded THEN (
                  SELECT COALESCE(SUM(v.reward), 0)
                  FROM unnest($4::int[]) WITH ORDINALITY AS v(reward, ord)
                  WHERE ord - 1 > r.highest_arena_rewarded AND ord - 1 <= r.next_arena_idx
                )
                ELSE 0
              END,
            highest_arena_rewarded = GREATEST(r.highest_arena_rewarded, r.next_arena_idx)
       FROM reward_calc r
       WHERE u.id = r.id
       RETURNING u.*`,
    [userId, delta, won, [...ARENA_DIAMOND_REWARDS]],
  );
  const profile = toProfile(rows[0]!);
  const nextArenaIdx = ARENAS.findIndex((a) => a.name === profile.arena.name);
  const arenaReward = nextArenaIdx > prevArenaIdx
    ? ARENA_DIAMOND_REWARDS.slice(prevArenaIdx + 1, nextArenaIdx + 1).reduce((sum, n) => sum + n, 0)
    : 0;
  return { profile, delta, arenaReward };
}

export async function changeDisplayName(
  userId: string,
  newName: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const COST = 1000; // diamonds
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

// Set the player's profile picture. Free avatars can be used by everyone; premium
// ones require ownership. `null` clears back to the default icon.
export async function setAvatar(
  userId: string,
  avatar: string | null,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (avatar !== null && !isAvatar(avatar)) return { ok: false, error: 'Geçersiz profil fotoğrafı' };
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (!canUseAvatar(user.ownedAvatars, avatar)) return { ok: false, error: 'Önce bu profil fotoğrafını satın al' };
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET avatar = $2, selected_avatar = COALESCE($2, $3) WHERE id = $1 RETURNING *`,
    [userId, avatar, DEFAULT_AVATAR_ID],
  );
  if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: toProfile(rows[0]) };
}

// Grant diamonds for watching a rewarded ad. There is no AdMob server-side
// verification yet, so we bound abuse with a per-UTC-day cap plus a minimum gap
// between grants (a real rewarded ad can't finish faster than this). One atomic
// UPDATE guarded on both, so concurrent taps can never exceed the cap.
const AD_REWARD = 5;
const AD_REWARD_DAILY_CAP = 100;   // max rewarded-ad grants per day
const AD_REWARD_MIN_GAP_SEC = 12;  // min seconds between grants
export async function grantAdReward(
  userId: string,
): Promise<{ ok: true; profile: UserProfile; granted: number } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET
       diamonds = diamonds + $2,
       ad_reward_count = CASE WHEN ad_reward_day = CURRENT_DATE THEN ad_reward_count + 1 ELSE 1 END,
       ad_reward_day = CURRENT_DATE,
       last_ad_reward_at = now()
     WHERE id = $1
       AND (last_ad_reward_at IS NULL OR last_ad_reward_at < now() - ($4 || ' seconds')::interval)
       AND (ad_reward_day IS NULL OR ad_reward_day < CURRENT_DATE OR ad_reward_count < $3)
     RETURNING *`,
    [userId, AD_REWARD, AD_REWARD_DAILY_CAP, String(AD_REWARD_MIN_GAP_SEC)],
  );
  if (!rows[0]) {
    const chk = await pool.query<{ c: number; today: boolean }>(
      `SELECT ad_reward_count AS c, (ad_reward_day = CURRENT_DATE) AS today FROM users WHERE id = $1`,
      [userId],
    );
    const capped = !!chk.rows[0]?.today && (chk.rows[0]?.c ?? 0) >= AD_REWARD_DAILY_CAP;
    return { ok: false, error: capped ? 'Günlük reklam ödülü sınırına ulaştın' : 'Çok hızlı, birazdan tekrar dene' };
  }
  return { ok: true, profile: toProfile(rows[0]), granted: AD_REWARD };
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
  const clean = [...new Set(ids)].filter(isEquippableEmote).slice(0, MAX_EQUIPPED);
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET equipped_emotes = $2 WHERE id = $1 RETURNING *`,
    [userId, clean],
  );
  if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: toProfile(rows[0]) };
}

export async function buyAvatar(
  userId: string,
  avatarId: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const price = avatarPrice(avatarId);
  if (price === null || !isAvatar(avatarId)) return { ok: false, error: 'Geçersiz profil fotoğrafı' };
  if (isFreeAvatar(avatarId)) return { ok: false, error: 'Bu profil fotoğrafı zaten herkeste' };

  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (user.ownedAvatars.includes(avatarId)) return { ok: false, error: 'Bu profil fotoğrafına zaten sahipsin' };
  if (user.diamonds < price) return { ok: false, error: `Yetersiz elmas (${user.diamonds}/${price})` };

  const { rows } = await pool.query<DbUser>(
    `UPDATE users
        SET diamonds = diamonds - $2,
            owned_avatars = array_append(owned_avatars, $3),
            selected_avatar = $3,
            avatar = $3
      WHERE id = $1 AND diamonds >= $2 AND NOT ($3 = ANY(owned_avatars))
      RETURNING *`,
    [userId, price, avatarId],
  );
  if (!rows[0]) return { ok: false, error: 'Satın alma başarısız' };
  return { ok: true, profile: toProfile(rows[0]) };
}

// ---- Leaderboard ----

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  trophies: number;
  wins: number;
  losses: number;
  arena: Arena;
  avatar: string | null;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const { rows } = await pool.query<DbUser>(
    `SELECT * FROM users ORDER BY trophies DESC, wins DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.id,
    displayName: r.display_name,
    trophies: r.trophies,
    wins: r.wins,
    losses: Number(r.losses),
    arena: getArena(r.trophies),
    avatar: r.avatar ?? null,
  }));
}

// ---- Friends ----

export interface FriendView {
  userId: string;
  displayName: string;
  selectedAvatar: string;
  avatar: string | null;
  trophies: number;
  arena: Arena;
  lastSeen?: string | null;
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
    selectedAvatar: r.selected_avatar ?? DEFAULT_AVATAR_ID,
    avatar: r.avatar ?? r.selected_avatar ?? null,
    trophies: r.trophies,
    arena: getArena(r.trophies),
    lastSeen: r.last_seen ?? null,
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

  // Already pending (either direction)?
  const pending = await pool.query(
    `SELECT 1 FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)`,
    [fromUserId, target.id],
  );
  if (pending.rows[0]) return { ok: false, error: 'İstek zaten gönderildi' };

  // Create a pending request — the target must explicitly accept or reject
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
  selected_avatar: string | null;
  owned_avatars: string[] | null;
  owned_emotes: string[] | null;
  equipped_emotes: string[] | null;
  username_set: boolean | null;
  social_pack_until: string | null;
  avatar: string | null;
  last_seen: string | null;
  highest_arena_rewarded: number | null;
  created_at: string;
}

// Stamp the user's last-online time (on connect and disconnect) for "last seen".
export async function touchLastSeen(userId: string): Promise<void> {
  if (!userId) return;
  await pool.query(`UPDATE users SET last_seen = now() WHERE id = $1`, [userId]);
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
    selectedAvatar: row.avatar ?? row.selected_avatar ?? DEFAULT_AVATAR_ID,
    ownedAvatars: row.owned_avatars ?? [],
    ownedEmotes: row.owned_emotes ?? [],
    equippedEmotes: row.equipped_emotes ?? [],
    usernameSet: row.username_set ?? false,
    socialPackUntil: row.social_pack_until ?? null,
    arena: getArena(row.trophies),
    avatar: row.avatar ?? row.selected_avatar ?? null,
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
  mode?: string;        // 'team-team' | 'country-team' | 'letter-team'
  country?: string;     // nationality value (country-team mode)
  letter?: string;      // letter (letter-team mode)
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
