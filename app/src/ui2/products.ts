// UI2 ürün verisi — GERÇEK ürünlerimiz (sunucu iap.ts + ASC ile birebir). Mock'taki
// sahte adet/fiyatlar kullanılmaz; fiyat StoreKit'ten (displayPrice) gelir, burası yedek.
import type { ImageSourcePropType } from 'react-native';
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
  // 'training' (Antrenman Bileti) UI2'de SATILMAZ/GÖSTERİLMEZ — kullanıcı kararı 2026-09-08 ("antrenman diye bir güç yok").
];

// ── Maç içi Özel Güçler (mağaza + koleksiyon) — sanat: kullanıcının çizdirdiği rozetler (assets/powers, eski uygulamayla aynı kimlik) ──
export type SpId = 'freeze' | 'reveal' | 'skip' | 'extratime' | 'secondchance';
export const SP_LIST: SpId[] = ['freeze', 'reveal', 'skip', 'extratime', 'secondchance'];
export const SP_ART: Record<SpId, ImageSourcePropType> = {
  freeze: require('../../assets/powers/sp-freeze.png'), reveal: require('../../assets/powers/sp-reveal.png'), skip: require('../../assets/powers/sp-skip.png'),
  extratime: require('../../assets/powers/sp-extratime.png'), secondchance: require('../../assets/powers/sp-secondchance.png'),
};
export const SP_FACE: Record<SpId, [string, string, string]> = { freeze: ['#1BA7F0', '#8CE0FF', '#0E6CA8'], reveal: ['#E8B400', '#FFE98A', '#A67900'], skip: ['#8E2BEA', '#C58BFF', '#4B0F9E'], extratime: ['#22C55E', '#86EFAC', '#15803D'], secondchance: ['#FF4B7A', '#FFA6C0', '#B01E48'] };
export const SP_PACK = 3; // sunucu specialPowers cfg.packSize: 1 alım = 3 adet, fiyat paket fiyatı

// Arena eşikleri (screens.tsx ARENA_DATA ile birebir) — kupa ilerleme çubuğu için.
export const ARENA_STEPS: { name: string; min: number }[] = [
  { name: 'Mahalle Sahası', min: 0 }, { name: 'Amatör Lig', min: 200 }, { name: 'Profesyonel Lig', min: 500 },
  { name: 'Şampiyonlar Ligi', min: 1000 }, { name: 'Efsaneler Arenası', min: 2000 }, { name: 'Dünya Klasmanı', min: 3500 }, { name: 'GOAT', min: 5000 },
];
// Arena sanatı + kupa aralığı + maç başı kupa + ulaşma ödülü (screens.tsx ARENA_DATA ile birebir; artan sıra)
export const ARENAS: { key: string; min: number; max: number; win: number; loss: number; reward: number; art: ImageSourcePropType }[] = [
  { key: 'mahalle', min: 0, max: 199, win: 30, loss: 10, reward: 50, art: require('../../assets/arenas/mahalle.png') },
  { key: 'amator', min: 200, max: 499, win: 28, loss: 14, reward: 100, art: require('../../assets/arenas/amator.png') },
  { key: 'profesyonel', min: 500, max: 999, win: 25, loss: 18, reward: 150, art: require('../../assets/arenas/profesyonel.png') },
  { key: 'sampiyonlar', min: 1000, max: 1999, win: 22, loss: 22, reward: 200, art: require('../../assets/arenas/sampiyonlar.png') },
  { key: 'efsaneler', min: 2000, max: 3499, win: 20, loss: 26, reward: 300, art: require('../../assets/arenas/efsaneler.png') },
  { key: 'dunya', min: 3500, max: 4999, win: 18, loss: 30, reward: 500, art: require('../../assets/arenas/dunya.png') },
  { key: 'goat', min: 5000, max: 99999, win: 15, loss: 35, reward: 1000, art: require('../../assets/arenas/goat.png') },
];
// Yardım & bilgi bağlantıları (screens.tsx INFO_LINKS ile aynı; canlı sayfalar)
export const INFO_LINKS = { help: 'https://crossoverfootball.com/destek/', privacy: 'https://crossoverfootball.com/gizlilik/', parents: 'https://crossoverfootball.com/ebeveyn/', terms: 'https://crossoverfootball.com/kosullar/', founders: 'https://crossoverfootball.com/' } as const;
export function nextArenaMin(trophies: number): number {
  const next = ARENA_STEPS.find((a) => a.min > trophies);
  return next ? next.min : ARENA_STEPS[ARENA_STEPS.length - 1]!.min;
}
