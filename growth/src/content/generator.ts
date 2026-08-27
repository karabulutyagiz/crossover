import type { GeneratedContent, HookType, MediaBrief, Pillar, Platform } from '../core/types.ts';
import { hookQualityScore } from '../core/score.ts';
import { pickHook } from './hooks.ts';
import { pickCta } from './ctas.ts';
import type { PairChallenge, CareerPath } from './pairs.ts';
import { type RandomSource, defaultRandom } from './teams.ts';

// Content Intelligence Engine (bölüm 10 + 33 + 36).
// Bu modül SAF'tır: veri (challenge / kariyer yolu) ve ağırlıklar dışarıdan
// gelir, çıktı deterministik test edilebilir. DB erişimi planner'dadır.
//
// Platform-native dil (bölüm 36): X kısa/konuşma başlatan, Instagram
// visual-first (media brief + kısa caption), Telegram community-first.
// Aynı copy'nin platformlar arası kopyalanması bu katmanda imkânsızdır çünkü
// her platformun kendi render'ı vardır.

export interface GeneratorWeights {
  hook_type: Record<string, number>;
  cta: Record<string, number>;
}

export interface GeneratorInput {
  platform: Extract<Platform, 'x' | 'instagram' | 'telegram'>;
  pillar: Pillar;
  challenge?: PairChallenge;
  careerPath?: CareerPath;
  footballContext?: string; // maç günü / transfer bağlamı (SourceVerified akışından gelir)
  weights: GeneratorWeights;
  language?: 'tr' | 'en';
  rnd?: RandomSource;
}

const PILLAR_CTA_PROBABILITY: Record<Pillar, number> = {
  challenge: 0.45,
  guess_path: 0.35,
  impossible: 0.4,
  derby: 0.5,
  transfer: 0.4,
  match_day: 0.45,
  nostalgia: 0.3,
  turkish_football: 0.45,
  european_football: 0.45,
  competitive: 0.9, // bu pillar'ın amacı zaten rekabet çağrısı
};

function pick<T>(arr: readonly T[], rnd: RandomSource): T {
  return arr[Math.floor(rnd.next() * arr.length)]!;
}

// ── Pillar gövdeleri (TR, doğal internet dili — bölüm 35) ────────────────
function pairBody(pillar: Pillar, ch: PairChallenge, rnd: RandomSource, context?: string): string {
  const A = ch.clubA.name;
  const B = ch.clubB.name;
  const n = ch.commonPlayers.length;
  switch (pillar) {
    case 'impossible':
      return pick([
        `${A} + ${B}\n\nİki takımda da forma giymiş futbolcu var. Evet, gerçekten var.`,
        `${A} ve ${B}.\n\nOrtak futbolcu? Bilene helal olsun.`,
        `Zor olsun istedik:\n\n${A} + ${B}\n\nOrtak futbolcu kim?`,
      ], rnd);
    case 'derby':
      return pick([
        `${A} + ${B}\n\nİkisinde de oynamış futbolcu? 👀`,
        `Derbi sorusu:\n\n${A} + ${B}\n\nİki formayı da giyen kim?`,
      ], rnd);
    case 'match_day':
      return pick([
        `${context ? context + '\n\n' : ''}${A} + ${B}\n\nİki takımda da oynayan kaç futbolcu sayabilirsin?`,
        `${context ? context + '\n\n' : ''}Maç öncesi ısınma:\n\n${A} + ${B}\n\nOrtak futbolcu?`,
      ], rnd);
    case 'nostalgia':
      return pick([
        `Eski toprak sorusu:\n\n${A} + ${B}\n\nİkisinde de oynamış futbolcu?`,
        `${A} + ${B}\n\n2000'leri yaşayanlar bilir. Ortak futbolcu kim?`,
      ], rnd);
    case 'competitive':
      return pick([
        `${A} + ${B}\n\nOrtak futbolcuyu rakibinden önce bulman lazım. Hazır mısın?`,
        `${A} + ${B}\n\nBu soruyu karşındakinden hızlı cevaplayabilir misin?`,
      ], rnd);
    case 'turkish_football':
      return pick([
        `${A} + ${B}\n\nOrtak futbolcu? Süper Lig hafızanı konuştur.`,
        `${A} + ${B}\n\nİkisinde de top koşturmuş bir isim söyle.`,
      ], rnd);
    default: {
      // challenge / european_football / transfer
      const multi = n >= 3
        ? `İkisinde de oynayan ${Math.min(n, 3)} futbolcu sayabilir misin?`
        : 'İkisinde de oynayan futbolcuyu bul.';
      return pick([
        `${A} + ${B}\n\n${multi}`,
        `${A} + ${B}\n\nOrtak futbolcu?`,
        `${context ? context + '\n\n' : ''}${A} + ${B}\n\nİki formayı da giymiş bir isim?`,
      ], rnd);
    }
  }
}

function careerBody(path: CareerPath, rnd: RandomSource): string {
  const chain = path.clubs.join(' → ');
  return pick([
    `${chain}\n\nKim?`,
    `Kariyer yolu:\n\n${chain}\n\nHangi futbolcu?`,
    `${chain}\n\nBu yolu yürüyen futbolcuyu bil.`,
  ], rnd);
}

