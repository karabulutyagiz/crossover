// ============================================================================
// FUTBOL XOX (Tiki-Taka-Toe) — 3×3 grid üreticisi.
//
// KURAL: 9 hücrenin HER BİRİ en az MIN_CELL_ANSWERS geçerli cevaba sahip
// olmalı — imkânsız hücre, turu değil MAÇI kilitler. Üretim deterministik
// değildir ama sunucu-otoriterdir: grid yalnız burada doğar, istemci çizer.
//
// Seçki dili retention kararlarıyla aynı (bkz. retention-first-bots):
// popüler/bilindik kulüpler ağırlıklı, Türk devlerinin gride girme şansı
// yüksek — oyuncu tanıdığı takımlarla oynar.
// ============================================================================
import { pool } from '../db/pool.ts';
import { clubPopularityTier, tierBaseWeight, isTurkishClub } from './clubPopularity.ts';
import {
  pickXoxCountryForClubs, pickXoxLeagueForClubs, pickXoxManagerForClubs, pickXoxTrophyForClubs,
  pickXoxPositionForClubs, pickXoxBdorForClubs, pickXoxComboForClubs, countXoxCell, toXoxCellAxis,
  XOX_COMBOS,
} from './verify.ts';

/** Bir XOX ekseni: KULÜP, ÜLKE, LİG, TD, KUPA, MEVKİ veya BALLON D'OR.
 * Ülke=nationality; lig=clubs.league; TD=manager_tenures(yıl-örtüşme);
 * kupa/BDOR=player_honours; mevki=player_positions(ana mevki, KATI).
 * Hücre = kesişen kulüpte oynamış VE (o ülkeden / o ligde / o TD altında / o
 * kupayı kazanmış / ana mevkisi O / Ballon d'Or kazanmış). */
export interface XoxAxis {
  kind: 'club' | 'country' | 'league' | 'manager' | 'trophy' | 'position' | 'bdor' | 'combo';
  id: number;              // kulüp id; özel eksenler için 0 (sentinel)
  name: string;
  logoUrl: string | null;  // kulüp arması / lig logosu / TD fotosu; diğerlerinde null
  country?: string;        // ham milliyet string'i (kind==='country')
  flag?: string;           // bayrak emojisi (kind==='country')
  league?: string;         // büyük lig KODU, ör. 'ES1' (kind==='league')
  manager?: number;        // TM trainer id (kind==='manager')
  trophy?: string;         // kupa KODU 'CL'|'WC'|'EL' (kind==='trophy')
  position?: string;       // mevki KODU 'GK'|'CB'|… (kind==='position')
  combo?: string;          // birleşik logo KEY'i, ör. 'BARCA_REAL' (kind==='combo')
  comboA?: number;         // combo 1. kulüp id (kind==='combo')
  comboB?: number;         // combo 2. kulüp id (kind==='combo')
}

export interface XoxGrid {
  rows: XoxAxis[];             // 3 satır ekseni (kulüp veya ülke)
  cols: XoxAxis[];             // 3 sütun ekseni (kulüp veya ülke)
  /** Satır-major 9 hücre: kaç geçerli cevap var (bot zorluğu + telemetri). */
  cellAnswerCounts: number[];
}

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : fallback;
}

