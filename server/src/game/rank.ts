import { pool } from '../db/pool.ts';
import { emotePrice, isFreeEmote } from './emotes.ts';

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
  provider: 'apple' | 'google',
  sub: string,
  email: string | null,
  displayName: string,
): Promise<UserProfile> {
  const col = provider === 'apple' ? 'apple_sub' : 'google_sub';
  const found = await pool.query<DbUser>(`SELECT * FROM users WHERE ${col} = $1`, [sub]);
  if (found.rows[0]) return toProfile(found.rows[0]);
  const { rows } = await pool.query<DbUser>(
    `INSERT INTO users (display_name, ${col}, email) VALUES ($1, $2, $3) RETURNING *`,
    [displayName.trim() || 'Oyuncu', sub, email],
  );
  return toProfile(rows[0]!);
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
    arena: getArena(row.trophies),
  };
}
