// ============================================================================
// KLİP ÜRETİCİ (2026-08-27) — TikTok/Reels için hazır soru kartı + kısa video.
//
// Oyunun KENDİ verisinden ("iki takımda da oynamış futbolcu") 9:16 içerik
// üretir: 3-2-1 geri sayımlı soru kartları + cevap kartı (PNG, resvg) ve
// ffmpeg varsa ~6.5 sn'lik dikey MP4. Müzik bilerek YOK — trend sesi TikTok
// içinde eklemek erişim için daha iyidir (ve lisans derdi yoktur).
//
// Tasarım dili: kit spec §14 ("AI teması yasak") — düz koyu lacivert zemin,
// tıknaz opak tipografi, banded ton geçişi; glassmorphism/glow yok.
//
// Kullanım:
//   npx tsx src/cli/daily-clip.ts                  # 1 çift, bugünün tarihiyle
//   npx tsx src/cli/daily-clip.ts --pairs 5 --tr   # 5 çift, Türk kulübü ağırlıklı
//   npx tsx src/cli/daily-clip.ts --seed elma      # deterministik farklı seçki
//   npx tsx src/cli/daily-clip.ts --no-video       # yalnız PNG'ler
// Çıktı: marketing/clips/<YYYY-MM-DD>/<slug>/ altında q3/q2/q1/answer.png,
// clip.mp4 ve yapıştırmaya hazır caption.txt.
// ============================================================================
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from '../db/pool.ts';
import { commonPlayersDetailed } from '../game/verify.ts';
import { clubPopularityTier, isTurkishClub } from '../game/clubPopularity.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
// Açıklamalardaki mağaza bağlantısı — tek yerde dursun.
const APP_STORE_URL = 'https://apps.apple.com/tr/app/crossover-football/id6778542426';
const FONT_DIR = join(REPO_ROOT, 'app/assets/fonts');
const FONTS = ['Poppins-Black.ttf', 'Poppins-ExtraBold.ttf', 'Poppins-SemiBold.ttf'].map((f) => join(FONT_DIR, f));

// dailyCrossover.ts ile aynı ilke (oradaki A_TEAM filtresinin kopyası — kaynak orası).
const A_TEAM_FILTER = `
  AND c.name_norm !~* '(women|femen|femin|femmin|frauen|kadin|ladies)'
  AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|sub-?[0-9]|youth|jugend|primavera|juvenil|altyapi|akademi|academy|junior|jeugd)([^a-z]|$)'
  AND c.name_norm !~* '( b| c| ii| iii| a[0-9]| reserves?| castilla| atletic)$'
`;

interface Args { pairs: number; seed: string; tr: boolean; video: boolean; out: string | null; teamA: string | null; teamB: string | null; countdown: number; answer: string | null }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const get = (flag: string) => { const i = a.indexOf(flag); return i >= 0 ? a[i + 1] : undefined; };
  return {
    pairs: Math.max(1, Math.min(20, Number(get('--pairs') ?? 1) || 1)),
    seed: get('--seed') ?? new Date().toISOString().slice(0, 10),
    tr: a.includes('--tr'),
    video: !a.includes('--no-video'),
    out: get('--out') ?? null,
    // Growth OS entegrasyonu: content item'ın teams[] alanıyla çağrılır —
    // rastgele seçim atlanır, tam bu çift render edilir.
    teamA: get('--teamA') ?? null,
    teamB: get('--teamB') ?? null,
    // Tek doğruluk kaynağı content item olsun diye reveal cevabı dışarıdan
    // dayatılabilir (Growth players[0] ile çağırır) — verilmezse en tanınır
    // ortak oyuncu bizden.
    answer: get('--answer') ?? null,
    // Growth storyboard'u 5-4-3-2-1 kullanıyor; organik el paylaşımı 3-2-1.
    countdown: Math.max(3, Math.min(5, Number(get('--countdown') ?? 3) || 3)),
  };
}

