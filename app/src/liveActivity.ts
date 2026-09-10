// Live Activity köprüsünün GÜVENLİ sarmalayıcısı.
// Native modül yalnız gerçek iOS build'inde var (Expo Go / Android / eski
// build'lerde yok) — her çağrı try/catch'li no-op'a düşer, uygulama asla kırılmaz.
import { t } from './i18n';
import { PACK_MODES } from './ui2/products';

interface CofLiveActivityNative {
  isSupported(): boolean;
  startOffer(offerId: string, title: string, priceText: string, endsAtMs: number, packPitch: string): Promise<boolean>;
  endAll(): Promise<void>;
}

let native: CofLiveActivityNative | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requireNativeModule } = require('expo-modules-core');
  native = requireNativeModule('CofLiveActivity');
} catch { /* Expo Go / Android / modülsüz build */ }

export function liveActivitySupported(): boolean {
  try { return native?.isSupported() ?? false; } catch { return false; }
}

/** Uygulama ARKAYA atılınca çağrılır: aktif Günlük Fırsat varsa geri sayımı
 * kilit ekranı + Dynamic Island'a taşır. Fırsat yoksa/bittiyse no-op.
 *
 * Süre TAVANI native tarafta (30 dk): günlük fırsat saatlerce sürebiliyor ama
 * adada o kadar durması istenmiyor (kullanıcı kararı 2026-09-11).
 *
 * `hasPack` false ise karta Sosyal Paket vurgusu düşer; paketi olana düşmez. */
export async function startOfferActivity(
  offer: { key: string; price: number; expiresAt: string; itemName: string },
  hasPack = true,
): Promise<void> {
  if (!native) return;
  try {
    const endsAtMs = Date.parse(offer.expiresAt);
    if (!Number.isFinite(endsAtMs) || endsAtMs <= Date.now() + 60_000) return;
    const packPitch = hasPack ? '' : t('offer.laPackPitch', { n: String(PACK_MODES.length) });
    await native.startOffer(offer.key, offer.itemName, t('offer.laPrice', { n: String(offer.price) }), endsAtMs, packPitch);
  } catch { /* sessiz — Live Activity süs, oyun akışını asla etkilemez */ }
}

/** Uygulama öne dönünce / fırsat alınınca: adadaki aktiviteyi kapat. */
export async function endOfferActivity(): Promise<void> {
  try { await native?.endAll(); } catch { /* sessiz */ }
}
