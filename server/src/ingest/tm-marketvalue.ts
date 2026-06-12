// Fetch each (searchable) club's Transfermarkt squad market value and use it as
// the club's `popularity` — a far better fame signal than raw player count
// (which just measures squad churn). Famous clubs (Real, Barça, Bayern) get the
// highest popularity, so they top search results and the easy-difficulty pool.
//
// Resumable: only clubs with a logo and no market value yet are fetched.
import 'dotenv/config';
import { pool, closePool } from '../db/pool.ts';

const API = process.env.TM_API ?? 'http://127.0.0.1:8000';
const DELAY = Number(process.env.TM_DELAY_MS ?? 250);
const CONCURRENCY = Number(process.env.TM_CONCURRENCY ?? 6);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let reqs = 0;

async function tm(path: string): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
    } catch {
      await sleep(3000);
      continue;
    }
    reqs++;
    await sleep(DELAY);
    if (r.status === 404 || r.status === 400) return null;
    if (r.status === 429 || r.status === 403 || r.status >= 500) {
      await sleep(15000);
      continue;
    }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}

async function pMap<T>(items: T[], worker: (t: T) => Promise<void>, n = CONCURRENCY): Promise<void> {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      try { await worker(items[idx]!); } catch (e) { console.warn('err', String(e).slice(0, 100)); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, run));
}

async function run(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs WHERE logo_url IS NOT NULL AND market_value IS NULL ORDER BY id`,
  );
  console.log(`Fetching market value for ${rows.length} clubs...`);
  let done = 0, withMv = 0;
  await pMap(rows, async ({ id }) => {
    const pr = await tm(`/clubs/${id}/profile`);
    const mv = Number(pr?.currentMarketValue ?? 0) || 0;
    await pool.query(
      `UPDATE clubs SET market_value = $2, popularity = GREATEST(popularity, $2) WHERE id = $1`,
      [id, mv],
    );
    if (mv > 0) withMv++;
    if (++done % 200 === 0) console.log(`  ${done}/${rows.length} (${withMv} with value) | reqs ${reqs}`);
  });
  console.log(`\n✓ DONE. ${done} clubs, ${withMv} with a market value. reqs=${reqs}`);
}

run().catch((e) => { console.error('market value ingest failed:', e); process.exitCode = 1; }).finally(closePool);