export const XOX_MIN_CELL_ANSWERS = intEnv('XOX_MIN_CELL_ANSWERS', 2);
// Kolaylaştırma (2026-08-29): havuz 70→55 (yalnız EN ünlü kulüpler) ve sütunlar
// cevabı BOL (kolay) hücrelere meyilli seçilir — gelen takımlar daha tanıdık.
const POOL_LIMIT = 55;
// KARIŞIK DİZİLİM (kullanıcı kararı 2026-08-30): özeller İKİ eksene de dağılır
// (segregasyon yok). HER gridde EN AZ 2 özel (3 zorunlu değil) → k ∈ {2,3}.
// En az bir özel satırda, en az bir sütunda → özel×özel hücreler oluşabilir.
// Kulüp hücreleri ≥2 (adil); combo/BDOR içeren hücreler ≥1 (elit/nadir — tek
// tanınır cevap kabul: ör. Barça+Real × Galatasaray → Hagi).
const SPECIALS_MIN = 2;
const SPECIALS_MAX = 3;
// TÜM özel türleri EŞİT nadirlikte — maçtan maça RANDOM gelir (kullanıcı kararı
// 2026-08-30). Tür seçimi tekdüze rastgele; combo/BDOR seçilince o gridin kulüp
// havuzu ONLARI destekleyen kulüplerle sınırlanır → seçildiklerinde DAİMA çıkarlar
// (böylece görünme sıklıkları diğerleriyle eşitlenir, ağırlık farkı yok).
//
// MEVKİ ekseni GEÇİCİ KAPALI (2026-08-31): mevki verisi eksik (~%25) ve TM toplu
// taramayı engellediğinden tamamlanması yavaş → doğru stoperler bile reddediliyordu.
// Arka plan taraması bitip kapsam yükselince POSITION_ENABLED=true yapılacak.
const POSITION_ENABLED = process.env.XOX_POSITION_ENABLED === 'true';
const SPECIAL_TYPES = ['country', 'league', 'manager', 'trophy', 'bdor', 'combo']
  .concat(POSITION_ENABLED ? ['position'] : []);

interface PoolClub {
  id: number;
  name: string;
  logoUrl: string | null;
  weight: number;
}

let poolCache: { at: number; clubs: PoolClub[] } | null = null;

/** Popüler kulüp havuzu (5 dk önbellek): bilindik takımlar ağır basar,
 * Türk devleri ekstra çarpanla gride sık girer. */
async function popularClubPool(): Promise<PoolClub[]> {
  if (poolCache && Date.now() - poolCache.at < 5 * 60_000) return poolCache.clubs;
  const { rows } = await pool.query<{ id: string; name: string; name_norm: string; logo_url: string | null; league: string | null; country: string | null; pop: string }>(
    `SELECT c.id, c.name, c.name_norm, c.logo_url, c.league, c.country,
            COALESCE(NULLIF(c.popularity, 0), (SELECT count(*) FROM player_clubs pc WHERE pc.club_id = c.id)) AS pop
       FROM clubs c
      WHERE c.is_national = false
        AND c.logo_url IS NOT NULL
        AND EXISTS (SELECT 1 FROM player_clubs pc WHERE pc.club_id = c.id)
        AND c.name_norm !~* '(women|femen|femin|frauen|kadin|ladies)'
        AND c.name_norm !~* '(^|[^a-z])(u-?1[2-9]|u-?2[0-3]|youth|jugend|primavera|altyapi|akademi|academy|junior)([^a-z]|$)'
        AND c.name_norm !~* '( b| ii| iii| reserves?| castilla)$'
      ORDER BY pop DESC
      LIMIT 400`,
  );
  // FAME'e göre seç, kadro büyüklüğüne göre DEĞİL (2026-08-30 düzeltme).
  // 'popularity' = kadro büyüklüğü (İtalyan orta-sıra şişkin) → eski
  // 'ORDER BY roster LIMIT 55' Real/Barça/Bayern/PSG/City gibi DÜNYA DEVLERİNİ
  // (kadroları görece küçük) havuz DIŞINDA bırakıyordu; gridler Genoa/Parma/
  // Sampdoria ile doluyor, BDOR/kupa elit kulüplerde olduğundan ~hiç çıkmıyordu.
  // Artık: katman sistemi kulüp ADINDAN ünlüleri bilir → TÜM ünlüler (dev/çok-
  // popüler/popüler) havuza girer, kalan slotlar tanınırlardan (büyük-lig) dolar.
  const ranked = rows.map((r) => {
    const tier = clubPopularityTier({ name: r.name, nameNorm: r.name_norm, popularity: Number(r.pop), league: r.league, country: r.country });
    let weight = tierBaseWeight(tier);
    if (isTurkishClub(r.name)) weight *= 1.8; // Türk devleri gridde sık görünsün
    return { id: Number(r.id), name: r.name, logoUrl: r.logo_url, weight, tier, pop: Number(r.pop) };
  });
  const FAMOUS_TIERS = new Set(['GLOBAL_GIANT', 'VERY_POPULAR', 'POPULAR']);
  const famous = ranked.filter((c) => FAMOUS_TIERS.has(c.tier));
  const rest = ranked.filter((c) => c.tier === 'RECOGNIZABLE').sort((a, b) => b.pop - a.pop);
  const target = Math.max(POOL_LIMIT, famous.length); // ünlülerin HEPSİ girsin
  const chosen = [...famous];
  for (const c of rest) { if (chosen.length >= target) break; chosen.push(c); }
  const clubs: PoolClub[] = chosen.map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl, weight: c.weight }));
  poolCache = { at: Date.now(), clubs };
  return clubs;
}

