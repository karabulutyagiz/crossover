import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.ts';
import { milestoneFor } from './specialPowers.ts';
import { config } from '../config.ts';
import { PREMIUM_ROAD_PRICE } from './level.ts';
import { emotePrice, isFreeEmote, isEquippableEmote, MAX_EQUIPPED, ALL_COLLECTIBLE_EMOTES } from './emotes.ts';
import { avatarPrice, canUseAvatar, DEFAULT_AVATAR_ID, isAvatar, isFreeAvatar } from './avatars.ts';
import { validateUsername } from './username.ts';
import { recordDiamondLedger } from './diamondLedger.ts';
import { BOT_GAIN_MAX, BOT_GAIN_MIN, BOT_LOSS_MAX, BOT_LOSS_MIN, clampFinalTrophyDelta, trophyDeltaExpectedScore } from '../matchmaking/trophyIntegrity.ts';
// moderation.ts only pulls in the pool + logger, so this import cannot cycle back.
import { isBlockedBetween, isIdentifiedAccount } from './moderation.ts';

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

// Legacy fallback raw [win, loss] when MMR inputs are unavailable. This is not the
// final trophy result: applyMatchResult always applies the production hard clamp.
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

// ---- Rakip-farkına duyarlı fallback raw delta ----
// MMR inputs are preferred. If they are missing, this gives a rough raw value from
// visible trophy difference; the final persisted delta is clamped in applyMatchResult.
const DIFF_DIVISOR = 12;
const MAX_ADJUST = 13;
const WIN_MIN = 5;
const WIN_MAX = 43;      // maks baz galibiyet (30) + MAX_ADJUST — CR'ın gözlenen tavanı
const LOSS_MAX_MAG = 48; // maks |baz kayıp| (35) + MAX_ADJUST

function clampN(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function trophyDelta(trophies: number, won: boolean, opponentTrophies: number | null): number {
  const arena = getArena(trophies);
  const idx = ARENAS.indexOf(arena);
  const [win, loss] = TROPHY_TABLE[idx] ?? TROPHY_TABLE[0]!;
  const oppOk = typeof opponentTrophies === 'number' && Number.isFinite(opponentTrophies) && opponentTrophies >= 0;
  const adjust = oppOk ? clampN(Math.round(((opponentTrophies as number) - trophies) / DIFF_DIVISOR), -MAX_ADJUST, MAX_ADJUST) : 0;
  if (won) return clampN(win + adjust, WIN_MIN, WIN_MAX);
  return clampN(loss + adjust, -LOSS_MAX_MAG, 0);
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
  equippedEmotes: string[]; // visual emotes in the match loadout (max MAX_EQUIPPED = 8, emotes.ts)
  usernameSet: boolean;
  socialPackUntil: string | null; // ISO date or null
  outageGiftAt: string | null;        // kesinti telafisi alındı damgası (ISO) ya da null
  outageGiftAvailable: boolean;       // kampanya açık VE bu hesap henüz almadı → özür penceresi gösterilir
  arena: Arena;
  avatar: string | null; // chosen profile-picture id (e.g. 'pp7') or null
  xp: number;    // mevcut seviye içindeki ilerleme
  level: number; // 1..50 — asla düşmez
  selectedFrame: string | null; // takılı profil çerçevesi (bronze..goat) ya da null
  claimedLevels: number[]; // Seviye Yolu'nda toplanmış ödül seviyeleri
  powerXp2x: number;       // envanterdeki 2x XP jetonu adedi
  powerShield: number;     // envanterdeki kupa kalkanı adedi
  xpBoostUntil: string | null; // aktif 2x XP penceresinin bitişi (ISO) ya da null
  shieldArmed: boolean;    // kuşanılmış kalkan — sıradaki dereceli maçta tüketilir, kayıpta korur
  winStreak: number;       // güncel dereceli galibiyet serisi (mağlubiyette sıfırlanır)
  bestStreak: number;      // tüm zamanların en yüksek serisi
  powerStreak: number;     // envanterdeki Seri Geri Yükleme adedi
  lostStreak: number;      // son mağlubiyette kırılan seri (geri yüklenebilir değer)
  premiumRoad: boolean;    // Premium Seviye Yolu açık mı (sezonluk)
  claimedPremium: number[]; // Premium şeritte toplanmış ödül seviyeleri
  ownedFrames: string[];   // KALICI çerçeve sahipliği (sezonlar arası korunur)
  ownedCosmetics: string[]; // elmas mağazasından alınan kalıcı kozmetikler
  equippedNameEffectId: string | null;
  equippedMatchBackgroundId: string | null;
  equippedBallId: string | null;
  equippedIntroId: string | null;
  equippedVictoryEffectId: string | null;
  equippedAnswerEffectId: string | null;
  powerTraining: number;       // envanterdeki Antrenman Bileti adedi
  trainingBoostUntil: string | null; // aktif Antrenman Bileti penceresinin bitişi (ISO) ya da null
  powerSocialToken: number;    // envanterdeki Sosyal Paket Jetonu adedi
  highestArenaRewarded: number; // ulaşılıp açılmış/ödülü işlenmiş en yüksek arena index'i
  bannedAt: string | null;     // kural ihlali askısı — doluysa bağlantı katmanı girişi reddeder
  // Maç içi Özel Güç envanteri (maç başına 1 kullanım — room.ts uygular)
  spFreeze: number;
  spReveal: number;
  spSkip: number;
  spExtratime: number;
  spSecondchance: number;
  equippedSpecialPower: string | null;
  equippedSpecialPowers: string[];
}

function isFutureIso(iso: string | null | undefined): iso is string {
  return !!iso && new Date(iso).getTime() > Date.now();
}

// ---- Aylık sezon (Europe/Istanbul, UTC+3 sabit) ----
// Yol ilerlemesi SEZONLUKTUR: ay değişince level/xp/claim'ler ve Premium Yol
// sıfırlanır. Kozmetikler (çerçeve sahipliği owned_frames'te), elmas, güç
// envanteri ve istatistikler KALIR. season_id NULL ise yalnız damgalanır —
// mevcut oyuncuların ilerlemesi ilk kurulumda silinmez.
export function currentSeasonId(): string {
  const ist = new Date(Date.now() + 3 * 3600_000); // Istanbul = UTC+3 (DST yok)
  return ist.toISOString().slice(0, 7); // 'YYYY-MM'
}

async function ensureSeason(row: DbUser): Promise<DbUser> {
  const cur = currentSeasonId();
  if (row.season_id === cur) return row;
  if (!row.season_id) {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET season_id = $2 WHERE id = $1 RETURNING *`, [row.id, cur]);
    return rows[0] ?? { ...row, season_id: cur };
  }
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET season_id = $2, level = 1, xp = 0,
       claimed_levels = '{}', claimed_premium = '{}', premium_road = FALSE
     WHERE id = $1 RETURNING *`, [row.id, cur]);
  return rows[0] ?? row;
}

async function clearExpiredSocialPackIfNeeded(row: DbUser): Promise<DbUser> {
  if (isFutureIso(row.social_pack_until)) return row;
  if (!row.social_pack_until) return row;
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET social_pack_until = NULL WHERE id = $1 RETURNING *`,
    [row.id],
  );
  return rows[0] ?? { ...row, social_pack_until: null };
}

// ---- Onboarding seed (App Store 2.1(a): pre-populated demo content) ----
// A single persistent "Crossover" system account befriends every NEW user and
// sends a couple of welcome DMs, so the Friends/Messages features are never empty
// for a fresh (incl. guest) account — App Review can verify them immediately.
const SYS_KEY = 'system_user_id';
const WELCOME_MESSAGES = [
  'Crossover\'a hoş geldin! 👋 Karşına iki futbol kulübü çıkar; ikisinde de forma giymiş ortak futbolcuyu rakibinden önce bul.',
  'Hazır olduğunda "Hemen Oyna" ile ilk düellona başla. Bol şans! ⚽',
];

async function getSystemUserId(): Promise<string> {
  const found = await pool.query<{ value: string }>(`SELECT value FROM app_state WHERE key = $1`, [SYS_KEY]);
  if (found.rows[0]?.value) return found.rows[0].value;
  let id: string;
  try {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO users (display_name, username_set, selected_avatar, avatar)
       VALUES ('Crossover', true, 'pp7', 'pp7') RETURNING id`,
    );
    id = ins.rows[0]!.id;
  } catch (e) {
    // Lost the create race (unique username) → reuse the existing system account.
    if ((e as { code?: string })?.code === '23505') {
      const byName = await pool.query<{ id: string }>(
        `SELECT id FROM users WHERE lower(display_name) = lower('Crossover') AND username_set = true LIMIT 1`,
      );
      if (!byName.rows[0]) throw e;
      id = byName.rows[0].id;
    } else throw e;
  }
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [SYS_KEY, id],
  );
  return id;
}