// ── Media brief (bölüm 34) — Instagram reel/görsel için ──────────────────
function buildMediaBrief(ch: PairChallenge, hook: string): MediaBrief {
  const answer = ch.commonPlayers[0]?.name ?? '';
  return {
    format: '9:16',
    durationSec: 8,
    scenes: [
      { atSec: 0, description: `${ch.clubA.name} arması + ${ch.clubB.name} arması yan yana`, overlayText: hook || '5 saniyen var.' },
      { atSec: 1, description: 'Geri sayım 5-4-3-2-1, gerilim müziği', overlayText: '5…4…3…2…1' },
      { atSec: 5, description: `Cevap reveal: ${answer} (iki forma yan yana)`, overlayText: answer },
      { atSec: 6, description: 'CrossOver Football logo + App Store CTA', overlayText: 'Rakibinden önce bulabilir misin?' },
    ],
  };
}

const HASHTAGS: Record<string, string[]> = {
  instagram: ['#futbol', '#futboltrivia', '#süperlig', '#şampiyonlarligi', '#crossoverfootball', '#futbolquiz'],
  x: ['#futbol'],
  telegram: [],
};

// ── Ana üretim ───────────────────────────────────────────────────────────
export function generateContent(input: GeneratorInput): GeneratedContent | null {
  const rnd = input.rnd ?? defaultRandom;
  const language = input.language ?? 'tr';

  // Veri yoksa içerik yok — asla uydurma soru üretilmez.
  if (input.pillar === 'guess_path' && !input.careerPath) return null;
  if (input.pillar !== 'guess_path' && !input.challenge) return null;
  // Transfer/maç günü içerikleri doğrulanmış bağlam ister (bölüm 15).
  if ((input.pillar === 'transfer' || input.pillar === 'match_day') && !input.footballContext) return null;

  const { hook, hookType, quality } = pickHook(input.weights.hook_type, rnd);
  const ctaProb = PILLAR_CTA_PROBABILITY[input.pillar];
  const cta = pickCta(input.weights.cta, ctaProb, rnd);

  const teams: string[] = [];
  const players: string[] = [];
  let core = '';
  let mediaBrief: MediaBrief | null = null;

  if (input.pillar === 'guess_path' && input.careerPath) {
    core = careerBody(input.careerPath, rnd);
    players.push(input.careerPath.player.name);
    teams.push(...input.careerPath.clubs);
  } else if (input.challenge) {
    core = pairBody(input.pillar, input.challenge, rnd, input.footballContext);
    teams.push(input.challenge.clubA.name, input.challenge.clubB.name);
    players.push(...input.challenge.commonPlayers.slice(0, 5).map((p) => p.name));
    if (input.platform === 'instagram') mediaBrief = buildMediaBrief(input.challenge, hook);
  }

  // "Günün sorusu:" + "Zor olsun istedik:" gibi etiket istiflenmesini önle:
  // gövde zaten iki nokta ile biten bir lead-in taşıyorsa, iki nokta ile biten
  // hook düşürülür (zaman baskısı gibi hook'lar kalır).
  const coreLead = core.split('\n')[0] ?? '';
  const effectiveHook = hook.endsWith(':') && coreLead.endsWith(':') ? '' : hook;

  // IG caption'ın çekirdeği takım/soru satırıdır — lead-in satırı değil.
  const igCore = teams.length >= 2 && input.pillar !== 'guess_path'
    ? `${teams[0]} + ${teams[1]}\n\nOrtak futbolcu? Cevap videoda 👀`
    : core;

  // Platform-native birleştirme: X → hook üstte, kısa; IG → caption kısa,
  // asıl iş media brief'te; TG → topluluk sohbeti tonu.
  let body: string;
  let contentType: GeneratedContent['contentType'];
  switch (input.platform) {
    case 'x':
      body = [effectiveHook, core, cta.text].filter(Boolean).join('\n\n');
      contentType = 'post';
      break;
    case 'instagram':
      body = [igCore, cta.text, HASHTAGS.instagram!.slice(0, 4).join(' ')]
        .filter(Boolean).join('\n\n');
      contentType = 'reel';
      break;
    case 'telegram':
      body = [effectiveHook, core, cta.text ? cta.text + ' ⚽' : '', 'Cevabını yaz 👇']
        .filter(Boolean).join('\n\n');
      contentType = 'post';
      break;
  }

  const risk =
    0.05 +
    (cta.direct ? 0.2 : 0) +
    (hookType === 'stat_bait' ? 0.1 : 0) +
    (input.pillar === 'transfer' ? 0.15 : 0);

  const hookW = input.weights.hook_type[hookType] ?? 1;
  const ctaW = input.weights.cta[cta.id] ?? 1;
  const predicted = Math.max(0.05, Math.min(1, (hookW + ctaW) / 4));

  return {
    platform: input.platform,
    contentType,
    pillar: input.pillar,
    hook,
    hookType: hookType as HookType,
    body,
    cta: cta.text,
    ctaId: cta.id,
    hashtags: HASHTAGS[input.platform] ?? [],
    mediaBrief,
    targetAudience: input.pillar === 'turkish_football' || input.pillar === 'derby'
      ? 'Süper Lig kitlesi' : 'futbol trivia + mobil oyun kitlesi',
    teams,
    players,
    footballContext: input.footballContext ?? '',
    postingReason: `pillar=${input.pillar} hook=${hookType} cta=${cta.id}`,
    suggestedTime: null,
    riskScore: Math.min(1, Math.round(risk * 100) / 100),
    predictedEngagement: Math.round(predicted * 100) / 100,
    hookQualityScore: quality || hookQualityScore(hook),
    language,
    templateId: `${input.platform}_${input.pillar}_v1`,
  };
}
