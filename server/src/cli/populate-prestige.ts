// clubs.prestige'i katman sisteminden (fame) doldurur — reveal/bot "en bilindik
// oyuncu" sıralaması için. DB yeniden kurulunca bir kez çalıştır.
// (server) npx tsx src/cli/populate-prestige.ts
import { pool } from '../db/pool.ts';
import { clubPopularityTier, tierBaseWeight, isTurkishClub } from '../game/clubPopularity.ts';

const { rows } = await pool.query<{ id: string; name: string; name_norm: string; league: string | null; country: string | null; popularity: string | null }>(
  `SELECT id, name, name_norm, league, country, popularity FROM clubs`,
);
let n = 0;
for (const r of rows) {
  const tier = clubPopularityTier({ name: r.name, nameNorm: r.name_norm, popularity: Number(r.popularity ?? 0), league: r.league, country: r.country });
  let prestige = tierBaseWeight(tier);
  if (isTurkishClub(r.name)) prestige *= 1.15; // Türk audience: devler biraz öne
  await pool.query('UPDATE clubs SET prestige = $2 WHERE id = $1', [r.id, prestige]);
  n++;
}
console.log(`prestige güncellendi: ${n} kulüp`);
await pool.end();
