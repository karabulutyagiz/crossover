/**
 * Offline football database powered by expo-sqlite.
 *
 * On first launch (or when the bundled data version changes) the JSON asset is
 * loaded into a SQLite database stored on the device. Subsequent launches just
 * open the existing DB.
 *
 * Public API mirrors the server's verify.ts functions:
 *   searchClubs, verifyGuess, commonPlayers, randomClub
 */
// expo-sqlite may not be available in Expo Go
let SQLite: any; try { SQLite = require('expo-sqlite'); } catch { /* native module unavailable */ }
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- types matching the JSON export ----------
interface ExClub { id: number; name: string; norm: string; country: string | null; league: string | null; logo: string | null }
interface ExPlayer { id: number; name: string; norm: string; nat: string | null; img: string | null }
interface ExSpell { p: number; c: number; s: number | null; e: number | null }
interface OfflineData { clubs: ExClub[]; players: ExPlayer[]; spells: ExSpell[] }

// ---------- normalize (mirrors server/src/game/normalize.ts) ----------
const TK: Record<string, string> = { ı:'i',İ:'i',ş:'s',Ş:'s',ğ:'g',Ğ:'g',ü:'u',Ü:'u',ö:'o',Ö:'o',ç:'c',Ç:'c' };
const COMBINING = /\p{M}/gu;
export function normalize(input: string): string {
  if (!input) return '';
  let s = input.replace(/[ıİşŞğĞüÜöÖçÇ]/g, ch => TK[ch] ?? ch);
  s = s.normalize('NFD').replace(COMBINING, '');
  s = s.replace(/[''`´.]/g, '');
  s = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

// ---------- trigram similarity (mirrors pg_trgm) ----------
function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const set = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
  return set;
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const union = ta.size + tb.size - common;
  return union === 0 ? 0 : common / union;
}

// ---------- DB singleton ----------
const DB_NAME = 'crossover_offline.db';
const DATA_VERSION_KEY = '@offline_data_v';
const CURRENT_VERSION = '2'; // bump when data.json changes

let db: any = null;

export async function initOfflineDB(): Promise<void> {
  if (db) return;
  if (!SQLite) return;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  const stored = await AsyncStorage.getItem(DATA_VERSION_KEY);
  if (stored === CURRENT_VERSION) return; // already populated

  console.log('[offline] Loading data into SQLite...');
  const raw: OfflineData = require('./data.json');

  await db.execAsync('DROP TABLE IF EXISTS spells');
  await db.execAsync('DROP TABLE IF EXISTS players');
  await db.execAsync('DROP TABLE IF EXISTS clubs');

  await db.execAsync(`
    CREATE TABLE clubs (
      id INTEGER PRIMARY KEY, name TEXT, norm TEXT,
      country TEXT, league TEXT, logo TEXT
    )
  `);
  await db.execAsync(`
    CREATE TABLE players (
      id INTEGER PRIMARY KEY, name TEXT, norm TEXT,
      nat TEXT, img TEXT
    )
  `);
  await db.execAsync(`
    CREATE TABLE spells (
      player_id INTEGER, club_id INTEGER,
      start_year INTEGER, end_year INTEGER
    )
  `);

  // Bulk insert: multi-row INSERTs (chunked under SQLite's ~999 variable limit) collapse
  // ~165k bridge round-trips into a few hundred. WAL + synchronous=OFF speed the one-time
  // seed; yielding every few chunks keeps the UI responsive while it loads in background.
  await db.execAsync('PRAGMA journal_mode=WAL; PRAGMA synchronous=OFF;');
  const d = db; // non-null here
  const bulk = async (table: string, cols: number, rows: unknown[], toRow: (r: never) => (string | number | null)[], orReplace = true) => {
    if (!rows.length) return;
    const perChunk = Math.max(1, Math.floor(800 / cols));
    const ph = '(' + Array(cols).fill('?').join(',') + ')';
    const verb = orReplace ? 'INSERT OR REPLACE INTO' : 'INSERT INTO';
    await d.execAsync('BEGIN');
    for (let i = 0; i < rows.length; i += perChunk) {
      const chunk = rows.slice(i, i + perChunk);
      const params = chunk.flatMap(toRow as (r: unknown) => (string | number | null)[]);
      await d.runAsync(`${verb} ${table} VALUES ${chunk.map(() => ph).join(',')}`, params);
      if (((i / perChunk) | 0) % 25 === 0) await new Promise((r) => setTimeout(r, 0)); // yield to UI
    }
    await d.execAsync('COMMIT');
  };
  await bulk('clubs', 6, raw.clubs, (c: ExClub) => [c.id, c.name, c.norm, c.country, c.league, c.logo]);
  await bulk('players', 5, raw.players, (p: ExPlayer) => [p.id, p.name, p.norm, p.nat, p.img]);
  await bulk('spells', 4, raw.spells, (s: ExSpell) => [s.p, s.c, s.s, s.e], false);

  // Indexes for fast lookups
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_spells_club ON spells(club_id)');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_spells_player ON spells(player_id)');

  await AsyncStorage.setItem(DATA_VERSION_KEY, CURRENT_VERSION);
  console.log('[offline] DB ready');
}

function getDB(): any {
  if (!db) throw new Error('Offline DB not initialized — call initOfflineDB first');
  return db;
}

// ---------- Public query API ----------

export interface OfflineClub {
  id: number;
  name: string;
  logoUrl: string | null;
}

export async function searchClubs(query: string, limit = 30): Promise<OfflineClub[]> {
  const d = getDB();
  if (!query.trim()) {
    // Return popular clubs (those with the most spells)
    const rows = await d.getAllAsync(
      `SELECT c.id, c.name, c.logo FROM clubs c
       JOIN spells s ON s.club_id = c.id
       GROUP BY c.id ORDER BY COUNT(*) DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r: any) => ({ id: r.id, name: r.name, logoUrl: r.logo }));
  }
  const norm = normalize(query);
  // SQLite doesn't have pg_trgm — use LIKE + in-memory similarity ranking
  const rows = await d.getAllAsync(
    `SELECT id, name, norm, logo FROM clubs WHERE norm LIKE ? LIMIT 200`,
    [`%${norm}%`],
  );
  // Rank by similarity
  const ranked = rows
    .map((r: any) => ({ ...r, sim: similarity(norm, r.norm) }))
    .sort((a: any, b: any) => b.sim - a.sim)
    .slice(0, limit);
  return ranked.map((r: any) => ({ id: r.id, name: r.name, logoUrl: r.logo }));
}

