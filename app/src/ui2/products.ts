// UI2 ürün verisi — GERÇEK ürünlerimiz (sunucu iap.ts + ASC ile birebir). Mock'taki
// sahte adet/fiyatlar kullanılmaz; fiyat StoreKit'ten (displayPrice) gelir, burası yedek.
import { UI2 } from './assets';

export const COPASS_PRODUCT_ID = 'com.crossover.copass';
export const DIAMOND_PACKS = [
  { id: 'pack1', amount: 100,   fallback: '₺29,99',   productId: 'com.crossover.diamonds.100',   art: UI2.gem_80,   artW: 1.0, ribbon: null as null | { label: string; color: 'red' | 'gold' } },
  { id: 'pack2', amount: 500,   fallback: '₺79,99',   productId: 'com.crossover.diamonds.500',   art: UI2.gem_250,  artW: 1.0, ribbon: null },
  { id: 'pack3', amount: 1200,  fallback: '₺149,99',  productId: 'com.crossover.diamonds.1200',  art: UI2.gem_650,  artW: 1.0, ribbon: { label: 'EN POPÜLER', color: 'red' as const } },
  { id: 'pack4', amount: 5000,  fallback: '₺449,99',  productId: 'com.crossover.diamonds.5000',  art: UI2.gem_1400, artW: 1.06, ribbon: { label: 'EN AVANTAJLI', color: 'red' as const } },
  { id: 'pack5', amount: 15000, fallback: '₺999,99',  productId: 'com.crossover.diamonds.15000', art: UI2.gem_1400, artW: 1.12, ribbon: null },
  { id: 'pack6', amount: 50000, fallback: '₺2.499,99', productId: 'com.crossover.diamonds.50000', art: UI2.gem_1400, artW: 1.18, ribbon: null },
] as const;
export const DIAMOND_PRODUCT_IDS: string[] = DIAMOND_PACKS.map((p) => p.productId);
export const SOCIAL_PACK = [
  { id: 'weekly', labelKey: 'Haftalık', fallback: '₺39,99', productId: 'com.crossover.socialpack.weekly' },
  { id: 'monthly', labelKey: 'Aylık', fallback: '₺79,99', productId: 'com.crossover.socialpack.monthly' },
] as const;
export const SOCIAL_PACK_IDS: string[] = SOCIAL_PACK.map((s) => s.productId);
export const PREMIUM_ROAD_PRICE = 2000; // CO PASS — elmasla (sunucu buy_premium_road)
export const LEVEL_CAP = 50;
// Sosyal Paket gerektiren modlar (screens.tsx PACK_MODES ile birebir).
export const PACK_MODES: string[] = ['country-team', 'letter-team', 'xox', 'cozkazan', 'guess-who'];

export type PowerId = 'xp2x' | 'shield' | 'streak' | 'training';
// Fiyatlar sunucudaki POWER_PRICES ile birebir (screens.tsx'teki eski tabloyla aynı kaynak).
export const ACCOUNT_POWERS: { id: PowerId; title: string; desc: string; price: number; art: keyof typeof UI2; face: string; lip: string; top: string }[] = [
  { id: 'xp2x', title: '2X XP', desc: 'BİR MAÇ BOYUNCA\n2X XP', price: 150, art: 'pw_xp', face: '#8E2BEA', lip: '#4B0F9E', top: '#C58BFF' },
  { id: 'shield', title: 'KALKAN', desc: 'SONRAKİ KAYIPTA\nKUPA KORUMASI', price: 250, art: 'pw_shield', face: '#1E7BFF', lip: '#0E4FB8', top: '#7DB8FF' },
  { id: 'streak', title: 'SERİ', desc: 'KIRILAN SERİYİ\nGERİ YÜKLE', price: 300, art: 'pw_streak', face: '#FF7A1A', lip: '#C24E00', top: '#FFB472' },
  { id: 'training', title: 'ANTRENMAN', desc: 'ANTRENMAN\nBİLETİ', price: 250, art: 'pw_training', face: '#22C55E', lip: '#15803D', top: '#86EFAC' },
];

// Arena eşikleri (screens.tsx ARENA_DATA ile birebir) — kupa ilerleme çubuğu için.
export const ARENA_STEPS: { name: string; min: number }[] = [
  { name: 'Mahalle Sahası', min: 0 }, { name: 'Amatör Lig', min: 200 }, { name: 'Profesyonel Lig', min: 500 },
  { name: 'Şampiyonlar Ligi', min: 1000 }, { name: 'Efsaneler Arenası', min: 2000 }, { name: 'Dünya Klasmanı', min: 3500 }, { name: 'GOAT', min: 5000 },
];
export function nextArenaMin(trophies: number): number {
  const next = ARENA_STEPS.find((a) => a.min > trophies);
  return next ? next.min : ARENA_STEPS[ARENA_STEPS.length - 1]!.min;
}
