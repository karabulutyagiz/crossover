// Fetch player nationalities from Wikidata P27 (country of citizenship) and
// store them in players.nationality. Required for the "country-team" game mode.
//
// Usage: npm run ingest:nationalities
import { pool, closePool } from '../db/pool.ts';
import { sparql, qidToNumber } from './wikidata.ts';

const BATCH = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function nationalityQuery(qids: number[]): string {
  const values = qids.map((id) => `wd:Q${id}`).join(' ');
  return `
    SELECT ?player ?country ?countryLabel WHERE {
      VALUES ?player { ${values} }
      ?player wdt:P27 ?country .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
}

async function run(): Promise<void> {
  // All players without a nationality set.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM players WHERE nationality IS NULL ORDER BY id`,
  );
  const ids = rows.map((r) => Number(r.id));
  console.log(`Fetching nationalities for ${ids.length} players...`);

  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let bindings;
    try {
      bindings = await sparql(nationalityQuery(chunk));
    } catch (err) {
      console.warn(`  batch ${i / BATCH} failed:`, err);
      await sleep(2000);
      continue;
    }

    // Keep one nationality per player (first result — usually the primary one).
    const byPlayer = new Map<number, string>();
    for (const b of bindings) {
      const playerUri = b.player?.value;
      const countryLabel = b.countryLabel?.value;
      if (!playerUri || !countryLabel || /^Q\d+$/.test(countryLabel)) continue;
      const playerId = qidToNumber(playerUri);
      if (!byPlayer.has(playerId)) byPlayer.set(playerId, countryLabel);
    }

    for (const [playerId, nationality] of byPlayer) {
      await pool.query(
        'UPDATE players SET nationality = $2 WHERE id = $1 AND nationality IS NULL',
        [playerId, nationality],
      );
      updated += 1;
    }
    console.log(
      `  [${Math.min(i + BATCH, ids.length)}/${ids.length}] +${byPlayer.size} nationalities (total ${updated})`,
    );
    await sleep(500);
  }

  // Report coverage
  const { rows: stats } = await pool.query<{ total: string; with_nat: string }>(
    `SELECT count(*) AS total, count(nationality) AS with_nat FROM players`,
  );
  const s = stats[0]!;
  console.log(`\n✓ Done. ${updated} players updated. Coverage: ${s.with_nat}/${s.total}.`);
}

run()
  .catch((err) => {
    console.error('Nationality ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