export async function randomClub(difficulty: 'easy' | 'medium' | 'hard'): Promise<OfflineClub | null> {
  const d = getDB();
  const topN = difficulty === 'easy' ? 20 : difficulty === 'medium' ? 60 : 200;
  const rows = await d.getAllAsync(
    `SELECT c.id, c.name, c.logo FROM clubs c
     JOIN spells s ON s.club_id = c.id
     GROUP BY c.id ORDER BY COUNT(*) DESC LIMIT ?`,
    [topN],
  );
  if (rows.length === 0) return null;
  const r = rows[Math.floor(Math.random() * rows.length)]!;
  return { id: r.id, name: r.name, logoUrl: r.logo };
}

const MATCH_THRESHOLD = 0.3;
const EXACT_THRESHOLD = 0.85;

export interface VerifyResult {
  correct: boolean;
  matchedPlayerName: string | null;
  matchedPlayerImageUrl: string | null;
  autocorrected: boolean;
  spellsA: { clubId: number; clubName: string; logoUrl: string | null; startYear: number | null; endYear: number | null }[];
  spellsB: { clubId: number; clubName: string; logoUrl: string | null; startYear: number | null; endYear: number | null }[];
  allClubs: { clubId: number; clubName: string; logoUrl: string | null; startYear: number | null; endYear: number | null }[];
}