async function resolveClub(name: string): Promise<{ id: number; name: string; logo_url: string | null } | null> {
  // Kadro derinliğine göre çöz: aynı isimli dublör satırlar var ("Galatasaray A2",
  // "Galatasaray SK" 76 kadro vs "Galatasaray S.K." 871) — gerçek kulüp en dolu olandır.
  const { rows } = await pool.query<{ id: number; name: string; logo_url: string | null }>(
    `SELECT c.id, c.name, c.logo_url FROM clubs c JOIN player_clubs pc ON pc.club_id = c.id
      WHERE c.name ILIKE '%' || $1 || '%' AND c.is_national = FALSE ${A_TEAM_FILTER}
      GROUP BY c.id, c.name, c.logo_url
      ORDER BY COUNT(pc.player_id) DESC, c.id LIMIT 1`,
    [name],
  );
  return rows[0] ?? null;
}

function rngFrom(seedText: string): () => number {
  let counter = 0;
  return () => {
    const h = createHash('sha256').update(`${seedText}:${counter++}`).digest();
    return h.readUInt32BE(0) / 0xffffffff;
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Kart üstünde kısa isim: parantezleri ve kurumsal ekleri kırp (Real Madrid Club de Fútbol → Real Madrid).
function shortClubName(name: string): string {
  return name
    .replace(/\s*\(.*\)\s*/g, ' ')
    .replace(/\b(Club de Fútbol|Fútbol Club|Futbol Club|Football Club|Balompié|Calcio(?: 1913| 1909)?|F\.?C\.?|S\.?S\.?C?\.?|A\.?[CS]\.?|U\.?[CS]\.?|B\.?C\.?|C\.?F\.?|S\.?L\.?|S\.?K\.?|F\.?K\.?|K\.?V\.?|R\.?S\.?C\.?|1909|1913)\b\.?/g, '')
    .replace(/\s{2,}/g, ' ').trim() || name;
}

// TEK DENEME YETMİYOR (2026-09-01): 5 klipli toplu üretimde kaynak sunucu hız
// sınırına takılıyor ve cevap kartı sessizce "?" ile çıkıyordu — aynı çift tek
// başına çalıştırılınca sorunsuz geliyor. Bir kez daha, kısa beklemeyle denenir.
async function fetchImage(url: string): Promise<{ mime: string; b64: string } | null> {
  const ilk = await fetchImageOnce(url);
  if (ilk) return ilk;
  await new Promise((r) => setTimeout(r, 900));
  return fetchImageOnce(url);
}

async function fetchImageOnce(url: string): Promise<{ mime: string; b64: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'CrossoverClipMaker/1.0' } });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    if (mime.includes('svg') || url.toLowerCase().includes('.svg')) {
      // resvg SVG-içinde-SVG gömmez: önce PNG'ye çevir, onu göm.
      const tmpSvg = join('/tmp', `clip-crest-${createHash('md5').update(url).digest('hex')}.svg`);
      const tmpPng = tmpSvg.replace(/\.svg$/, '.png');
      writeFileSync(tmpSvg, buf);
      execFileSync('resvg', ['--width', '320', tmpSvg, tmpPng]);
      const png = Buffer.from(execFileSync('cat', [tmpPng]));
      rmSync(tmpSvg, { force: true }); rmSync(tmpPng, { force: true });
      return { mime: 'image/png', b64: png.toString('base64') };
    }
    return { mime, b64: buf.toString('base64') };
  } catch {
    return null;
  }
}

function crestSvg(cx: number, cy: number, img: { mime: string; b64: string } | null, name: string): string {
  const R = 150;
  const circle = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#FFFFFF"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#0A142B" stroke-width="10"/>`;
  if (img) {
    return `${circle}
    <clipPath id="clip${cx}"><circle cx="${cx}" cy="${cy}" r="${R - 14}"/></clipPath>
    <image x="${cx - 120}" y="${cy - 120}" width="240" height="240" preserveAspectRatio="xMidYMid meet"
      href="data:${img.mime};base64,${img.b64}" clip-path="url(#clip${cx})"/>`;
  }
  const initials = esc(name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase());
  return `${circle}
    <text x="${cx}" y="${cy + 34}" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="96" fill="#0A142B">${initials}</text>`;
}

