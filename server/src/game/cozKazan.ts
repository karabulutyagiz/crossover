// ============================================================================
// ÇÖZ KAZAN — futbolcu adının harfleri karışık; ilk doğru bilen kazanır.
// Bu dosya SAF yardımcılar: isim biçimi seçimi, karıştırma, cevap normalizasyonu.
// (Oyuncu havuzu/DB seçimi ve maç akışı ayrı dosyalarda.)
//
// HARF KURALLARI (kullanıcı kararı 2026-08-31):
//  • GÖSTERİM: Türk harfleri ç ş ğ ı ö ü (İ/I) OLDUĞU GİBİ; diğer yabancı aksanlar
//    temel harfe iner (é→e, ñ→n, ø→o, ł→l, ß→ss …).
//  • EŞLEŞTİRME: TAM yazım (bulanık/autocorrect YOK). Türk harfleri ile SADE
//    karşılıkları KARŞILIKLI kabul (ç=c, ş=s, ğ=g, ı=i, ö=o, ü=u), diğer aksanlar
//    sadeleşir, büyük/küçük harfe ve boşluk/noktalamaya duyarsız. Onun dışında
//    harfler tam doğru olmalı.
// ============================================================================

import { pool } from '../db/pool.ts';

export type CozDifficulty = 'easy' | 'medium' | 'hard';

// Türk alfabesi glifleri — GÖSTERİMDE korunur (aksanları sıyrılmaz).
const TR_KEEP = new Set(['ç', 'Ç', 'ş', 'Ş', 'ğ', 'Ğ', 'ı', 'İ', 'ö', 'Ö', 'ü', 'Ü']);
// Gösterim BÜYÜK harf: Türk özel harfleri korunur; DÜZ 'i' standart 'I' olur
// (uluslararası isimlerde 'İ' garip durur; eşleştirme zaten İ/I/ı/i'yi aynı sayar).
const TR_UPPER: Record<string, string> = { 'ı': 'I', 'ç': 'Ç', 'ş': 'Ş', 'ğ': 'Ğ', 'ö': 'Ö', 'ü': 'Ü' };

/** Aksanları çözer (NFKD) + ayrışmayan yabancı harfleri temel karşılığına indirir. */
function stripForeign(ch: string): string {
  const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return base
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
    .replace(/ß/g, 'ss')
    .replace(/[đð]/g, 'd').replace(/[ĐÐ]/g, 'D')
    .replace(/þ/g, 'th').replace(/Þ/g, 'TH');
}

/** GÖSTERİM için: Türk glifleri korunur, diğer aksanlar sadeleşir. */
export function displayNormalize(s: string): string {
  let out = '';
  for (const ch of s) out += TR_KEEP.has(ch) ? ch : stripForeign(ch);
  return out;
}

/** EŞLEŞTİRME anahtarı: her şey temel ASCII'ye indirgenir, boşluk/noktalama atılır. */
export function matchKey(s: string): string {
  return s
    .replace(/[ıİI]/g, 'i')                                   // Türkçe noktalı/noktasız I → i
    .replace(/ø/gi, 'o').replace(/ł/gi, 'l').replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').replace(/[đðĐÐ]/g, 'd').replace(/þ/gi, 'th')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')        // ç→c, ş→s, ğ→g, ö→o, ü→u, é→e, ñ→n …
    .replace(/[^a-z0-9]/g, '');
}

/** Cevap doğru mu — gösterilen biçimle (soyad ya da tam ad) TAM eşleşme. */
export function isCorrectAnswer(guess: string, shownForm: string): boolean {
  const g = matchKey(guess);
  return g.length > 0 && g === matchKey(shownForm);
}

/** GÖSTERİM için Türkçe-duyarlı BÜYÜK harf (i→İ, ı→I). */
export function turkishUpper(s: string): string {
  let out = '';
  for (const ch of s) out += TR_UPPER[ch] ?? ch.toUpperCase();
  return out;
}

// Kelime ayıracı: boşluk + tire/çizgi türleri (ASCII '-' ve U+2010–2015). Tire
// GÖSTERİLMEZ (tile olmaz), kelime sınırı sayılır → tireli ismin parçaları AYRI
// grup olarak karışır (kullanıcı isteği 2026-08-31: "- harflerin arasında olmasın").
// Eşleştirmede zaten fark etmez: matchKey tüm alfasayısal-olmayanı siler (tire=boşluk=hiç).
const WORD_SEP = /[\s‐-―-]+/;

/** İsmi kelimelere böler (boşluk/tire). Aksanlar GÖSTERİM'e göre sadeleşmiş hâlde. */
function words(name: string): string[] {
  return displayNormalize(name).trim().split(WORD_SEP).filter(Boolean);
}

