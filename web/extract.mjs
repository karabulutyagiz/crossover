#!/usr/bin/env node
// Pulls the football facts the site publishes out of the local Transfermarkt
// rebuild (`crossover_verify`) and freezes them into web/data/*.json, so the
// page build itself needs no database. Run it again only when the data changes.
//
//   node web/extract.mjs
//
// Every claim on a /ortak-futbolcu/ page traces back to a row this script read.
// Nothing here invents a transfer.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = process.env.COF_DB ?? 'crossover_verify';

function q(sql) {
  const out = execFileSync('psql', ['-d', DB, '-At', '-F', '', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(''));
}

// ---------------------------------------------------------------------------
// The curated club set. Hand-picked rather than ranked by a column: `popularity`
// counts squad rows, so it puts Rizespor above Galatasaray. Ids verified against
// the clubs table; a club only earns pages if its careers are complete here.
// `loc` is the Turkish locative suffix the club name takes ("Beşiktaş'ta", not
// "Beşiktaş'de"): vowel harmony plus voiceless-consonant assimilation, decided
// per club because foreign names follow Turkish pronunciation, not spelling.
// (Paris Saint-Germain is deliberately absent — this dataset has no clean row
// for it, and a half-empty PSG page would be worse than none.)
// ---------------------------------------------------------------------------
const CLUBS = [
  // Türkiye
  { id: 141, slug: 'galatasaray', name: 'Galatasaray', short: 'Galatasaray', country: 'Türkiye', tier: 1, loc: 'da' },
  { id: 36, slug: 'fenerbahce', name: 'Fenerbahçe', short: 'Fenerbahçe', country: 'Türkiye', tier: 1, loc: 'de' },
  { id: 114, slug: 'besiktas', name: 'Beşiktaş', short: 'Beşiktaş', country: 'Türkiye', tier: 1, loc: 'ta' },
  { id: 449, slug: 'trabzonspor', name: 'Trabzonspor', short: 'Trabzonspor', country: 'Türkiye', tier: 1, loc: 'da' },
  { id: 6890, slug: 'basaksehir', name: 'Başakşehir', short: 'Başakşehir', country: 'Türkiye', tier: 2, loc: 'de' },
  // England
  { id: 985, slug: 'manchester-united', name: 'Manchester United', short: 'Man United', country: 'İngiltere', tier: 1, loc: 'da' },
  { id: 281, slug: 'manchester-city', name: 'Manchester City', short: 'Man City', country: 'İngiltere', tier: 1, loc: 'de' },
  { id: 31, slug: 'liverpool', name: 'Liverpool', short: 'Liverpool', country: 'İngiltere', tier: 1, loc: 'da' },
  { id: 631, slug: 'chelsea', name: 'Chelsea', short: 'Chelsea', country: 'İngiltere', tier: 1, loc: 'de' },
  { id: 11, slug: 'arsenal', name: 'Arsenal', short: 'Arsenal', country: 'İngiltere', tier: 1, loc: 'de' },
  { id: 148, slug: 'tottenham', name: 'Tottenham', short: 'Tottenham', country: 'İngiltere', tier: 2, loc: 'da' },
  { id: 29, slug: 'everton', name: 'Everton', short: 'Everton', country: 'İngiltere', tier: 2, loc: 'da' },
  { id: 762, slug: 'newcastle', name: 'Newcastle United', short: 'Newcastle', country: 'İngiltere', tier: 2, loc: 'da' },
  { id: 379, slug: 'west-ham', name: 'West Ham United', short: 'West Ham', country: 'İngiltere', tier: 2, loc: 'da' },
  { id: 1003, slug: 'leicester', name: 'Leicester City', short: 'Leicester', country: 'İngiltere', tier: 2, loc: 'de' },
  { id: 405, slug: 'aston-villa', name: 'Aston Villa', short: 'Aston Villa', country: 'İngiltere', tier: 2, loc: 'da' },
  { id: 543, slug: 'wolves', name: 'Wolverhampton', short: 'Wolves', country: 'İngiltere', tier: 3, loc: 'da' },
  // Spain
  { id: 418, slug: 'real-madrid', name: 'Real Madrid', short: 'Real Madrid', country: 'İspanya', tier: 1, loc: 'de' },
  { id: 131, slug: 'barcelona', name: 'Barcelona', short: 'Barcelona', country: 'İspanya', tier: 1, loc: 'da' },
  { id: 13, slug: 'atletico-madrid', name: 'Atlético Madrid', short: 'Atlético', country: 'İspanya', tier: 1, loc: 'de' },
  { id: 368, slug: 'sevilla', name: 'Sevilla', short: 'Sevilla', country: 'İspanya', tier: 2, loc: 'da' },
  { id: 1049, slug: 'valencia', name: 'Valencia', short: 'Valencia', country: 'İspanya', tier: 2, loc: 'da' },
  { id: 1050, slug: 'villarreal', name: 'Villarreal', short: 'Villarreal', country: 'İspanya', tier: 3, loc: 'da' },
  // Italy
  { id: 506, slug: 'juventus', name: 'Juventus', short: 'Juventus', country: 'İtalya', tier: 1, loc: 'ta' },
  { id: 46, slug: 'inter', name: 'Inter', short: 'Inter', country: 'İtalya', tier: 1, loc: 'de' },
  { id: 5, slug: 'milan', name: 'Milan', short: 'Milan', country: 'İtalya', tier: 1, loc: 'da' },
  { id: 12, slug: 'roma', name: 'Roma', short: 'Roma', country: 'İtalya', tier: 2, loc: 'da' },
  { id: 6195, slug: 'napoli', name: 'Napoli', short: 'Napoli', country: 'İtalya', tier: 2, loc: 'de' },
  { id: 398, slug: 'lazio', name: 'Lazio', short: 'Lazio', country: 'İtalya', tier: 2, loc: 'da' },
  { id: 430, slug: 'fiorentina', name: 'Fiorentina', short: 'Fiorentina', country: 'İtalya', tier: 3, loc: 'da' },
  { id: 800, slug: 'atalanta', name: 'Atalanta', short: 'Atalanta', country: 'İtalya', tier: 3, loc: 'da' },
  // Germany
  { id: 27, slug: 'bayern-munih', name: 'Bayern Münih', short: 'Bayern', country: 'Almanya', tier: 1, loc: 'te' },
  { id: 16, slug: 'borussia-dortmund', name: 'Borussia Dortmund', short: 'Dortmund', country: 'Almanya', tier: 1, loc: 'da' },
  { id: 15, slug: 'bayer-leverkusen', name: 'Bayer Leverkusen', short: 'Leverkusen', country: 'Almanya', tier: 2, loc: 'de' },
  { id: 33, slug: 'schalke-04', name: 'Schalke 04', short: 'Schalke', country: 'Almanya', tier: 2, loc: 'te' },
  { id: 82, slug: 'wolfsburg', name: 'Wolfsburg', short: 'Wolfsburg', country: 'Almanya', tier: 3, loc: 'da' },
  { id: 23826, slug: 'rb-leipzig', name: 'RB Leipzig', short: 'Leipzig', country: 'Almanya', tier: 3, loc: 'de' },
  // France
  { id: 244, slug: 'marsilya', name: 'Marsilya', short: 'Marsilya', country: 'Fransa', tier: 2, loc: 'da' },
  { id: 1041, slug: 'lyon', name: 'Lyon', short: 'Lyon', country: 'Fransa', tier: 2, loc: 'da' },
  // Netherlands
  { id: 610, slug: 'ajax', name: 'Ajax', short: 'Ajax', country: 'Hollanda', tier: 2, loc: 'ta' },
  { id: 383, slug: 'psv', name: 'PSV', short: 'PSV', country: 'Hollanda', tier: 2, loc: 'de' },
  { id: 234, slug: 'feyenoord', name: 'Feyenoord', short: 'Feyenoord', country: 'Hollanda', tier: 3, loc: 'da' },
  // Portugal
  { id: 720, slug: 'porto', name: 'Porto', short: 'Porto', country: 'Portekiz', tier: 2, loc: 'da' },
  { id: 294, slug: 'benfica', name: 'Benfica', short: 'Benfica', country: 'Portekiz', tier: 2, loc: 'da' },
  { id: 336, slug: 'sporting', name: 'Sporting', short: 'Sporting', country: 'Portekiz', tier: 3, loc: 'de' },
];

const byId = new Map(CLUBS.map((c) => [c.id, c]));
const ids = CLUBS.map((c) => c.id);

// ---------------------------------------------------------------------------
// 1. Every spell a curated club ever had, collapsed to one row per player+club.
//    A player can hold several rows for one club (loan back, youth repointed to
//    the parent, a re-signing); min(start)/max(end) turns that into one span.
// ---------------------------------------------------------------------------
console.log('· kulüp dönemleri okunuyor…');
const spellRows = q(`
  select pc.club_id, pc.player_id, pc.start_year, pc.end_year
  from player_clubs pc
  where pc.club_id in (${ids.join(',')})
  order by pc.club_id, pc.player_id, pc.start_year nulls last
`);

// Every spell is kept separately. Collapsing them to min(start)/max(end) would
// print "Beşiktaş 2006–2020" for Burak Yılmaz, who actually had two stints —
// a span the archive never claims.
const spells = new Map(); // `${playerId}:${clubId}` -> [{from,to}, …]
const clubPlayers = new Map(ids.map((id) => [id, new Set()]));
for (const [clubId, playerId, from, to] of spellRows) {
  const cid = Number(clubId);
  const pid = Number(playerId);
  clubPlayers.get(cid).add(pid);
  const key = `${pid}:${cid}`;
  const list = spells.get(key) ?? [];
  list.push({ from: from ? Number(from) : null, to: to ? Number(to) : null });
  spells.set(key, list);
}

// Two rows describing the same stretch (a youth spell repointed onto the parent
// club, a duplicated season) collapse into one; genuinely separate stints stay
// separate. Adjacent/overlapping ranges merge, a real gap does not.
for (const [key, list] of spells) {
  const known = list.filter((s) => s.from != null).sort((a, b) => a.from - b.from);
  const unknown = list.filter((s) => s.from == null);
  const merged = [];
  for (const s of known) {
    const last = merged[merged.length - 1];
    if (last && s.from <= (last.to ?? last.from) + 1) {
      last.to = Math.max(last.to ?? last.from, s.to ?? s.from);
    } else {
      merged.push({ ...s });
    }
  }
  spells.set(key, merged.length ? merged : unknown.slice(0, 1));
}

// Latest year on record for a player at a club — used only for ordering.
const lastYear = (list) =>
  Math.max(0, ...list.map((s) => s.to ?? s.from ?? 0));

// ---------------------------------------------------------------------------
// 2. Player identity + full club career, for the players that matter.
// ---------------------------------------------------------------------------
const relevant = new Set();
for (const set of clubPlayers.values()) for (const pid of set) relevant.add(pid);
console.log(`· ${relevant.size} futbolcu ilgili`);

const playerRows = q(`
  select p.id, p.name, coalesce(p.nationality,''), coalesce(p.birth_year::text,''),
         (select count(distinct pc.club_id) from player_clubs pc where pc.player_id = p.id)
  from players p
  where p.id in (${[...relevant].join(',')})
`);
const players = new Map(
  playerRows.map(([id, name, nat, birth, clubCount]) => [
    Number(id),
    { id: Number(id), name, nat: nat || null, birth: birth ? Number(birth) : null, clubs: Number(clubCount) },
  ]),
);

// How many of the curated (famous) clubs a player turned out for — the fame
// proxy used to order a pair page. Sneijder outranks a one-season squad filler.
const bigClubCount = new Map();
for (const [cid, set] of clubPlayers) {
  const tier = byId.get(cid).tier;
  const weight = tier === 1 ? 3 : tier === 2 ? 2 : 1;
  for (const pid of set) bigClubCount.set(pid, (bigClubCount.get(pid) ?? 0) + weight);
}

// ---------------------------------------------------------------------------
// 3. Intersections. A pair only becomes a page when it clears MIN_PLAYERS —
//    a page listing two names is a thin page, and thin pages are index bloat.
// ---------------------------------------------------------------------------
const MIN_PLAYERS = 5;
const pairs = [];
for (let i = 0; i < CLUBS.length; i++) {
  for (let j = i + 1; j < CLUBS.length; j++) {
    const a = CLUBS[i];
    const b = CLUBS[j];
    const setA = clubPlayers.get(a.id);
    const setB = clubPlayers.get(b.id);
    const both = [...setA].filter((pid) => setB.has(pid));
    if (both.length < MIN_PLAYERS) continue;

    const list = both
      .map((pid) => {
        const p = players.get(pid);
        const sa = spells.get(`${pid}:${a.id}`) ?? [];
        const sb = spells.get(`${pid}:${b.id}`) ?? [];
        return {
          id: pid,
          name: p.name,
          nat: p.nat,
          birth: p.birth,
          clubs: p.clubs,
          a: sa,
          b: sb,
          // Whoever wore both shirts most recently leads; ties break on fame.
          recent: Math.max(lastYear(sa), lastYear(sb)),
          fame: bigClubCount.get(pid) ?? 0,
        };
      })
      .sort((x, y) => y.fame - x.fame || y.recent - x.recent || x.name.localeCompare(y.name, 'tr'));

    pairs.push({
      slug: `${a.slug}-${b.slug}`,
      a: a.slug,
      b: b.slug,
      count: list.length,
      // Pair prominence: two tier-1 clubs make a page people actually search for.
      weight: (4 - a.tier) * (4 - b.tier),
      sameCountry: a.country === b.country,
      players: list,
    });
  }
}
pairs.sort((x, y) => y.weight - x.weight || y.count - x.count);

// ---------------------------------------------------------------------------
// 4. Dataset-wide totals — the only numbers the site is allowed to print.
// ---------------------------------------------------------------------------
const [[totPlayers, totClubs, totSpells, totNations]] = q(`
  select (select count(*) from players),
         (select count(*) from clubs where is_national = false),
         (select count(*) from player_clubs),
         (select count(distinct nationality) from players where nationality is not null)
`);

// ---------------------------------------------------------------------------
// 5. Datasets the guide articles are built on. Same rule as the pair pages:
//    a name only appears here because a row in the archive put it there.
// ---------------------------------------------------------------------------

// Players who wore the shirt of two or more of the Turkish big four. The list
// Turkish fans argue about, settled with years.
const BIG4 = [141, 36, 114, 449];
const derby = [];
for (const pid of relevant) {
  const wore = BIG4.filter((cid) => clubPlayers.get(cid).has(pid));
  if (wore.length < 2) continue;
  const p = players.get(pid);
  derby.push({
    name: p.name,
    nat: p.nat,
    clubs: wore.map((cid) => ({
      slug: byId.get(cid).slug,
      name: byId.get(cid).name,
      spells: spells.get(`${pid}:${cid}`) ?? [],
    })),
    count: wore.length,
    recent: Math.max(...wore.map((cid) => lastYear(spells.get(`${pid}:${cid}`) ?? []))),
  });
}
derby.sort((a, b) => b.count - a.count || b.recent - a.recent || a.name.localeCompare(b.name, 'tr'));

// The nomads: most distinct clubs on record. Restricted to players who passed
// through at least one curated club, so the list stays recognisable.
console.log('· gezgin futbolcular hesaplanıyor…');
const nomadRows = q(`
  select p.id, p.name, coalesce(p.nationality,''),
         count(distinct pc.club_id) n,
         string_agg(distinct c.name, ' | ')
  from players p
  join player_clubs pc on pc.player_id = p.id
  join clubs c on c.id = pc.club_id and c.is_national = false
  where p.id in (${[...relevant].join(',')})
  group by p.id, p.name, p.nationality
  having count(distinct pc.club_id) >= 10
  order by n desc, p.name
  limit 40
`);
const nomads = nomadRows.map(([id, name, nat, n, list]) => ({
  name,
  nat: nat || null,
  count: Number(n),
  clubs: list.split(' | '),
}));

const out = {
  generatedFrom: DB,
  derby,
  nomads,
  totals: {
    players: Number(totPlayers),
    clubs: Number(totClubs),
    spells: Number(totSpells),
    nations: Number(totNations),
  },
  clubs: CLUBS,
  pairs,
};

mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'football.json'), JSON.stringify(out));

const kept = pairs.length;
const tier1 = pairs.filter((p) => p.weight >= 9).length;
console.log(`✓ ${kept} çift (${tier1} tanesi tier-1 × tier-1), ${relevant.size} futbolcu`);
console.log(`✓ toplamlar: ${out.totals.players} futbolcu / ${out.totals.clubs} kulüp / ${out.totals.spells} dönem`);
console.log(`✓ web/data/football.json yazıldı`);
