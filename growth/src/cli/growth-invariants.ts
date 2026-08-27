// Growth OS invariant testleri — DB/ağ GEREKTİRMEZ, saf mantık ölçülür.
// Repo geleneği: "doğru yazdım" demek yerine koşup saymak.

import { contentSignature, textSimilarity, isDuplicateText, normalizeText } from '../core/signature.ts';
import { audienceFitScore, fitPriority, hookQualityScore, contentScore } from '../core/score.ts';
import { buildUtmUrl, newTrackingCode, utmContentSlug, trackingUrl } from '../core/utm.ts';
import { pickWeighted, POPULAR_POOL, type RandomSource } from '../content/teams.ts';
import { pickHook } from '../content/hooks.ts';
import { pickCta } from '../content/ctas.ts';
import { generateContent } from '../content/generator.ts';
import type { PairChallenge, CareerPath } from '../content/pairs.ts';
import { nextOccurrence, pickSlot, EXPERIMENTAL_SLOTS } from '../scheduler/slots.ts';
import { backoffDelayMs, effectiveLimits } from '../policy/rateLimiter.ts';
import { xProvider } from '../providers/x.ts';
import { telegramProvider } from '../providers/telegram.ts';
import { instagramProvider } from '../providers/instagram.ts';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failed += 1; console.error(`  ✗ ${name} ${detail}`); }
}

// Deterministik LCG — testler tekrarlanabilir.
function seededRnd(seed: number): RandomSource {
  let s = seed >>> 0;
  return {
    next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    },
  };
}

const FIXTURE_CHALLENGE: PairChallenge = {
  clubA: { id: 1, name: 'Real Madrid' },
  clubB: { id: 2, name: 'Juventus' },
  commonPlayers: [
    { id: 10, name: 'Cristiano Ronaldo' },
    { id: 11, name: 'Zinedine Zidane' },
    { id: 12, name: 'Fabio Cannavaro' },
  ],
  difficulty: 'medium',
};

const FIXTURE_PATH: CareerPath = {
  player: { id: 20, name: 'Zlatan Ibrahimovic' },
  clubs: ['Ajax', 'Juventus', 'Inter', 'Barcelona', 'Milan'],
};

const UNIFORM = { hook_type: {}, cta: {} };

console.log('\n── İmza & yorgunluk ──');
{
  const base = { platform: 'x', teams: ['Real Madrid', 'Juventus'], player: 'Ronaldo', hookType: 'time_pressure', ctaId: 'none', templateId: 't1' };
  const sigA = contentSignature(base);
  const sigB = contentSignature({ ...base, teams: ['Juventus', 'Real Madrid'] });
  const sigC = contentSignature({ ...base, player: 'Zidane' });
  check('imza deterministik + takım sırasından bağımsız', sigA === sigB);
  check('farklı oyuncu → farklı imza', sigA !== sigC);
  check('normalizeText Türkçe karakterleri sadeleştirir', normalizeText('Beşiktaş ÇĞİÖŞÜ') === 'besiktas cgiosu');

  const t1 = 'Real Madrid + Juventus\n\nOrtak futbolcu?';
  const t2 = 'Real Madrid + Juventus\n\nOrtak futbolcu kim?';
  const t3 = 'Bugün hava çok güzel, maç var';
  check('aynı metin benzerliği 1', textSimilarity(t1, t1) === 1);
  check('yakın kopya eşik üstü (>0.85)', textSimilarity(t1, t2) > 0.85, String(textSimilarity(t1, t2)));
  check('alakasız metin eşik altı', textSimilarity(t1, t3) < 0.3, String(textSimilarity(t1, t3)));
  check('isDuplicateText yakın kopyayı yakalar', isDuplicateText(t2, [t1], 0.85));
  check('isDuplicateText farklıyı geçirir', !isDuplicateText(t3, [t1], 0.85));
}

