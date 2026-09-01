// ============================================================================
// TM PROFİL (mevki + piyasa değeri) — felipeall/transfermarkt-api ÜZERİNDEN.
//
// Doğrudan web-scraping TM tarafından engelleniyordu (403). Bunun yerine projenin
// ANA veri kaynağı olan yerel TM API'si kullanılır: GET {TM_API}/players/{id}/profile
// → yapısal JSON: position.main (KATI ana mevki) + marketValue (euro). Hızlı, engelsiz.
// players.id = TM id. Resume'lu (positions_scanned). Bloke oyuncu scanned İŞARETLENMEZ
// → sonraki çalıştırma alır.
//
// Önce TM API'yi çalıştır (docker run -p 8000:8000 felipeall/transfermarkt-api ya da
// yerel uvicorn). Adres TM_API ile verilir (vars. http://127.0.0.1:8001).
// Çalıştırma: (server) TM_API=http://127.0.0.1:8001 npx tsx src/ingest/tm-positions.ts
// ============================================================================
import { readFileSync } from 'node:fs';
import { pool } from '../db/pool.ts';

const TM_API = (process.env.TM_API ?? 'http://127.0.0.1:8001').split(',')[0]!.trim();
const DELAY = Number(process.env.TM_DELAY_MS ?? 0);        // yerel API hızlı → gecikme gerekmez
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);  // yerel API → paralel güvenli
const GRID_CLUBS_FILE = process.env.GRID_CLUBS_FILE ?? '/tmp/gridclubs.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// TM ana mevki (İngilizce) → kod. Kapsanmayan → atla (mevki kaydedilmez).
function positionCode(main: string): string | null {
  const s = main.trim().toLowerCase();
  if (s === 'goalkeeper') return 'GK';
  if (s === 'centre-back' || s === 'sweeper') return 'CB';
  if (s === 'right-back' || s === 'right wing-back') return 'RB';
  if (s === 'left-back' || s === 'left wing-back') return 'LB';
  if (s === 'defensive midfield' || s === 'central midfield' || s === 'attacking midfield') return 'MF';
  if (s === 'left winger' || s === 'left midfield') return 'LW';
  if (s === 'right winger' || s === 'right midfield') return 'RW';
  if (s === 'centre-forward' || s === 'second striker') return 'ST';
  return null;
}

interface Profile { name: string | null; position: string | null; marketValue: number | null }

// TM API profilini çeker. blocked: geçici hata (isim boş / API hatası) → oyuncu
// scanned İŞARETLENMEZ, sonraki çalıştırmada tekrar denenir. 404 → veri yok (scanned).
async function getProfile(id: number): Promise<{ profile: Profile | null; blocked: boolean }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let r: Response;
    try { r = await fetch(`${TM_API}/players/${id}/profile`, { headers: { accept: 'application/json' } }); }
    catch { await sleep(2000); continue; }
    if (r.status === 404) return { profile: { name: null, position: null, marketValue: null }, blocked: false };
    if (!r.ok) { await sleep(1500 + attempt * 1500); continue; }
    let j: { name?: string; position?: { main?: string | null } | null; marketValue?: number | null };
    try { j = await r.json() as typeof j; } catch { await sleep(1500); continue; }
    if (!j || !j.name) { await sleep(1200 + attempt * 1200); continue; } // transient boş → tekrar
    const main = j.position && typeof j.position === 'object' ? (j.position.main ?? null) : null;
    const mv = typeof j.marketValue === 'number' ? j.marketValue : null;
    if (DELAY) await sleep(DELAY);
    return { profile: { name: j.name, position: main, marketValue: mv }, blocked: false };
  }
  return { profile: null, blocked: true };
}

