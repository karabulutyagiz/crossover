import type { HookType } from '../core/types.ts';
import { hookQualityScore } from '../core/score.ts';
import { pickWeighted, type RandomSource, defaultRandom } from './teams.ts';

// Viral Hook Engine (bölüm 13): her hook tipinin birden fazla doğal Türkçe
// varyantı var — robot dili yok, sürekli aynı kalıp yok. HookQualityScore
// clickbait frenidir; düşük skorlu hook üretimden elenir.

export interface HookOption {
  type: HookType;
  text: string;
}

const HOOKS: Record<HookType, string[]> = {
  time_pressure: [
    '5 saniyen var.',
    'Süre: 5 saniye. Başla.',
    '10 saniyede bilemezsen olmamış say.',
    'Kronometre başladı ⏱️',
  ],
  gatekeeping: [
    'Bunu bilen gerçek futbol hastasıdır.',
    'Futbol bilgine güveniyorsan bunu bil.',
    'Gerçek futbol fanı testi:',
    'Bunu bilen çok az çıkar.',
  ],
  social_challenge: [
    'Arkadaşına gönder, bakalım hanginiz önce bilecek.',
    'Grubuna at, ilk doğru cevap kazanır.',
    'Yanındakine sor — senden önce bilirse üzülme.',
  ],
  stat_bait: [
    '%90 burada yanlış cevap veriyor.',
    'On kişiden dokuzu bunu bilemiyor.',
    'Yorumların çoğu yanlış çıkıyor, dikkat.',
  ],
  no_google: [
    'Google yok.',
    'Google\'a bakmak yok, söz mü?',
    'Aklından cevapla, aratmak yasak.',
  ],
  direct_question: [
    '',
    'İmkansız futbol sorusu.',
    'Günün sorusu:',
  ],
};

export const ALL_HOOK_TYPES: readonly HookType[] = [
  'time_pressure', 'gatekeeping', 'social_challenge', 'stat_bait', 'no_google', 'direct_question',
];

/**
 * 3-5 hook adayı üretir, HookQualityScore ile eler ve öğrenilmiş tip
 * ağırlıklarına göre birini seçer. Elemeden sağ çıkan yoksa düz soruya düşer.
 */
export function pickHook(
  weights: Record<string, number>,
  rnd: RandomSource = defaultRandom,
): { hook: string; hookType: HookType; quality: number; candidates: HookOption[] } {
  const type = pickWeighted(ALL_HOOK_TYPES as HookType[], weights, rnd);
  const variants = HOOKS[type];
  const candidates: HookOption[] = variants.map((text) => ({ type, text }));
  const scored = candidates
    .map((c) => ({ ...c, quality: hookQualityScore(c.text) }))
    .filter((c) => c.text === '' || c.quality >= 0.4);
  const chosen = scored.length > 0
    ? scored[Math.floor(rnd.next() * scored.length)]!
    : { type: 'direct_question' as HookType, text: '', quality: hookQualityScore('') };
  return { hook: chosen.text, hookType: chosen.type, quality: chosen.quality, candidates };
}