let comboConnCache: { at: number; m: Map<string, Set<number>> } | null = null;
/** Her combo için BAĞLI kulüpler (o combo'nun iki takımında DA oynamış bir
 * oyuncunun ayrıca oynadığı 3. kulüpler) — 5 dk önbellek. Combo-featured
 * gridlerde bu kulüpler karşı eksene konur → combo daima uygun. */
async function comboConnectedByKey(): Promise<Map<string, Set<number>>> {
  if (comboConnCache && Date.now() - comboConnCache.at < 5 * 60_000) return comboConnCache.m;
  const m = new Map<string, Set<number>>();
  for (const combo of XOX_COMBOS) {
    const { rows } = await pool.query<{ club_id: string }>(
      `SELECT DISTINCT pc.club_id
         FROM player_clubs pca
         JOIN player_clubs pcb ON pcb.player_id = pca.player_id AND pcb.club_id = $2
         JOIN player_clubs pc ON pc.player_id = pca.player_id AND pc.club_id NOT IN ($1, $2)
         JOIN clubs cl ON cl.id = pc.club_id AND cl.is_national = false
        WHERE pca.club_id = $1`,
      [combo.a, combo.b],
    );
    m.set(combo.key, new Set(rows.map((r) => Number(r.club_id))));
  }
  comboConnCache = { at: Date.now(), m };
  return m;
}

let bdorClubCache: { at: number; ids: Set<number> } | null = null;
/** ≥1 Ballon d'Or kazananın oynadığı kulüp id'leri (5 dk önbellek). BDOR seçilen
 * gridlerde havuz bunlarla sınırlanır → BDOR daima uygun (hücre ≥1, elit-tek cevap). */
async function bdorEligibleClubIds(): Promise<Set<number>> {
  if (bdorClubCache && Date.now() - bdorClubCache.at < 5 * 60_000) return bdorClubCache.ids;
  const { rows } = await pool.query<{ club_id: string }>(
    `SELECT DISTINCT pc.club_id FROM player_honours h
       JOIN player_clubs pc ON pc.player_id = h.player_id
       JOIN clubs cl ON cl.id = pc.club_id AND cl.is_national = false
      WHERE h.competition = 'BDOR'`,
  );
  const ids = new Set(rows.map((r) => Number(r.club_id)));
  bdorClubCache = { at: Date.now(), ids };
  return ids;
}

function weightedSample(pool: PoolClub[], n: number, rnd: () => number): PoolClub[] {
  const picked: PoolClub[] = [];
  const remaining = [...pool];
  while (picked.length < n && remaining.length) {
    const total = remaining.reduce((s, c) => s + c.weight, 0);
    let roll = rnd() * total;
    let idx = 0;
    for (; idx < remaining.length; idx++) { roll -= remaining[idx]!.weight; if (roll <= 0) break; }
    picked.push(remaining.splice(Math.min(idx, remaining.length - 1), 1)[0]!);
  }
  return picked;
}