console.log('\n── Skorlar ──');
{
  const full = audienceFitScore({ footballRelevance: 1, engagement: 1, audienceAgeFit: 1, mobileGamingOverlap: 1, turkeyRelevance: 1, promotionFriendliness: 1 });
  const none = audienceFitScore({ footballRelevance: 0, engagement: 0, audienceAgeFit: 0, mobileGamingOverlap: 0, turkeyRelevance: 0, promotionFriendliness: 0 });
  check('AudienceFit tam giriş = 100', full === 100, String(full));
  check('AudienceFit sıfır giriş = 0', none === 0);
  check('öncelik eşikleri 75/50', fitPriority(80) === 'HIGH' && fitPriority(60) === 'MEDIUM' && fitPriority(40) === 'LOW');

  const normal = hookQualityScore('5 saniyen var.');
  const spam = hookQualityScore('İNANILMAZ ŞOK!! HEMEN İNDİR!!');
  check('normal hook > spam hook', normal > spam, `${normal} vs ${spam}`);
  check('hook skoru [0,1] içinde', normal >= 0 && normal <= 1 && spam >= 0 && spam <= 1);

  const dead = contentScore({ impressions: 0, linkClicks: 0, storeVisits: 0, installs: 0, shares: 0, comments: 0, activatedPlayers: 0 });
  const viral = contentScore({ impressions: 100000, linkClicks: 20, storeVisits: 5, installs: 0, shares: 900, comments: 900, activatedPlayers: 0 });
  const converting = contentScore({ impressions: 5000, linkClicks: 250, storeVisits: 120, installs: 60, shares: 40, comments: 40, activatedPlayers: 45 });
  check('sıfır metrik = 0 skor', dead === 0);
  check('install getiren içerik > sadece viral içerik', converting > viral, `${converting} vs ${viral}`);
}

console.log('\n── UTM & tracking ──');
{
  const url = buildUtmUrl('https://crossoverfootball.com', { source: 'x', medium: 'organic', campaign: 'football_challenge', content: 'real_juve_ronaldo_v2' });
  check('UTM parametreleri tam', url.includes('utm_source=x') && url.includes('utm_medium=organic') && url.includes('utm_campaign=football_challenge') && url.includes('utm_content=real_juve_ronaldo_v2'));
  const slug = utmContentSlug(['Real Madrid', 'Juventus'], 'Cristiano Ronaldo', 'v2');
  check('utm_content slug temiz', slug === 'real_madrid_juventus_cristiano_ronaldo_v2', slug);
  const codes = new Set(Array.from({ length: 1000 }, () => newTrackingCode()));
  check('1000 tracking kodu çakışmasız + 8 karakter', codes.size === 1000 && [...codes].every((c) => c.length === 8));
  check('tracking url biçimi', trackingUrl('https://g.example.com/', 'abc12345') === 'https://g.example.com/r/abc12345');
}

console.log('\n── Ağırlıklı seçim (bandit tabanı) ──');
{
  const rnd = seededRnd(42);
  const counts: Record<string, number> = { a: 0, b: 0 };
  for (let i = 0; i < 10000; i += 1) counts[pickWeighted(['a', 'b'], { a: 3, b: 1 }, rnd)]! += 1;
  const ratio = counts.a! / counts.b!;
  check('3:1 ağırlık ~3:1 seçim üretir', ratio > 2.5 && ratio < 3.5, ratio.toFixed(2));

  const rnd2 = seededRnd(7);
  const zeroCounts: Record<string, number> = { a: 0, b: 0 };
  for (let i = 0; i < 10000; i += 1) zeroCounts[pickWeighted(['a', 'b'], { a: 1, b: 0 }, rnd2)]! += 1;
  check('0 ağırlık bile keşif tabanı alır (asla sönmez)', zeroCounts.b! > 100, String(zeroCounts.b));
}

console.log('\n── Hook & CTA motorları ──');
{
  const rnd = seededRnd(1);
  const { hook, hookType, quality } = pickHook({}, rnd);
  check('hook seçimi geçerli tip döner', typeof hook === 'string' && typeof hookType === 'string' && quality >= 0);

  // Direct CTA dozu: 1000 seçimde (cta olasılığı 1.0) direct oranı sınırlı kalmalı.
  const rnd2 = seededRnd(99);
  let direct = 0;
  let none = 0;
  for (let i = 0; i < 1000; i += 1) {
    const c = pickCta({}, 1.0, rnd2);
    if (c.direct) direct += 1;
    if (c.id === 'none') none += 1;
  }
  check('direct CTA dozu frenli (<%30)', direct / 1000 < 0.3, String(direct / 1000));
  const rnd3 = seededRnd(5);
  let withCta = 0;
  for (let i = 0; i < 1000; i += 1) if (pickCta({}, 0.4, rnd3).id !== 'none') withCta += 1;
  check('ctaProbability 0.4 → ~%40 CTA\'lı', withCta > 300 && withCta < 500, String(withCta));
  void none;
}