/** KARIŞTIRILACAK biçim (kullanıcı isteği 2026-08-31): HERKES TAM AD (iki+ isim) —
 * SADECE tek ismiyle bilinen oyuncular (DB'de tek kelime: Pepe, Koke, Pedri, Neymar,
 * Ronaldinho, Marquinhos…) istisna, onlar tek isimle sorulur. Asla "yalnız soyad" yok.
 * Bileşik soyadlar bozulmasın diye TÜM kelimeler kalır (ör. "Ángel Di María").
 * (difficulty/rnd/alwaysFull artık biçimi ETKİLEMEZ — zorluk yalnız ün bandını seçer;
 * imza geriye-dönük uyumluluk için korunur.) */
export function pickNameForm(fullName: string, _difficulty?: CozDifficulty, _rnd: () => number = Math.random, _alwaysFull = false): string {
  const w = words(fullName);
  if (w.length <= 1) return w[0] ?? displayNormalize(fullName); // mononim: tek isim
  return w.join(' ');                                           // herkes: tam ad
}

/** Orijinaldeki BİTİŞİK harf çiftleri (sırasız). */
function adjacentPairKey(a: string, b: string): string {
  return a < b ? a + b : b + a;
}

/** Bir kelimeyi seçilen ZORLUKTA karıştırır (kullanıcı isteği 2026-08-31: bağlama
 * göre kolay/orta/zor harf dizilimi). Ölçüt = korunan "okunur bitişik ikili" (foothold)
 * hedefi: easy=çok foothold (okunur), medium=~1 foothold, hard=0 (tam karışık).
 * İLK harf her zorlukta taşınır, yerinde kalan harf ~0. 70 aday → hedefe en yakını. */
function shuffleWord(word: string, rnd: () => number, diff: CozDifficulty = 'medium'): string {
  const chars = [...word];
  const L = chars.length;
  if (L <= 1) return word;
  if (L === 2) return chars[0] !== chars[1] ? chars[1]! + chars[0]! : word;
  if (L === 3) { const r = chars[2]! + chars[0]! + chars[1]!; return r !== word ? r : chars[1]! + chars[2]! + chars[0]!; }
  const distinct = new Set(chars).size;
  if (distinct <= 1) return word; // "aa" gibi — tek olası dizilim
  const origAdj = new Set<string>();
  for (let i = 0; i < L - 1; i++) origAdj.add(adjacentPairKey(chars[i]!, chars[i + 1]!));
  // (kullanıcı 2026-08-31 "bir tık kolaylaştır") — hedefler hafif yükseltildi:
  const target = diff === 'hard' ? (L >= 7 ? 1 : 0)              // zor: uzun kelimede 1 tutamak
    : diff === 'easy' ? Math.max(2, Math.round((L - 1) * 0.5))   // kolay: bol foothold → okunur
    : Math.min(3, Math.max(1, Math.round((L - 1) * 0.3)));       // orta: ~1-2 foothold
  const cost = (a: string[]) => {
    let ip = 0, adj = 0;
    for (let i = 0; i < L; i++) if (a[i] === chars[i]) ip++;
    for (let i = 0; i < L - 1; i++) if (origAdj.has(adjacentPairKey(a[i]!, a[i + 1]!))) adj++;
    const firstInPlace = a[0] === chars[0] ? 1 : 0;
    return Math.abs(adj - target) * 2 + ip + firstInPlace * 4; // ilk harf yerinde = ağır ceza
  };
  let best: string[] | null = null, bestCost = Infinity;
  for (let attempt = 0; attempt < 70; attempt++) {
    const a = [...chars];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
    if (a.join('') === word) continue;             // orijinale eşit — atla
    const c = cost(a);
    if (c < bestCost) { bestCost = c; best = a; if (c === 0) break; } // hedef: ip=0, ilk taşındı, adj=target
  }
  return (best ?? chars).join('');
}

/** GÖSTERİLECEK karışık harfler: her kelime KENDİ içinde karışır, ayrı ayrı
 * (BÜYÜK harf). Sonuç kelime dizisi — client her kelimeyi ayrı grup çizer. */
export function scrambleForm(shownForm: string, rnd: () => number = Math.random, diff: CozDifficulty = 'medium'): string[] {
  return displayNormalize(shownForm).trim().split(WORD_SEP).filter(Boolean)
    .map((w) => turkishUpper(shuffleWord(w, rnd, diff)));
}

/** Cevabın DÜZ harf dizisi (kelime sırasıyla, ayıraçsız, BÜYÜK harf) — "harf alma"
 * ipucu için: pozisyon k = k'ıncı harf. Client'ın kutucuk sırasıyla birebir hizalı
 * (kelime uzunlukları scrambled ile aynı; her kelime kendi harfleri). */
