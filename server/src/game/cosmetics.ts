import { pool } from '../db/pool.ts';
import { specialPowerCatalog } from './specialPowers.ts';
import type { UserProfile } from './rank.ts';

export type CosmeticType = 'frame' | 'name_effect' | 'match_background' | 'ball' | 'intro' | 'victory_effect' | 'answer_effect' | 'avatar' | 'emote';
export type CosmeticRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  rarity: CosmeticRarity;
  diamondPrice: number;
  isLimited?: boolean;
  availableFrom?: string;
  availableUntil?: string;
}

export interface CosmeticLoadout {
  frameId: string | null;
  avatarId: string | null;
  nameEffectId: string | null;
  matchBackgroundId: string | null;
  ballId: string | null;
  introId: string | null;
  victoryEffectId: string | null;
  answerEffectId: string | null;
  emoteIds: string[];
}

export interface StoreCatalogView {
  version: number;
  serverTime: string;
  dailyResetAt: string;
  weeklyResetAt: string;
  items: CosmeticItem[];
  featured: string[];
  // Maç içi Özel Güç fiyat/rarity kataloğu — istemci fiyat hardcode etmez.
  specialPowers?: { id: string; rarity: string; price: number }[];
  /** KASA (2026-08-27): bu haftanın limitli mythic düşüşü. Mythic'ler YALNIZ
   * kasadan çıktıkları hafta satın alınabilir (buyCosmetic sunucuda uygular). */
  vaultItemId?: string;
  /** Kasa ürününün vitrinden kalkacağı an (haftalık reset) — istemci geri sayımı. */
  vaultUntil?: string;
  /** Bu kullanıcı ilk elmas paketinde 2x hakkını henüz kullanmadı (ws katmanı doldurur). */
  firstDiamondDoubleAvailable?: boolean;
}

export const STORE_CATALOG_VERSION = 1;
const DEFAULT_BALL = 'classic_ball';

