// Clean, from-scratch rebuild of ALL club/player/career data from Transfermarkt
// ONLY. No Wikidata / API-Football / Sportmonks data is used — the goal is a
// single authoritative source with no pollution or conflicts.
//
// Data source: a locally-run instance of felipeall/transfermarkt-api
// (https://github.com/felipeall/transfermarkt-api), default http://127.0.0.1:8000.
//
// Transfermarkt IDs are reused directly as our bigint primary keys (clubs and
// players live in separate tables, so id reuse across them is fine).
//
// Three resumable phases, all writing ONLY to tm_* staging tables (the live game
// keeps running on the real tables until a separate verified swap):
//   A) discover: for each competition x season, list clubs and their squads ->
//      collect club ids and player ids (this is what surfaces retired players,
//      who appear in old-season squads).
//   B) club profiles: fetch name/logo/country/league for every distinct club.
//   C) careers: for each player, fetch profile (name/photo/birth/nat) + full
//      transfer history -> career spells (youth / reserve / "without club" /
//      women teams filtered out).
//
// Progress is journaled in tm_state so a restart continues where it stopped.
import 'dotenv/config';
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const API = process.env.TM_API ?? 'http://127.0.0.1:8000';
const DELAY = Number(process.env.TM_DELAY_MS ?? 700);
const COMPETITIONS = (process.env.TM_COMPETITIONS ??
  // Broad coverage: top leagues + second divisions + continental cups + global
  'TR1,GB1,GB2,ES1,ES2,IT1,IT2,L1,L2,FR1,FR2,PO1,NL1,BE1,SC1,C1,A1,' +
  'DK1,NO1,SE1,PL1,TS1,KR1,SER1,RO1,GR1,UKR1,' +
  'SA1,MLS1,MEX1,BRA1,BRA2,AR1N,JAP1,RSK1,AUS1,' +
  'CL,EL').split(',').map((s) => s.trim()).filter(Boolean);
const SEASON_FROM = Number(process.env.TM_SEASON_FROM ?? 2006);
const SEASON_TO = Number(process.env.TM_SEASON_TO ?? 2025);

const CONCURRENCY = Number(process.env.TM_CONCURRENCY ?? 5);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let reqs = 0;

/** Run `worker` over `items` with a fixed number of parallel workers. */
async function pMap<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = CONCURRENCY,
): Promise<void> {
  let idx = 0;
  const runner = async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await worker(items[i]!, i);
      } catch (e) {
        console.warn('worker error', String(e).slice(0, 120));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, runner));
}

async function tm(path: string): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
    } catch {
      await sleep(3000);
      continue;
    }
    reqs++;
    await sleep(DELAY);
    if (r.status === 404 || r.status === 400) return null; // no such entity / no data
    if (r.status === 429 || r.status === 403 || r.status >= 500) {
      // Transfermarkt throttling / transient — back off harder.
      await sleep(15000);
      continue;
    }
    if (!r.ok) return null;
    return r.json();
  }
  return null;
}

// ---- non-senior / junk club filter -----------------------------------------
const JUNK = /(\bu-?\d{1,2}\b|sub-?\d{2}|youth|\byth\b|jugend|juvenil|primavera|altyapi|akademi|academy|\bjunior\b|\bjeugd\b|reserve|\bii\b|\biii\b|frauen|women|\bkadin\b|femen|femin)/i;
const NOT_A_CLUB = /^(retired|without club|career break|unknown|ban|---|n\/a|\?)$/i;
function isSeniorClub(name: string | undefined | null): boolean {
  if (!name) return false;
  if (NOT_A_CLUB.test(name.trim())) return false;
  if (JUNK.test(name)) return false;
  return true;
}

