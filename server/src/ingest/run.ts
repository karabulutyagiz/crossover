import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';
import { sparql, searchEntities, qidToNumber, type SparqlBinding } from './wikidata.ts';
import { SEED_CLUBS, type SeedClub } from './seedClubs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TeamRow {
  id: number;
  name: string;
  isNational: boolean;
}
interface PlayerRow {
  id: number;
  name: string;
}
interface SpellRow {
  playerId: number;
  clubId: number;
  startYear: number | null;
  endYear: number | null;
}

interface SeedData {
  teams: Map<number, TeamRow>;
  players: Map<number, PlayerRow>;
  spells: Map<string, SpellRow>;
}

// Running totals across seeds (for logging only; DB writes are per-seed).
const allTeams = new Set<number>();
const allPlayers = new Set<number>();
let allSpells = 0;
let nationalSeen = new Set<number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NATIONAL_RE = /\bnational\b/i;

function seedQuery(qid: string): string {
  return `
SELECT ?player ?playerLabel ?club ?clubLabel ?startYear ?endYear WHERE {
  ?player p:P54 ?seedSt . ?seedSt ps:P54 wd:${qid} .
  ?player p:P54 ?st . ?st ps:P54 ?club .
  OPTIONAL { ?st pq:P580 ?s. BIND(YEAR(?s) AS ?startYear) }
  OPTIONAL { ?st pq:P582 ?e. BIND(YEAR(?e) AS ?endYear) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,tr". }
}`;
}

async function resolveQid(seed: SeedClub): Promise<string | null> {
  if (seed.qid) return seed.qid;
  const hits = await searchEntities(seed.name);
  const club = hits.find(
    (h) => /football|soccer/i.test(h.description) && !/national team/i.test(h.description),
  );
  return (club ?? hits[0])?.id ?? null;
}

function label(binding: SparqlBinding, key: string, fallback: string): string {
  const v = binding[key]?.value;
  if (v && v.trim() && !/^Q\d+$/.test(v)) return v.trim();
  return fallback;
}
function intOrNull(binding: SparqlBinding, key: string): number | null {
  const v = binding[key]?.value;
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function buildSeedData(rows: SparqlBinding[]): SeedData {
  const teams = new Map<number, TeamRow>();
  const players = new Map<number, PlayerRow>();
  const spells = new Map<string, SpellRow>();
  for (const r of rows) {
    const playerUri = r.player?.value;
    const clubUri = r.club?.value;
    if (!playerUri || !clubUri) continue;
    const playerId = qidToNumber(playerUri);
    const clubId = qidToNumber(clubUri);
    const playerName = label(r, 'playerLabel', playerUri.split('/').pop()!);
    const clubName = label(r, 'clubLabel', clubUri.split('/').pop()!);
    players.set(playerId, { id: playerId, name: playerName });
    const isNational = NATIONAL_RE.test(clubName);
    teams.set(clubId, { id: clubId, name: clubName, isNational });
    if (isNational) nationalSeen.add(clubId);
    const startYear = intOrNull(r, 'startYear');
    const endYear = intOrNull(r, 'endYear');
    const key = `${playerId}:${clubId}:${startYear ?? -1}`;
    const existing = spells.get(key);
    spells.set(key, { playerId, clubId, startYear, endYear: endYear ?? existing?.endYear ?? null });
  }
  return { teams, players, spells };
}

async function batchUpsert<T>(
  rows: T[],
  columnsPerRow: number,
  buildValues: (r: T) => unknown[],
  sqlPrefix: string,
  sqlSuffix: string,
  batchSize = 400,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    chunk.forEach((row, idx) => {
      const base = idx * columnsPerRow;
      const ph = Array.from({ length: columnsPerRow }, (_, k) => `$${base + k + 1}`);
      placeholders.push(`(${ph.join(',')})`);
      values.push(...buildValues(row));
    });
    await pool.query(`${sqlPrefix} ${placeholders.join(',')} ${sqlSuffix}`, values);
  }
}

// Persist one seed's data immediately, so a later crash never loses progress.
async function writeSeedData(d: SeedData): Promise<void> {
  await batchUpsert(
    [...d.teams.values()],
    4,
    (t) => [t.id, t.name, normalize(t.name), t.isNational],
    'INSERT INTO clubs (id, name, name_norm, is_national) VALUES',
    'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_norm = EXCLUDED.name_norm, is_national = EXCLUDED.is_national',
  );
  await batchUpsert(
    [...d.players.values()],
    3,
    (p) => [p.id, p.name, normalize(p.name)],
    'INSERT INTO players (id, name, name_norm) VALUES',
    'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_norm = EXCLUDED.name_norm',
  );
  await batchUpsert(
    [...d.spells.values()],
    4,
    (s) => [s.playerId, s.clubId, s.startYear, s.endYear],
    'INSERT INTO player_clubs (player_id, club_id, start_year, end_year) VALUES',
    'ON CONFLICT (player_id, club_id, (COALESCE(start_year, -1))) DO UPDATE SET end_year = EXCLUDED.end_year',
  );
}

async function ensureSchema(): Promise<void> {
  const sql = await readFile(join(__dirname, '../db/schema.sql'), 'utf8');
  await pool.query(sql);
}

async function run(): Promise<void> {
  await ensureSchema();
  console.log(`Ingesting ${SEED_CLUBS.length} seed clubs from Wikidata (writing per seed)...\n`);

  let i = 0;
  for (const seed of SEED_CLUBS) {
    i += 1;
    let qid: string | null = null;
    try {
      qid = await resolveQid(seed);
    } catch {
      /* fall through to null */
    }
    if (!qid) {
      console.warn(`[${i}/${SEED_CLUBS.length}] ✗ could not resolve "${seed.name}"`);
      continue;
    }
    try {
      const rows = await sparql(seedQuery(qid));
      const data = buildSeedData(rows);
      await writeSeedData(data);
      data.teams.forEach((t) => allTeams.add(t.id));
      data.players.forEach((p) => allPlayers.add(p.id));
      allSpells += data.spells.size;
      await pool.query('INSERT INTO ingest_log (seed_club, qid, rows_seen) VALUES ($1, $2, $3)', [
        seed.name,
        qidToNumber(qid),
        rows.length,
      ]);
      console.log(
        `[${i}/${SEED_CLUBS.length}] ${seed.name} (${qid}): ${rows.length} rows → ` +
          `totals: ${allPlayers.size} players, ${allTeams.size} teams`,
      );
    } catch (err) {
      console.warn(`[${i}/${SEED_CLUBS.length}] ✗ ${seed.name} (${qid}):`, String(err).slice(0, 160));
    }
    await sleep(400);
  }

  const { rows: counts } = await pool.query<{ players: string; clubs: string; spells: string }>(
    'SELECT (SELECT count(*) FROM players) players, (SELECT count(*) FROM clubs) clubs, (SELECT count(*) FROM player_clubs) spells',
  );
  console.log(
    `\n✓ Done. DB now has ${counts[0]!.players} players, ${counts[0]!.clubs} clubs, ` +
      `${counts[0]!.spells} spells (${nationalSeen.size} national teams flagged this run).`,
  );
}

run()
  .catch((err) => {
    console.error('Ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