export const COSMETIC_ITEMS: readonly CosmeticItem[] = [
  { id: 'fire_frame', type: 'frame', name: 'Fire Frame', description: 'Alevli kırmızı prestij çerçevesi.', rarity: 'epic', diamondPrice: 450 },
  { id: 'ice_frame', type: 'frame', name: 'Ice Frame', description: 'Soğuk mavi buz halkası.', rarity: 'rare', diamondPrice: 350 },
  { id: 'champions_frame', type: 'frame', name: 'Champions Frame', description: 'Şampiyonlar sahnesi için altın-mavi çerçeve.', rarity: 'legendary', diamondPrice: 800 },
  { id: 'golden_frame', type: 'frame', name: 'Golden Frame', description: 'Temiz altın profil çerçevesi.', rarity: 'epic', diamondPrice: 550 },
  { id: 'neon_frame', type: 'frame', name: 'Neon Frame', description: 'Gece modunda parlayan neon çerçeve.', rarity: 'legendary', diamondPrice: 750 },
  { id: 'goat_frame', type: 'frame', name: 'GOAT Frame', description: 'En üst seviye keçi tacı çerçevesi.', rarity: 'mythic', diamondPrice: 1400 },

  { id: 'gold_name', type: 'name_effect', name: 'Gold Name', description: 'Kullanıcı adında okunaklı altın vurgu.', rarity: 'rare', diamondPrice: 300 },
  { id: 'fire_name', type: 'name_effect', name: 'Fire Name', description: 'Alev renkli isim parıltısı.', rarity: 'epic', diamondPrice: 500 },
  { id: 'ice_name', type: 'name_effect', name: 'Ice Name', description: 'Buz mavisi isim efekti.', rarity: 'rare', diamondPrice: 350 },
  { id: 'neon_name', type: 'name_effect', name: 'Neon Name', description: 'Neon yeşil okunaklı glow.', rarity: 'epic', diamondPrice: 550 },
  { id: 'champion_glow_name', type: 'name_effect', name: 'Champion Glow', description: 'Şampiyon kartı isim ışıltısı.', rarity: 'legendary', diamondPrice: 850 },
  { id: 'goat_name', type: 'name_effect', name: 'GOAT Animated Name', description: 'GOAT prestij isim efekti.', rarity: 'mythic', diamondPrice: 1500 },

  { id: 'champions_stadium', type: 'match_background', name: 'Champions Stadium', description: 'Şampiyonlar ışıklarıyla maç zemini.', rarity: 'legendary', diamondPrice: 900 },
  { id: 'night_stadium', type: 'match_background', name: 'Night Stadium', description: 'Gece stadyumu atmosferi.', rarity: 'rare', diamondPrice: 400 },
  { id: 'fire_arena', type: 'match_background', name: 'Fire Arena', description: 'Alevli arena sunumu.', rarity: 'epic', diamondPrice: 650 },
  { id: 'neon_pitch', type: 'match_background', name: 'Neon Pitch', description: 'Neon çizgili modern saha.', rarity: 'epic', diamondPrice: 650 },
  { id: 'golden_stadium', type: 'match_background', name: 'Golden Stadium', description: 'Altın tribün sunumu.', rarity: 'legendary', diamondPrice: 1000 },
  { id: 'goat_arena', type: 'match_background', name: 'GOAT Arena', description: 'GOAT seviyesi özel maç arka planı.', rarity: 'mythic', diamondPrice: 1800 },

  { id: DEFAULT_BALL, type: 'ball', name: 'Classic', description: 'Varsayılan COF topu.', rarity: 'common', diamondPrice: 0 },
  { id: 'golden_ball', type: 'ball', name: 'Golden Ball', description: 'Altın top kaplaması.', rarity: 'rare', diamondPrice: 300 },
  { id: 'fire_ball', type: 'ball', name: 'Fire Ball', description: 'Alevli top sunumu.', rarity: 'epic', diamondPrice: 500 },
  { id: 'champions_ball', type: 'ball', name: 'Champions Ball', description: 'Şampiyonlar temalı top.', rarity: 'legendary', diamondPrice: 800 },
  { id: 'neon_ball', type: 'ball', name: 'Neon Ball', description: 'Neon çizgili top.', rarity: 'epic', diamondPrice: 550 },
  { id: 'goat_ball', type: 'ball', name: 'GOAT Ball', description: 'GOAT prestij topu.', rarity: 'mythic', diamondPrice: 1200 },

  { id: 'fire_entrance', type: 'intro', name: 'Fire Entrance', description: 'VS ekranına alevli giriş.', rarity: 'epic', diamondPrice: 600 },
  { id: 'lightning_entrance', type: 'intro', name: 'Lightning Entrance', description: 'Hızlı yıldırım intro efekti.', rarity: 'epic', diamondPrice: 650 },
  { id: 'stadium_lights_intro', type: 'intro', name: 'Stadium Lights', description: 'Projektörlü maç girişi.', rarity: 'rare', diamondPrice: 450 },
  { id: 'champion_entrance', type: 'intro', name: 'Champion Entrance', description: 'Şampiyonlar seremonisi.', rarity: 'legendary', diamondPrice: 950 },
  { id: 'goat_entrance', type: 'intro', name: 'GOAT Entrance', description: 'GOAT seviyesi giriş sunumu.', rarity: 'mythic', diamondPrice: 1600 },

  { id: 'fire_victory', type: 'victory_effect', name: 'Fire Victory', description: 'Galibiyette alevli kutlama.', rarity: 'epic', diamondPrice: 700 },
  { id: 'lightning_victory', type: 'victory_effect', name: 'Lightning Victory', description: 'Galibiyette yıldırım patlaması.', rarity: 'epic', diamondPrice: 750 },
  { id: 'golden_champion_victory', type: 'victory_effect', name: 'Golden Champion', description: 'Altın konfeti galibiyet efekti.', rarity: 'legendary', diamondPrice: 1100 },
  { id: 'stadium_celebration', type: 'victory_effect', name: 'Stadium Celebration', description: 'Tribün kutlamalı zafer.', rarity: 'legendary', diamondPrice: 1000 },
  { id: 'goat_celebration', type: 'victory_effect', name: 'GOAT Celebration', description: 'GOAT prestij zafer efekti.', rarity: 'mythic', diamondPrice: 1900 },

  { id: 'lightning_shot', type: 'answer_effect', name: 'Lightning Shot', description: 'Cevap gönderiminde yıldırım izi.', rarity: 'epic', diamondPrice: 500 },
  { id: 'fire_shot', type: 'answer_effect', name: 'Fire Ball Shot', description: 'Cevap gönderiminde alevli top.', rarity: 'epic', diamondPrice: 500 },
  { id: 'champions_flash', type: 'answer_effect', name: 'Champions Flash', description: 'Kısa stadyum flaşı.', rarity: 'legendary', diamondPrice: 800 },
  { id: 'ice_shot', type: 'answer_effect', name: 'Ice Shot', description: 'Buz parçacıklı cevap efekti.', rarity: 'rare', diamondPrice: 350 },
];

