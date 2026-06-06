// Fetch player photos from Wikidata (P18 "image") and store a raster
// thumbnail URL on players.image_url.  Images on Wikimedia Commons are
// typically CC-BY-SA or public domain — safe for informational use.
import { pool, closePool } from '../db/pool.ts';
import { sparql, qidToNumber } from './wikidata.ts';

const BATCH = 150;
const THUMB_WIDTH = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toThumb(imageUrl: string): string {
  // Wikimedia Commons Special:FilePath serves raster thumbnails at any width.
  const https = imageUrl.replace(/^http:\/\//, 'https://');
  return https.includes('?') ? `${https}&width=${THUMB_WIDTH}` : `${https}?width=${THUMB_WIDTH}`;
}

function photoQuery(qids: number[]): string {
  const values = qids.map((id) => `wd:Q${id}`).join(' ');
  return `SELECT ?player ?image WHERE { VALUES ?player { ${values} } ?player wdt:P18 ?image. }`;
}

async function run(): Promise<void> {
  // All players that don't already have an image.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM players WHERE image_url IS NULL ORDER BY id`,
  );
  const ids = rows.map((r) => Number(r.id));
  console.log(`Fetching photos for ${ids.length} players...`);

  let withPhoto = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let bindings;
    try {
      bindings = await sparql(photoQuery(chunk));
    } catch (err) {
      console.warn(`  batch ${i / BATCH} failed:`, err);
      await sleep(1000);
      continue;
    }

    // Keep the first image per player.
    const byPlayer = new Map<number, string>();
    for (const b of bindings) {
      const playerUri = b.player?.value;
      const image = b.image?.value;
      if (!playerUri || !image) continue;
      const id = qidToNumber(playerUri);
      if (!byPlayer.has(id)) byPlayer.set(id, toThumb(image));
    }

    for (const [id, url] of byPlayer) {
      await pool.query('UPDATE players SET image_url = $2 WHERE id = $1', [id, url]);
      withPhoto += 1;
    }
    console.log(`  [${Math.min(i + BATCH, ids.length)}/${ids.length}] +${byPlayer.size} photos (total ${withPhoto})`);
    await sleep(400);
  }

  console.log(`\n✓ Done. ${withPhoto}/${ids.length} players now have a photo.`);
}

run()
  .catch((err) => {
    console.error('Photo ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
