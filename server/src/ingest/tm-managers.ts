// ============================================================================
// TM MANAGERS — Transfermarkt'tan teknik direktör (baş antrenör) DÖNEM verisi.
//
// XOX "teknik direktör" ekseni için: her TD'nin ad + foto + yönettiği kulüplerde
// başlangıç/bitiş yılı. Kaynak transfermarkt.com (doğrudan HTML; felipeall API
// gerekmez). Fizibilite workflow'uyla kanıtlanan yöntem:
//   1) TM aramasıyla doğru trainer id'yi çöz (slug tuzağına düşme).
//   2) /stationen/trainer/{id} → "History" tablosu STATİK HTML (AJAX yok).
//   3) Satırlardan verein/{tmClubId} + Appointed/In charge until tarihleri.
//   4) YALNIZ baş antrenör rolü (Assistant/Scout/Director/GSD HARİÇ).
//   5) tmClubId = clubs.id (doğrudan) → yalnız DB'de VAR OLAN kulüpleri tut.
//
// Çalıştırma:  (server dizininde)  npx tsx src/ingest/tm-managers.ts
// Liste MANAGERS sabitinde. Idempotent: her TD için dönemler baştan yazılır.
// ============================================================================
import { pool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

// Kürasyon listesi (kullanıcı kararı 2026-08-29): yalnız bu 7 ünlü TD.
// İsim yeter; TM id otomatik çözülür. Listede OLMAYAN TD'ler DB'den silinir (aşağıda).
const MANAGERS: string[] = [
  'Pep Guardiola', 'José Mourinho', 'Zinédine Zidane', 'Carlo Ancelotti',
  'Alex Ferguson', 'Diego Simeone', 'Luis Enrique',
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASE = 'https://www.transfermarkt.com';
const DELAY = Number(process.env.TM_DELAY_MS ?? 700);
const CUR_YEAR = new Date().getFullYear();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    let r: Response;
    try { r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'text/html' } }); }
    catch { await sleep(3000); continue; }
    await sleep(DELAY);
    if (r.status === 404 || r.status === 400) return null;
    if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(15000); continue; }
    if (!r.ok) return null;
    return r.text();
  }
  return null;
}

/** TM aramasıyla doğru trainer id'yi çöz (ilk /profil/trainer/{id}). */
async function resolveTrainerId(name: string): Promise<number | null> {
  const html = await get(`${BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name)}`);
  if (!html) return null;
  const m = html.match(/\/profil\/trainer\/(\d+)/);
  return m ? Number(m[1]) : null;
}

interface Tenure { clubId: number; startYear: number; endYear: number | null }

/** Baş antrenör dönemleri: yalnız 'Manager' rolü; Assistant/Scout/Director hariç. */
function parseStations(html: string): Tenure[] {
  const tables = html.match(/<table class="items">[\s\S]*?<\/table>/g) ?? [];
  const target = tables.find((t) => t.includes('Appointed') && t.includes('In charge until'));
  if (!target) return [];
  const tbodyM = target.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyM) return [];
  const rows = tbodyM[1]!.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  const out: Tenure[] = [];
  for (const row of rows) {
    // Rol filtresi: yalnız BAŞ ANTRENÖR. Assistant/Scout/Director/GSD/Co-Trainer hariç.
    if (/Assistant|Scout|Director|Co-?Trainer|Goalkeep|Fitness|Analyst|Interpreter/i.test(row)) continue;
    const vm = row.match(/\/verein\/(\d+)/);
    if (!vm) continue;
    const clubId = Number(vm[1]);
    // Parantezli gerçek tarihler: ilk=Appointed(başlangıç), ikinci=In charge until(bitiş).
    const dates = [...row.matchAll(/\((\d{2})\/(\d{2})\/(\d{4})\)/g)].map((d) => Number(d[3]));
    if (!dates.length) continue;
    const startYear = dates[0]!;
    let endYear: number | null = dates.length >= 2 ? dates[1]! : null;
    if (endYear != null && endYear > CUR_YEAR) endYear = null; // gelecek/açık uçlu → devam ediyor
    out.push({ clubId, startYear, endYear });
  }
  return out;
}

function parsePhoto(html: string): string | null {
  const m = html.match(/src="(https:\/\/img\.a\.transfermarkt\.technology\/portrait\/(?:header|big|medium)\/[^"]+)"/);
  return m ? m[1]! : null;
}

function parseName(html: string): string | null {
  const m = html.match(/<h1[^>]*class="data-header__headline-wrapper[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
  if (!m) return null;
  return m[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

async function dbClubIds(): Promise<Set<number>> {
  const { rows } = await pool.query<{ id: string }>('SELECT id FROM clubs');
  return new Set(rows.map((r) => Number(r.id)));
}

async function upsertManager(id: number, name: string, photo: string | null, tenures: Tenure[]): Promise<void> {
  await pool.query(
    `INSERT INTO managers(id, name, name_norm, image_url) VALUES($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, name_norm=EXCLUDED.name_norm,
       image_url=COALESCE(EXCLUDED.image_url, managers.image_url)`,
    [id, name, normalize(name), photo],
  );
  await pool.query('DELETE FROM manager_tenures WHERE manager_id=$1', [id]);
  for (const t of tenures) {
    await pool.query(
      `INSERT INTO manager_tenures(manager_id, club_id, start_year, end_year) VALUES($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [id, t.clubId, t.startYear, t.endYear],
    );
  }
}

async function main(): Promise<void> {
  const clubIds = await dbClubIds();
  let ok = 0, totalTenures = 0;
  const ingestedIds: number[] = [];
  for (const nameIn of MANAGERS) {
    const id = await resolveTrainerId(nameIn);
    if (!id) { console.log(`❌ id bulunamadı: ${nameIn}`); continue; }
    const [stHtml, prHtml] = [await get(`${BASE}/x/stationen/trainer/${id}`), await get(`${BASE}/x/profil/trainer/${id}`)];
    if (!stHtml) { console.log(`❌ stations yok: ${nameIn} (${id})`); continue; }
    const allTenures = parseStations(stHtml);
    const tenures = allTenures.filter((t) => clubIds.has(t.clubId)); // yalnız DB'de var olan kulüpler
    const name = (prHtml && parseName(prHtml)) || nameIn;
    const photo = prHtml ? parsePhoto(prHtml) : null;
    if (!tenures.length) { console.log(`⚠️ DB-kulüp dönemi yok: ${name} (${id}) — ham ${allTenures.length} dönem`); continue; }
    await upsertManager(id, name, photo, tenures);
    ingestedIds.push(id);
    ok++; totalTenures += tenures.length;
    console.log(`✅ ${name} (${id}) — ${tenures.length}/${allTenures.length} dönem DB'de | foto ${photo ? 'var' : 'YOK'}`);
  }
  // Kendini temizle: listede OLMAYAN TD'leri (ve dönemlerini CASCADE ile) sil —
  // böylece managers tablosu her zaman güncel liste ile birebir eşleşir.
  if (ingestedIds.length) {
    const del = await pool.query('DELETE FROM managers WHERE id <> ALL($1::bigint[])', [ingestedIds]);
    if (del.rowCount) console.log(`🧹 listede olmayan ${del.rowCount} TD silindi`);
  }
  console.log(`\n=== BİTTİ: ${ok}/${MANAGERS.length} TD, ${totalTenures} dönem ===`);
  await pool.end();
}

void main();