const BY_ID = new Map(COSMETIC_ITEMS.map((item) => [item.id, item]));
const EQUIP_COLUMN: Record<Exclude<CosmeticType, 'avatar' | 'emote'>, string> = {
  frame: 'equipped_frame_id',
  name_effect: 'equipped_name_effect_id',
  match_background: 'equipped_match_background_id',
  ball: 'equipped_ball_id',
  intro: 'equipped_intro_id',
  victory_effect: 'equipped_victory_effect_id',
  answer_effect: 'equipped_answer_effect_id',
};

export function cosmeticItem(id: string): CosmeticItem | null {
  return BY_ID.get(id) ?? null;
}

export function isFreeDefaultCosmetic(item: CosmeticItem): boolean {
  return item.diamondPrice === 0;
}

// HAFTALIK vitrin (2026-08-26: "daily shop değil weekly shop"): seçki haftada
// bir, Pazartesi 00:00 UTC'de döner. Epoch günü 0 Perşembe olduğundan +3
// kaydırma hafta sınırlarını Pazartesi'ye oturtur — istemcideki sayaç da
// Pazartesi'ye sayar, ikisi aynı anda sıfırlanır.
export function storeWeek(now = new Date()): { weekIndex: number; resetAt: Date } {
  const epochDay = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000);
  // PERŞEMBE çapası (kullanıcı kararı 2026-08-27): beyaz-listeli vitrin o gün
  // yayına girdi — hafta TAM 7 gün sürer, sayaç ilk günden 7'den geri sayar.
  // (Epoch günü 0 zaten Perşembe; ofset yok.) Eski Pazartesi çapası (+3),
  // vitrini yarı haftayla açtırıyordu ("süre 7 gün değil" şikâyeti).
  const weekIndex = Math.floor(epochDay / 7);
  return { weekIndex, resetAt: new Date((weekIndex + 1) * 7 * 86_400_000) };
}

// ══════════════════════════════════════════════════════════════════════════
// KESİN KURAL (kullanıcı, 2026-08-27): mağazaya YALNIZ kullanıcının ÇİZDİRDİĞİ
// asset'e sahip ürünler girer. Prosedürel/çizimsiz ürün satışa ASLA çıkmaz.
// Bu BEYAZ LİSTEDİR — yeni ürün, asset'i app/assets'e girip buraya eklenmeden
// vitrine/fırsata/satışa giremez. Katalogdan silinmezler (eski sahipler kuşanır);
// satış yüzeylerinin ÜÇÜ de buna bağlı: vitrin + Günlük Fırsat + buyCosmetic.
// (VAULT_POOL bu listeyi kullandığı için liste ondan ÖNCE tanımlı kalmalı.)
// ══════════════════════════════════════════════════════════════════════════
const SELLABLE_COSMETICS = new Set([
  'ice_frame', 'goat_frame',
  'fire_name', 'ice_name',
  'neon_pitch', 'night_stadium', 'goat_arena',
  'goat_ball', 'champions_ball',
  // Efekt üçlüsü (kullanıcı onayı 2026-08-27: 'lightningleri de koy —
  // yaptığımız o vitrin'): gerçek sahneli animasyon efektleri.
  'lightning_entrance', 'lightning_victory', 'stadium_celebration',
]);

/**
 * KASA (2026-08-27): mythic ürünler kalıcı vitrinin parçası DEĞİL — yalnız
 * kasadan çıktıkları hafta satın alınabilirler. Rotasyon YALNIZ beyaz listedeki
 * (çizimli) mythic'leri döner — çizimsiz goat serisi satış yüzeyine hiç çıkmaz.
 */
const VAULT_POOL = COSMETIC_ITEMS.filter((item) => item.rarity === 'mythic' && SELLABLE_COSMETICS.has(item.id));

export function vaultItemOfWeek(now = new Date()): CosmeticItem {
  const { weekIndex } = storeWeek(now);
  return VAULT_POOL[weekIndex % VAULT_POOL.length]!;
}

export function isVaultCosmetic(item: CosmeticItem): boolean {
  return item.rarity === 'mythic';
}