export function cozAnswerLetters(shownForm: string): string[] {
  return displayNormalize(shownForm).trim().split(WORD_SEP).filter(Boolean)
    .flatMap((w) => [...turkishUpper(w)]);
}

// ── Oyuncu seçimi + tur üretimi (DB) ────────────────────────────────────────
// BAĞLAMA GÖRE seçim (kullanıcı isteği 2026-08-31):
//  • DERECELİ: her zaman ÜNLÜ (famous) oyuncu + ZOR harf dizilimi (sadece harfler zor).
//  • BOT kolay: famous + KISA isim + kolay harf (yenmesi kolay bot).
//  • BOT orta:  mid-segment bilinirlik + orta harf.
//  • BOT zor:   az bilinen (obscure) oyuncu + zor harf (yenmesi zor bot).
// TANINIRLIK — kullanıcı defalarca "no name isimler çıkıyor" dedi (2026-08-31).
// KÖK NEDEN: `fame` (kulüp prestij×yıl×güncellik) yedek kaleci/kadro oyuncusunu
// şişiriyor, gerçek popülerliği yakalamıyor (market_value ~boş). ÇÖZÜM: `player_honours`
// (CL/EL/WC/Ballon d'Or kazananları — 624 kişi, HEPSİ tanınır) bir "kesin ünlü" filtresi
// olarak kullanılır. Bant örnekleri:
//   famous  = onurlu (CL/EL/WC) VEYA fame≥230 → Messi, Xavi, Pirlo, Chiellini, van Persie,
//             Arda Turan, Muslera, Burak Yılmaz… (Kane gibi onursuz yıldızları fame≥230 yakalar)
//   mid     = onursuz, fame [90,230) → Gervinho/Matuidi tipi orta bilinirlik
//   obscure = onursuz, fame [30,90)  → az bilinen
export type CozTier = 'famous' | 'mid' | 'obscure';
const HAS_HONOURS = `EXISTS(SELECT 1 FROM player_honours ph WHERE ph.player_id = p.id)`;
// SADECE Dünya Kupası / Ballon d'Or — millî-takım seviyesi ELİT (kullanıcı defalarca
// "saçma sapan isimler geliyor"). Kulüp CL/EL onurları KADRO oyuncusunu (Ben Woodburn,
// yedek kaleci) da içerdiği için famous havuzuna SOKMAZ; WC/BDOR çok daha seçkin.
const HAS_TOP_HONOURS = `EXISTS(SELECT 1 FROM player_honours ph WHERE ph.player_id = p.id AND ph.competition IN ('WC','BDOR'))`;
/** Tier'a göre SQL koşulu + sıralama (hepsi düz random → çeşitlilik). */
function tierWhereOrder(tier: CozTier): { cond: string; order: string } {
  // famous havuzu: fame≥170 VEYA WC/BDOR sahibi. ~373 kişi, HEPSİ çok ünlü — kulüp
  // CL/EL kadro oyuncuları (Woodburn/Sóbis tipi) GİRMEZ. Kane(188)/Pogba/Griezmann
  // fame'den, Mbappé WC'den gelir. (kullanıcı 2026-09-01 "çok bilindik, çok ünlü olsun".)
  const FAMOUS_POOL = `(p.fame >= 170 OR ${HAS_TOP_HONOURS})`;
  // Sıralama DÜZ random() — TAM ÇEŞİTLİLİK (kullanıcı 2026-08-31 "hep aynı oyuncular
  // çıkıyor"). Havuz zaten tanınır olduğundan ün-ağırlığı gerekmez; ağırlık en
  // tepedeki 10-13 kişiye kilitliyordu.
  if (tier === 'famous') return { cond: FAMOUS_POOL, order: `random()` };
  if (tier === 'mid') return { cond: `(NOT ${HAS_HONOURS} AND p.fame >= 90 AND p.fame < 230)`, order: `random()` };
  return { cond: `(NOT ${HAS_HONOURS} AND p.fame >= 30 AND p.fame < 90)`, order: `random()` };
}

/** Bir Çöz Kazan turunun bağlamı: hangi oyuncu havuzu + harf zorluğu. */
export interface CozContext {
  tier: CozTier;
  scramble: CozDifficulty;  // harf dizilimi zorluğu (easy/medium/hard)
  shortName?: boolean;      // bot-kolay: kısa isimli oyuncu
}
export const RANKED_COZ_CONTEXT: CozContext = { tier: 'famous', scramble: 'hard' };
/** Bot zorluğuna göre bağlam. */
export function cozContextForBot(botDifficulty: CozDifficulty): CozContext {
  if (botDifficulty === 'easy') return { tier: 'famous', scramble: 'easy', shortName: true };
  if (botDifficulty === 'hard') return { tier: 'obscure', scramble: 'hard' };
  return { tier: 'mid', scramble: 'medium' };
}