// Hedef: GRIDE GİREN kulüplerin (fame havuzu, ~62 kulüp) TÜM oyuncuları. Kulüp id
// listesi GRID_CLUBS_FILE'dan okunur (generateXoxGrid ile üretilir). Böylece bir
// STOPER×kulüp hücresine yazılabilecek HER oyuncunun ana mevkisi bilinir → doğru
// oyuncu (Maguire/Piqué gibi) asla yanlışlıkla reddedilmez.
async function targetPlayers(): Promise<number[]> {
  const clubIds = JSON.parse(readFileSync(GRID_CLUBS_FILE, 'utf8')) as number[];
  // EN ÜNLÜ kulüplerin oyuncuları ÖNCE (prestige DESC) → sık test edilen hücreler
  // (Man Utd/Barça vb.) en kısa sürede tam mevkili olur.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT pc.player_id AS id, MAX(cl.prestige) AS pr
       FROM player_clubs pc JOIN clubs cl ON cl.id = pc.club_id
      WHERE pc.club_id = ANY($1::bigint[])
      GROUP BY pc.player_id ORDER BY pr DESC`,
    [clubIds],
  );
  return rows.map((r) => Number(r.id));
}

async function scanOne(id: number, tally: Record<string, number>): Promise<{ pos: boolean; mv: boolean; blocked: boolean }> {
  const { profile, blocked } = await getProfile(id);
  if (blocked) return { pos: false, mv: false, blocked: true }; // scanned İŞARETLEME → sonra tekrar
  let pos = false, mvSet = false;
  if (profile) {
    const code = profile.position ? positionCode(profile.position) : null;
    if (code) {
      await pool.query(
        `INSERT INTO player_positions(player_id,position) VALUES($1,$2)
         ON CONFLICT(player_id) DO UPDATE SET position=EXCLUDED.position`, [id, code]);
      pos = true; tally[code] = (tally[code] ?? 0) + 1;
    }
    if (profile.marketValue != null && profile.marketValue > 0) {
      await pool.query('UPDATE players SET market_value = $2 WHERE id = $1', [id, profile.marketValue]);
      mvSet = true;
    }
  }
  await pool.query('INSERT INTO positions_scanned(player_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
  return { pos, mv: mvSet, blocked: false };
}

// Kullanıcının test ettiği örnekler + sık yazılan marquee oyuncular ÖNCE (TM engeli
// aralıklı; ilk açılan pencerelerde bunlar dolsun). İstersen genişletilebilir.
const PRIORITY_IDS = [
  177907, 18944, // Maguire, Piqué (kullanıcı örnekleri)
  25557, 88755, 3373, 28003, 8198, 68290, // Ramos, van Dijk, Ronaldinho, Messi, C.Ronaldo, Kimmich
];

async function main(): Promise<void> {
  const all = await targetPlayers();
  const allSet = new Set(all);
  const { rows: sc } = await pool.query<{ player_id: string }>('SELECT player_id FROM positions_scanned');
  const done = new Set(sc.map((r) => Number(r.player_id)));
  const prio = PRIORITY_IDS.filter((id) => allSet.has(id) && !done.has(id));
  const prioSet = new Set(prio);
  const todo = [...prio, ...all.filter((id) => !done.has(id) && !prioSet.has(id))];
  console.log(`hedef ${all.length} oyuncu, taranmış ${done.size}, kalan ${todo.length} | worker ${CONCURRENCY} | delay ${DELAY}ms | API ${TM_API}`);
  const posTally: Record<string, number> = {};
  const BLOCK_WAIT = Number(process.env.BLOCK_WAIT_MS ?? 30000); // TM engeli → nazikçe bekle
  let cursor = 0, ok = 0, withPos = 0, mvCount = 0, blocks = 0;
  const startedAt = Date.now();
  // SABIRLI paralel: bloke olunca cursor İLERLEMEZ (aynı oyuncu tekrar denenir) ve
  // kısa süre beklenir → TM zorlanmaz, engel geçince akış sürer. Her başarıda gecikme.
  async function worker(): Promise<void> {
    while (cursor < todo.length) {
      const id = todo[cursor]!;
      const r = await scanOne(id, posTally);
      if (r.blocked) {
        blocks++;
        if (blocks % 4 === 1) console.log(`⏸ TM engelli (${blocks}) — ${BLOCK_WAIT / 1000}sn bekle (cursor ${cursor}/${todo.length})`);
        await sleep(BLOCK_WAIT);
        continue;
      }
      cursor++; ok++; if (r.pos) withPos++; if (r.mv) mvCount++;
      if (DELAY) await sleep(DELAY);
      if (ok % 100 === 0) {
        const rate = ok / ((Date.now() - startedAt) / 1000);
        const eta = rate > 0 ? Math.round((todo.length - ok) / rate / 60) : 0;
        console.log(`... ${ok}/${todo.length} | mevkili ${withPos} | MV ${mvCount} | bloke ${blocks} | ~${rate.toFixed(2)}/s | kalan ~${eta} dk`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, () => worker()));
  console.log(`\n=== BİTTİ: ${ok} tarandı | mevkili ${withPos} | MV ${mvCount} | bloke ${blocks} ===`);
  console.log('mevki dağılımı:', JSON.stringify(posTally));
  await pool.end();
}

void main();