interface CardData { teamA: { name: string; img: { mime: string; b64: string } | null }; teamB: { name: string; img: { mime: string; b64: string } | null } }

// Zemin: düz lacivert + 3 bantlı ton merdiveni (degrade yumuşatması yok — kit dili).
const BG = `
  <rect width="1080" height="1920" fill="#0A1834"/>
  <rect y="0" width="1080" height="640" fill="#0D1F44"/>
  <rect y="640" width="1080" height="640" fill="#0B1B3B"/>
  <rect y="0" width="1080" height="6" fill="#24406F"/>
`;
const FOOTER = `
  <rect y="1720" width="1080" height="200" fill="#071226"/>
  <rect y="1720" width="1080" height="5" fill="#F0B429"/>
  <text x="540" y="1806" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="52" fill="#FFFFFF" letter-spacing="2">CROSSOVER FOOTBALL</text>
  <text x="540" y="1868" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="34" fill="#8FA5C8">App Store'da ücretsiz · crossoverfootball.com</text>
`;

function questionSvg(d: CardData, count: number | null): string {
  const countBlock = count == null ? '' : `
    <circle cx="540" cy="1445" r="130" fill="#F0B429"/>
    <circle cx="540" cy="1445" r="130" fill="none" stroke="#B37F0E" stroke-width="10"/>
    <text x="540" y="1512" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="190" fill="#071226">${count}</text>`;
  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  ${BG}
  <rect x="290" y="120" width="500" height="78" rx="39" fill="#F0B429"/>
  <text x="540" y="174" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="40" fill="#071226" letter-spacing="3">GÜNÜN SORUSU</text>
  <text x="540" y="330" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="76" fill="#FFFFFF">BU İKİSİNDE DE</text>
  <text x="540" y="424" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="76" fill="#F0B429">FORMA GİYDİ</text>
  ${crestSvg(300, 760, d.teamA.img, d.teamA.name)}
  ${crestSvg(780, 760, d.teamB.img, d.teamB.name)}
  <text x="540" y="790" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="84" fill="#8FA5C8">×</text>
  <text x="300" y="1010" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="46" fill="#FFFFFF">${esc(shortClubName(d.teamA.name))}</text>
  <text x="780" y="1010" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="46" fill="#FFFFFF">${esc(shortClubName(d.teamB.name))}</text>
  <text x="540" y="1200" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="120" fill="#FFFFFF">KİM?</text>
  ${countBlock}
  <text x="540" y="1662" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="38" fill="#8FA5C8">Cevabı yorumlara yaz</text>
  <path d="M 516 1678 L 564 1678 L 540 1702 Z" fill="#F0B429"/>
  ${FOOTER}
</svg>`;
}

function answerSvg(d: CardData, playerName: string, playerImg: { mime: string; b64: string } | null, extraCount: number): string {
  const photo = playerImg
    ? `<clipPath id="pclip"><circle cx="540" cy="820" r="170"/></clipPath>
       <circle cx="540" cy="820" r="184" fill="#F0B429"/>
       <image x="${540 - 170}" y="${820 - 170}" width="340" height="340" preserveAspectRatio="xMidYMid slice" href="data:${playerImg.mime};base64,${playerImg.b64}" clip-path="url(#pclip)"/>`
    : `<circle cx="540" cy="820" r="170" fill="#0D1F44"/><circle cx="540" cy="820" r="170" fill="none" stroke="#F0B429" stroke-width="10"/><text x="540" y="878" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="160" fill="#F0B429">?</text>`;
  const arrow = (y: number) => `<path d="M 516 ${y} L 564 ${y} L 540 ${y + 24} Z" fill="#F0B429"/>`;
  const extra = extraCount > 0
    ? `<text x="540" y="1420" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="42" fill="#8FA5C8">+${extraCount} doğru cevap daha var…</text>
       <text x="540" y="1486" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="44" fill="#FFFFFF">Kaçını buldun? Yorumlara yaz</text>
       ${arrow(1506)}`
    : `<text x="540" y="1450" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="44" fill="#FFFFFF">Bildin mi? Yorumlara yaz</text>
       ${arrow(1470)}`;
  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  ${BG}
  <rect x="380" y="140" width="320" height="90" rx="45" fill="#2ECC71"/>
  <text x="540" y="203" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="48" fill="#06220F" letter-spacing="4">CEVAP</text>
  <text x="540" y="420" text-anchor="middle" font-family="Poppins" font-weight="800" font-size="46" fill="#8FA5C8">${esc(shortClubName(d.teamA.name))} × ${esc(shortClubName(d.teamB.name))}</text>
  ${photo}
  <text x="540" y="1150" text-anchor="middle" font-family="Poppins" font-weight="900" font-size="${playerName.length > 16 ? 76 : 96}" fill="#F0B429">${esc(playerName.toUpperCase())}</text>
  ${extra}
  ${FOOTER}
</svg>`;
}

