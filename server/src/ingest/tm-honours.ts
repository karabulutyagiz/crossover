// ============================================================================
// TM HONOURS — Transfermarkt'tan oyuncu KUPA (kazanan) verisi.
//
// XOX "kupa" ekseni için: hedef kupaları (CL / WC / EL) KAZANMIŞ oyuncular.
// Kaynak: TM oyuncu Erfolge sayfası (/erfolge/spieler/{id}); başlık deseni
//   ">Nx {Kupa} winner<"  (runner-up/participant HARİÇ). Tam eşleşme ile
//   "FIFA Club World Cup"/"U20 World Cup" tuzakları elenir.
// Kapsam: havuz kulüplerinin en ünlü ~2000 oyuncusu (kullanıcı kararı 2026-08-29).
// players.id = TM id (doğrudan). Resume'lu (honours_scanned).
//
// Çalıştırma:  (server dizininde)  npx tsx src/ingest/tm-honours.ts
// ============================================================================
import { pool } from '../db/pool.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BASE = 'https://www.transfermarkt.com';
const DELAY = Number(process.env.TM_DELAY_MS ?? 650);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Hedef kupa adları (TAM eşleşme; tarihsel adlar dahil).
const CL = new Set(['UEFA Champions League', 'Champions League', 'European Cup']);
const WC = new Set(['World Cup']);
const EL = new Set(['UEFA Europa League', 'Europa League', 'UEFA Cup']);

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

/** Erfolge HTML → kazanılan hedef kupalar (CL/WC/EL). */
function parseHonours(html: string): string[] {
  const won = new Set<string>();
  for (const m of html.matchAll(/>(\d+)x\s+([^<]+?)\s+winner</g)) {
    const comp = m[2]!.trim();
    if (CL.has(comp)) won.add('CL');
    else if (WC.has(comp)) won.add('WC');
    else if (EL.has(comp)) won.add('EL');
  }
  return [...won];
}

// Elit kulüpler (TM id). DB'de popularity=roster-şişkinliği / market_value=0 →
// güvenilir fame metriği YOK. Bu yüzden kupa kazananların yoğunlaştığı elit
// kulüpleri DOĞRUDAN id ile hedefliyoruz; bu kulüplerin TÜM oyuncuları taranır
// (tek-kulüp efsaneleri de dahil: Xavi/Maldini/Gerrard/Raúl…). 12 dev + Türk 3'lü.
const ELITE_CLUB_IDS = [
  418, 131, 27, 281, 985, 31, 631, 506, 46, 5, 583, 610, // Real, Barça, Bayern, City, Utd, Liverpool, Chelsea, Juve, Inter, Milan, PSG, Ajax
  141, 36, 114,                                            // Galatasaray, Fenerbahçe, Beşiktaş
];

async function targetPlayers(): Promise<number[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT DISTINCT p.id
       FROM players p
       JOIN player_clubs pc ON pc.player_id=p.id
      WHERE pc.club_id = ANY($1::bigint[])`,
    [ELITE_CLUB_IDS],
  );
  return rows.map((r) => Number(r.id));
}

async function main(): Promise<void> {
  const all = await targetPlayers();
  const { rows: scanned } = await pool.query<{ player_id: string }>('SELECT player_id FROM honours_scanned');
  const done = new Set(scanned.map((r) => Number(r.player_id)));
  const todo = all.filter((id) => !done.has(id));
  console.log(`hedef ${all.length} oyuncu, taranmış ${done.size}, kalan ${todo.length}`);
  let scannedN = 0, withHonour = 0, cl = 0, wc = 0, el = 0;
  for (const id of todo) {
    const html = await get(`${BASE}/x/erfolge/spieler/${id}`);
    const comps = html ? parseHonours(html) : [];
    await pool.query('DELETE FROM player_honours WHERE player_id=$1', [id]);
    for (const c of comps) {
      await pool.query('INSERT INTO player_honours(player_id,competition) VALUES($1,$2) ON CONFLICT DO NOTHING', [id, c]);
      if (c === 'CL') cl++; else if (c === 'WC') wc++; else el++;
    }
    await pool.query('INSERT INTO honours_scanned(player_id) VALUES($1) ON CONFLICT DO NOTHING', [id]);
    scannedN++;
    if (comps.length) withHonour++;
    if (scannedN % 100 === 0) console.log(`... ${scannedN}/${todo.length} tarandı | kupalı ${withHonour} | CL ${cl} WC ${wc} EL ${el}`);
  }
  console.log(`\n=== BİTTİ: ${scannedN} tarandı, ${withHonour} kupalı | CL ${cl} · WC ${wc} · EL ${el} ===`);
  await pool.end();
}

void main();
