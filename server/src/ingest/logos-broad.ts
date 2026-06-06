// Broad club logo coverage: try Wikidata P154 (logo), P94 (coat of arms),
// and P18 (image) in priority order for clubs that still lack a logo.
import { pool, closePool } from '../db/pool.ts';
import { sparql, qidToNumber } from './wikidata.ts';

const BATCH = 100;
const THUMB_WIDTH = 160;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toThumb(url: string): string {
  const https = url.replace(/^http:\/\//, 'https://');
  return https.includes('?') ? `${https}&width=${THUMB_WIDTH}` : `${https}?width=${THUMB_WIDTH}`;
}

function broadLogoQuery(qids: number[]): string {
  const values = qids.map((id) => `wd:Q${id}`).join(' ');
  // Priority: P154 (logo) > P94 (coat of arms/crest) > P18 (image)
  return `
    SELECT ?club ?image (MIN(?prio) AS ?priority) WHERE {
      VALUES ?club { ${values} }
      {
        ?club wdt:P154 ?image . BIND(1 AS ?prio)
      } UNION {
        ?club wdt:P94 ?image . BIND(2 AS ?prio)
      } UNION {
        ?club wdt:P18 ?image . BIND(3 AS ?prio)
      }
    }
    GROUP BY ?club ?image
    ORDER BY ?club ?priority
  `;
}

async function run(): Promise<void> {
  // Clubs without logo that have at least one player.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs
      WHERE logo_url IS NULL
        AND is_national = false
        AND id IN (SELECT DISTINCT club_id FROM player_clubs)
      ORDER BY id`,
  );
  const ids = rows.map((r) => Number(r.id));
  console.log(`Fetching logos for ${ids.length} clubs without logo (P154/P94/P18)...`);

  let updated = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let bindings;
    try {
      bindings = await sparql(broadLogoQuery(chunk));
    } catch (err) {
      console.warn(`  batch ${i / BATCH} failed:`, err);
      await sleep(2000);
      continue;
    }

    // Keep the highest-priority image per club (lowest prio number).
    const byClub = new Map<number, { url: string; prio: number }>();
    for (const b of bindings) {
      const clubUri = b.club?.value;
      const image = b.image?.value;
      const prio = Number(b.priority?.value ?? 99);
      if (!clubUri || !image) continue;
      const id = qidToNumber(clubUri);
      const existing = byClub.get(id);
      if (!existing || prio < existing.prio) {
        byClub.set(id, { url: toThumb(image), prio });
      }
    }

    for (const [id, { url }] of byClub) {
      await pool.query('UPDATE clubs SET logo_url = $2 WHERE id = $1 AND logo_url IS NULL', [id, url]);
      updated += 1;
    }
    console.log(`  [${Math.min(i + BATCH, ids.length)}/${ids.length}] +${byClub.size} logos (total ${updated})`);
    await sleep(500);
  }

  console.log(`\n✓ Done. ${updated} additional clubs now have a logo.`);

  // Report coverage
  const { rows: stats } = await pool.query<{ total: string; with_logo: string }>(
    `SELECT count(*) AS total, count(logo_url) AS with_logo
       FROM clubs WHERE is_national = false AND id IN (SELECT DISTINCT club_id FROM player_clubs)`,
  );
  const s = stats[0]!;
  console.log(`Coverage: ${s.with_logo}/${s.total} clubs have logos.`);
}

run()
  .catch((err) => {
    console.error('Broad logo ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
