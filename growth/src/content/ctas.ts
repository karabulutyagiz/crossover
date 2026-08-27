import { pickWeighted, type RandomSource, defaultRandom } from './teams.ts';

// CTA Engine (bölüm 14): çeşitlilik + organik görünüm. CTA her içerikte şart
// değil — "none" da geçerli bir koldur ve öğrenme döngüsü onu da ölçer.
// Dağılım hedefi (bölüm 5): %55 value/challenge, %20 conversation,
// %15 game-related, %10 direct acquisition. CTA'sız içerik value/conversation
// tarafını taşır; ctaProbability bu dengeyi kurar.

export interface CtaOption {
  id: string;
  text: string;
  direct: boolean; // true = doğrudan indirme çağrısı (dozu düşük tutulur)
}

export const CTAS: readonly CtaOption[] = [
  { id: 'none', text: '', direct: false },
  { id: 'vs_friend', text: 'Arkadaşından önce bulabilir misin?', direct: false },
  { id: 'play_rivals', text: 'Rakibe karşı oynamak istiyorsan: CrossOver Football.', direct: true },
  { id: 'hundreds_more', text: 'Bunun yüzlercesi oyunda.', direct: false },
  { id: 'try_in_game', text: 'CrossOver Football\'da dene.', direct: true },
  { id: 'test_vs_real', text: 'Futbol bilgini gerçek oyunculara karşı test et.', direct: false },
  { id: 'app_store', text: 'App Store\'da: CrossOver Football.', direct: true },
];

const CTA_IDS = CTAS.map((c) => c.id);

/**
 * ctaProbability: içeriğin CTA taşıma olasılığı (pillar'a göre üretici belirler).
 * Direct CTA'lar ayrıca %35 tavana kırpılır — satış reklamı hissi engellenir.
 */
export function pickCta(
  weights: Record<string, number>,
  ctaProbability: number,
  rnd: RandomSource = defaultRandom,
): CtaOption {
  if (rnd.next() > ctaProbability) return CTAS[0]!; // none
  const id = pickWeighted(CTA_IDS, weights, rnd);
  const cta = CTAS.find((c) => c.id === id) ?? CTAS[0]!;
  if (cta.direct && rnd.next() > 0.35) {
    // Direct CTA dozunu düşür: soft bir alternatife düş.
    return CTAS.find((c) => c.id === 'vs_friend')!;
  }
  return cta;
}
