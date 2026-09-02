// "Ben Kimim?" modu çekirdeği: hedef seçimi, oyuncu KARTI (foto/kulüp/uyruk/yaş/forma/
// mevki/lig) ve tahmin↔hedef KARŞILAŞTIRMA motoru. Havuz = guess_who_pool (aktif oyuncular).
import { pool } from '../db/pool.ts';

// Mevki 8-kodu → geniş grup (adil eşleşme: aynı grup yeşil). GK|CB|RB|LB|MF|LW|RW|ST
const POS_GROUP: Record<string, string> = {
  GK: 'GK', CB: 'DEF', RB: 'DEF', LB: 'DEF', MF: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD',
};
export function posGroup(code: string | null): string | null {
  return code ? (POS_GROUP[code] ?? null) : null;
}

export interface GuessWhoCard {
  playerId: number;
  name: string;
  imageUrl: string | null;
  nationality: string | null;
  age: number | null;
  jersey: number | null;
  position: string | null;   // 8-kod
  clubId: number | null;
  clubName: string | null;
  clubLogo: string | null;
  league: string | null;
}

function ageFromBirth(birth: Date | string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a >= 10 && a <= 60 ? a : null;
}

const CARD_SELECT = `
  SELECT g.player_id, p.name, p.image_url, p.nationality, g.birth_date, g.jersey_number, g.position,
         g.current_club_id, c.name AS club_name, c.logo_url AS club_logo, c.league
    FROM guess_who_pool g
    JOIN players p ON p.id = g.player_id
    LEFT JOIN clubs c ON c.id = g.current_club_id`;

function rowToCard(r: any): GuessWhoCard {
  return {
    playerId: Number(r.player_id),
    name: r.name,
    imageUrl: r.image_url ?? null,
    nationality: r.nationality ?? null,
    age: ageFromBirth(r.birth_date),
    jersey: r.jersey_number ?? null,
    position: r.position ?? null,
    clubId: r.current_club_id != null ? Number(r.current_club_id) : null,
    clubName: r.club_name ?? null,
    clubLogo: r.club_logo ?? null,
    league: r.league ?? null,
  };
}

/** Hedef oyuncu: tanınırlık için fame eşiği üstünden rastgele (foto + tam nitelik şart). */
export async function pickGuessWhoTarget(minFame = 120): Promise<GuessWhoCard | null> {
  const { rows } = await pool.query(
    `${CARD_SELECT}
      WHERE p.image_url IS NOT NULL AND g.current_club_id IS NOT NULL
        AND g.birth_date IS NOT NULL AND g.position IS NOT NULL
        AND p.fame >= $1
      ORDER BY random() LIMIT 1`,
    [minFame],
  );
  return rows[0] ? rowToCard(rows[0]) : null;
}

export async function getCard(playerId: number): Promise<GuessWhoCard | null> {
  const { rows } = await pool.query(`${CARD_SELECT} WHERE g.player_id = $1`, [playerId]);
  return rows[0] ? rowToCard(rows[0]) : null;
}

/** İstemci otomatik-tamamlaması için havuz listesi (id + ad). Maç başında bir kez yollanır. */
export async function guessWhoPoolList(): Promise<{ id: number; name: string }[]> {
  const { rows } = await pool.query(
    `SELECT g.player_id AS id, p.name FROM guess_who_pool g JOIN players p ON p.id = g.player_id
      WHERE p.image_url IS NOT NULL ORDER BY p.name`,
  );
  return rows.map((r: any) => ({ id: Number(r.id), name: r.name }));
}

export type Cmp = { value: string | number | null; match: boolean; dir?: 'up' | 'down' };

export interface GuessWhoRow {
  playerId: number;
  name: string;
  imageUrl: string | null;
  correct: boolean;
  club: Cmp & { logo: string | null };
  nationality: Cmp;
  age: Cmp;
  jersey: Cmp;
  position: Cmp;   // value = 8-kod (istemci yerelleştirir); grup eşleşince yeşil
  league: Cmp;
}

const numCmp = (guess: number | null, target: number | null): Cmp => {
  if (guess == null) return { value: null, match: false };
  if (target == null) return { value: guess, match: false };
  if (guess === target) return { value: guess, match: true };
  return { value: guess, match: false, dir: target > guess ? 'up' : 'down' }; // hedef büyükse ↑
};

/** Tahmin edilen oyuncunun kartını hedefle kıyaslar → satır (yeşil/kırmızı + ok). */
export function compareToTarget(guess: GuessWhoCard, target: GuessWhoCard): GuessWhoRow {
  return {
    playerId: guess.playerId,
    name: guess.name,
    imageUrl: guess.imageUrl,
    correct: guess.playerId === target.playerId,
    club: { value: guess.clubName, logo: guess.clubLogo, match: guess.clubId != null && guess.clubId === target.clubId },
    nationality: { value: guess.nationality, match: !!guess.nationality && guess.nationality === target.nationality },
    age: numCmp(guess.age, target.age),
    jersey: numCmp(guess.jersey, target.jersey),
    // Mevki: geniş grup eşleşince yeşil (kaleci/defans/orta/forvet) — daha adil.
    position: { value: guess.position, match: !!guess.position && posGroup(guess.position) === posGroup(target.position) },
    league: { value: guess.league, match: !!guess.league && guess.league === target.league },
  };
}
