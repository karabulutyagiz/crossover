import { type RandomSource, defaultRandom } from './teams.ts';

// Yorum taslağı üretici (comment marketing). SAF modül — DB yok, test edilir.
// İlkeler: doğal Türkçe, link YOK, marka adı en fazla 1 varyantta (doz),
// videoya/tweete gerçekten uyan içerik (bağlam boşsa jenerik soru tarzı).
// Amaç reklam değil: yorumu okuyan "bu adam futbol biliyor" desin, meraklanan
// profile/oyuna kendi gelsin.

export interface CommentContext {
  teams?: [string, string];   // videodaki/tweetteki iki takım (varsa)
  commonPlayer?: string;      // iki takımda da oynamış oyuncu (service DB'den doğrular)
  topic?: string;             // serbest konu ("derbi tahminleri", "transfer" ...)
}

export interface CommentDraft {
  text: string;
  variantKey: string;
  mentionsBrand: boolean;
}

const MAX_LEN: Record<string, number> = { x: 270, instagram: 500, tiktok: 150, youtube: 500 };

function pick<T>(arr: readonly T[], rnd: RandomSource): T {
  return arr[Math.floor(rnd.next() * arr.length)]!;
}

export function generateCommentDrafts(
  platform: 'x' | 'instagram' | 'tiktok' | 'youtube',
  ctx: CommentContext,
  rnd: RandomSource = defaultRandom,
): CommentDraft[] {
  const drafts: CommentDraft[] = [];
  const maxLen = MAX_LEN[platform] ?? 270;

  if (ctx.teams) {
    const [A, B] = ctx.teams;
    drafts.push({
      variantKey: 'soru',
      mentionsBrand: false,
      text: pick([
        `Asıl soru şu: ${A} + ${B}, ikisinde de oynayan futbolcu kim? 👀`,
        `${A} + ${B} demişken… iki formayı da giymiş bir isim söyleyebilen var mı?`,
        `Bunu izleyenlere soru: ${A} ve ${B}'de oynamış ortak futbolcu? Google yok.`,
      ], rnd),
    });
    drafts.push({
      variantKey: 'meydan',
      mentionsBrand: false,
      text: pick([
        `Yorumlarda gerçek futbol bilen var mı test edelim: ${A} + ${B}, ortak futbolcu?`,
        `${A} + ${B} → ortak futbolcuyu ilk bilen gerçek futbol hastası. Süre başladı ⏱️`,
      ], rnd),
    });
    if (ctx.commonPlayer) {
      drafts.push({
        variantKey: 'flex',
        mentionsBrand: false,
        text: pick([
          `${ctx.commonPlayer} diyenler buraya 🤝 iki formayı da giydiğini bilenler azınlıkta.`,
          `İpucu: cevaplardan biri ${ctx.commonPlayer.split(' ')[0]} ile başlıyor… bilene helal olsun.`,
        ], rnd),
      });
    }
    // Marka dozu: 4 varyantın en fazla 1'i — o da yumuşak.
    drafts.push({
      variantKey: 'marka',
      mentionsBrand: true,
      text: pick([
        `${A} + ${B} sorusunun rakibe karşı oynanan hali var: CrossOver Football. İlk doğru bilen kazanıyor.`,
        `Bu soruyu arkadaşına karşı süre tutarak oynamak istersen: CrossOver Football ⚽`,
      ], rnd),
    });
  } else {
    const topic = ctx.topic?.trim();
    drafts.push({
      variantKey: 'soru',
      mentionsBrand: false,
      text: pick([
        `${topic ? topic + ' güzel de, ' : ''}asıl test şu: iki takım söyle, ikisinde de oynamış futbolcuyu bul. Çoğu kişi 10 saniyede kalıyor.`,
        `Buradaki herkes futbol biliyor da… Galatasaray + Inter deyince 3 saniyede ortak futbolcu sayabiliyor musun?`,
        `Futbol bilgisi konuşulan her yerde aynı soru: iki kulüpte de forma giymiş adamı kim daha hızlı bulur?`,
      ], rnd),
    });
    drafts.push({
      variantKey: 'meydan',
      mentionsBrand: false,
      text: pick([
        `Yorumlara iki takım yaz, ortak futbolcusunu ilk bilen kazansın. Başlıyorum: Fenerbahçe + Arsenal 👀`,
        `Mini test: Real Madrid + Juventus, ikisinde de oynayan? Google'a bakan elenir.`,
      ], rnd),
    });
    drafts.push({
      variantKey: 'marka',
      mentionsBrand: true,
      text: pick([
        `Bu muhabbetin oyunu var: iki takım, ortak futbolcuyu rakibinden önce bul — CrossOver Football.`,
        `Futbol bilgine güveniyorsan bunu gerçek rakiplere karşı dene: CrossOver Football ⚽`,
      ], rnd),
    });
  }

  return drafts
    .filter((d) => d.text.length <= maxLen)
    .map((d, i) => ({ ...d, variantKey: `${d.variantKey}_${i}` }));
}

/** x.com/kullanici/status/123 → tweet id; değilse null. */
export function parseTweetId(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/[^/]+\/status(?:es)?\/(\d{5,25})/i);
  return m?.[1] ?? null;
}

/** URL'den platform tahmini. */
export function detectPlatform(url: string): 'x' | 'instagram' | 'tiktok' | 'youtube' | null {
  if (/(?:twitter|x)\.com\//i.test(url)) return 'x';
  if (/instagram\.com\//i.test(url)) return 'instagram';
  if (/tiktok\.com\//i.test(url)) return 'tiktok';
  if (/(?:youtube\.com|youtu\.be)\//i.test(url)) return 'youtube';
  return null;
}
