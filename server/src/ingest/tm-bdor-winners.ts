// Hedefli: modern Ballon d'Or kazananlarını isimle çöz → profil → mevki + BDOR.
// (kulüp-bazlı taramanın kaçırdığı Messi/Benzema/Zidane vb. garanti eklenir.)
// (server dizininde)  npx tsx src/ingest/tm-bdor-winners.ts
import { pool } from '../db/pool.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASE = 'https://www.transfermarkt.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const WINNERS = [
  'Lionel Messi', 'Cristiano Ronaldo', 'Karim Benzema', 'Luka Modrić', 'Ronaldinho',
  'Kaká', 'Fabio Cannavaro', 'Pavel Nedvěd', 'Andriy Shevchenko', 'Luís Figo',
  'Rivaldo', 'Ronaldo', 'Zinedine Zidane', 'Michael Owen', 'George Weah',
  'Matthias Sammer', 'Hristo Stoichkov', 'Roberto Baggio', 'Marco van Basten',
  'Ruud Gullit', 'Lothar Matthäus', 'Jean-Pierre Papin', 'Rodri', 'Ousmane Dembélé',
];

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
async function get(url: string): Promise<string | null> {
  for (let a = 0; a < 5; a++) {
    let r: Response;
    try { r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'text/html' }, redirect: 'follow' }); }
    catch { await sleep(2500); continue; }
    await sleep(500);
    if (r.status === 404) return null;
    if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(12000); continue; }
    if (!r.ok) return null;
    return r.text();
  }
  return null;
}
async function resolveId(name: string): Promise<number | null> {
  const html = await get(`${BASE}/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name)}`);
  if (!html) return null;
  const m = html.match(/\/profil\/spieler\/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function main(): Promise<void> {
  const { rows: known } = await pool.query<{ id: string }>('SELECT id FROM players');
  const dbIds = new Set(known.map((r) => Number(r.id)));
  let bdor = 0, pos = 0, notInDb = 0;
  for (const name of WINNERS) {
    const id = await resolveId(name);
    if (!id) { console.log(`❌ id yok: ${name}`); continue; }
    if (!dbIds.has(id)) { console.log(`⚠️ DB'de yok: ${name} (${id})`); notInDb++; continue; }
    const html = await get(`${BASE}/x/profil/spieler/${id}`);
    if (!html) { console.log(`❌ profil yok: ${name} (${id})`); continue; }
    const main = html.match(/Main position:[\s\S]*?<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/);
    const code = main ? positionCode(main[1]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : null;
    if (code) { await pool.query(`INSERT INTO player_positions(player_id,position) VALUES($1,$2) ON CONFLICT(player_id) DO UPDATE SET position=EXCLUDED.position`, [id, code]); pos++; }
    const won = /title="Winner Ballon d'Or"/.test(html);
    if (won) { await pool.query(`INSERT INTO player_honours(player_id,competition) VALUES($1,'BDOR') ON CONFLICT DO NOTHING`, [id]); bdor++; }
    await pool.query('INSERT INTO positions_scanned(player_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
    console.log(`✅ ${name} (${id}) — mevki ${code ?? '-'} | BDOR ${won ? 'EVET' : 'hayır'}`);
  }
  console.log(`\n=== BİTTİ: ${bdor} BDOR, ${pos} mevki, ${notInDb} DB'de yok ===`);
  await pool.end();
}
void main();
