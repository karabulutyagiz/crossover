// ============================================================================
// MAÇ İÇİ ÖZEL GÜÇLER (Special Powers) — sunucu-otoriter domain modeli.
//
// DEĞİŞMEZ ANA KURAL: envanterde kaç adet olursa olsun BİR OYUNCU BİR MAÇTA
// TOPLAM 1 MANUEL ÖZEL GÜÇ KULLANABİLİR. Bu limit satın alma / premium / VIP /
// seviye ile ARTIRILAMAZ. Kupa Kalkanı ve Seri Geri Yükleme gibi meta-koruma
// eşyaları (rank.ts'teki xp2x/shield/streak/training/socialtoken) bu limitten
// AYRIDIR ve bu modüle taşınmaz.
//
// Kaynak-of-truth SUNUCUDUR: istemci yalnız arayüz çizer. Tüketim atomiktir
// (koşullu UPDATE), her işlem special_power_audit'e yazılır, aynı requestId
// ikinci kez tüketmez (idempotency maç-durumunda tutulur — bkz. room.ts).
// ============================================================================
import { pool } from '../db/pool.ts';
import { recordDiamondLedger } from './diamondLedger.ts';

export type SpecialPowerId = 'freeze' | 'reveal' | 'skip' | 'extratime' | 'secondchance';

export const SPECIAL_POWER_IDS: readonly SpecialPowerId[] = ['freeze', 'reveal', 'skip', 'extratime', 'secondchance'];

export function isSpecialPowerId(v: unknown): v is SpecialPowerId {
  return typeof v === 'string' && (SPECIAL_POWER_IDS as readonly string[]).includes(v);
}

export type SpecialPowerRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface SpecialPowerDef {
  id: SpecialPowerId;
  rarity: SpecialPowerRarity;
  /** 💎 mağaza fiyatı (tekli). Env ile ezilebilir — istemciye kataloğla gider, hardcode edilmez. */
  price: number;
}

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
}

// ---- REMOTE BALANCE CONFIG ----------------------------------------------
// Tüm denge değerleri env'den ezilebilir (release beklemeden ayar). İstemciye
// maç başında special_power_state.config ile gönderilir — istemci hiçbir
// süreyi hardcode etmez.
export function specialPowersConfig(): {
  enabled: boolean;
  rolloutPct: number;
  freezeMs: number;
  extraTimeMs: number;
  botUseProbability: number;
  prices: Record<SpecialPowerId, number>;
} {
  return {
    // Kill switch + yüzdeli güvenli rollout (stableRolloutBucket ile maç başında uygulanır).
    enabled: process.env.SPECIAL_POWERS_ENABLED !== '0',
    rolloutPct: Math.min(100, Math.max(0, Number(process.env.SPECIAL_POWERS_ROLLOUT_PCT ?? '100') || 0)),
    // Freeze: rakip girişi bu kadar kilitli — TUR SAYACI DURMAZ (rekabet avantajı buradan).
    freezeMs: intEnv('SPECIAL_POWER_FREEZE_MS', 4000),
    // Extra Time: yalnız kullanan oyuncunun kendi son teslim anı bu kadar uzar.
    extraTimeMs: intEnv('SPECIAL_POWER_EXTRATIME_MS', 7000),
    // Botun bir maçta güç kullanmayı PLANLAMA olasılığı (doğal an bulamazsa hiç kullanmaz).
    botUseProbability: Math.min(1, Math.max(0, Number(process.env.SPECIAL_POWER_BOT_USE_PROB ?? '0.38') || 0)),
    prices: {
      extratime: intEnv('SPECIAL_POWER_PRICE_EXTRATIME', 200),
      secondchance: intEnv('SPECIAL_POWER_PRICE_SECONDCHANCE', 300),
      skip: intEnv('SPECIAL_POWER_PRICE_SKIP', 350),
      freeze: intEnv('SPECIAL_POWER_PRICE_FREEZE', 400),
      reveal: intEnv('SPECIAL_POWER_PRICE_REVEAL', 600),
    },
  };
}