console.log('\n── İçerik üretici (platform-native) ──');
{
  const rnd = seededRnd(3);
  const x = generateContent({ platform: 'x', pillar: 'challenge', challenge: FIXTURE_CHALLENGE, weights: UNIFORM, rnd });
  check('X içeriği üretildi', x !== null);
  if (x) {
    check('X gövdesi takımları içerir', x.body.includes('Real Madrid') && x.body.includes('Juventus'));
    check('X içeriği 280 sınırında geçerli', xProvider.validateContent({ text: x.body, idempotencyKey: 'k' }).valid, `${x.body.length} kr`);
    check('cevap oyuncular alanında (gövdede sızıntı yok)', x.players.length > 0 && !x.body.includes('Cristiano Ronaldo'));
    check('risk skoru [0,1]', x.riskScore >= 0 && x.riskScore <= 1);
  }

  const ig = generateContent({ platform: 'instagram', pillar: 'challenge', challenge: FIXTURE_CHALLENGE, weights: UNIFORM, rnd: seededRnd(4) });
  check('IG içeriği media brief taşır', ig !== null && ig.mediaBrief !== null && ig.mediaBrief!.format === '9:16');
  check('IG reveal sahnesi cevabı içerir', ig !== null && JSON.stringify(ig.mediaBrief).includes('Cristiano Ronaldo'));

  const tg = generateContent({ platform: 'telegram', pillar: 'challenge', challenge: FIXTURE_CHALLENGE, weights: UNIFORM, rnd: seededRnd(6) });
  check('TG içeriği community-first (cevap çağrısı var)', tg !== null && tg.body.includes('Cevabını yaz'));
  if (x && ig && tg) {
    check('platformlar arası copy-paste yok', x.body !== ig.body && x.body !== tg.body && ig.body !== tg.body);
  }

  const path = generateContent({ platform: 'x', pillar: 'guess_path', careerPath: FIXTURE_PATH, weights: UNIFORM, rnd: seededRnd(8) });
  check('kariyer yolu içeriği ok yönü içerir', path !== null && path.body.includes('→') && path.body.includes('Ajax'));
  check('kariyer yolu cevabı gövdede sızmaz', path !== null && !path.body.includes('Ibrahimovic'));

  check('transfer pillar bağlamsız üretilmez (SourceVerified şartı)',
    generateContent({ platform: 'x', pillar: 'transfer', challenge: FIXTURE_CHALLENGE, weights: UNIFORM, rnd: seededRnd(9) }) === null);
  check('guess_path verisiz üretilmez',
    generateContent({ platform: 'x', pillar: 'guess_path', weights: UNIFORM, rnd: seededRnd(10) }) === null);
}

console.log('\n── Yorum motoru (comment marketing) ──');
{
  const { generateCommentDrafts, parseTweetId, detectPlatform } = await import('../content/comments.ts');

  const rnd = seededRnd(21);
  const withTeams = generateCommentDrafts('x', { teams: ['Galatasaray', 'Inter'], commonPlayer: 'Wesley Sneijder' }, rnd);
  check('takımlı bağlam 4 taslak üretir', withTeams.length === 4, String(withTeams.length));
  check('X taslakları 270 sınırında', withTeams.every((d) => d.text.length <= 270));
  check('marka dozu: en fazla 1 varyant', withTeams.filter((d) => d.mentionsBrand).length <= 1);
  check('takımlar taslaklara giriyor', withTeams.some((d) => d.text.includes('Galatasaray')));
  check('flex varyantı doğrulanmış oyuncuyu kullanır', withTeams.some((d) => d.text.includes('Sneijder')));

  const noTeams = generateCommentDrafts('tiktok', { topic: 'derbi tahminleri' }, seededRnd(22));
  check('bağlamsız da taslak çıkar (jenerik)', noTeams.length >= 1);
  check('TikTok 150 karakter sınırı uygulanır', noTeams.every((d) => d.text.length <= 150));

  check('tweet id ayrıştırma', parseTweetId('https://x.com/cof/status/1234567890123') === '1234567890123');
  check('twitter.com da tanınır', parseTweetId('https://twitter.com/a/statuses/987654321') === '987654321');
  check('bozuk URL null', parseTweetId('https://x.com/cof') === null);
  check('platform tespiti', detectPlatform('https://www.tiktok.com/@a/video/1') === 'tiktok'
    && detectPlatform('https://youtu.be/abc') === 'youtube'
    && detectPlatform('https://instagram.com/p/x') === 'instagram'
    && detectPlatform('https://ornek.com/video') === null);
}

