import { pool, closePool } from '../db/pool.ts';
import {
  botCommonPlayersRanked,
  getValidPlayersForCountryAndClub,
  hasPlayersCountryTeam,
  verifyCountryTeamGuess,
  verifyGuess,
  verifyLetterTeamGuess,
  verifyPlayerPlayerGuess,
  validateCountryTeamPlayerId,
} from '../game/verify.ts';
import { normalize } from '../game/normalize.ts';
import { validateCountryTeamBotCandidate } from '../rooms/countryTeamBotValidation.ts';

let failed = false;
let skipped = 0;
const MIN_SPELL_YEAR = 1980;

function pass(name: string): void { console.log(`PASS ${name}`); }
function fail(name: string, detail?: string): void { console.error(`FAIL ${name}${detail ? ` - ${detail}` : ''}`); failed = true; }
function skip(name: string, detail?: string): void { console.log(`SKIP ${name}${detail ? ` - ${detail}` : ''}`); skipped += 1; }

async function clubByNorm(name: string): Promise<number | null> {
  const norm = normalize(name);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id
       FROM clubs c
      WHERE c.is_national = false
        AND (c.name_norm = $1 OR c.name_norm LIKE '%' || $1 || '%' OR $1 = ANY(c.aliases))
      ORDER BY (c.name_norm = $1) DESC,
               COALESCE(c.popularity, 0) DESC,
               length(c.name) ASC
      LIMIT 1`,
    [norm],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function playerByNorm(name: string): Promise<number | null> {
  const norm = normalize(name);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT p.id
       FROM players p
      WHERE p.name_norm = $1 OR word_similarity($1, p.name_norm) >= 0.9
      ORDER BY (p.name_norm = $1) DESC,
               (p.image_url IS NOT NULL) DESC,
               length(p.name) ASC
      LIMIT 1`,
    [norm],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function hasCountryTeamFixture(clubId: number, countries: string[], playerId: number): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM players p
         JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = $1
         JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
        WHERE p.id = $3
          AND p.nationality = ANY($2)
          AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
     ) AS ok`,
    [clubId, countries, playerId],
  );
  return rows[0]?.ok === true;
}

async function seedCountryTeamPair(): Promise<{ clubId: number; country: string; playerId: number; playerName: string } | null> {
  const { rows } = await pool.query<{ club_id: string; nationality: string; player_id: string; player_name: string }>(
    `SELECT pc.club_id, p.nationality, p.id AS player_id, p.name AS player_name
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN clubs c ON c.id = pc.club_id
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND p.nationality IS NOT NULL
         AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
      ORDER BY COALESCE(c.popularity, 0) DESC,
               (p.image_url IS NOT NULL) DESC
      LIMIT 1`,
  );
  const r = rows[0];
  return r ? { clubId: Number(r.club_id), country: r.nationality, playerId: Number(r.player_id), playerName: r.player_name } : null;
}

async function clubNotPlayedBy(playerId: number, excludedClubId: number): Promise<number | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND c.id <> $2
        AND NOT EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.player_id = $1 AND pc.club_id = c.id)
      ORDER BY COALESCE(c.popularity, 0) DESC
      LIMIT 1`,
    [playerId, excludedClubId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

async function countryNotInClub(clubId: number): Promise<string | null> {
  const { rows } = await pool.query<{ nationality: string }>(
    `SELECT p.nationality
       FROM players p
      WHERE p.nationality IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM player_clubs pc
            JOIN players pp ON pp.id = pc.player_id
           WHERE pc.club_id = $1
              AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
             AND pp.nationality = p.nationality
        )
      GROUP BY p.nationality
      ORDER BY count(*) DESC
      LIMIT 1`,
    [clubId],
  );
  return rows[0]?.nationality ?? null;
}

async function emptyCountryTeamPair(): Promise<{ clubId: number; country: string } | null> {
  const { rows } = await pool.query<{ club_id: string; nationality: string }>(
    `WITH clubs_sample AS (
       SELECT c.id
         FROM clubs c
        WHERE c.is_national = false AND c.logo_url IS NOT NULL
        ORDER BY COALESCE(c.popularity, 0) DESC
        LIMIT 40
     ), countries_sample AS (
       SELECT p.nationality
         FROM players p
        WHERE p.nationality IS NOT NULL
        GROUP BY p.nationality
        ORDER BY count(*) DESC
        LIMIT 40
     )
     SELECT c.id AS club_id, n.nationality
       FROM clubs_sample c
       CROSS JOIN countries_sample n
      WHERE NOT EXISTS (
        SELECT 1
          FROM players p
          JOIN player_clubs pc ON pc.player_id = p.id AND pc.club_id = c.id
         WHERE p.nationality = n.nationality
            AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
      )
      LIMIT 1`,
  );
  return rows[0] ? { clubId: Number(rows[0].club_id), country: rows[0].nationality } : null;
}

async function teamTeamRegression(): Promise<void> {
  const { rows } = await pool.query<{ a: string; b: string; name: string }>(
    `SELECT a.club_id AS a, b.club_id AS b, p.name
       FROM player_clubs a
       JOIN player_clubs b ON b.player_id = a.player_id AND b.club_id <> a.club_id
       JOIN players p ON p.id = a.player_id
       JOIN clubs ca ON ca.id = a.club_id AND ca.is_national = false
       JOIN clubs cb ON cb.id = b.club_id AND cb.is_national = false
      ORDER BY COALESCE(ca.popularity, 0) + COALESCE(cb.popularity, 0) DESC
      LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return skip('Team-Team regression', 'no shared-club pair found');
  const ranked = await botCommonPlayersRanked(Number(r.a), Number(r.b), 8);
  const verified = await verifyGuess(Number(r.a), Number(r.b), r.name);
  if (ranked.length > 0 && verified.correct) pass('Team-Team regression');
  else fail('Team-Team regression', `ranked=${ranked.length} correct=${verified.correct}`);
}

async function otherModesRegression(seed: { clubId: number; playerName: string } | null): Promise<void> {
  if (seed) {
    const first = normalize(seed.playerName).slice(0, 1);
    const letter = await verifyLetterTeamGuess(seed.clubId, first, seed.playerName);
    if (letter.correct) pass('Letter-Team regression');
    else fail('Letter-Team regression');
  } else {
    skip('Letter-Team regression', 'no qualifying country-team seed player in database');
  }

  const { rows } = await pool.query<{ p1: string; p2: string; club: string; club_name: string }>(
    `WITH one_pair_per_club AS (
       SELECT DISTINCT ON (a.club_id)
              a.player_id AS p1,
              b.player_id AS p2,
              a.club_id AS club,
              c.name AS club_name,
              COALESCE(c.popularity, 0) AS popularity
         FROM player_clubs a
         JOIN player_clubs b ON b.club_id = a.club_id AND b.player_id <> a.player_id
         JOIN clubs c ON c.id = a.club_id AND c.is_national = false
        ORDER BY a.club_id, a.player_id, b.player_id
     )
     SELECT p1, p2, club, club_name
       FROM one_pair_per_club
      ORDER BY popularity DESC
      LIMIT 50`,
  );
  if (rows.length === 0) return skip('Player-Player regression', 'no shared club for two players found');
  for (const r of rows) {
    const pp = await verifyPlayerPlayerGuess(Number(r.p1), Number(r.p2), r.club_name);
    if (pp.correct && pp.matchedClubId === Number(r.club)) {
      pass('Player-Player regression');
      return;
    }
  }
  fail('Player-Player regression', 'no sampled shared-club fixture validated');
}

async function main(): Promise<void> {
  const muId = await clubByNorm('Manchester United');
  const parkId = await playerByNorm('Park Ji-sung');
  if (muId && parkId) {
    const countries = ['South-Korea', 'South Korea', 'Korea, South'];
    const fixtureExists = await hasCountryTeamFixture(muId, countries, parkId);
    if (fixtureExists) {
      const valid = await validateCountryTeamPlayerId(muId, 'South-Korea', parkId);
      const guess = await verifyCountryTeamGuess(muId, 'South-Korea', 'Park Ji-sung');
      const pool = await getValidPlayersForCountryAndClub(muId, 'South-Korea', 20);
      if (valid.valid && guess.correct && pool.some((p) => p.playerId === parkId)) pass('South Korea + Manchester United -> Park Ji-sung');
      else fail('South Korea + Manchester United -> Park Ji-sung', `valid=${valid.valid} guess=${guess.correct} pool=${pool.length}`);
    } else {
      skip('South Korea + Manchester United -> Park Ji-sung', 'verified relationship not present in this DB snapshot');
    }
  } else {
    skip('South Korea + Manchester United -> Park Ji-sung', 'entities not present in this DB snapshot');
  }

  const seed = await seedCountryTeamPair();
  if (seed) {
    const seedValid = await validateCountryTeamPlayerId(seed.clubId, seed.country, seed.playerId);
    if (seedValid.valid) pass('Seed country-team pair validates by playerId');
    else fail('Seed country-team pair validates by playerId');

    const wrongClub = await clubNotPlayedBy(seed.playerId, seed.clubId);
    if (wrongClub) {
      const impossible = await validateCountryTeamPlayerId(wrongClub, seed.country, seed.playerId);
      if (!impossible.valid) pass('Impossible relationship rejected');
      else fail('Impossible relationship rejected');

      const wrongClubSameCountry = await validateCountryTeamPlayerId(wrongClub, seed.country, seed.playerId);
      if (!wrongClubSameCountry.valid) pass('Correct country, wrong club rejected');
      else fail('Correct country, wrong club rejected');

      const botRejected = await validateCountryTeamBotCandidate({ clubId: wrongClub, countryId: seed.country, candidatePlayerId: seed.playerId, candidateText: seed.playerName });
      if (botRejected.action === 'REJECTED' && !botRejected.submitText) pass('Bot invalid candidate rejected without fake answer');
      else fail('Bot invalid candidate rejected without fake answer', botRejected.action);
    } else {
      skip('Impossible/wrong-club tests', 'no wrong club found');
    }

    const wrongCountry = await countryNotInClub(seed.clubId);
    if (wrongCountry) {
      const wrongCountryResult = await validateCountryTeamPlayerId(seed.clubId, wrongCountry, seed.playerId);
      if (!wrongCountryResult.valid) pass('Correct club, wrong country rejected');
      else fail('Correct club, wrong country rejected');
    } else {
      skip('Correct club, wrong country rejected', 'no wrong country found');
    }

    const unknown = await validateCountryTeamPlayerId(seed.clubId, seed.country, 999999999);
    if (!unknown.valid) pass('Unknown player id rejected');
    else fail('Unknown player id rejected');
  } else {
    skip('Seed country-team pair validates by playerId', 'no qualifying country-team seed pair in database');
    skip('Impossible/wrong-club tests', 'no qualifying country-team seed pair in database');
    skip('Correct club, wrong country rejected', 'no qualifying country-team seed pair in database');
    skip('Unknown player id rejected', 'no qualifying country-team seed pair in database');
  }

  const emptyPair = await emptyCountryTeamPair();
  if (emptyPair) {
    const empty = await getValidPlayersForCountryAndClub(emptyPair.clubId, emptyPair.country, 5);
    const has = await hasPlayersCountryTeam(emptyPair.clubId, emptyPair.country);
    if (empty.length === 0 && !has) pass('Empty intersection cannot produce bot answer');
    else fail('Empty intersection cannot produce bot answer', `answers=${empty.length} has=${has}`);
  } else {
    skip('Empty intersection cannot produce bot answer', 'no empty pair found');
  }

  const multi = await pool.query<{ club_id: string; nationality: string }>(
    `SELECT pc.club_id, p.nationality
       FROM player_clubs pc
       JOIN players p ON p.id = pc.player_id
       JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
      WHERE p.nationality IS NOT NULL
         AND COALESCE(pc.end_year, pc.start_year, 9999) >= ${MIN_SPELL_YEAR}
      GROUP BY pc.club_id, p.nationality
     HAVING count(DISTINCT p.id) >= 2
      ORDER BY count(DISTINCT p.id) DESC
      LIMIT 1`,
  );
  const mr = multi.rows[0];
  if (mr) {
    const pool = await getValidPlayersForCountryAndClub(Number(mr.club_id), mr.nationality, 8);
    const candidate = pool[0];
    const botOk = candidate ? await validateCountryTeamBotCandidate({ clubId: Number(mr.club_id), countryId: mr.nationality, candidatePlayerId: candidate.playerId, candidateText: candidate.canonicalName }) : null;
    if (pool.length >= 2 && botOk?.action === 'SUBMIT' && botOk.submitText) pass('Multiple valid footballers can be selected safely');
    else fail('Multiple valid footballers can be selected safely', `pool=${pool.length} action=${botOk?.action}`);
  } else {
    skip('Multiple valid footballers can be selected safely', 'no multi-answer pair found');
  }

  await teamTeamRegression();
  await otherModesRegression(seed);

  await closePool();
  console.log(`\ncountry-team bot validation tests complete: skipped=${skipped}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch(async (err) => {
  console.error('country-team bot validation test error:', err);
  await closePool().catch(() => {});
  process.exitCode = 1;
});