function renderPng(svg: string, outPath: string): void {
  const tmp = outPath.replace(/\.png$/, '.svg');
  writeFileSync(tmp, svg);
  execFileSync('resvg', [...FONTS.flatMap((f) => ['--use-font-file', f]), '--width', '1080', tmp, outPath]);
  rmSync(tmp, { force: true });
}

function buildVideo(dir: string, countdown: number): void {
  // N..1 geri sayım (1.1 sn/kart) + cevap 3 sn — 30fps, sessiz (ses TikTok'ta eklenir).
  const inputs: string[] = [];
  const counts = Array.from({ length: countdown }, (_, i) => countdown - i);
  for (const n of counts) inputs.push('-loop', '1', '-t', '1.1', '-i', join(dir, `q${n}.png`));
  inputs.push('-loop', '1', '-t', '3.0', '-i', join(dir, 'answer.png'));
  const streams = Array.from({ length: counts.length + 1 }, (_, i) => `[${i}:v]`).join('');
  execFileSync('ffmpeg', [
    '-y', ...inputs,
    '-filter_complex', `${streams}concat=n=${counts.length + 1}:v=1:a=0,format=yuv420p`,
    '-r', '30', join(dir, 'clip.mp4'),
  ], { stdio: 'pipe' });
}

async function main(): Promise<void> {
  const args = parseArgs();
  const rnd = rngFrom(`cof-clip:${args.seed}`);
  const dateStr = new Date().toISOString().slice(0, 10);
  const outRoot = args.out ?? join(REPO_ROOT, 'marketing/clips', dateStr);
  mkdirSync(outRoot, { recursive: true });

  // Sabit çift modu (Growth OS entegrasyonu): --teamA/--teamB verildiyse
  // rastgele seçim yok — tam bu çift render edilir.
  if (args.teamA && args.teamB) {
    const [a, b] = await Promise.all([resolveClub(args.teamA), resolveClub(args.teamB)]);
    if (!a || !b) throw new Error(`Kulüp bulunamadı: ${!a ? args.teamA : args.teamB}`);
    const answers = await commonPlayersDetailed(Number(a.id), Number(b.id), 8);
    if (!answers.length) throw new Error(`${a.name} × ${b.name} için ortak oyuncu yok`);
    await producePair(outRoot, 1, a, b, answers, args);
    console.log(`\n1 klip hazır → ${outRoot}`);
    return;
  }

  // Kadro derinliğiyle sırala (dailyCrossover.ts ile aynı gerekçe: popularity
  // kolonu ortamlar arası tutarsız, dublör satırlar var).
  const { rows: rawClubs } = await pool.query<{ id: number; name: string; logo_url: string | null; popularity: string | null }>(
    `SELECT c.id, c.name, c.logo_url, c.popularity::text AS popularity, COUNT(pc.player_id)::int AS squad
       FROM clubs c JOIN player_clubs pc ON pc.club_id = c.id
      WHERE c.is_national = FALSE AND c.logo_url IS NOT NULL ${A_TEAM_FILTER}
      GROUP BY c.id, c.name, c.logo_url, c.popularity
      ORDER BY COUNT(pc.player_id) DESC, c.id LIMIT 220`,
  );
  const famous = rawClubs.filter((c) => {
    const t = clubPopularityTier({ name: c.name, popularity: Number(c.popularity ?? 0) });
    return t === 'GLOBAL_GIANT' || t === 'VERY_POPULAR' || t === 'POPULAR';
  });
  const turkish = famous.filter((c) => isTurkishClub(c.name));
  const usedClubIds = new Set<number>();

  let made = 0;
  for (let attempt = 0; attempt < args.pairs * 8 && made < args.pairs; attempt++) {
    const poolA = args.tr && turkish.length && rnd() < 0.6 ? turkish : famous;
    const teamA = poolA[Math.floor(rnd() * poolA.length)]!;
    if (usedClubIds.has(Number(teamA.id))) continue;
    const { rows: partners } = await pool.query<{ id: number; name: string; logo_url: string | null }>(
      `SELECT c.id, c.name, c.logo_url
         FROM player_clubs a
         JOIN player_clubs b ON b.player_id = a.player_id AND b.club_id <> a.club_id
         JOIN clubs c ON c.id = b.club_id
        WHERE a.club_id = $1 AND c.is_national = FALSE AND c.logo_url IS NOT NULL ${A_TEAM_FILTER}
        GROUP BY c.id, c.name, c.logo_url
       HAVING COUNT(DISTINCT a.player_id) >= 3
        ORDER BY c.popularity DESC NULLS LAST, c.id LIMIT 40`,
      [teamA.id],
    );
    const famousIds = new Set(famous.map((c) => Number(c.id)));
    const known = partners.filter((c) => famousIds.has(Number(c.id)) && !usedClubIds.has(Number(c.id)));
    if (!known.length) continue;
    const teamB = known.slice(0, 15)[Math.floor(rnd() * Math.min(15, known.length))]!;
    const answers = await commonPlayersDetailed(Number(teamA.id), Number(teamB.id), 8);
    if (!answers.length) continue;

    usedClubIds.add(Number(teamA.id)); usedClubIds.add(Number(teamB.id));
    await producePair(outRoot, made + 1, teamA, teamB, answers, args);
    made += 1;
  }
  console.log(made ? `\n${made} klip hazır → ${outRoot}` : 'Uygun çift bulunamadı — DB dolu mu?');
}