/** Befriend the new user with the system account + seed welcome DMs (best-effort). */
export async function seedWelcomeForNewUser(newUserId: string): Promise<void> {
  try {
    if (!newUserId) return;
    const sysId = await getSystemUserId();
    if (newUserId === sysId) return;
    await pool.query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`,
      [newUserId, sysId],
    );
    await pool.query(
      `INSERT INTO messages (from_user, to_user, body, created_at)
       VALUES ($1, $2, $3, now() - interval '2 minutes'),
              ($1, $2, $4, now() - interval '1 minute')`,
      [sysId, newUserId, WELCOME_MESSAGES[0], WELCOME_MESSAGES[1]],
    );
  } catch {
    // Never let onboarding-seed failure block account creation.
  }
}

// ---- User CRUD ----

function cleanInitialDisplayName(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ') || 'Oyuncu';
}

function provisionalDisplayName(base: string, attempt: number): string {
  if (attempt === 0) return base;
  return `${base} ${attempt < 8 ? 1000 + Math.floor(Math.random() * 9000) : randomUUID().slice(0, 8)}`;
}

async function displayNameTaken(displayName: string, exceptUserId?: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM users WHERE lower(display_name) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [displayName, exceptUserId ?? null],
  );
  return Boolean(rows[0]);
}

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

  const baseName = cleanInitialDisplayName(displayName);
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = provisionalDisplayName(baseName, attempt);
    if (await displayNameTaken(candidate)) continue;
    try {
      const { rows } = await pool.query<DbUser>(
        `INSERT INTO users (display_name, game_center_id)
         VALUES ($1, $2)
         RETURNING *`,
        [candidate, gameCenterId],
      );
      await seedWelcomeForNewUser(rows[0]!.id);
      return toProfile(rows[0]!);
    } catch (e) {
      if ((e as { code?: string })?.code !== '23505') throw e;
      if (gameCenterId) {
        const raced = await pool.query<DbUser>('SELECT * FROM users WHERE game_center_id = $1', [gameCenterId]);
        if (raced.rows[0]) return toProfile(raced.rows[0]);
      }
    }
  }
  throw new Error('display name generation exhausted');
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
  const baseName = cleanInitialDisplayName(displayName);
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = provisionalDisplayName(baseName, attempt);
    if (await displayNameTaken(candidate)) continue;
    try {
      const { rows } = await pool.query<DbUser>(
        `INSERT INTO users (display_name, ${col}, email) VALUES ($1, $2, $3) RETURNING *`,
        [candidate, sub, email],
      );
      await seedWelcomeForNewUser(rows[0]!.id);
      return toProfile(rows[0]!);
    } catch (e) {
      if ((e as { code?: string })?.code !== '23505') throw e;
      const raced = await pool.query<DbUser>(`SELECT * FROM users WHERE ${col} = $1`, [sub]);
      if (raced.rows[0]) return toProfile(raced.rows[0]);
    }
  }
  throw new Error('display name generation exhausted');
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
    if (await displayNameTaken(username)) continue;
    try {
      const { rows } = await pool.query<DbUser>(
        `INSERT INTO users (display_name, username_set) VALUES ($1, true) RETURNING *`,
        [username],
      );
      await seedWelcomeForNewUser(rows[0]!.id);
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

// ---- Kesinti telafisi (2026-08-25) ----
// Zorunlu güncelleme kapısı yüzünden oyuna girilemeyen kesinti için tek seferlik
// Sosyal Paket telafisi. Hediye KENDİLİĞİNDEN tanımlanmaz — oyuncu özür
// penceresindeki "AL" düğmesine bastığında bu fonksiyon çağrılır.
export function outageGiftWindowOpen(): boolean {
  if (!config.outageGift.enabled) return false;
  const until = Date.parse(config.outageGift.until);
  return !Number.isFinite(until) || Date.now() <= until;
}

// GREATEST, aktif bir paket varsa süreyi onun ÜSTÜNE bindirir (yoksa şu andan
// başlatır). `outage_gift_at IS NULL` koşulu UPDATE'in kendisinde olduğu için
// aynı anda iki kez basılsa bile ikinci istek 0 satır günceller — hediye tek
// seferliktir, çift veremez.
export async function claimOutageGift(
  userId: string,
): Promise<{ ok: true; profile: UserProfile; granted: boolean } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (!outageGiftWindowOpen()) return { ok: false, error: 'Kampanya sona erdi' };
  const { rows } = await pool.query<DbUser>(
    `UPDATE users
     SET social_pack_until = GREATEST(COALESCE(social_pack_until, now()), now())
                             + make_interval(hours => $2::int),
         outage_gift_at = now()
     WHERE id = $1 AND outage_gift_at IS NULL
     RETURNING *`,
    [userId, config.outageGift.hours],
  );
  if (rows[0]) return { ok: true, profile: toProfile(rows[0]), granted: true };
  // 0 satır: hediye bu hesaba zaten tanımlanmış. Hata değil — güncel profili
  // döndür ki istemci pencereyi kapatsın.
  const current = await getUser(userId);
  if (!current) return { ok: false, error: 'Hesap bulunamadı' };
  return { ok: true, profile: current, granted: false };
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
  if (await displayNameTaken(name, userId)) return { ok: false, error: 'Bu kullanıcı adı alınmış' };
  try {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET display_name = $2, username_set = true WHERE id = $1 RETURNING *`,
      [userId, name],
    );
    if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
    return { ok: true, profile: toProfile(rows[0]) };
  } catch (e) {
    // unique index race → someone took it a moment ago
    if ((e as { code?: string })?.code !== '23505') throw e;
    return { ok: false, error: 'Bu kullanıcı adı alınmış' };
  }
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const { rows } = await pool.query<DbUser>(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  return toProfile(await ensureSeason(await clearExpiredSocialPackIfNeeded(rows[0])));
}

