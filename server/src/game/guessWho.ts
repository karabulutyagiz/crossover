// "Ben Kimim?" modu çekirdeği: hedef seçimi, oyuncu KARTI (foto/kulüp/uyruk/yaş/forma/
// mevki/lig) ve tahmin↔hedef KARŞILAŞTIRMA motoru. Havuz = guess_who_pool (aktif oyuncular).
import { pool } from '../db/pool.ts';
import { leagueLogoUrl } from './verify.ts';

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

/** Hedef oyuncu: tanınırlık için fame eşiği üstünden rastgele (foto + tam nitelik şart).
 * excludeIds: aynı maçın önceki turlarında çıkan hedefler (çok turlu mod) tekrar gelmez. */
export async function pickGuessWhoTarget(minFame = 120, excludeIds: number[] = []): Promise<GuessWhoCard | null> {
  const { rows } = await pool.query(
    `${CARD_SELECT}
      WHERE p.image_url IS NOT NULL AND g.current_club_id IS NOT NULL
        AND g.birth_date IS NOT NULL AND g.position IS NOT NULL
        AND p.fame >= $1
        AND NOT (g.player_id = ANY($2::bigint[]))
      ORDER BY random() LIMIT 1`,
    [minFame, excludeIds],
  );
  return rows[0] ? rowToCard(rows[0]) : null;
}

export async function getCard(playerId: number): Promise<GuessWhoCard | null> {
  const { rows } = await pool.query(`${CARD_SELECT} WHERE g.player_id = $1`, [playerId]);
  return rows[0] ? rowToCard(rows[0]) : null;
}

/** HAVUZ DIŞI tahmin kartı (kullanıcı kararı 2026-09-06: yazarken TÜM futbolcular
 * çıksın, hedef hazır havuzdan kalsın). Havuzdaysa tam kart; değilse players +
 * player_positions + SON kulüp dönemi (player_clubs: bitmemiş ya da en yeni) ile
 * yaklaşık kart: forma no yok (nötr hücre), yaş doğum YILINDAN (±1). Karşılaştırma
 * hedefin gerçek kartına karşı yapıldığından bot tümdengelimi hedefi asla elemez. */
export async function getCardAny(playerId: number): Promise<GuessWhoCard | null> {
  const inPool = await getCard(playerId);
  if (inPool) return inPool;
  const { rows } = await pool.query(
    `SELECT p.id AS player_id, p.name, p.image_url, p.nationality, p.birth_year, pp.position,
            lc.club_id AS current_club_id, c.name AS club_name, c.logo_url AS club_logo, c.league
       FROM players p
       LEFT JOIN player_positions pp ON pp.player_id = p.id
       LEFT JOIN LATERAL (
         SELECT x.club_id
           FROM player_clubs x JOIN clubs cc ON cc.id = x.club_id AND cc.is_national = false
          WHERE x.player_id = p.id
          ORDER BY (x.end_year IS NULL) DESC, x.start_year DESC NULLS LAST, x.end_year DESC NULLS LAST
          LIMIT 1) lc ON true
       LEFT JOIN clubs c ON c.id = lc.club_id
      WHERE p.id = $1`,
    [playerId],
  );
  const r = rows[0];
  if (!r) return null;
  const y = r.birth_year != null ? Number(r.birth_year) : null;
  const age = y ? new Date().getFullYear() - y : null;
  return {
    playerId: Number(r.player_id), name: r.name, imageUrl: r.image_url ?? null, nationality: r.nationality ?? null,
    age: age != null && age >= 10 && age <= 60 ? age : null, jersey: null, position: r.position ?? null,
    clubId: r.current_club_id != null ? Number(r.current_club_id) : null, clubName: r.club_name ?? null,
    clubLogo: r.club_logo ?? null, league: r.league ?? null,
  };
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
  league: Cmp & { logo: string | null };   // lig LOGOSU (kullanıcı isteği 2026-09-02: kod yerine logo)
}