/**
 * Bu haftanın vitrini — mağazada FİİLEN satılan kozmetikler.
 * TEK KAYNAK: Günlük Fırsat da buradan seçer. Vitrin dışından bir ürün
 * "fırsat" diye gösterilirse kullanıcı mağazada bulamıyor (Altın Çerçeve
 * şikâyeti, 2026-08-27) — bu yüzden havuz burada tanımlıdır, çoğaltılmaz.
 * Slot 0 = haftanın kasa düşüşü (mythic); kalan 7 slot mythic-dışı havuzdan.
 */
export function featuredCosmetics(now = new Date()): CosmeticItem[] {
  // KULLANICI EMRİ (2026-08-27, ACİL): vitrin = çizdirilen 9 ürünün TAMAMI,
  // her hafta, rotasyonsuz ve kasa beklemesiz — GOAT serisi dahil hepsi görünür
  // ve satın alınabilir. Hafta yalnız SAYAÇ içindir (7 gün, Perşembe çapası).
  return COSMETIC_ITEMS.filter((item) => item.diamondPrice > 0 && SELLABLE_COSMETICS.has(item.id));
}

export function storeCatalog(now = new Date()): StoreCatalogView {
  const dailyResetAt = nextUtcBoundary(now, 1);
  const weeklyResetAt = storeWeek(now).resetAt;
  const featured = featuredCosmetics(now).map((item) => item.id);
  // Özel Güç fiyatları da katalogla gider — istemci fiyat hardcode etmez (spec §73).
  return {
    version: STORE_CATALOG_VERSION,
    serverTime: now.toISOString(),
    dailyResetAt: dailyResetAt.toISOString(),
    weeklyResetAt: weeklyResetAt.toISOString(),
    items: [...COSMETIC_ITEMS],
    featured,
    specialPowers: specialPowerCatalog().map((d) => ({ id: d.id, rarity: d.rarity, price: d.price })),
    vaultItemId: vaultItemOfWeek(now).id,
    vaultUntil: weeklyResetAt.toISOString(),
  };
}

function nextUtcBoundary(now: Date, days: number): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = Math.floor(d.getTime() / 86_400_000);
  const next = Math.floor(day / days) * days + days;
  return new Date(next * 86_400_000);
}

export function toCosmeticLoadout(profile: Pick<UserProfile, 'avatar' | 'selectedFrame' | 'equippedEmotes'> & Partial<Record<'ownedCosmetics' | 'equippedNameEffectId' | 'equippedMatchBackgroundId' | 'equippedBallId' | 'equippedIntroId' | 'equippedVictoryEffectId' | 'equippedAnswerEffectId', any>>): CosmeticLoadout {
  return {
    frameId: typeof profile.selectedFrame === 'string' ? profile.selectedFrame : null,
    avatarId: typeof profile.avatar === 'string' ? profile.avatar : null,
    nameEffectId: typeof profile.equippedNameEffectId === 'string' ? profile.equippedNameEffectId : null,
    matchBackgroundId: typeof profile.equippedMatchBackgroundId === 'string' ? profile.equippedMatchBackgroundId : null,
    ballId: typeof profile.equippedBallId === 'string' ? profile.equippedBallId : DEFAULT_BALL,
    introId: typeof profile.equippedIntroId === 'string' ? profile.equippedIntroId : null,
    victoryEffectId: typeof profile.equippedVictoryEffectId === 'string' ? profile.equippedVictoryEffectId : null,
    answerEffectId: typeof profile.equippedAnswerEffectId === 'string' ? profile.equippedAnswerEffectId : null,
    emoteIds: Array.isArray(profile.equippedEmotes) ? profile.equippedEmotes : [],
  };
}

export function canOwnCosmetic(profile: UserProfile, item: CosmeticItem): boolean {
  return isFreeDefaultCosmetic(item) || profile.ownedCosmetics.includes(item.id);
}