export function specialPowerCatalog(): SpecialPowerDef[] {
  const cfg = specialPowersConfig();
  const rarity: Record<SpecialPowerId, SpecialPowerRarity> = {
    extratime: 'common',
    secondchance: 'rare',
    skip: 'epic',
    freeze: 'epic',
    reveal: 'legendary',
  };
  return SPECIAL_POWER_IDS.map((id) => ({ id, rarity: rarity[id], price: cfg.prices[id] }));
}

const COLUMN: Record<SpecialPowerId, string> = {
  freeze: 'sp_freeze',
  reveal: 'sp_reveal',
  skip: 'sp_skip',
  extratime: 'sp_extratime',
  secondchance: 'sp_secondchance',
};

export interface SpecialPowerInventory {
  freeze: number;
  reveal: number;
  skip: number;
  extratime: number;
  secondchance: number;
  equipped: SpecialPowerId | null;
}

export function inventoryFromRow(row: Record<string, unknown>): SpecialPowerInventory {
  const eq = row.equipped_special_power;
  return {
    freeze: Number(row.sp_freeze ?? 0),
    reveal: Number(row.sp_reveal ?? 0),
    skip: Number(row.sp_skip ?? 0),
    extratime: Number(row.sp_extratime ?? 0),
    secondchance: Number(row.sp_secondchance ?? 0),
    equipped: isSpecialPowerId(eq) ? eq : null,
  };
}

