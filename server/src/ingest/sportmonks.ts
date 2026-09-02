// Bulk ingest from Sportmonks: pull ALL players with their complete transfer
// history for our accessible leagues. Store everything in our DB so we never
// need the API again after the trial period.
//
// Strategy:
//   1. Get all teams in accessible leagues (Süper Lig + European cups)
//   2. For each team, get squad → player IDs
//   3. For each player, get transfers (with fromTeam/toTeam names)
//   4. Build complete career spells and upsert into player_clubs
//   5. Store player photos from Sportmonks CDN
import 'dotenv/config';
import { pool, closePool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const TOKEN = process.env.SPORTMONKS_TOKEN ?? '';
const BASE = 'https://api.sportmonks.com/v3/football';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let requestCount = 0;

async function smFetch(path: string, params = ''): Promise<any> {
  requestCount++;
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}api_token=${TOKEN}${params ? '&' + params : ''}`;
  const res = await fetch(url);
  if (res.status === 429) {
    console.warn('  Rate limited, waiting 60s...');
    await sleep(60000);
    return smFetch(path, params);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

async function fetchAllPages(path: string, params = ''): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const data = await smFetch(path, `${params}&page=${page}&per_page=100`);
    all.push(...(data.data ?? []));
    const pagination = data.pagination ?? {};
    if (!pagination.has_more) break;
    page++;
    await sleep(300);
  }
  return all;
}

// Club name → our DB club ID cache
const clubCache = new Map<string, number | null>();

async function resolveClub(name: string): Promise<number | null> {
  if (clubCache.has(name)) return clubCache.get(name)!;
  const norm = normalize(name);
  if (!norm) { clubCache.set(name, null); return null; }
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM clubs
      WHERE is_national = false
        AND (similarity(name_norm, $1) >= 0.25 OR name_norm LIKE '%' || $1 || '%')
      ORDER BY similarity(name_norm, $1) DESC,
               (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = clubs.id) DESC
      LIMIT 1`,
    [norm],
  );
  const id = rows[0] ? Number(rows[0].id) : null;
  clubCache.set(name, id);
  return id;
}

// Sportmonks team ID → our DB club ID
const teamIdCache = new Map<number, number | null>();

async function resolveTeamById(smTeamId: number, smTeamName?: string): Promise<number | null> {
  if (teamIdCache.has(smTeamId)) return teamIdCache.get(smTeamId)!;
  if (smTeamName) {
    const id = await resolveClub(smTeamName);
    teamIdCache.set(smTeamId, id);
    return id;
  }
  teamIdCache.set(smTeamId, null);
  return null;
}

/**
 * SAFE player matching that can ALSO add a genuinely missing current club.
 *
 * The previous version required the player to already have a spell at the squad's
 * club — a catch-22 that made it impossible to add the very club that was missing
 * (e.g. Uğurcan Çakır's Galatasaray spell, the whole reason we run this). Since
 * Sportmonks gives full names (display_name), we match exact full names directly:
 *
 *   1) exact normalized full-name match, UNIQUE  -> trust it (adds missing clubs)
 *   2) otherwise fuzzy, but only if it overlaps a club we already know for this
 *      player (prevents "Kartal Yılmaz" -> "Burak Yılmaz"); never guess otherwise.
 */