export async function buyCosmetic(
  userId: string,
  itemId: string,
  idempotencyKey?: string,
): Promise<{ ok: true; profile: UserProfile; item: CosmeticItem; alreadyOwned?: boolean } | { ok: false; error: string; shortfall?: number; price?: number }> {
  const item = cosmeticItem(itemId);
  if (!item || item.type === 'avatar' || item.type === 'emote') return { ok: false, error: 'Geçersiz ürün' };
  if (item.diamondPrice < 0) return { ok: false, error: 'Geçersiz fiyat' };
  if (item.diamondPrice === 0) return { ok: false, error: 'Bu ürün ücretsiz' };
  // BEYAZ LİSTE SATIN ALMADA DA uygulanır — kural yalnız vitrinde kalırsa
  // modifiye istemci çizimsiz ürünü yine satın alabilirdi.
  if (!SELLABLE_COSMETICS.has(item.id)) {
    return { ok: false, error: 'Bu ürün şu an satışta değil' };
  }
  // Kasa kuralı KALDIRILDI (kullanıcı emri 2026-08-27): beyaz listedeki her ürün
  // her zaman satın alınabilir — GOAT serisi kasa haftası beklemez.
  const key = idempotencyKey || `cosmetic:${userId}:${itemId}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query<any>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const row = locked.rows[0];
    if (!row) { await client.query('ROLLBACK'); return { ok: false, error: 'Kullanıcı bulunamadı' }; }
    if ((row.owned_cosmetics ?? []).includes(item.id)) {
      await client.query('COMMIT');
      const fresh = await import('./rank.ts').then((m) => m.getUser(userId));
      if (!fresh) return { ok: false, error: 'Kullanıcı bulunamadı' };
      return { ok: true, profile: fresh, item, alreadyOwned: true };
    }
    if (Number(row.diamonds) < item.diamondPrice) {
      await client.query('ROLLBACK');
      return { ok: false, error: `Yetersiz elmas (${row.diamonds}/${item.diamondPrice})`, shortfall: item.diamondPrice - Number(row.diamonds), price: item.diamondPrice };
    }
    const nextBalance = Number(row.diamonds) - item.diamondPrice;
    await client.query<any>(
      `UPDATE users
          SET diamonds = $2,
              owned_cosmetics = array_append(COALESCE(owned_cosmetics, '{}'), $3)
        WHERE id = $1
        RETURNING *`,
      [userId, nextBalance, item.id],
    );
    await client.query(
      `INSERT INTO diamond_ledger (idempotency_key, user_id, amount, balance_before, balance_after, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5, 'COSMETIC_PURCHASE', $6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [key, userId, -item.diamondPrice, Number(row.diamonds), nextBalance, item.id],
    );
    await client.query('COMMIT');
    const fresh = await import('./rank.ts').then((m) => m.getUser(userId));
    if (!fresh) return { ok: false, error: 'Kullanıcı bulunamadı' };
    return { ok: true, profile: fresh, item };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function equipCosmetic(
  userId: string,
  itemId: string | null,
  type: Exclude<CosmeticType, 'avatar' | 'emote'>,
): Promise<{ ok: true; profile: UserProfile } | { ok: false; error: string }> {
  const col = EQUIP_COLUMN[type];
  if (!col) return { ok: false, error: 'Geçersiz kategori' };
  // classic_ball katalog ürünü değil, varsayılanın kendisi: eski istemciler top
  // çıkarırken bunu gönderiyor — null say, yoksa "Geçersiz ürün"e takılır.
  if (type === 'ball' && itemId === DEFAULT_BALL) itemId = null;
  const user = await import('./rank.ts').then((m) => m.getUser(userId));
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı' };
  if (itemId !== null) {
    const item = cosmeticItem(itemId);
    if (!item || item.type !== type) return { ok: false, error: 'Geçersiz ürün' };
    if (!canOwnCosmetic(user, item)) return { ok: false, error: 'Önce bu ürünü satın al' };
  }
  // Çerçevede İKİ sütun birden yazılır: profil görünümü equipped_frame_id'yi,
  // liderlik tablosu selected_frame'i okur — tek sütun yazmak ikisini
  // birbirinden koparıyordu (mağaza çerçevesi profilde var, tabloda yok).
  // setSelectedFrame (seviye çerçeveleri) zaten ikisini birden yazıyor.
  const setClause = type === 'frame' ? `${col} = $2, selected_frame = $2` : `${col} = $2`;
  const { rows } = await pool.query<any>(`UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`, [userId, itemId]);
  if (!rows[0]) return { ok: false, error: 'Kullanıcı bulunamadı' };
  const fresh = await import('./rank.ts').then((m) => m.getUser(userId));
  if (!fresh) return { ok: false, error: 'Kullanıcı bulunamadı' };
  return { ok: true, profile: fresh };
}
