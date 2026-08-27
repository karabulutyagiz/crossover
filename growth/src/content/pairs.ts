import { pool } from '../db/pool.ts';
import { normalizeText } from '../core/signature.ts';
import { POPULAR_POOL, type RandomSource, defaultRandom } from './teams.ts';

// İçerik motorunun veri kalbi: sorular UYDURULMAZ. Oyunun kendi
// clubs/players/player_clubs tablolarından gerçek "iki takımda da oynamış"
// futbolcular çekilir — yayınlanan her challenge oyun içinde de doğrulanabilir.

export interface ClubRef {
  id: number;
  name: string;
}

export interface PairChallenge {
  clubA: ClubRef;
  clubB: ClubRef;
  commonPlayers: { id: number; name: string }[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CareerPath {
  player: { id: number; name: string };
  clubs: string[]; // kronolojik sıra
}

/**
 * İsimden kulüp çözer (pg_trgm fuzzy — "Bayern Munich" ↔ "FC Bayern München").
 * Sıralama: tam eşleşme > benzerlik > KISA isim. Kısa isim tercihi "Real
 * Madrid" sorusunun yanlışlıkla "Real Madrid C" (C takımı) çözmesini önler;
 * oyuncu sayısı eşiği de hayalet/alt takım kayıtlarını eler.
 */
export async function resolveClub(name: string): Promise<ClubRef | null> {
  const norm = normalizeText(name);
  // Sıralama skoru sim × √spells: saf trigram benzerliği kanonik kulübün
  // ALEYHİNE çalışır ("fc barcelona" → Futbol Club Barcelona sim 0.46 iken
  // FC Barcelona Atlètic 0.62, FC Barcelona C 0.87). Oyunun searchClubs'ının
  // öğrettiği ders: aynı isim ailesinde kanonik kulüp = en derin kadro.
  // √spells benzerliği ezmeden (Inter ≠ Internacional) dev kulübü öne çıkarır.
  const { rows } = await pool.query<{ id: string; name: string; sim: number }>(
    `SELECT c.id, c.name, similarity(c.name_norm, $1) AS sim
       FROM clubs c
      CROSS JOIN LATERAL (
        SELECT count(*)::float AS spells FROM player_clubs pc WHERE pc.club_id = c.id
      ) s
      WHERE c.is_national = FALSE AND (c.name_norm % $1 OR c.name_norm ILIKE '%' || $1 || '%')
        AND s.spells >= 25
        -- B/C/gençlik/rezerv takımları içerik havuzuna asla girmez
        -- ("Real Madrid" sorgusu "Real Madrid C"yi DEĞİL ana kulübü bulmalı).
        AND c.name_norm !~ '(^|\\s)(b|c|ii|iii|u\\d{2}|[abc]\\d)$'
        AND c.name_norm !~ '(castilla|reserve|youth|academy|atletic$|juvenil)'
        -- kadın takımları erkek futbolu içerik havuzunun dışında (ayrı ürün)
        AND c.name_norm !~ '(femen|feminin|women|ladies|kadin)'
      ORDER BY (c.name_norm = $1) DESC,
               similarity(c.name_norm, $1) * sqrt(s.spells) DESC
      LIMIT 1`,
    [norm],
  );
  const row = rows[0];
  if (!row || row.sim < 0.25) return null;
  return { id: Number(row.id), name: row.name };
}

// Popüler havuz isimleri → gerçek kulüp id'leri (bir kez çözülür, süreç boyunca
// önbellekte). Çift seçimi isim-altdizesi yerine ID üzerinden yapılır — "Real
// Madrid C" gibi alt takımlar havuza sızamaz.
let poolCache: Map<number, string> | null = null;

async function popularClubIds(): Promise<Map<number, string>> {
  if (poolCache) return poolCache;
  const map = new Map<number, string>();
  for (const name of POPULAR_POOL) {
    const club = await resolveClub(name);
    if (club) map.set(club.id, club.name);
  }
  poolCache = map;
  return map;
}

export async function commonPlayers(clubAId: number, clubBId: number): Promise<{ id: number; name: string }[]> {
  // Tanınırlık sırası: oynadığı popüler kulüp sayısı çok olan önce (IG reveal
  // ve dashboard "cevap" alanı meçhul bir ismi değil yıldızı göstersin).
  const poolIds = [...(await popularClubIds()).keys()];
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT p.id, p.name,
            (SELECT count(DISTINCT pc.club_id) FROM player_clubs pc
              WHERE pc.player_id = p.id AND pc.club_id = ANY($3::bigint[])) AS fame
       FROM players p
      WHERE EXISTS (SELECT 1 FROM player_clubs WHERE player_id = p.id AND club_id = $1)
        AND EXISTS (SELECT 1 FROM player_clubs WHERE player_id = p.id AND club_id = $2)
      ORDER BY fame DESC, p.name
      LIMIT 25`,
    [clubAId, clubBId, poolIds],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

/** Verilen kulüple ortak oyuncusu olan diğer kulüpler (ortak oyuncu sayısıyla). */
async function partnersOf(clubId: number): Promise<{ id: number; name: string; common: number }[]> {
  const { rows } = await pool.query<{ id: string; name: string; common: string }>(
    `SELECT c2.id, c2.name, COUNT(DISTINCT pc2.player_id) AS common
       FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> pc1.club_id
       JOIN clubs c2 ON c2.id = pc2.club_id AND c2.is_national = FALSE
      WHERE pc1.club_id = $1
      GROUP BY c2.id, c2.name
      HAVING COUNT(DISTINCT pc2.player_id) >= 1
      ORDER BY common DESC
      LIMIT 200`,
    [clubId],
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, common: Number(r.common) }));
}

export function difficultyFromCommonCount(count: number): 'easy' | 'medium' | 'hard' {
  if (count >= 5) return 'easy';
  if (count >= 2) return 'medium';
  return 'hard';
}

/**
 * Popüler havuzdan, gerçekten ortak oyuncusu olan bir takım çifti seçer.
 * wantHard=true → "impossible" içerikleri için 1-2 ortak oyunculu çift aranır.
 */
export async function pickPairChallenge(
  opts: { wantHard?: boolean; preferTurkish?: boolean; rnd?: RandomSource } = {},
): Promise<PairChallenge | null> {
  const rnd = opts.rnd ?? defaultRandom;
  const basePool = opts.preferTurkish
    ? ['Galatasaray', 'Fenerbahçe', 'Beşiktaş', 'Trabzonspor']
    : [...POPULAR_POOL];

  // 6 denemeye kadar: rastgele bir popüler kulüp al, partnerlerinden yine
  // popüler havuzda (ID bazlı) olan birini seç.
  const poolIds = await popularClubIds();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const aName = basePool[Math.floor(rnd.next() * basePool.length)]!;
    const clubA = await resolveClub(aName);
    if (!clubA) continue;
    const partners = await partnersOf(clubA.id);
    let candidates = partners.filter((p) => poolIds.has(p.id) && p.id !== clubA.id);
    if (opts.wantHard) {
      candidates = candidates.filter((c) => c.common <= 2);
    }
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(rnd.next() * candidates.length)]!;
    const players = await commonPlayers(clubA.id, pick.id);
    if (players.length === 0) continue;
    return {
      clubA,
      clubB: { id: pick.id, name: pick.name },
      commonPlayers: players,
      difficulty: difficultyFromCommonCount(players.length),
    };
  }
  return null;
}

/** Belirli iki takım için challenge (derbi/maç günü içerikleri buradan geçer). */
export async function pairChallengeFor(nameA: string, nameB: string): Promise<PairChallenge | null> {
  const clubA = await resolveClub(nameA);
  const clubB = await resolveClub(nameB);
  if (!clubA || !clubB || clubA.id === clubB.id) return null;
  const players = await commonPlayers(clubA.id, clubB.id);
  if (players.length === 0) return null;
  return { clubA, clubB, commonPlayers: players, difficulty: difficultyFromCommonCount(players.length) };
}

/**
 * "Guess The Player" için kariyer yolu: en az minClubs popüler kulüpte oynamış
 * rastgele bir oyuncu (kulüpler start_year sırasıyla).
 */
export async function pickCareerPath(minClubs = 3, rnd: RandomSource = defaultRandom): Promise<CareerPath | null> {
  // Fuzzy CTE değil, çözülmüş havuz ID'leri: alt takımlar ("Atlético Madrid C")
  // kariyer yoluna sızarsa hem yol bozuk hem cevap anonim çıkıyor.
  const poolIds = await popularClubIds();
  const ids = [...poolIds.keys()];
  if (ids.length === 0) return null;
  const { rows } = await pool.query<{ player_id: string; player_name: string; clubs: string[] }>(
    `WITH popular_clubs AS (
       SELECT c.id, c.name FROM clubs c WHERE c.id = ANY($1::bigint[])
     ),
     candidates AS (
       SELECT pc.player_id, COUNT(DISTINCT pc.club_id) AS club_count
         FROM player_clubs pc
         JOIN popular_clubs c ON c.id = pc.club_id
        GROUP BY pc.player_id
       HAVING COUNT(DISTINCT pc.club_id) >= $2
        ORDER BY random()
        LIMIT 20
     )
     SELECT p.id AS player_id, p.name AS player_name,
            array_agg(DISTINCT c.name) AS clubs
       FROM candidates cd
       JOIN players p ON p.id = cd.player_id
       JOIN player_clubs pc ON pc.player_id = p.id
       JOIN popular_clubs c ON c.id = pc.club_id
      GROUP BY p.id, p.name`,
    [ids, minClubs],
  );
  if (rows.length === 0) return null;
  const row = rows[Math.floor(rnd.next() * rows.length)]!;
  return {
    player: { id: Number(row.player_id), name: row.player_name },
    clubs: row.clubs,
  };
}
