// UI2 ürün verisi — GERÇEK ürünlerimiz (sunucu iap.ts + ASC ile birebir). Mock'taki
// sahte adet/fiyatlar kullanılmaz; fiyat StoreKit'ten (displayPrice) gelir, burası yedek.
import type { MessageKey } from '../i18n';
import { UI2 } from './assets';

export const COPASS_PRODUCT_ID = 'com.crossover.copass';
export const DIAMOND_PACKS = [
  { id: 'pack1', amount: 100,   fallback: '₺29,99',   productId: 'com.crossover.diamonds.100',   art: UI2.gem_80,   artW: 1.0, ribbon: null as null | { labelKey: MessageKey; color: 'red' | 'gold' } },
  { id: 'pack2', amount: 500,   fallback: '₺79,99',   productId: 'com.crossover.diamonds.500',   art: UI2.gem_250,  artW: 1.0, ribbon: null },
  { id: 'pack3', amount: 1200,  fallback: '₺149,99',  productId: 'com.crossover.diamonds.1200',  art: UI2.gem_650,  artW: 1.0, ribbon: { labelKey: 'store.popular' as MessageKey, color: 'red' as const } },
  { id: 'pack4', amount: 5000,  fallback: '₺449,99',  productId: 'com.crossover.diamonds.5000',  art: UI2.gem_1400, artW: 1.06, ribbon: { labelKey: 'ui2.bestValue' as MessageKey, color: 'red' as const } },
  { id: 'pack5', amount: 15000, fallback: '₺999,99',  productId: 'com.crossover.diamonds.15000', art: UI2.gem_1400, artW: 1.12, ribbon: null },
  { id: 'pack6', amount: 50000, fallback: '₺2.499,99', productId: 'com.crossover.diamonds.50000', art: UI2.gem_1400, artW: 1.18, ribbon: null },
] as const;
export const DIAMOND_PRODUCT_IDS: string[] = DIAMOND_PACKS.map((p) => p.productId);
export const SOCIAL_PACK = [
  { id: 'weekly', labelKey: 'store.weekly' as MessageKey, fallback: '₺39,99', productId: 'com.crossover.socialpack.weekly' },
  { id: 'monthly', labelKey: 'store.monthly' as MessageKey, fallback: '₺79,99', productId: 'com.crossover.socialpack.monthly' },
] as const;
export const SOCIAL_PACK_IDS: string[] = SOCIAL_PACK.map((s) => s.productId);
export const PREMIUM_ROAD_PRICE = 2000; // CO PASS — elmasla (sunucu buy_premium_road)
export const LEVEL_CAP = 50;
// Sosyal Paket gerektiren modlar (screens.tsx PACK_MODES ile birebir).
export const PACK_MODES: string[] = ['country-team', 'letter-team', 'xox', 'cozkazan', 'guess-who'];

export type PowerId = 'xp2x' | 'shield' | 'streak' | 'training';
// Fiyatlar sunucudaki POWER_PRICES ile birebir (screens.tsx'teki eski tabloyla aynı kaynak).
export const ACCOUNT_POWERS: { id: PowerId; titleKey: MessageKey; descKey: MessageKey; price: number; art: keyof typeof UI2; face: string; lip: string; top: string }[] = [
  { id: 'xp2x', titleKey: 'ui2.pw.xp', descKey: 'ui2.pw.xpDesc', price: 150, art: 'pw_xp', face: '#8E2BEA', lip: '#4B0F9E', top: '#C58BFF' },
  { id: 'shield', titleKey: 'ui2.pw.shield', descKey: 'ui2.pw.shieldDesc', price: 250, art: 'pw_shield', face: '#1E7BFF', lip: '#0E4FB8', top: '#7DB8FF' },
  { id: 'streak', titleKey: 'ui2.pw.streak', descKey: 'ui2.pw.streakDesc', price: 300, art: 'pw_streak', face: '#FF7A1A', lip: '#C24E00', top: '#FFB472' },
  { id: 'training', titleKey: 'ui2.pw.training', descKey: 'ui2.pw.trainingDesc', price: 250, art: 'pw_training', face: '#22C55E', lip: '#15803D', top: '#86EFAC' },
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
