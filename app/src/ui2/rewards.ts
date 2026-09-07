// Seviye Yolu ödülü → etiket + sanat. CO-PASS v2 açıksa her seviyede (passRewardView), değilse eski düzen
// (her 5. seviye elmas, 10/20/30/40/50 çerçeve; premium şerit güç/elmas). Turnuvalar sekmesi ve Seviye Yolu penceresi ortak.
import type { ImageSourcePropType } from 'react-native';
import { t } from '../i18n';
import { LEVEL_TIERS, levelRewardGems, passRewardView, PREMIUM_LEVEL_POWERS, premiumRewardGems } from '../screens';
import type { GameState } from './types';
import { UI2 } from './assets';

export type RoadReward = { kind: 'gems' | 'frame' | 'power' | 'cosmetic'; label: string; art: ImageSourcePropType; amount?: number };
const POWER_ART: Record<string, ImageSourcePropType> = { xp2x: UI2.pw_xp, shield: UI2.pw_shield, streak: UI2.pw_streak, training: UI2.pw_training, freeze: UI2.pw_freeze };
const POWER_NAME: Record<string, string> = { xp2x: 'ui2.pw.xp', shield: 'ui2.pw.shield', streak: 'ui2.pw.streak', training: 'ui2.pw.training', freeze: 'sp.freeze.name', reveal: 'sp.reveal.name', skip: 'sp.skip.name', extratime: 'sp.extratime.name', secondchance: 'sp.secondchance.name' };
export function roadReward(p: GameState['profile'], n: number, track: 'free' | 'premium'): RoadReward | null {
  if (p?.copassV2) {
    const r = passRewardView(n, track); if (!r) return null;
    if (r.frameTier) return { kind: 'frame', label: t('ui2.specialFrame'), art: UI2.rw_frame };
    if (r.cosmeticId) return { kind: 'cosmetic', label: t('collection.tabCosmetics'), art: UI2.rw_frame };
    const pw = (r.specialPower ?? r.roadPower) as string | undefined;
    if (pw) return { kind: 'power', label: t((POWER_NAME[pw] ?? 'store.powers') as any), art: POWER_ART[pw] ?? UI2.pw_xp };
    if (r.diamonds) return { kind: 'gems', label: t('store.diamonds', { n: r.diamonds }), art: UI2.rw_gems, amount: r.diamonds };
    return null;
  }
  if (track === 'free') {
    if (LEVEL_TIERS.some((tier) => tier.min === n)) return { kind: 'frame', label: t('ui2.specialFrame'), art: UI2.rw_frame };
    const g = levelRewardGems(n); return g ? { kind: 'gems', label: t('store.diamonds', { n: g }), art: UI2.rw_gems, amount: g } : null;
  }
  const pw = PREMIUM_LEVEL_POWERS[n]; if (pw) return { kind: 'power', label: t((POWER_NAME[pw] ?? 'store.powers') as any), art: POWER_ART[pw] ?? UI2.pw_xp };
  const g = premiumRewardGems(n); return g ? { kind: 'gems', label: t('store.diamonds', { n: g }), art: UI2.rw_gems, amount: g } : null;
}
