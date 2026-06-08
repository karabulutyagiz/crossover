// Fetch player portrait photos from Wikipedia infoboxes.
//
// Wikipedia editors consistently choose clear headshot/portrait photos for
// footballer articles. These are almost always CC-BY-SA or public domain.
//
// Strategy:
//   1. SPARQL: batch player QIDs → English Wikipedia article titles
//   2. Wikipedia API: batch titles → page main image (pageimages prop, 50/req)
//   3. Update players.image_url
import { pool, closePool } from '../db/pool.ts';
import { sparql, qidToNumber } from './wikidata.ts';
import { config } from '../config.ts';

const SPARQL_BATCH = 200;
const WIKI_BATCH = 50; // Wikipedia API allows up to 50 titles per request
const THUMB_WIDTH = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Step 1: Get Wikipedia article titles for a batch of player QIDs
function sitelinkQuery(qids: number[]): string {
  const values = qids.map((id) => `wd:Q${id}`).join(' ');
  return `
    SELECT ?player ?title WHERE {
      VALUES ?player { ${values} }
      ?article schema:about ?player .
      ?article schema:isPartOf <https://en.wikipedia.org/> .
      ?article schema:name ?title .
    }
  `;
}

// Step 2: Get page images from Wikipedia API (up to 50 titles at once)
async function fetchPageImages(
  titles: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', titles.join('|'));
  url.searchParams.set('prop', 'pageimages');
  url.searchParams.set('format', 'json');
  url.searchParams.set('pithumbsize', String(THUMB_WIDTH));
  url.searchParams.set('pilicense', 'any');

  const res = await fetch(url, {
    headers: { 'User-Agent': config.wikidataUserAgent },
  });
  if (!res.ok) throw new Error(`Wikipedia API HTTP ${res.status}`);
  const json = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; thumbnail?: { source: string; width: number; height: number } }
      >;
      normalized?: Array<{ from: string; to: string }>;
    };
  };

  const pages = json.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    const t = page.thumbnail;
    if (!page.title || !t?.source) continue;
    // Only accept portrait-oriented images (height >= width).
    // Landscape images are almost always action/stadium shots where
    // the player's face is not clearly visible.
    if (t.height >= t.width) {
      result.set(page.title, t.source);
    }
  }
  // Handle normalized titles (Wikipedia normalizes "alexis_sánchez" -> "Alexis Sánchez")
  const normalizations = json.query?.normalized ?? [];
  for (const n of normalizations) {
    const imgUrl = result.get(n.to);
    if (imgUrl) result.set(n.from, imgUrl);
  }
  return result;
}

async function run(): Promise<void> {
  // All players (re-fetch for everyone to get better portraits)
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM players ORDER BY id',
  );
  const ids = rows.map((r) => Number(r.id));
  console.log(`Fetching Wikipedia portraits for ${ids.length} players...`);

  let updated = 0;
  let noArticle = 0;

  for (let i = 0; i < ids.length; i += SPARQL_BATCH) {
    const chunk = ids.slice(i, i + SPARQL_BATCH);

    // Step 1: Get Wikipedia article titles via SPARQL
    let bindings;
    try {
      bindings = await sparql(sitelinkQuery(chunk));
    } catch (err) {
      console.warn(`  SPARQL batch ${Math.floor(i / SPARQL_BATCH)} failed:`, err);
      await sleep(2000);
      continue;
    }

    // Map: player QID number → Wikipedia article title
    const qidToTitle = new Map<number, string>();
    for (const b of bindings) {
      const playerUri = b.player?.value;
      const title = b.title?.value;
      if (!playerUri || !title) continue;
      const qid = qidToNumber(playerUri);
      if (!qidToTitle.has(qid)) qidToTitle.set(qid, title);
    }
    noArticle += chunk.length - qidToTitle.size;

    // Step 2: Fetch page images from Wikipedia in sub-batches of 50
    const entries = [...qidToTitle.entries()];
    for (let j = 0; j < entries.length; j += WIKI_BATCH) {
      const subChunk = entries.slice(j, j + WIKI_BATCH);
      const titles = subChunk.map(([, t]) => t);

      let images: Map<string, string>;
      try {
        images = await fetchPageImages(titles);
      } catch (err) {
        console.warn(`  Wikipedia API batch failed:`, err);
        await sleep(1000);
        continue;
      }

      for (const [qid, title] of subChunk) {
        const imgUrl = images.get(title);
        if (imgUrl) {
          await pool.query(
            'UPDATE players SET image_url = $2 WHERE id = $1',
            [qid, imgUrl],
          );
          updated += 1;
        }
      }
      await sleep(200); // Be polite to Wikipedia API
    }

    console.log(
      `  [${Math.min(i + SPARQL_BATCH, ids.length)}/${ids.length}] ${updated} portraits found`,
    );
    await sleep(300);
  }

  console.log(`\n✓ Done. ${updated} players updated with Wikipedia portraits.`);
  console.log(`  ${noArticle} players had no English Wikipedia article.`);
}

run()
  .catch((err) => {
    console.error('Wikipedia photo ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