export interface CozRound {
  playerId: number;
  playerName: string;          // tam kanonik ad (reveal için)
  playerImageUrl: string | null;
  shownForm: string;           // karıştırılan biçim (soyad/tam ad), gösterim-normalize
  scrambled: string[];         // karışık kelimeler (BÜYÜK harf) — client'e gider
  difficulty: CozDifficulty;   // botun bilme-olasılığı ayarı için (famous→easy … obscure→hard)
}

/** Verilen tier'da (+ ops. kısa isim), resimli rastgele oyuncu (dışlananlar hariç). */
async function pickPlayer(tier: CozTier, exclude: number[], shortName = false): Promise<{ id: number; name: string; imageUrl: string | null; nationality: string | null } | null> {
  const maxLen = shortName ? 15 : 34;
  const { cond, order } = tierWhereOrder(tier);
  const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; nationality: string | null }>(
    `SELECT p.id, p.name, p.image_url, p.nationality
       FROM players p
      WHERE p.image_url IS NOT NULL
        AND char_length(p.name) BETWEEN 4 AND $2
        AND NOT (p.id = ANY($1::bigint[]))
        AND ${cond}
      ORDER BY ${order} LIMIT 1`,
    [exclude.length ? exclude : [0], maxLen],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: r.name, imageUrl: r.image_url, nationality: r.nationality } : null;
}

/** Tier → CozRound.difficulty (botun diffAdj'i için: ünlü=easy … az bilinen=hard). */
function tierToDifficulty(tier: CozTier): CozDifficulty {
  return tier === 'famous' ? 'easy' : tier === 'obscure' ? 'hard' : 'medium';
}

/** GÜNÜN BULMACASI için DETERMİNİSTİK tur: verilen (seed'li) rnd ile herkese AYNI
 * ünlü oyuncu + aynı karıştırma. Instance'lar arası tutarlı (yazma gerekmez). */
export async function buildDailyScramble(rnd: () => number): Promise<CozRound | null> {
  // Günün sorusu HERKESİN bileceği biri olsun → famous havuzu (onurlu VEYA fame≥230).
  const DAILY_POOL = `FROM players p WHERE p.image_url IS NOT NULL AND char_length(p.name) BETWEEN 4 AND 30 AND (p.fame >= 170 OR ${HAS_TOP_HONOURS})`;
  const { rows: cnt } = await pool.query<{ n: string }>(`SELECT count(*) n ${DAILY_POOL}`);
  const n = Number(cnt[0]?.n ?? 0);
  if (!n) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const off = Math.floor(rnd() * n);
    const { rows } = await pool.query<{ id: string; name: string; image_url: string | null; nationality: string | null }>(
      `SELECT p.id, p.name, p.image_url, p.nationality ${DAILY_POOL} ORDER BY p.id OFFSET $1 LIMIT 1`, [off]);
    const p = rows[0];
    if (!p) continue;
    const shownForm = pickNameForm(p.name); // herkes tam ad; mononimler tek isim
    if (matchKey(shownForm).length < 3) continue;
    const scrambled = scrambleForm(shownForm, rnd);
    if (!scrambled.length) continue;
    return { playerId: Number(p.id), playerName: p.name, playerImageUrl: p.image_url, shownForm, scrambled, difficulty: 'medium' };
  }
  return null;
}

/** Bir Çöz Kazan turu üretir: BAĞLAMA GÖRE oyuncu seç → biçim → karıştır. Uygun
 * oyuncu/biçim bulunamazsa null (çağıran tekrar dener). ctx yoksa dereceli (famous+zor). */
export async function buildCozKazanRound(exclude: number[], ctx: CozContext = RANKED_COZ_CONTEXT, rnd: () => number = Math.random): Promise<CozRound | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const p = await pickPlayer(ctx.tier, exclude, ctx.shortName).catch(() => null);
    if (!p) continue;
    const shownForm = pickNameForm(p.name); // herkes tam ad; mononimler tek isim
    if (matchKey(shownForm).length < 3) continue;         // çok kısa/dejenere → atla
    const scrambled = scrambleForm(shownForm, rnd, ctx.scramble);
    if (!scrambled.length || scrambled.join('').length < 3) continue;
    return { playerId: p.id, playerName: p.name, playerImageUrl: p.imageUrl, shownForm, scrambled, difficulty: tierToDifficulty(ctx.tier) };
  }
  return null;
}