// ── Bot tümdengelimi (kullanıcı kuralı 2026-09-02: "bot gerçek insan gibi") ──
// Bot HEDEFİ BİLMEZ; yalnız tabloda biriken ipuçlarından (yeşil/kırmızı/ok) mantık
// yürütür: kısıtları sağlayan adaylar havuzdan süzülür, insan gibi ÜNLÜLERDEN
// başlanarak seçilir. Kısıtlar hedef hakkında hep DOĞRU olduğundan aday kümesi
// daralır ve hedef doğal olarak "bulunur" — asla kör şansla ilk tahminde değil.
export interface GwDeduction {
  excludeIds: number[];                     // tahmin edilmişler (+ ilk tahminde hedef)
  clubEq?: number | null; clubNe: number[];
  natEq?: string | null; natNe: string[];
  leagueEq?: string | null; leagueNe: string[];
  posGroupEq?: string | null; posGroupNe: string[];   // GK|DEF|MID|FWD
  ageEq?: number | null; ageMin?: number | null; ageMax?: number | null;
  jerseyEq?: number | null; jerseyMin?: number | null; jerseyMax?: number | null;
}

const POS_CODES_BY_GROUP: Record<string, string[]> = {
  GK: ['GK'], DEF: ['CB', 'RB', 'LB'], MID: ['MF'], FWD: ['LW', 'RW', 'ST'],
};

/** İpucu kısıtlarını sağlayan havuz adayları, ün sırasıyla (insanlar ünlüden düşünür). */
export async function deduceGuessWhoCandidates(d: GwDeduction, limit = 60): Promise<{ playerId: number; fame: number }[]> {
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [
    'p.image_url IS NOT NULL', 'g.current_club_id IS NOT NULL',
    'g.birth_date IS NOT NULL', 'g.position IS NOT NULL',
  ];
  if (d.excludeIds.length) where.push(`g.player_id <> ALL(${p(d.excludeIds)}::bigint[])`);
  if (d.clubEq != null) where.push(`g.current_club_id = ${p(d.clubEq)}`);
  else if (d.clubNe.length) where.push(`g.current_club_id <> ALL(${p(d.clubNe)}::bigint[])`);
  if (d.natEq != null) where.push(`p.nationality = ${p(d.natEq)}`);
  else if (d.natNe.length) where.push(`(p.nationality IS NULL OR p.nationality <> ALL(${p(d.natNe)}::text[]))`);
  if (d.leagueEq != null) where.push(`c.league = ${p(d.leagueEq)}`);
  else if (d.leagueNe.length) where.push(`(c.league IS NULL OR c.league <> ALL(${p(d.leagueNe)}::text[]))`);
  if (d.posGroupEq != null) where.push(`g.position = ANY(${p(POS_CODES_BY_GROUP[d.posGroupEq] ?? [])}::text[])`);
  else if (d.posGroupNe.length) {
    const ne = d.posGroupNe.flatMap((grp) => POS_CODES_BY_GROUP[grp] ?? []);
    if (ne.length) where.push(`NOT (g.position = ANY(${p(ne)}::text[]))`);
  }
  const ageExpr = `EXTRACT(YEAR FROM age(current_date, g.birth_date))::int`;
  if (d.ageEq != null) where.push(`${ageExpr} = ${p(d.ageEq)}`);
  else {
    if (d.ageMin != null) where.push(`${ageExpr} >= ${p(d.ageMin)}`);
    if (d.ageMax != null) where.push(`${ageExpr} <= ${p(d.ageMax)}`);
  }
  if (d.jerseyEq != null) where.push(`g.jersey_number = ${p(d.jerseyEq)}`);
  else {
    if (d.jerseyMin != null) where.push(`g.jersey_number >= ${p(d.jerseyMin)}`);
    if (d.jerseyMax != null) where.push(`g.jersey_number <= ${p(d.jerseyMax)}`);
  }
  // forma kısıtı varsa numarasız adaylar elenir (insan da bilinen numaralı düşünür)
  if (d.jerseyEq != null || d.jerseyMin != null || d.jerseyMax != null) where.push('g.jersey_number IS NOT NULL');
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT g.player_id, COALESCE(p.fame, 0) AS fame
       FROM guess_who_pool g
       JOIN players p ON p.id = g.player_id
       LEFT JOIN clubs c ON c.id = g.current_club_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.fame DESC NULLS LAST
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r: any) => ({ playerId: Number(r.player_id), fame: Number(r.fame) }));
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
    league: { value: guess.league, logo: guess.league ? leagueLogoUrl(guess.league) : null, match: !!guess.league && guess.league === target.league },
  };
}
