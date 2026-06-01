// Fetch club logos from Wikidata (P154 "logo image") for the clubs players
// actually played for, and store a raster thumbnail URL on clubs.logo_url.
//
// SVG logos are served as PNG when a width is requested via Special:FilePath,
// so React Native's <Image> can render them.
import { pool, closePool } from '../db/pool.ts';
import { sparql, qidToNumber } from './wikidata.ts';

const BATCH = 150;
const THUMB_WIDTH = 160;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toThumb(logoUrl: string): string {
  const https = logoUrl.replace(/^http:\/\//, 'https://');
  return https.includes('?') ? `${https}&width=${THUMB_WIDTH}` : `${https}?width=${THUMB_WIDTH}`;
}

function logoQuery(qids: number[]): string {
  const values = qids.map((id) => `wd:Q${id}`).join(' ');
  return `SELECT ?club ?logo WHERE { VALUES ?club { ${values} } ?club wdt:P154 ?logo. }`;
}

async function run(): Promise<void> {
  // Pickable clubs: non-national clubs that at least one player belongs to.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs
      WHERE is_national = false
        AND id IN (SELECT DISTINCT club_id FROM player_clubs)
      ORDER BY id`,
  );
  const ids = rows.map((r) => Number(r.id));
  console.log(`Fetching logos for ${ids.length} clubs...`);

  let withLogo = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let bindings;
    try {
      bindings = await sparql(logoQuery(chunk));
    } catch (err) {
      console.warn(`  batch ${i / BATCH} failed:`, err);
      await sleep(1000);
      continue;
    }

    // Keep the first logo per club.
    const byClub = new Map<number, string>();
    for (const b of bindings) {
      const clubUri = b.club?.value;
      const logo = b.logo?.value;
      if (!clubUri || !logo) continue;
      const id = qidToNumber(clubUri);
      if (!byClub.has(id)) byClub.set(id, toThumb(logo));
    }

    for (const [id, url] of byClub) {
      await pool.query('UPDATE clubs SET logo_url = $2 WHERE id = $1', [id, url]);
      withLogo += 1;
    }
    console.log(`  [${Math.min(i + BATCH, ids.length)}/${ids.length}] +${byClub.size} logos (total ${withLogo})`);
    await sleep(400);
  }

  console.log(`\n✓ Done. ${withLogo}/${ids.length} clubs now have a logo.`);
}

run()
  .catch((err) => {
    console.error('Logo ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