export async function verifyGuess(teamAId: number, teamBId: number, guess: string): Promise<VerifyResult> {
  const d = getDB();
  const norm = normalize(guess);
  if (!norm) return emptyResult();

  // Find candidate players by LIKE search
  const candidates = await d.getAllAsync(
    `SELECT id, name, norm, img FROM players WHERE norm LIKE ? LIMIT 50`,
    [`%${norm}%`],
  );
  if (candidates.length === 0) return emptyResult();

  // Score each candidate by similarity
  const scored = candidates
    .map((c: any) => ({ ...c, sim: similarity(norm, c.norm) }))
    .filter((c: any) => c.sim >= MATCH_THRESHOLD)
    .sort((a: any, b: any) => b.sim - a.sim);

  if (scored.length === 0) return emptyResult();

  // Check if top candidate is an "exact" intent (similarity >= 0.85)
  const top = scored[0]!;
  if (top.sim >= EXACT_THRESHOLD) {
    // Player specifically named — check strictly
    const played = await playedBothClubs(d, top.id, teamAId, teamBId);
    if (played) {
      return await buildResult(d, top.id, top.name, top.img, teamAId, teamBId, false);
    }
    return emptyResult();
  }

  // Approximate: find the best candidate who played both clubs
  for (const c of scored) {
    const played = await playedBothClubs(d, c.id, teamAId, teamBId);
    if (played) {
      return await buildResult(d, c.id, c.name, c.img, teamAId, teamBId, c.id !== top.id);
    }
  }
  return emptyResult();
}

async function playedBothClubs(d: any, playerId: number, clubA: number, clubB: number): Promise<boolean> {
  const row = await d.getFirstAsync(
    `SELECT COUNT(DISTINCT club_id) as cnt FROM spells
     WHERE player_id = ? AND club_id IN (?, ?)`,
    [playerId, clubA, clubB],
  );
  return (row?.cnt ?? 0) >= 2;
}

async function buildResult(
  d: any, playerId: number, playerName: string, playerImg: string | null,
  teamAId: number, teamBId: number, autocorrected: boolean,
): Promise<VerifyResult> {
  const spells = await d.getAllAsync(
    'SELECT club_id, start_year, end_year FROM spells WHERE player_id = ?',
    [playerId],
  );
  const clubIds = [...new Set(spells.map((s: any) => s.club_id))];
  const clubs = clubIds.length > 0
    ? await d.getAllAsync(
        `SELECT id, name, logo FROM clubs WHERE id IN (${clubIds.map(() => '?').join(',')})`,
        clubIds,
      )
    : [];
  const clubMap = new Map<number, any>(clubs.map((c: any) => [c.id, c]));

  const spellsA = spells.filter((s: any) => s.club_id === teamAId).map((s: any) => ({
    clubId: teamAId, clubName: clubMap.get(teamAId)?.name ?? '', logoUrl: clubMap.get(teamAId)?.logo ?? null, startYear: s.start_year, endYear: s.end_year,
  }));
  const spellsB = spells.filter((s: any) => s.club_id === teamBId).map((s: any) => ({
    clubId: teamBId, clubName: clubMap.get(teamBId)?.name ?? '', logoUrl: clubMap.get(teamBId)?.logo ?? null, startYear: s.start_year, endYear: s.end_year,
  }));
  const allClubs = spells.map((s: any) => ({
    clubId: s.club_id,
    clubName: clubMap.get(s.club_id)?.name ?? '',
    logoUrl: clubMap.get(s.club_id)?.logo ?? null,
    startYear: s.start_year,
    endYear: s.end_year,
  }));

  return { correct: true, matchedPlayerName: playerName, matchedPlayerImageUrl: playerImg, autocorrected, spellsA, spellsB, allClubs };
}

function emptyResult(): VerifyResult {
  return { correct: false, matchedPlayerName: null, matchedPlayerImageUrl: null, autocorrected: false, spellsA: [], spellsB: [], allClubs: [] };
}

export async function commonPlayers(teamAId: number, teamBId: number, limit = 5): Promise<{ name: string; imageUrl: string | null }[]> {
  const d = getDB();
  const rows = await d.getAllAsync(
    `SELECT DISTINCT p.name, p.img FROM players p
     JOIN spells s1 ON s1.player_id = p.id AND s1.club_id = ?
     JOIN spells s2 ON s2.player_id = p.id AND s2.club_id = ?
     LIMIT ?`,
    [teamAId, teamBId, limit],
  );
  return rows.map((r: any) => ({ name: r.name, imageUrl: r.img }));
}

export async function hasCommonPlayers(teamAId: number, teamBId: number): Promise<boolean> {
  const d = getDB();
  const row = await d.getFirstAsync(
    `SELECT COUNT(*) as cnt FROM (
       SELECT DISTINCT s1.player_id FROM spells s1
       JOIN spells s2 ON s2.player_id = s1.player_id AND s2.club_id = ?
       WHERE s1.club_id = ? LIMIT 1
     )`,
    [teamBId, teamAId],
  );
  return (row?.cnt ?? 0) > 0;
}