async function producePair(
  outRoot: string,
  index: number,
  teamA: { id: number; name: string; logo_url: string | null },
  teamB: { id: number; name: string; logo_url: string | null },
  answers: { name: string; imageUrl: string | null }[],
  args: Args,
): Promise<void> {
  const slug = `${shortClubName(teamA.name)}-${shortClubName(teamB.name)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const dir = join(outRoot, `${String(index).padStart(2, '0')}-${slug}`);
  mkdirSync(dir, { recursive: true });

  const [imgA, imgB] = await Promise.all([
    teamA.logo_url ? fetchImage(teamA.logo_url) : null,
    teamB.logo_url ? fetchImage(teamB.logo_url) : null,
  ]);
  // --answer: reveal cevabını çağıran belirler (Growth content item = tek
  // doğruluk kaynağı). Listede bulunursa fotoğrafıyla; bulunmazsa isim aynen
  // kullanılır, fotoğraf DB'den aranır.
  let top = answers[0]!;
  if (args.answer) {
    const norm = (s: string) => s.toLocaleLowerCase('tr-TR').trim();
    const want = norm(args.answer);
    const hit = answers.find((p) => norm(p.name).includes(want) || want.includes(norm(p.name)));
    if (hit) top = hit;
    else {
      const { rows: ph } = await pool.query<{ name: string; image_url: string | null }>(
        `SELECT name, image_url FROM players WHERE name ILIKE '%' || $1 || '%' LIMIT 1`,
        [args.answer],
      );
      top = { name: ph[0]?.name ?? args.answer, imageUrl: ph[0]?.image_url ?? null };
      console.warn(`  ! --answer "${args.answer}" ortak listede yok — yine de kullanılıyor (yayın öncesi kontrol et)`);
    }
  }
  const playerImg = top.imageUrl ? await fetchImage(top.imageUrl) : null;
  // Fotoğrafsız cevap kartı "?" ile çıkar — yayına gitmeden ÖNCE bilinmeli.
  if (!playerImg) console.warn(`  ! ${top.name}: cevap kartı fotoğrafsız (${top.imageUrl ? 'indirilemedi: ' + top.imageUrl.slice(0, 70) : 'DB\'de foto yok'})`);
  const card: CardData = { teamA: { name: teamA.name, img: imgA }, teamB: { name: teamB.name, img: imgB } };

  for (let n = args.countdown; n >= 1; n--) renderPng(questionSvg(card, n), join(dir, `q${n}.png`));
  renderPng(answerSvg(card, top.name, playerImg, answers.length - 1), join(dir, 'answer.png'));

  // METİNLER PLATFORMA GÖRE AYRI (2026-09-01): tek bir TikTok caption'ı vardı ve
  // aranan terimi HİÇ içermiyordu. "3-2-1 oyunu" araması Google'da tamamen
  // videoyla dolu (ilk 20'de tek web sitesi yok) — o listeye girmenin tek yolu
  // videoyu o adla yayınlamak. Sıralamayı YouTube tuttuğu için başlık ve
  // açıklama ayrıca üretilir; YouTube başlığı sıralamada caption'dan ağır basar.
  const kisaA = shortClubName(teamA.name);
  const kisaB = shortClubName(teamB.name);
  const digerSayi = answers.length - 1;
  writeFileSync(join(dir, 'caption.txt'),
    `── YOUTUBE SHORTS BAŞLIĞI ──\n`
    + `3-2-1 Oyunu | ${kisaA} × ${kisaB} — Ortak Futbolcu Kim? #shorts\n\n`
    + `── YOUTUBE AÇIKLAMASI ──\n`
    + `${kisaA} ve ${kisaB} formalarının ikisini de giymiş futbolcuyu ${args.countdown} saniyede bulabilir misin?\n`
    + (digerSayi > 0 ? `Bu eşleşmede toplam ${answers.length} doğru cevap var — kaçını biliyorsun?\n` : '')
    + `\n3-2-1 oyununun (iki takımda da oynayan futbolcuyu bulma oyunu) kurallı hâli: CrossOver Football.\n`
    + `Canlı 1v1, gerçek transfer verisiyle doğrulanan cevaplar. iOS'ta ücretsiz:\n`
    + `${APP_STORE_URL}\n\n`
    + `#shorts #321oyunu #ortakfutbolcu #futbol #futbolbilgisi\n\n`
    + `── TIKTOK / REELS ──\n`
    + `3-2-1 oyunu! Bu iki takımda da oynayan futbolcuyu ${args.countdown} saniyede bil ⚽ ${kisaA} × ${kisaB}`
    + `${digerSayi > 0 ? ` — ${answers.length} doğru cevabı var` : ''}, bulduğun isimleri yorumlara yaz 👇\n\n`
    + `#321oyunu #ortakfutbolcu #futbol #futbolbilgisi #quiz #futbolcu #tahmin #kesfet #crossoverfootball\n`);

  if (args.video) {
    try { buildVideo(dir, args.countdown); } catch (err) {
      console.warn(`  ! video atlandı (${slug}):`, err instanceof Error ? err.message.slice(0, 120) : err);
    }
  }
  console.log(`✓ ${String(index).padStart(2, '0')} ${shortClubName(teamA.name)} × ${shortClubName(teamB.name)} — cevap: ${top.name} (+${answers.length - 1})`);
}

main().catch((err) => { console.error('daily-clip failed:', err); process.exitCode = 1; }).finally(closePool);