/**
 * Permanently delete a user account and ALL of its data (App Store 5.1.1(v)).
 * `processed_transactions` has no ON DELETE CASCADE, so it is cleared explicitly;
 * everything else (friend_requests, friendships, match_history, messages,
 * push_tokens) cascades from the users row. All-or-nothing in one transaction.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  if (!userId) return false;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Silmeden ÖNCE anonim silme günlüğü (admin panel "Hesabını silenler" için).
    // Kişisel/tanımlayıcı hiçbir alan yazılmaz — sadece tip + kupa/seviye + tarih.
    // was_guest, admin.ts'teki isGuestSql ile aynı kuralı taşır. Test hesapları
    // (istatistiklerin dışında tutulanlar) günlüğe yazılmaz.
    await client.query(
      `INSERT INTO account_deletions (user_id, display_name, was_guest, auth_provider, trophies, level, account_created_at)
       SELECT u.id,
              u.display_name,
              (u.apple_sub IS NULL AND u.google_sub IS NULL AND u.facebook_sub IS NULL
                 AND u.game_center_id IS NULL AND u.display_name ~ '^M[0-9]{9}$'),
              CASE WHEN u.apple_sub    IS NOT NULL THEN 'apple'
                   WHEN u.google_sub   IS NOT NULL THEN 'google'
                   WHEN u.facebook_sub IS NOT NULL THEN 'facebook'
                   WHEN u.game_center_id IS NOT NULL THEN 'gamecenter'
                   ELSE NULL END,
              u.trophies, u.level, u.created_at
         FROM users u
        WHERE u.id = $1
          AND lower(u.display_name) NOT IN ('yagiz', 'bloodsucker')`,
      [userId],
    );
    await client.query('DELETE FROM processed_transactions WHERE user_id = $1', [userId]);
    const res = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    return (res.rowCount ?? 0) > 0;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

export async function applyMatchResult(
  userId: string,
  won: boolean,
  // leaver: hükmen mağlubiyette AYRILAN taraf. Kuşanılmış kalkan varsa bu maçta
  // geçerli sayılır; bir sonraki dereceli sonuç kazanılsa/kaybedilse/çıkılsa tüketilir.
  // opponentTrophies: rakibin MAÇ BAŞI kupası (bot dahil) — dinamik delta farkı.
  opts?: {
    leaver?: boolean;
    opponentTrophies?: number | null;
    playerSkillMean?: number | null;
    playerSkillUncertainty?: number | null;
    opponentSkillMean?: number | null;
    opponentSkillUncertainty?: number | null;
    matchId?: string;
    opponentId?: string | null;
    opponentRef?: string | null;
    opponentType?: 'HUMAN' | 'BOT';
    antiFarmMultiplier?: number;
    botEconomyMultiplier?: number;
    farmRiskScore?: number;
    farmRiskLevel?: string;
    economyState?: string;
    ledgerReason?: string;
    ledgerMetadata?: Record<string, unknown>;
  },
): Promise<{ profile: UserProfile; delta: number; arenaReward: number; shielded: boolean; expectedWinProbability?: number; streakReward?: { streak: number; diamonds: number; powerId: string | null } }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query<DbUser>(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    const rowUser = userRes.rows[0];
    if (!rowUser) throw new Error('User not found');
    const user = toProfile(rowUser);
    if (opts?.matchId) {
      try {
        const previous = await client.query<{ delta: number; expected_win_probability: number | null; metadata: Record<string, unknown> | null }>(
          `SELECT delta, expected_win_probability, metadata
             FROM trophy_ledger
            WHERE match_id = $1 AND player_id = $2
            ORDER BY created_at ASC
            LIMIT 1`,
          [opts.matchId, userId],
        );
        const row = previous.rows[0];
        if (row) {
          const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
          await client.query('COMMIT');
          return {
            profile: user,
            delta: Number(row.delta),
            arenaReward: 0,
            shielded: metadata.shielded === true,
            expectedWinProbability: row.expected_win_probability == null ? undefined : Number(row.expected_win_probability),
          };
        }
      } catch (err) {
        if ((err as { code?: string }).code !== '42P01') throw err;
      }
    }
    // Kupa Kalkanı: kuşanıldıktan sonraki ilk dereceli sonuçta tüketilir. Sonuç
    // mağlubiyetse (hükmen çıkış dahil) kupa kaybını emer; galibiyette yalnız tüketilir.
    const { rows: shieldRows } = await client.query<{ id: string }>(
        `UPDATE users SET shield_armed = FALSE WHERE id = $1 AND shield_armed = TRUE RETURNING id`,
        [userId],
      );
    const shieldConsumed = shieldRows.length > 0;
    const shielded = shieldConsumed && !won;
    const expectedCalc = !shielded
      && typeof opts?.playerSkillMean === 'number'
      && typeof opts?.opponentSkillMean === 'number'
      ? trophyDeltaExpectedScore({
          playerSkillMean: opts.playerSkillMean,
          opponentSkillMean: opts.opponentSkillMean,
          playerSkillUncertainty: opts.playerSkillUncertainty ?? undefined,
          opponentSkillUncertainty: opts.opponentSkillUncertainty ?? undefined,
          won,
          playerTrophies: user.trophies,
          opponentTrophies: opts.opponentTrophies ?? null,
          vsBot: (opts.opponentType ?? (opts.opponentId ? 'HUMAN' : 'BOT')) === 'BOT',
        })
      : null;
    const isBotMatch = (opts?.opponentType ?? (opts?.opponentId ? 'HUMAN' : 'BOT')) === 'BOT';
    const botBounds = isBotMatch ? { gainMin: BOT_GAIN_MIN, gainMax: BOT_GAIN_MAX, lossMin: BOT_LOSS_MIN, lossMax: BOT_LOSS_MAX } : {};
    const baseRaw = shielded ? 0 : (expectedCalc?.delta ?? trophyDelta(user.trophies, won, opts?.opponentTrophies ?? null));
    const finalMultiplier = Math.max(0, Math.min(1.25, (opts?.antiFarmMultiplier ?? 1) * (opts?.botEconomyMultiplier ?? 1)));
    const raw = won && baseRaw > 0 ? Math.round(baseRaw * finalMultiplier) : baseRaw;
    const delta = shielded ? 0 : clampFinalTrophyDelta({ rawDelta: raw, won, currentTrophies: user.trophies, ...botBounds });
    const prevRewardedArenaIdx = Math.max(0, Math.min(ARENAS.length - 1, user.highestArenaRewarded));

    const { rows } = await client.query<DbUser>(
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
            -- Seri: galibiyette +1, mağlubiyette sıfır; rekor hiç düşmez.
            -- Kırılan seri lost_streak'e yazılır — Seri Geri Yükleme gücü onu geri getirir.
            win_streak = CASE WHEN $3 THEN COALESCE(u.win_streak, 0) + 1 ELSE 0 END,
            best_streak = GREATEST(COALESCE(u.best_streak, 0), CASE WHEN $3 THEN COALESCE(u.win_streak, 0) + 1 ELSE 0 END),
            -- Kırılan seri YALNIZ kırıldığı maçtan hemen sonra geri yüklenebilir:
            -- bir maç daha oynanınca (galibiyet ya da seri kırmayan mağlubiyet) sıfırlanır.
            lost_streak = CASE WHEN NOT $3 AND COALESCE(u.win_streak, 0) > 0 THEN u.win_streak ELSE 0 END,
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
    const nextRewardedArenaIdx = Math.max(0, Math.min(ARENAS.length - 1, profile.highestArenaRewarded));
    const arenaReward = nextRewardedArenaIdx > prevRewardedArenaIdx
      ? ARENA_DIAMOND_REWARDS.slice(prevRewardedArenaIdx + 1, nextRewardedArenaIdx + 1).reduce((sum, n) => sum + n, 0)
      : 0;
    if (arenaReward > 0) {
      // highest_arena_rewarded tek yönlü yükseldiği için arena indeksi doğal
      // idempotency anahtarıdır — aynı arena ödülü deftere iki kez düşemez.
      // Bilinçli olarak pool'dan (tx DIŞI) yazılır: defter best-effort'tur ve
      // başarısız bir INSERT settlement transaction'ını zehirlememelidir.
      void recordDiamondLedger({
        userId, amount: arenaReward, balanceAfter: profile.diamonds,
        reason: 'ARENA_REWARD', referenceId: ARENAS[nextRewardedArenaIdx]?.name ?? String(nextRewardedArenaIdx),
        idempotencyKey: `arena:${userId}:${nextRewardedArenaIdx}`,
      });
    }
    // GOAT arenasına İLK varış: goat çerçevesi kalıcı olarak hesaba yazılır
    // ("goat olunca goat çerçevesi vercez"). Sahiplik owned_frames'te sezondan
    // bağımsız yaşar; çerçevenin GÖRÜNÜMÜ istemcide kupayla evrilir (GOAT II-V).
    if (nextRewardedArenaIdx >= ARENAS.length - 1 && prevRewardedArenaIdx < ARENAS.length - 1) {
      const { rows: goatRows } = await client.query<{ owned_frames: string[] }>(
        `UPDATE users SET owned_frames = array_append(owned_frames, 'goat')
         WHERE id = $1 AND NOT ('goat' = ANY(owned_frames))
         RETURNING owned_frames`,
        [userId],
      );
      if (goatRows[0]) profile.ownedFrames = goatRows[0].owned_frames;
    }
    // GALİBİYET SERİSİ KİLOMETRE TAŞI (2026-08-27): mevcut win_streak sistemi
    // genişletildi — seri TAM kilometre taşına ulaştığı maçta ödül aynı
    // transaction'da yazılır. Seri bir koşuda aynı değeri iki kez göremez
    // (kaybedince 0'a döner) → doğal idempotency, ayrı claim tablosu gerekmez.
    let streakReward: { streak: number; diamonds: number; powerId: string | null } | undefined;
    if (won) {
      const ms = milestoneFor(profile.winStreak);
      if (ms) {
        const col = ms.powerId ? { freeze: 'sp_freeze', reveal: 'sp_reveal', skip: 'sp_skip', extratime: 'sp_extratime', secondchance: 'sp_secondchance' }[ms.powerId] : null;
        const sets = [
          ms.diamonds ? `diamonds = diamonds + ${Math.max(0, Math.round(ms.diamonds))}` : null,
          col ? `${col} = ${col} + ${Math.max(1, Math.round(ms.powerQty ?? 1))}` : null,
        ].filter(Boolean).join(', ');
        if (sets) {
          const { rows: msRows } = await client.query<DbUser>(
            `UPDATE users SET ${sets} WHERE id = $1 RETURNING *`,
            [userId],
          );
          if (msRows[0]) {
            const fresh = toProfile(msRows[0]);
            profile.diamonds = fresh.diamonds;
            profile.spFreeze = fresh.spFreeze; profile.spReveal = fresh.spReveal;
            profile.spSkip = fresh.spSkip; profile.spExtratime = fresh.spExtratime;
            profile.spSecondchance = fresh.spSecondchance;
            streakReward = { streak: ms.streak, diamonds: ms.diamonds ?? 0, powerId: ms.powerId ?? null };
            if (ms.diamonds) {
              // Pool'dan (tx dışı) — bkz. arena ödülü notu.
              void recordDiamondLedger({
                userId, amount: ms.diamonds, balanceAfter: fresh.diamonds,
                reason: 'STREAK_MILESTONE', referenceId: String(ms.streak),
                idempotencyKey: opts?.matchId ? `streak:${opts.matchId}:${userId}:${ms.streak}` : undefined,
              });
            }
          }
        }
      }
    }
    if (opts?.matchId) {
      const opponentType = opts.opponentType ?? (opts.opponentId ? 'HUMAN' : 'BOT');
      const source = opponentType === 'BOT'
        ? (delta >= 0 ? 'BOT_TO_HUMAN_INJECTION' : 'HUMAN_TO_BOT_SINK')
        : 'HUMAN_TO_HUMAN_TRANSFER';
      const ledgerMetadata = JSON.stringify({ ...(opts.ledgerMetadata ?? {}), rawTrophyDelta: raw, finalTrophyDelta: delta, shielded });
      await client.query(
        `INSERT INTO trophy_ledger
           (match_id, player_id, before_trophies, delta, after_trophies, opponent_id, opponent_ref, opponent_type,
            source, reason, expected_win_probability, anti_farm_multiplier, bot_economy_multiplier, final_multiplier,
            farm_risk_score, farm_risk_level, economy_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
         ON CONFLICT (match_id, player_id, reason) DO NOTHING`,
        [
          opts.matchId, userId, user.trophies, delta, profile.trophies, opts.opponentId ?? null, opts.opponentRef ?? null, opponentType,
          source, opts.ledgerReason ?? 'match_settlement', expectedCalc?.expectedWinProbability ?? null,
          opts.antiFarmMultiplier ?? 1, opts.botEconomyMultiplier ?? 1, finalMultiplier,
          opts.farmRiskScore ?? 0, opts.farmRiskLevel ?? 'LOW', opts.economyState ?? 'HEALTHY', ledgerMetadata,
        ],
      ).catch((err) => {
        if ((err as { code?: string }).code !== '42P01') throw err;
      });
    }
    await client.query('COMMIT');
    return { profile, delta, arenaReward, shielded, expectedWinProbability: expectedCalc?.expectedWinProbability, streakReward };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ---- Özel güçler (Seviye Yolu ödülü, tek kullanımlık) ----
// Etkinleştirme atomiktir: adet denetimi + düşüm + etki tek UPDATE'te — çifte
// dokunuş ikinci jetonu yakmaz, aktifken yeniden basmak stok eritmez.
export async function usePower(
  userId: string,
  powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken',
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (powerId === 'xp2x') {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET power_xp2x = power_xp2x - 1, xp_boost_until = now() + interval '1 hour'
       WHERE id = $1 AND power_xp2x > 0 AND (xp_boost_until IS NULL OR xp_boost_until < now())
       RETURNING *`,
      [userId],
    );
    if (rows[0]) return { ok: true, profile: toProfile(rows[0]) };
    const u = await getUser(userId);
    if (u?.xpBoostUntil) return { ok: false, error: '2x XP zaten aktif' };
    return { ok: false, error: 'Kullanılabilir 2x XP jetonun yok' };
  }
  if (powerId === 'shield') {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET power_shield = power_shield - 1, shield_armed = TRUE
       WHERE id = $1 AND power_shield > 0 AND shield_armed = FALSE
       RETURNING *`,
      [userId],
    );
    if (rows[0]) return { ok: true, profile: toProfile(rows[0]) };
    const u = await getUser(userId);
    if (u?.shieldArmed) return { ok: false, error: 'Kupa Kalkanı zaten kuşanılı' };
    return { ok: false, error: 'Kullanılabilir Kupa Kalkanın yok' };
  }
  if (powerId === 'streak') {
    // Anında etki: son kırılan seri mevcut serinin ÜZERİNE eklenir (araya giren
    // galibiyetler kaybolmaz), rekor gerekiyorsa yükselir, kırık kayıt tüketilir.
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET
         power_streak = power_streak - 1,
         win_streak = win_streak + lost_streak,
         best_streak = GREATEST(best_streak, win_streak + lost_streak),
         lost_streak = 0
       WHERE id = $1 AND power_streak > 0 AND lost_streak > 0
       RETURNING *`,
      [userId],
    );
    if (rows[0]) return { ok: true, profile: toProfile(rows[0]) };
    const u = await getUser(userId);
    if (u && u.powerStreak <= 0) return { ok: false, error: 'Kullanılabilir Seri Geri Yükleme yok' };
    return { ok: false, error: 'Geri yüklenecek kırık bir seri yok' };
  }
  if (powerId === 'training') {
    // Antrenman Bileti: 1 SAATLİK pencere boyunca bot maçlarındaki 60 XP günlük
    // tavanını kaldırır. Aktifken (pencere dolmadan) yeniden kullanmak engellenir.
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET power_training = power_training - 1, training_boost_until = now() + interval '1 hour'
       WHERE id = $1 AND power_training > 0 AND (training_boost_until IS NULL OR training_boost_until < now())
       RETURNING *`,
      [userId],
    );
    if (rows[0]) return { ok: true, profile: toProfile(rows[0]) };
    const u = await getUser(userId);
    if (u?.trainingBoostUntil) return { ok: false, error: 'Antrenman Bileti zaten aktif' };
    return { ok: false, error: 'Kullanılabilir Antrenman Biletin yok' };
  }
  if (powerId === 'socialtoken') {
    // Sosyal Paket Jetonu: süreye +24 saat ekler. Aktif bir paketin ÜSTÜNE eklenir
    // (GREATEST ile mevcut bitiş ya da şu an, hangisi ileriyse, esas alınır).
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET power_socialtoken = power_socialtoken - 1,
         social_pack_until = GREATEST(COALESCE(social_pack_until, now()), now()) + interval '24 hours'
       WHERE id = $1 AND power_socialtoken > 0
       RETURNING *`,
      [userId],
    );
    if (rows[0]) return { ok: true, profile: toProfile(rows[0]) };
    return { ok: false, error: 'Kullanılabilir Sosyal Paket Jetonun yok' };
  }
  return { ok: false, error: 'Bilinmeyen güç' };
}

// ---- Güç satın alma (mağaza) ----
// Güçler Seviye Yolu'ndan kazanılır AMA mağazadan elmasla da alınabilir.
// Atomik: bakiye denetimi + düşüm + envanter artışı tek UPDATE'te.
export const POWER_PRICES: Record<'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken', number> = {
  xp2x: 150,
  shield: 250,
  streak: 300,
  training: 250,
  socialtoken: 350,
};

export async function buyPower(
  userId: string,
  powerId: 'xp2x' | 'shield' | 'streak' | 'training' | 'socialtoken',
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const price = POWER_PRICES[powerId];
  if (!price) return { ok: false, error: 'Bilinmeyen güç' };
  const col = powerId === 'xp2x' ? 'power_xp2x' : powerId === 'shield' ? 'power_shield' : powerId === 'streak' ? 'power_streak' : powerId === 'training' ? 'power_training' : 'power_socialtoken';
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET diamonds = diamonds - $2, ${col} = ${col} + 1
     WHERE id = $1 AND diamonds >= $2
     RETURNING *`,
    [userId, price],
  );
  if (rows[0]) {
    void recordDiamondLedger({ userId, amount: -price, balanceAfter: Number(rows[0].diamonds), reason: 'POWER_PURCHASE', referenceId: powerId });
    return { ok: true, profile: toProfile(rows[0]) };
  }
  const u = await getUser(userId);
  return { ok: false, error: `Yetersiz elmas (${u?.diamonds ?? 0}/${price})` };
}

// ---- Premium Seviye Yolu satın alma ----
// Tek seferlik: PREMIUM_ROAD_PRICE (2000) elmas düşülür, premium_road açılır. Atomik — çift dokunuş
// iki kez ücret alamaz, bakiye yetmezse hiçbir şey değişmez.
export async function buyPremiumRoad(
  userId: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET diamonds = diamonds - $2, premium_road = TRUE
     WHERE id = $1 AND premium_road = FALSE AND diamonds >= $2
     RETURNING *`,
    [userId, PREMIUM_ROAD_PRICE],
  );
  if (rows[0]) {
    void recordDiamondLedger({ userId, amount: -PREMIUM_ROAD_PRICE, balanceAfter: Number(rows[0].diamonds), reason: 'PREMIUM_ROAD_PURCHASE', referenceId: 'copass' });
    return { ok: true, profile: toProfile(rows[0]) };
  }
  const u = await getUser(userId);
  if (u?.premiumRoad) return { ok: false, error: 'CO Pass zaten açık' };
  return { ok: false, error: `Yetersiz elmas (${u?.diamonds ?? 0}/${PREMIUM_ROAD_PRICE})` };
}

export async function changeDisplayName(
  userId: string,
  newName: string,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const COST = 1000; // diamonds
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  // Misafir hesaplar ad değiştiremez — yalnız Apple/Google/Facebook bağlı
  // hesaplar. (İstemci bu UI'ı misafire hiç göstermez; bu, protokol düzeyinde
  // ikinci kilittir — elmas düşülmeden ÖNCE kontrol edilir.)
  const { rows: linkRows } = await pool.query<{ linked: boolean }>(
    `SELECT (apple_sub IS NOT NULL OR google_sub IS NOT NULL OR facebook_sub IS NOT NULL) AS linked
     FROM users WHERE id = $1`,
    [userId],
  );
  if (!linkRows[0]?.linked) return { ok: false, error: 'Ad değiştirmek için bir hesapla kayıt olmalısın' };
  if (user.diamonds < COST) return { ok: false, error: `Yetersiz elmas (${user.diamonds}/${COST})` };

  // İsim başka bir hesapta dolu mu? (Büyük/küçük harf duyarsız; elmas
  // düşülmeden ÖNCE kontrol edilir.)
  const trimmed = newName.trim();
  const { rows: takenRows } = await pool.query(
    `SELECT 1 FROM users WHERE LOWER(display_name) = LOWER($1) AND id <> $2 LIMIT 1`,
    [trimmed, userId],
  );
  if (takenRows.length > 0) return { ok: false, error: 'Bu kullanıcı adı zaten dolu' };

  try {
    const { rows } = await pool.query<DbUser>(
      `UPDATE users SET display_name = $2, diamonds = diamonds - $3
       WHERE id = $1 AND diamonds >= $3
       RETURNING *`,
      [userId, trimmed, COST],
    );
    if (!rows[0]) return { ok: false, error: 'Yetersiz elmas' };
    void recordDiamondLedger({ userId, amount: -COST, balanceAfter: Number(rows[0].diamonds), reason: 'USERNAME_CHANGE' });
    return { ok: true, profile: toProfile(rows[0]) };
  } catch (err) {
    // Yarış durumu: aynı ada eşzamanlı iki istek — unique index ihlali (23505).
    if ((err as { code?: string }).code === '23505') return { ok: false, error: 'Bu kullanıcı adı zaten dolu' };
    throw err;
  }
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

// ---- Profil çerçevesi (seviye ödülü) ----
// Çerçeveler 10'un katı seviyelerde açılır; takmak için o seviyeye ulaşmış
// olmak şart. null = çerçeveyi kaldır.
const FRAME_MIN_LEVEL: Record<string, number> = { bronze: 10, silver: 20, gold: 30, diamond: 40, goat: 50 };
export async function setSelectedFrame(
  userId: string,
  frameId: string | null,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  if (frameId !== null) {
    const min = FRAME_MIN_LEVEL[frameId];
    if (!min) return { ok: false, error: 'Geçersiz çerçeve' };
    const user = await getUser(userId);
    if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
    // Sahiplik KALICIDIR (owned_frames) — sezon sıfırlansa da kazanılmış çerçeve takılabilir
    if (!user.ownedFrames.includes(frameId)) return { ok: false, error: 'Önce Seviye Yolu\'ndan bu çerçevenin ödülünü topla' };
  }
  const { rows } = await pool.query<DbUser>(
    `UPDATE users SET selected_frame = $2, equipped_frame_id = $2 WHERE id = $1 RETURNING *`,
    [userId, frameId],
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
  // Admin paneli sayaçları: kalıcı izleme günlüğü. Günlük kayıt hatası ödülü
  // asla engellememeli — bilinçli fire-and-forget.
  pool.query(`INSERT INTO ad_rewards (user_id) VALUES ($1)`, [userId]).catch(() => {});
  void recordDiamondLedger({ userId, amount: AD_REWARD, balanceAfter: Number(rows[0].diamonds), reason: 'AD_REWARD' });
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
  void recordDiamondLedger({ userId, amount: -price, balanceAfter: Number(rows[0].diamonds), reason: 'EMOTE_PURCHASE', referenceId: emoteId, idempotencyKey: `emote:${userId}:${emoteId}` });
  return { ok: true, profile: toProfile(rows[0]) };
}

// Set the player's equipped visual-emote loadout. Keeps only emote ids the
// player may actually equip — catalog-valid AND (free OR owned) — dedupes, and
// caps at MAX_EQUIPPED. Ownership is enforced HERE, not in the UI: a crafted
// client must not be able to equip stickers it never bought.
export async function setEquippedEmotes(
  userId: string,
  ids: string[],
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const user = await getUser(userId);
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  const clean = [...new Set(ids)]
    .filter((id) => isEquippableEmote(id) && (isFreeEmote(id) || user.ownedEmotes.includes(id)))
    .slice(0, MAX_EQUIPPED);
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
  void recordDiamondLedger({ userId, amount: -price, balanceAfter: Number(rows[0].diamonds), reason: 'AVATAR_PURCHASE', referenceId: avatarId, idempotencyKey: `avatar:${userId}:${avatarId}` });
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
  frame: string | null; // takılı profil çerçevesi
  isBot?: boolean;
}

export async function getLeaderboard(limit = 50, viewerUserId?: string): Promise<LeaderboardEntry[]> {
  // Show every account that has actually earned trophies. The app's "my rank"
  // footer depends on the current user being present even if they are a guest.
  const viewerUuid = viewerUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(viewerUserId)
    ? viewerUserId
    : null;
  const { rows } = await pool.query<DbUser>(
    `SELECT * FROM users
       WHERE trophies > 0
          OR ($1::uuid IS NOT NULL AND id = $1::uuid)
       ORDER BY trophies DESC, wins DESC`,
    [viewerUuid],
  );
  const entries: Omit<LeaderboardEntry, 'rank'>[] = rows.map((r) => ({
    userId: r.id,
    displayName: r.display_name,
    trophies: r.trophies,
    wins: r.wins,
    losses: Number(r.losses),
    arena: getArena(r.trophies),
    avatar: r.avatar ?? null,
    // toProfile ile aynı öncelik: mağaza çerçevesi (equipped_frame_id) varsa o,
    // yoksa seviye çerçevesi — eski kayıtlarda selected_frame güncel olmayabilir.
    frame: r.equipped_frame_id ?? r.selected_frame ?? null,
  }));
  const rankedUsers = entries
    .sort((a, b) => b.trophies - a.trophies || b.wins - a.wins || a.displayName.localeCompare(b.displayName))
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const ranked = rankedUsers;
  const top = ranked.slice(0, limit);
  if (viewerUuid && !top.some((e) => e.userId === viewerUuid)) {
    const mine = ranked.find((e) => e.userId === viewerUuid);
    if (mine) return [...top, mine];
  }
  return top;
}

// ---- Friends ----

export interface FriendView {
  userId: string;
  displayName: string;
  selectedAvatar: string;
  avatar: string | null;
  frame?: string | null; // takılı profil çerçevesi
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
    frame: r.equipped_frame_id ?? r.selected_frame ?? null,
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
  // Guideline 1.2 — a friendship is the doorway to messaging, so it needs the
  // same verified-identity requirement. Enforced here (server), not only in the
  // UI's guest gate, which a modified client could skip.
  if (!(await isIdentifiedAccount(fromUserId))) {
    return { ok: false, error: 'Arkadaş eklemek için Apple veya Google ile giriş yap' };
  }

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

  // Guideline 1.2: a block must close EVERY contact path, not just DMs — otherwise
  // a blocked user simply re-opens the channel with a friend request. Deliberately
  // the same "not found" wording as an unknown user, so a block isn't disclosed.
  if (await isBlockedBetween(fromUserId, target.id)) return { ok: false, error: 'Kullanıcı bulunamadı' };

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
// `viewerId` is optional only so older callers keep compiling — pass it whenever
// there is a signed-in user, otherwise the block filter below can't apply and a
// blocked account stays findable (and re-addable), which defeats the block.
export async function searchUsers(query: string, viewerId?: string): Promise<{ userId: string; displayName: string }[]> {
  if (!query || query.trim().length < 2) return [];
  const params: unknown[] = [query.trim()];
  let blockClause = '';
  if (viewerId) {
    params.push(viewerId);
    blockClause = `AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
       WHERE (b.blocker_id = $2 AND b.blocked_id = users.id)
          OR (b.blocker_id = users.id AND b.blocked_id = $2)
    )`;
  }
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users
      WHERE username_set = true AND lower(display_name) = lower($1)
      ${blockClause}
      LIMIT 10`,
    params,
  );
  return rows.map((r) => ({ userId: r.id, displayName: r.display_name }));
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
  outage_gift_at: string | null;
  avatar: string | null;
  last_seen: string | null;
  highest_arena_rewarded: number | null;
  created_at: string;
  xp: number | null;
  level: number | null;
  selected_frame: string | null;
  claimed_levels: number[] | null;
  power_xp2x: number | null;
  power_shield: number | null;
  xp_boost_until: string | null;
  shield_armed: boolean | null;
  win_streak: number | null;
  best_streak: number | null;
  power_streak: number | null;
  lost_streak: number | null;
  premium_road: boolean | null;
  claimed_premium: number[] | null;
  season_id: string | null;
  owned_frames: string[] | null;
  owned_cosmetics: string[] | null;
  equipped_frame_id: string | null;
  equipped_name_effect_id: string | null;
  equipped_match_background_id: string | null;
  equipped_ball_id: string | null;
  equipped_intro_id: string | null;
  equipped_victory_effect_id: string | null;
  equipped_answer_effect_id: string | null;
  power_training: number | null;
  training_boost_day: string | null;
  training_boost_until: string | null;
  power_socialtoken: number | null;
  banned_at: string | null;
  // Maç içi Özel Güçler (specialPowers.ts) — meta güçlerden AYRI envanter.
  sp_freeze: number | null;
  sp_reveal: number | null;
  sp_skip: number | null;
  sp_extratime: number | null;
  sp_secondchance: number | null;
  equipped_special_power: string | null;
  equipped_special_powers: string[] | null;
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
    socialPackUntil: isFutureIso(row.social_pack_until) ? row.social_pack_until : null,
    outageGiftAt: row.outage_gift_at ?? null,
    outageGiftAvailable: !row.outage_gift_at && outageGiftWindowOpen(),
    arena: getArena(row.trophies),
    avatar: row.avatar ?? row.selected_avatar ?? null,
    xp: row.xp ?? 0,
    level: row.level ?? 1,
    selectedFrame: row.equipped_frame_id ?? row.selected_frame ?? null,
    claimedLevels: row.claimed_levels ?? [],
    powerXp2x: row.power_xp2x ?? 0,
    powerShield: row.power_shield ?? 0,
    xpBoostUntil: isFutureIso(row.xp_boost_until) ? row.xp_boost_until : null,
    shieldArmed: row.shield_armed ?? false,
    winStreak: row.win_streak ?? 0,
    bestStreak: row.best_streak ?? 0,
    powerStreak: row.power_streak ?? 0,
    lostStreak: row.lost_streak ?? 0,
    premiumRoad: row.premium_road ?? false,
    claimedPremium: row.claimed_premium ?? [],
    ownedFrames: row.owned_frames ?? [],
    ownedCosmetics: row.owned_cosmetics ?? [],
    equippedNameEffectId: row.equipped_name_effect_id ?? null,
    equippedMatchBackgroundId: row.equipped_match_background_id ?? null,
    equippedBallId: row.equipped_ball_id ?? 'classic_ball',
    equippedIntroId: row.equipped_intro_id ?? null,
    equippedVictoryEffectId: row.equipped_victory_effect_id ?? null,
    equippedAnswerEffectId: row.equipped_answer_effect_id ?? null,
    powerTraining: row.power_training ?? 0,
    trainingBoostUntil: isFutureIso(row.training_boost_until) ? row.training_boost_until : null,
    powerSocialToken: row.power_socialtoken ?? 0,
    highestArenaRewarded: Math.max(0, Math.min(ARENAS.length - 1, row.highest_arena_rewarded ?? 0)),
    bannedAt: row.banned_at ?? null,
    spFreeze: row.sp_freeze ?? 0,
    spReveal: row.sp_reveal ?? 0,
    spSkip: row.sp_skip ?? 0,
    spExtratime: row.sp_extratime ?? 0,
    spSecondchance: row.sp_secondchance ?? 0,
    equippedSpecialPower: row.equipped_special_power ?? null,
    equippedSpecialPowers: row.equipped_special_powers ?? [],
  };
}

// ---- Mod bazlı istatistikler (profil ekranı) ----
// Kaynak: match_history — yalnız dereceli hızlı eşleşmeler sayılır. Zorluk seçilen
// solo bot maçları ve dostluk/oda maçları ranked=false kaldığı için profil kırılımına girmez.
export interface ModeStat { mode: string; wins: number; losses: number }
export async function getModeStats(userId: string): Promise<ModeStat[]> {
  const { rows } = await pool.query<{ game_mode: string; wins: string; losses: string }>(
    `SELECT game_mode,
            COUNT(*) FILTER (WHERE won) AS wins,
            COUNT(*) FILTER (WHERE NOT won) AS losses
     FROM match_history
     WHERE player_id = $1
        AND ranked = TRUE
      GROUP BY game_mode`,
    [userId],
  );
  return rows.map((r) => ({ mode: r.game_mode, wins: Number(r.wins), losses: Number(r.losses) }));
}

export async function getRankedProfileStats(userId: string): Promise<{ wins: number; losses: number; modes: ModeStat[] }> {
  const { rows } = await pool.query<{ wins: string; losses: string }>(
    `SELECT COUNT(*) FILTER (WHERE won) AS wins,
            COUNT(*) FILTER (WHERE NOT won) AS losses
       FROM match_history
      WHERE player_id = $1
        AND ranked = TRUE`,
    [userId],
  );
  return {
    wins: Number(rows[0]?.wins ?? 0),
    losses: Number(rows[0]?.losses ?? 0),
    modes: await getModeStats(userId),
  };
}

export function botModeStats(seed: number): ModeStat[] {
  const base = Math.max(20, Math.round(seed / 18));
  return [
    { mode: 'team-team', wins: base + 28, losses: Math.max(8, Math.round(base * 0.34)) },
    { mode: 'country-team', wins: Math.round(base * 0.72), losses: Math.max(6, Math.round(base * 0.28)) },
    { mode: 'letter-team', wins: Math.round(base * 0.58), losses: Math.max(5, Math.round(base * 0.32)) },
    { mode: 'player-player', wins: Math.round(base * 0.22), losses: Math.max(3, Math.round(base * 0.18)) },
  ];
}

export function getLeaderboardBotProfile(userId: string): (Omit<LeaderboardEntry, 'rank'> & { modeStats: ModeStat[] }) | null {
  void userId;
  return null;
}

export async function getBotPressureProfile(userId: string): Promise<{ pressure: number; relief: number; botWins: number; botGames: number; recentWins: number; recentGames: number; winStreak: number; trophyGain30m: number; botWins30m: number }> {
  const [{ rows }, userRes] = await Promise.all([
    pool.query<{ won: boolean; opponent_id: string | null; played_at: string; player_trophies: number }>(
      `SELECT won, opponent_id::text AS opponent_id, played_at, player_trophies
         FROM match_history
        WHERE player_id = $1
          AND ranked = TRUE
        ORDER BY played_at DESC
        LIMIT 24`,
      [userId],
    ),
    pool.query<{ trophies: number; win_streak: number | null }>('SELECT trophies, win_streak FROM users WHERE id = $1', [userId]),
  ]);
  const user = userRes.rows[0];
  const recentGames = rows.length;
  const recentWins = rows.filter((r) => r.won).length;
  const botRows = rows.filter((r) => r.opponent_id == null);
  const botGames = botRows.length;
  const botWins = botRows.filter((r) => r.won).length;
  const now = Date.now();
  const rows30m = rows.filter((r) => now - new Date(r.played_at).getTime() <= 30 * 60_000);
  const botWins30m = rows30m.filter((r) => r.opponent_id == null && r.won).length;
  const oldest30mTrophies = rows30m.length ? Math.min(...rows30m.map((r) => Number(r.player_trophies) || 0)) : (user?.trophies ?? 0);
  const trophyGain30m = Math.max(0, (user?.trophies ?? oldest30mTrophies) - oldest30mTrophies);
  const winStreak = Math.max(0, user?.win_streak ?? 0);
  const botRate = botGames >= 3 ? botWins / botGames : 0;
  const formRate = recentGames >= 5 ? recentWins / recentGames : 0;
  const recentLosses = recentGames - recentWins;
  const lossStreak = rows.findIndex((r) => r.won);
  const normalizedLossStreak = lossStreak < 0 ? Math.min(recentGames, 5) : lossStreak;
  const streakBonus = winStreak >= 8 ? 0.30 : winStreak >= 5 ? 0.20 : winStreak >= 3 ? 0.12 : 0;
  const botFarmBonus = botGames >= 6 && botRate >= 0.83 ? 0.42 : botGames >= 4 && botRate >= 0.75 ? 0.32 : botGames >= 3 && botRate >= 0.66 ? 0.20 : 0;
  const formBonus = formRate >= 0.85 ? 0.22 : formRate >= 0.72 ? 0.15 : formRate >= 0.64 ? 0.09 : 0;
  const burstBonus = trophyGain30m >= 350 ? 0.34 : trophyGain30m >= 220 ? 0.24 : trophyGain30m >= 120 ? 0.14 : 0;
  const burstBotBonus = botWins30m >= 8 ? 0.24 : botWins30m >= 5 ? 0.17 : botWins30m >= 3 ? 0.10 : 0;
  const relief = clampN(
    (recentGames >= 5 && formRate <= 0.35 ? 0.24 : recentGames >= 4 && formRate <= 0.45 ? 0.14 : 0)
    + (normalizedLossStreak >= 3 ? 0.20 : normalizedLossStreak >= 2 ? 0.10 : 0)
    + (recentGames >= 6 && recentLosses >= 4 ? 0.10 : 0),
    0,
    0.42,
  );
  const rawPressure = botFarmBonus + formBonus + streakBonus + burstBonus + burstBotBonus;
  return { pressure: clampN(rawPressure - relief, 0, 0.82), relief, botWins, botGames, recentWins, recentGames, winStreak, trophyGain30m, botWins30m };
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
  durationSecs = 0, // maç süresi (sn); 0 = bilinmiyor (eski istemci/kayıt)
  ranked = false,
): Promise<void> {
  await pool.query(
    `INSERT INTO match_history (player_id, player_name, opponent_id, opponent_name, player_score, opponent_score,
       won, player_trophies, opponent_trophies, game_mode, rounds, duration_secs, ranked)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [playerId, playerName, opponentId, opponentName, playerScore, opponentScore, won,
     playerTrophies, opponentTrophies, gameMode, JSON.stringify(rounds), durationSecs, ranked],
  );
}

// ── Oturum günlüğü (admin istatistikleri) ───────────────────────────────────
// ws bağlantısı kapanınca çağrılır: kullanıcının bu bağlantıda oyunda kaldığı
// süreyi yazar. 5 sn altı gürültü (anlık reconnect) yazılmaz; 6 saat üstü
// askıda kalmış soket varsayılıp kırpılır. Hata yutulur — istatistik uğruna
// kapanış akışı asla bozulmaz (çağıran zaten catch'ler, bu ikinci emniyet).
export async function recordPlaySession(userId: string, startedAtMs: number): Promise<void> {
  const rawSecs = Math.round((Date.now() - startedAtMs) / 1000);
  if (rawSecs < 5) return;
  const durationSecs = Math.min(rawSecs, 6 * 3600);
  await pool.query(
    `INSERT INTO play_sessions (user_id, started_at, duration_secs) VALUES ($1, $2, $3)`,
    [userId, new Date(startedAtMs).toISOString(), durationSecs],
  );
}

export async function getMatchHistory(userId: string): Promise<MatchHistoryEntry[]> {
  const { rows } = await pool.query<{
    id: string; player_name: string; opponent_name: string; player_score: number; opponent_score: number;
    won: boolean; player_trophies: number; opponent_trophies: number;
    game_mode: string; rounds: string; played_at: string;
  }>(
    `SELECT id, player_name, opponent_name, player_score, opponent_score, won,
             player_trophies, opponent_trophies, game_mode, rounds, played_at
        FROM match_history
       WHERE player_id = $1
       ORDER BY played_at DESC`,
    [userId],
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