async function resolvePlayerSafe(name: string, knownClubIds: number[]): Promise<number | null> {
  const norm = normalize(name);
  if (!norm) return null;

  const exact = await pool.query<{ id: string }>(
    `SELECT id FROM players WHERE name_norm = $1 LIMIT 3`,
    [norm],
  );
  if (exact.rows.length === 1) return Number(exact.rows[0]!.id);

  if (knownClubIds.length === 0) return null;
  // FULL-NAME eşleşmesi zorunlu (kullanıcı raporu 2026-09-02): word_similarity yalnız
  // ORTAK SOYAD (ör. "Cissé") + tek ortak kulüp olunca farklı ön-adlı oyuncuyu (Djibril↔
  // Édouard) karıştırıyordu. similarity() (tam-string) >= 0.55 farklı ön-adı reddeder.
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id FROM players p
      WHERE word_similarity($1, p.name_norm) >= 0.5
        AND similarity($1, p.name_norm) >= 0.55
        AND EXISTS (
          SELECT 1 FROM player_clubs pc
          WHERE pc.player_id = p.id AND pc.club_id = ANY($2::bigint[])
        )
      ORDER BY similarity($1, p.name_norm) DESC, word_similarity($1, p.name_norm) DESC
      LIMIT 1`,
    [norm, knownClubIds],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function run(): Promise<void> {
  if (!TOKEN) {
    console.error('Missing SPORTMONKS_TOKEN in .env');
    process.exitCode = 1;
    return;
  }

  // 1. Get accessible leagues
  console.log('Fetching accessible leagues...');
  const leagues = await smFetch('/leagues');
  const leagueIds = (leagues.data ?? []).map((l: any) => l.id);
  console.log(`  ${leagueIds.length} leagues: ${(leagues.data ?? []).map((l: any) => l.name).join(', ')}`);

  // 2. Get all seasons for these leagues
  console.log('Fetching seasons...');
  const allSeasons: number[] = [];
  for (const lid of leagueIds) {
    const seasons = await smFetch('/seasons', `filters=seasonLeagues:${lid}`);
    for (const s of seasons.data ?? []) {
      allSeasons.push(s.id);
    }
    await sleep(200);
  }
  console.log(`  ${allSeasons.length} seasons found`);

  // 3. Get all teams from these seasons
  console.log('Fetching teams...');
  const teamMap = new Map<number, string>(); // smTeamId → name
  for (const sid of allSeasons) {
    try {
      const teamsData = await smFetch(`/teams/seasons/${sid}`);
      for (const t of teamsData.data ?? []) {
        if (t.id && t.name) teamMap.set(t.id, t.name);
      }
    } catch {
      // Some seasons may not have teams
    }
    await sleep(300);
  }
  const teamIds = new Set(teamMap.keys());
  console.log(`  ${teamIds.size} unique teams`);

  // 4. For each team, get squad players and their transfers
  console.log('Fetching players and transfers...');
  let playersProcessed = 0;
  let spellsAdded = 0;
  let photosUpdated = 0;
  const processedPlayerIds = new Set<number>();

  for (const tid of teamIds) {
    let squad: any[];
    try {
      const data = await smFetch(`/squads/teams/${tid}`, 'include=player');
      squad = data.data ?? [];
    } catch {
      await sleep(500);
      continue;
    }

    // Resolve this team's DB club ID for safe matching
    const teamName = teamMap.get(tid);
    const ourTeamClubId = teamName ? await resolveClub(teamName) : null;

    for (const entry of squad) {
      const player = entry.player;
      if (!player || processedPlayerIds.has(player.id)) continue;
      processedPlayerIds.add(player.id);

      // SAFE: require player to already have a spell at this team's club
      const knownClubs = ourTeamClubId ? [ourTeamClubId] : [];
      const ourPlayerId = await resolvePlayerSafe(player.display_name ?? player.name ?? '', knownClubs);
      if (!ourPlayerId) continue;

      // Update photo only for safely matched players
      if (player.image_path) {
        await pool.query(
          'UPDATE players SET image_url = $2 WHERE id = $1 AND image_url IS NULL',
          [ourPlayerId, player.image_path],
        );
        photosUpdated++;
      }

      // Get transfers for this player
      let transfers: any[];
      try {
        const tData = await smFetch(`/transfers/players/${player.id}`, 'include=fromTeam;toTeam');
        transfers = tData.data ?? [];
      } catch {
        await sleep(300);
        continue;
      }

      // Sort transfers by date
      transfers.sort((a: any, b: any) => (a.date ?? '').localeCompare(b.date ?? ''));

      for (let i = 0; i < transfers.length; i++) {
        const tr = transfers[i];
        const toTeam = tr.toteam ?? tr.toTeam;
        if (!toTeam?.name) continue;

        const clubId = await resolveClub(toTeam.name);
        if (!clubId) continue;

        const startYear = tr.date ? Number(tr.date.split('-')[0]) : null;
        const nextTr = transfers[i + 1];
        const endYear = nextTr?.date ? Number(nextTr.date.split('-')[0]) : null;

        if (startYear && endYear && startYear > endYear) continue;

        try {
          const { rowCount } = await pool.query(
            `INSERT INTO player_clubs (player_id, club_id, start_year, end_year)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (player_id, club_id, (COALESCE(start_year, -1))) DO NOTHING`,
            [ourPlayerId, clubId, startYear, endYear],
          );
          if (rowCount && rowCount > 0) spellsAdded++;
        } catch {
          // FK violation — skip
        }
      }

      playersProcessed++;
      await sleep(200);
    }

    console.log(`  Team ${tid}: squad ${squad.length}, processed ${playersProcessed} players, +${spellsAdded} spells`);
    await sleep(500);
  }

  console.log(`\n✓ Done.`);
  console.log(`  Players processed: ${playersProcessed}`);
  console.log(`  New spells added: ${spellsAdded}`);
  console.log(`  Photos updated: ${photosUpdated}`);
  console.log(`  API requests: ${requestCount}`);
}

run()
  .catch((err) => {
    console.error('Sportmonks ingest failed:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