export async function getSpecialPowerInventory(userId: string): Promise<SpecialPowerInventory | null> {
  const { rows } = await pool.query(
    `SELECT sp_freeze, sp_reveal, sp_skip, sp_extratime, sp_secondchance, equipped_special_power FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0] ? inventoryFromRow(rows[0]) : null;
}

/** Maça girerken kuşanılacak güç: kuşanılmış ve stokta varsa o; yoksa en çok
 * sahip olunan güç (sahiplik varsa oyuncu asla butonsuz kalmaz). */
export function snapshotEquipped(inv: SpecialPowerInventory): { powerId: SpecialPowerId; qty: number } | null {
  if (inv.equipped && inv[inv.equipped] > 0) return { powerId: inv.equipped, qty: inv[inv.equipped] };
  let best: SpecialPowerId | null = null;
  for (const id of SPECIAL_POWER_IDS) {
    if (inv[id] > 0 && (best == null || inv[id] > inv[best])) best = id;
  }
  return best ? { powerId: best, qty: inv[best] } : null;
}

/** ATOMİK tüketim: koşullu UPDATE — stok yoksa hiçbir şey değişmez. Başarıda
 * audit satırı yazılır (best-effort; audit hatası tüketimi geri almaz, loglanır). */
export async function consumeSpecialPower(args: {
  userId: string;
  powerId: SpecialPowerId;
  matchId: string;
  roundNumber: number;
  requestId: string;
}): Promise<{ ok: true; remaining: number } | { ok: false; error: 'no_inventory' }> {
  const col = COLUMN[args.powerId];
  const { rows } = await pool.query<{ remaining: number; before_qty: number }>(
    `UPDATE users SET ${col} = ${col} - 1
      WHERE id = $1 AND ${col} > 0
      RETURNING ${col} AS remaining, ${col} + 1 AS before_qty`,
    [args.userId],
  );
  if (!rows[0]) return { ok: false, error: 'no_inventory' };
  const remaining = Number(rows[0].remaining);
  void auditSpecialPower({
    userId: args.userId, matchId: args.matchId, roundNumber: args.roundNumber,
    powerId: args.powerId, action: 'consume', beforeQty: remaining + 1, afterQty: remaining,
    requestId: args.requestId, result: 'ok',
  });
  return { ok: true, remaining };
}

/** Mağaza satın alma: elmas düşümü + envanter artışı TEK atomik UPDATE. */
export async function buySpecialPower(
  userId: string,
  powerId: SpecialPowerId,
  qty = 1,
): Promise<{ ok: true } | { ok: false; error: string; shortfall?: number }> {
  if (!userId) return { ok: false, error: 'Önce giriş yap' };
  const n = Math.max(1, Math.min(10, Math.round(qty)));
  const price = specialPowersConfig().prices[powerId] * n;
  const col = COLUMN[powerId];
  const { rows } = await pool.query<{ after_qty: number; diamonds: number }>(
    `UPDATE users SET diamonds = diamonds - $2, ${col} = ${col} + $3
      WHERE id = $1 AND diamonds >= $2
      RETURNING ${col} AS after_qty, diamonds`,
    [userId, price, n],
  );
  if (!rows[0]) {
    const { rows: bal } = await pool.query<{ diamonds: number }>(`SELECT diamonds FROM users WHERE id = $1`, [userId]);
    const have = Number(bal[0]?.diamonds ?? 0);
    return { ok: false, error: `Yetersiz elmas (${have}/${price})`, shortfall: Math.max(0, price - have) };
  }
  void auditSpecialPower({
    userId, matchId: null, roundNumber: null, powerId, action: 'purchase',
    beforeQty: Number(rows[0].after_qty) - n, afterQty: Number(rows[0].after_qty),
    requestId: null, result: 'ok', metadata: { qty: n, price },
  });
  void recordDiamondLedger({
    userId, amount: -price, balanceAfter: Number(rows[0].diamonds),
    reason: 'SPECIAL_POWER_PURCHASE', referenceId: powerId, metadata: { qty: n },
  });
  return { ok: true };
}

/** Ödül/hediye artışı (seri kilometre taşı, sandık...): atomik, audit'li. */
export async function grantSpecialPower(userId: string, powerId: SpecialPowerId, qty: number, reason: string): Promise<void> {
  const col = COLUMN[powerId];
  const n = Math.max(1, Math.round(qty));
  const { rows } = await pool.query<{ after_qty: number }>(
    `UPDATE users SET ${col} = ${col} + $2 WHERE id = $1 RETURNING ${col} AS after_qty`,
    [userId, n],
  );
  if (rows[0]) {
    void auditSpecialPower({
      userId, matchId: null, roundNumber: null, powerId, action: 'grant',
      beforeQty: Number(rows[0].after_qty) - n, afterQty: Number(rows[0].after_qty),
      requestId: null, result: 'ok', metadata: { reason },
    });
  }
}

export async function equipSpecialPower(userId: string, powerId: SpecialPowerId | null): Promise<boolean> {
  const res = await pool.query(
    `UPDATE users SET equipped_special_power = $2 WHERE id = $1`,
    [userId, powerId],
  );
  return (res.rowCount ?? 0) > 0;
}

async function auditSpecialPower(args: {
  userId: string; matchId: string | null; roundNumber: number | null;
  powerId: SpecialPowerId; action: 'consume' | 'purchase' | 'grant';
  beforeQty: number; afterQty: number; requestId: string | null;
  result: string; metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO special_power_audit (user_id, match_id, round_number, power_id, action, before_qty, after_qty, request_id, result, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [args.userId, args.matchId, args.roundNumber, args.powerId, args.action, args.beforeQty, args.afterQty, args.requestId, args.result, JSON.stringify(args.metadata ?? {})],
    );
  } catch (err) {
    // Audit best-effort — tablo yoksa (eski DB) sessiz geç, başka hatayı logla.
    if ((err as { code?: string }).code !== '42P01') {
      console.error('[special_power_audit] failed:', err instanceof Error ? err.message : err);
    }
  }
}

// ---- GALİBİYET SERİSİ KİLOMETRE TAŞLARI ----------------------------------
// Mevcut win_streak sistemi KORUNUR (rank.ts yazar) — bu tablo yalnız seriye
// ödül bağlar. Ödül, seri TAM o değere ulaştığı anda bir kez verilir (seri
// aynı koşuda bir değeri iki kez göremez → doğal idempotency).
export interface StreakMilestone {
  streak: number;
  diamonds?: number;
  powerId?: SpecialPowerId;
  powerQty?: number;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { streak: 3, diamonds: 30 },
  { streak: 5, diamonds: 60 },
  { streak: 7, powerId: 'freeze', powerQty: 1 },
  { streak: 10, diamonds: 120 },
  { streak: 15, powerId: 'reveal', powerQty: 1 },
  { streak: 20, diamonds: 300 },
];

export function milestoneFor(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.streak === streak) ?? null;
}

export function nextMilestoneAfter(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.streak > streak) ?? null;
}