async function setup(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tm_clubs (
      id bigint PRIMARY KEY, name text, name_norm text, country text,
      is_national boolean DEFAULT false, logo_url text, league text
    );
    CREATE TABLE IF NOT EXISTS tm_players (
      id bigint PRIMARY KEY, name text, name_norm text, birth_year int,
      nationality text, image_url text, done boolean DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS tm_player_clubs (
      player_id bigint, club_id bigint, start_year int, end_year int,
      PRIMARY KEY (player_id, club_id)
    );
    CREATE TABLE IF NOT EXISTS tm_state (k text PRIMARY KEY, v text);
  `);
}
async function done(k: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM tm_state WHERE k=$1', [k]);
  return rows.length > 0;
}
async function mark(k: string): Promise<void> {
  await pool.query('INSERT INTO tm_state(k,v) VALUES($1,$2) ON CONFLICT(k) DO NOTHING', [k, '1']);
}

async function seedClub(id: number, name?: string, league?: string): Promise<void> {
  if (!id) return;
  await pool.query(
    `INSERT INTO tm_clubs(id,name,name_norm,league) VALUES($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, tm_clubs.name),
       name_norm = COALESCE(EXCLUDED.name_norm, tm_clubs.name_norm),
       league = COALESCE(tm_clubs.league, EXCLUDED.league)`,
    [id, name ?? null, name ? normalize(name) : null, league ?? null],
  );
}
async function seedPlayer(id: number, name?: string): Promise<void> {
  if (!id) return;
  await pool.query(
    `INSERT INTO tm_players(id,name,name_norm) VALUES($1,$2,$3)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(tm_players.name, EXCLUDED.name),
       name_norm = COALESCE(tm_players.name_norm, EXCLUDED.name_norm)`,
    [id, name ?? null, name ? normalize(name) : null],
  );
}

// ---- Phase A: discover clubs & players from competition squads ---------------
async function discover(): Promise<void> {
  console.log(`Phase A: discover (${COMPETITIONS.join(',')} | ${SEASON_FROM}-${SEASON_TO})`);
  for (const comp of COMPETITIONS) {
    for (let season = SEASON_TO; season >= SEASON_FROM; season--) {
      const k = `disc:${comp}:${season}`;
      if (await done(k)) continue;
      const data = await tm(`/competitions/${comp}/clubs?season_id=${season}`);
      const clubs = data?.clubs ?? [];
      await pMap(clubs, async (c: any) => {
        const cid = Number(c.id);
        await seedClub(cid, c.name, comp);
        const squad = await tm(`/clubs/${cid}/players?season_id=${season}`);
        for (const p of squad?.players ?? []) await seedPlayer(Number(p.id), p.name);
      });
      await mark(k);
      const { rows: pc } = await pool.query('SELECT count(*) n FROM tm_players');
      console.log(`  ${comp} ${season}: ${clubs.length} clubs | total players ${pc[0].n} | reqs ${reqs}`);
    }
  }
}

// ---- Phase B: club profiles (logo / country / league) ------------------------
async function clubProfiles(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM tm_clubs WHERE logo_url IS NULL ORDER BY id',
  );
  console.log(`Phase B: ${rows.length} club profiles`);
  let n = 0;
  await pMap(rows, async ({ id }) => {
    const k = `club:${id}`;
    if (await done(k)) return;
    const pr = await tm(`/clubs/${id}/profile`);
    if (pr) {
      const name = pr.name ?? pr.officialName ?? null;
      await pool.query(
        `UPDATE tm_clubs SET name=COALESCE($2,name), name_norm=COALESCE($3,name_norm),
           logo_url=$4, country=$5 WHERE id=$1`,
        [id, name, name ? normalize(name) : null, pr.image ?? null, pr.addressLine3 ?? pr.country ?? null],
      );
    }
    await mark(k);
    if (++n % 200 === 0) console.log(`  club profiles ${n}/${rows.length} | reqs ${reqs}`);
  });
}

// ---- transfers -> career spells ----------------------------------------------
function spellsFromTransfers(transfers: any[]): Map<number, { name: string; start: number | null; end: number | null }> {
  const sorted = [...transfers].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
  const byClub = new Map<number, { name: string; start: number | null; end: number | null }>();
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]!;
    const to = t.clubTo ?? t.to;
    if (!to?.id || !isSeniorClub(to.name)) continue;
    const cid = Number(to.id);
    const startY = t.date ? Number(String(t.date).slice(0, 4)) : null;
    const next = sorted[i + 1];
    const endY = next?.date ? Number(String(next.date).slice(0, 4)) : null;
    const cur = byClub.get(cid);
    if (!cur) byClub.set(cid, { name: to.name, start: startY, end: endY });
    else {
      if (startY != null && (cur.start == null || startY < cur.start)) cur.start = startY;
      if (endY != null && (cur.end == null || endY > cur.end)) cur.end = endY;
    }
  }
  return byClub;
}

// ---- Phase C: player careers + photos ----------------------------------------
async function careers(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM tm_players WHERE done = false ORDER BY id',
  );
  console.log(`Phase C: ${rows.length} player careers`);
  let n = 0, kept = 0;
  await pMap(rows, async ({ id }) => {
    const pid = Number(id);
    const prof = await tm(`/players/${pid}/profile`);
    if (prof) {
      const name = prof.name ?? null;
      const by = prof.dateOfBirth ? Number(String(prof.dateOfBirth).slice(0, 4)) : null;
      const nat = Array.isArray(prof.citizenship) ? prof.citizenship[0]
        : (prof.citizenship ?? (Array.isArray(prof.nationality) ? prof.nationality[0] : prof.nationality) ?? null);
      await pool.query(
        `UPDATE tm_players SET name=COALESCE($2,name), name_norm=COALESCE($3,name_norm),
           birth_year=$4, nationality=$5, image_url=$6 WHERE id=$1`,
        [pid, name, name ? normalize(name) : null, by, nat, prof.imageUrl ?? prof.imageURL ?? prof.image ?? null],
      );
    }
    const tr = await tm(`/players/${pid}/transfers`);
    const spells = spellsFromTransfers(tr?.transfers ?? []);
    for (const [cid, sp] of spells) {
      await seedClub(cid, sp.name);
      await pool.query(
        `INSERT INTO tm_player_clubs(player_id,club_id,start_year,end_year) VALUES($1,$2,$3,$4)
         ON CONFLICT(player_id,club_id) DO UPDATE
           SET start_year=LEAST(COALESCE(tm_player_clubs.start_year,EXCLUDED.start_year),COALESCE(EXCLUDED.start_year,tm_player_clubs.start_year)),
               end_year=GREATEST(COALESCE(tm_player_clubs.end_year,EXCLUDED.end_year),COALESCE(EXCLUDED.end_year,tm_player_clubs.end_year))`,
        [pid, cid, sp.start, sp.end],
      );
    }
    if (spells.size > 0) kept++;
    await pool.query('UPDATE tm_players SET done=true WHERE id=$1', [pid]);
    if (++n % 200 === 0) console.log(`  careers ${n}/${rows.length} | with spells ${kept} | reqs ${reqs}`);
  });
}

async function run(): Promise<void> {
  await setup();
  const phase = process.env.TM_PHASE; // optional: A | B | C
  if (!phase || phase === 'A') await discover();
  if (!phase || phase === 'C') await careers();   // careers also seeds clubs from transfers
  if (!phase || phase === 'B') await clubProfiles(); // logos last (covers transfer-discovered clubs)
  const { rows } = await pool.query(
    'SELECT (SELECT count(*) FROM tm_clubs) clubs,(SELECT count(*) FROM tm_players) players,(SELECT count(*) FROM tm_player_clubs) spells',
  );
  console.log(`\n✓ DONE. clubs=${rows[0].clubs} players=${rows[0].players} spells=${rows[0].spells} reqs=${reqs}`);
}

run().catch((e) => { console.error('tm-rebuild failed:', e); process.exitCode = 1; }).finally(closePool);