console.log('\n── Zamanlama ──');
{
  const rnd = seededRnd(11);
  const slot = pickSlot({}, rnd);
  check('slot deneysel listeden', (EXPERIMENTAL_SLOTS as readonly string[]).includes(slot), slot);

  const now = new Date('2026-08-27T10:00:00Z'); // 13:00 İstanbul
  const at = nextOccurrence('20:00', now, 0, rnd);
  const istHour = (at.getUTCHours() + 3) % 24;
  check('20:00 slotu İstanbul 20:00\'ye düşer', istHour === 20, String(istHour));
  check('slot gelecekte', at.getTime() > now.getTime());

  const past = nextOccurrence('12:00', now, 0, rnd); // 12:00 IST bugün geçti → yarın
  check('geçmiş slot yarına kayar', past.getTime() > now.getTime() && past.getTime() - now.getTime() < 24 * 60 * 60 * 1000);

  let maxJitter = 0;
  for (let i = 0; i < 200; i += 1) {
    const j = nextOccurrence('20:00', now, 7, seededRnd(i));
    const base = nextOccurrence('20:00', now, 0, seededRnd(0));
    maxJitter = Math.max(maxJitter, Math.abs(j.getTime() - base.getTime()));
  }
  check('jitter ±7 dk sınırında', maxJitter <= 7 * 60 * 1000, `${maxJitter / 60000} dk`);
}

console.log('\n── Rate limit & backoff ──');
{
  const d1 = backoffDelayMs(1, () => 0);
  const d3 = backoffDelayMs(3, () => 0);
  const dHuge = backoffDelayMs(20, () => 0);
  check('backoff üstel artar', d3 > d1, `${d1} → ${d3}`);
  check('backoff 6 saatte tavanlanır', dHuge === 6 * 60 * 60 * 1000, String(dHuge));
  const withJitter = backoffDelayMs(2, () => 1);
  const noJitter = backoffDelayMs(2, () => 0);
  check('jitter %30 sınırında', withJitter <= noJitter * 1.3 + 1 && withJitter > noJitter);

  const eff = effectiveLimits({ maxPostsPerDay: 999, maxPostsPerHour: 5, minIntervalMinutes: 1 });
  check('global tavan provider limitini kırpar', eff.maxPostsPerDay <= 20 && eff.minIntervalMinutes >= 20, JSON.stringify(eff));
}

console.log('\n── Provider sözleşmeleri ──');
{
  check('X 280+ karakteri reddeder', !xProvider.validateContent({ text: 'x'.repeat(281), idempotencyKey: 'k' }).valid);
  check('X boş metni reddeder', !xProvider.validateContent({ text: '  ', idempotencyKey: 'k' }).valid);
  check('TG 4096+ karakteri reddeder', !telegramProvider.validateContent({ text: 'x'.repeat(4097), idempotencyKey: 'k' }).valid);
  check('IG medyasız yayını reddeder', !instagramProvider.validateContent({ text: 'caption', idempotencyKey: 'k' }).valid);
  check('yapılandırılmamış X publish edemez (capabilities)', xProvider.getPublishingCapabilities().canPublish === false || Boolean(process.env.X_API_KEY));
  check('POPULAR_POOL Türk devlerini içerir', POPULAR_POOL.includes('Galatasaray') && POPULAR_POOL.includes('Fenerbahçe'));
}

console.log(`\n${passed} geçti, ${failed} kaldı.`);
if (failed > 0) process.exit(1);