/** 3 satır kulübünün HER BİRİYLE ≥min kesişen sütun adayları — tek sorgu. */
async function columnCandidates(rowIds: number[], candidateIds: number[], min: number): Promise<Map<number, [number, number, number]>> {
  const { rows } = await pool.query<{ cid: string; x1: string; x2: string; x3: string }>(
    `SELECT pc2.club_id AS cid,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $1) AS x1,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $2) AS x2,
            count(DISTINCT pc1.player_id) FILTER (WHERE pc1.club_id = $3) AS x3
       FROM player_clubs pc1
       JOIN player_clubs pc2 ON pc2.player_id = pc1.player_id AND pc2.club_id <> pc1.club_id
      WHERE pc1.club_id = ANY($4::bigint[])
        AND pc2.club_id = ANY($5::bigint[])
      GROUP BY pc2.club_id`,
    [rowIds[0], rowIds[1], rowIds[2], rowIds, candidateIds],
  );
  const out = new Map<number, [number, number, number]>();
  for (const r of rows) {
    const t: [number, number, number] = [Number(r.x1), Number(r.x2), Number(r.x3)];
    if (t[0] >= min && t[1] >= min && t[2] >= min) out.set(Number(r.cid), t);
  }
  return out;
}

/** [0,1,2]'yi verilen rnd ile karıştırır (özel eksen giriş sırası). */
function shuffleIdx3(rnd: () => number): number[] {
  const a = [0, 1, 2];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

function clubAxis(c: PoolClub): XoxAxis {
  return { kind: 'club', id: c.id, name: c.name, logoUrl: c.logoUrl };
}

/** combo/BDOR — elit/nadir eksenler: hücrede ≥1 tek tanınır cevap kabul edilir. */
const isComboOrBdor = (a: XoxAxis): boolean => a.kind === 'combo' || a.kind === 'bdor';

/** Bir özel türünü, verilen 3 KULÜBÜN her biriyle ≥ (combo/bdor→1, diğer→2)
 * kesişecek şekilde somutlaştırır (mevcut pickXox* motorları). counts = kulüp
 * sırasına göre. Uygun yoksa null. */
async function buildSpecial(
  type: string, clubIds: number[], rnd: () => number,
): Promise<{ axis: XoxAxis; counts: [number, number, number] } | null> {
  const M = XOX_MIN_CELL_ANSWERS;
  switch (type) {
    case 'country': {
      const r = await pickXoxCountryForClubs(clubIds, M).catch(() => null);
      return r ? { axis: { kind: 'country', id: 0, name: r.name, logoUrl: null, country: r.country, flag: r.flag }, counts: r.counts } : null;
    }
    case 'league': {
      const r = await pickXoxLeagueForClubs(clubIds, M).catch(() => null);
      return r ? { axis: { kind: 'league', id: 0, name: r.name, logoUrl: r.logoUrl, league: r.code }, counts: r.counts } : null;
    }
    case 'manager': {
      const r = await pickXoxManagerForClubs(clubIds, M).catch(() => null);
      return r ? { axis: { kind: 'manager', id: 0, name: r.name, logoUrl: r.photoUrl, manager: r.managerId }, counts: r.counts } : null;
    }
    case 'trophy': {
      const r = await pickXoxTrophyForClubs(clubIds, M).catch(() => null);
      return r ? { axis: { kind: 'trophy', id: 0, name: r.name, logoUrl: r.logoUrl, trophy: r.code }, counts: r.counts } : null;
    }
    case 'position': {
      const r = await pickXoxPositionForClubs(clubIds, M).catch(() => null);
      return r ? { axis: { kind: 'position', id: 0, name: r.label, logoUrl: null, position: r.code }, counts: r.counts } : null;
    }
    case 'bdor': {
      const r = await pickXoxBdorForClubs(clubIds, 1).catch(() => null);
      return r ? { axis: { kind: 'bdor', id: 0, name: "Ballon d'Or", logoUrl: null }, counts: r.counts } : null;
    }
    case 'combo': {
      const r = await pickXoxComboForClubs(clubIds, 1, rnd).catch(() => null);
      return r ? { axis: { kind: 'combo', id: 0, name: r.name, logoUrl: null, combo: r.key, comboA: r.a, comboB: r.b }, counts: r.counts } : null;
    }
    default: return null;
  }
}

/** k FARKLI özel tür seçer — TEKDÜZE rastgele (eşit nadirlik). combo ve BDOR
 * AYNI gridde olmaz (ikisi de kulüp havuzunu farklı sınırlar → çakışmasın). */
function pickSpecialTypes(k: number, pool: string[], rnd: () => number): string[] {
  const remaining = [...pool];
  const out: string[] = [];
  while (out.length < k && remaining.length) {
    const i = Math.floor(rnd() * remaining.length);
    const t = remaining.splice(Math.min(i, remaining.length - 1), 1)[0]!;
    out.push(t);
    // combo↔bdor karşılıklı dışlama: biri seçilince diğerini adaylardan çıkar.
    if (t === 'combo' || t === 'bdor') {
      const other = t === 'combo' ? 'bdor' : 'combo';
      const j = remaining.indexOf(other);
      if (j >= 0) remaining.splice(j, 1);
    }
  }
  return out;
}

/** {0,1,2}'den n FARKLI slot. */
function pickSlots(n: number, rnd: () => number): number[] { return shuffleIdx3(rnd).slice(0, n); }

// KARIŞIK DİZİLİM üretimi: taban 3×3 KULÜP gridi (kulüp×kulüp ≥2 garanti) +
// özeller İKİ eksene de dağıtılır. Satır özelleri karşı 3 sütun-kulübüne, sütun
// özelleri karşı 3 satır-kulübüne göre somutlaşır → kulüp hücreleri ≥min garanti.
// Sadece özel×özel kesişimleri gerçek sayımla doğrulanır (combo/bdor→≥1, diğer→≥2).
export async function generateXoxGrid(rnd: () => number = Math.random): Promise<XoxGrid | null> {
  const clubs = await popularClubPool();
  if (clubs.length < 10) return null;
  const connectedByKey = await comboConnectedByKey().catch(() => new Map<string, Set<number>>());
  const bdorIds = await bdorEligibleClubIds().catch(() => new Set<number>());
  // DIŞ döngü türleri (TEKDÜZE) seçer; İÇ döngü o türler için kulüpleri dener.
  // Böylece "zor" türler (combo — dağınık bağlı kulüpler) ilk başarılı denemede
  // "kolay" türlere yenilmez; her tür kendi kulüp denemelerini alır → EŞİT sıklık.
  const OUTER = 9, INNER = 8;
  for (let outer = 0; outer < OUTER; outer++) {
    const reliable = outer < OUTER - 2; // son 2 tur: zor türler (combo/bdor) hariç → grid garanti
    const kMax = reliable ? SPECIALS_MAX : SPECIALS_MIN;
    const typePool = reliable ? SPECIAL_TYPES
      : ['trophy', 'country', 'league', 'manager'].concat(POSITION_ENABLED ? ['position'] : []);
    const k = SPECIALS_MIN + Math.floor(rnd() * (kMax - SPECIALS_MIN + 1));
    const types = pickSpecialTypes(k, typePool, rnd);
    if (types.length < k) continue;

    // Havuzları seçilen ZOR türe göre belirle (combo & bdor aynı gridde olmaz):
    //  - combo: yalnız SÜTUN kulüpleri combo'ya BAĞLI (combo satırda, karşısı sütun);
    //    satırlar tam havuzdan → grid güvenilir kurulur.
    //  - bdor: her iki eksen de BDOR-kazananlı kulüplerden (hücre ≥1 elit cevap).
    let rowPool = clubs;
    let colPool = clubs;
    let comboOnRow = false;
    if (types.includes('combo')) {
      const combo = XOX_COMBOS[Math.floor(rnd() * XOX_COMBOS.length)]!;
      const conn = connectedByKey.get(combo.key) ?? new Set<number>();
      colPool = clubs.filter((c) => conn.has(c.id));
      comboOnRow = true;
      if (colPool.length < 4) continue;
    } else if (types.includes('bdor')) {
      rowPool = clubs.filter((c) => bdorIds.has(c.id));
      colPool = rowPool;
    }
    if (rowPool.length < 6) continue;
    if (comboOnRow) { const ci = types.indexOf('combo'); if (ci > 0) { types.splice(ci, 1); types.unshift('combo'); } }

    for (let inner = 0; inner < INNER; inner++) {
      // 1) Taban 3×3 KULÜP gridi (satır rowPool, sütun colPool).
      const rowsPick = weightedSample(rowPool, 3, rnd);
      const rowIds = rowsPick.map((c) => c.id);
      const candidates = colPool.filter((c) => !rowIds.includes(c.id));
      const ok = await columnCandidates(rowIds, candidates.map((c) => c.id), XOX_MIN_CELL_ANSWERS);
      if (ok.size < 3) continue;
      const viableCands = candidates.filter((c) => ok.has(c.id));
      viableCands.sort((a, b) => ok.get(b.id)!.reduce((s, n) => s + n, 0) - ok.get(a.id)!.reduce((s, n) => s + n, 0));
      const colsPick = weightedSample(viableCands.slice(0, Math.min(14, viableCands.length)), 3, rnd);
      if (colsPick.length < 3) continue;
      const rows: XoxAxis[] = rowsPick.map(clubAxis);
      const cols: XoxAxis[] = colsPick.map(clubAxis);
      const rowClubIds = rowIds;
      const colClubIds = colsPick.map((c) => c.id);
      const counts: number[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) counts.push(ok.get(colsPick[c]!.id)![r]!);

      // 2) KARIŞIK yerleşim: en az 1 satırda + en az 1 sütunda (both≥1).
      const rowN = k === 2 ? 1 : (rnd() < 0.5 ? 1 : 2);
      const colN = k - rowN;
      const rowSlots = pickSlots(rowN, rnd);
      const colSlots = pickSlots(colN, rnd);

      // 3) Somutlaştır (satır özeli↔sütun kulüpleri, sütun özeli↔satır kulüpleri).
      let ti = 0; let built = true;
      const rowSp: { slot: number; axis: XoxAxis; counts: [number, number, number] }[] = [];
      const colSp: { slot: number; axis: XoxAxis; counts: [number, number, number] }[] = [];
      for (const slot of rowSlots) {
        const b = await buildSpecial(types[ti++]!, colClubIds, rnd);
        if (!b) { built = false; break; }
        rowSp.push({ slot, axis: b.axis, counts: b.counts });
      }
      if (!built) continue;
      for (const slot of colSlots) {
        const b = await buildSpecial(types[ti++]!, rowClubIds, rnd);
        if (!b) { built = false; break; }
        colSp.push({ slot, axis: b.axis, counts: b.counts });
      }
      if (!built) continue;

      // 4) Yerleştir + kulüp-hücre sayıları; özel×özel kesişimlerini GERÇEK say.
      for (const rS of rowSp) { rows[rS.slot] = rS.axis; for (let c = 0; c < 3; c++) counts[rS.slot * 3 + c] = rS.counts[c]!; }
      for (const cS of colSp) { cols[cS.slot] = cS.axis; for (let r = 0; r < 3; r++) counts[r * 3 + cS.slot] = cS.counts[r]!; }
      let cellsOk = true;
      for (const rS of rowSp) {
        for (const cS of colSp) {
          const cmin = (isComboOrBdor(rS.axis) || isComboOrBdor(cS.axis)) ? 1 : XOX_MIN_CELL_ANSWERS;
          const n = await countXoxCell(toXoxCellAxis(rS.axis), toXoxCellAxis(cS.axis), 30).catch(() => 0);
          if (n < cmin) { cellsOk = false; break; }
          counts[rS.slot * 3 + cS.slot] = n;
        }
        if (!cellsOk) break;
      }
      if (!cellsOk) continue;

      return { rows, cols, cellAnswerCounts: counts };
    }
  }
  return null;
}

/** Klasik XOX kazanan çizgileri (satır-major hücre indeksleri). */
export const XOX_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function xoxWinningLine(owners: readonly (string | null)[], playerId: string): number[] | null {
  for (const line of XOX_LINES) {
    if (line.every((i) => owners[i] === playerId)) return [...line];
  }
  return null;
}

export const XOX_TURN_MS = intEnv('XOX_TURN_MS', 20_000);
export const XOX_TURN_CAP = intEnv('XOX_TURN_CAP', 24);
export const XOX_SUDDEN_MS = intEnv('XOX_SUDDEN_MS', 30_000);
