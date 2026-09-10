// Run only against the disposable DB created by capacity-local.mjs.
import assert from 'node:assert/strict';
import { pool, closePool, nameIndexFloor } from '../db/pool.ts';
import { config } from '../config.ts';
import { indexedDatabaseUrl, playerNameIndexFloor } from '../db/playerNameIndex.ts';

async function main() {
  const url = new URL(config.databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/cof_load_[a-f0-9]{12}$/);
  assert.ok(playerNameIndexFloor(.25) < .25);
  assert.ok(playerNameIndexFloor(.1) < .1);
  assert.ok(playerNameIndexFloor(1) < .25);
  const configured = new URL(indexedDatabaseUrl('postgres://localhost/db?options=-c%20statement_timeout%3D5000', .249999));
  assert.equal(configured.searchParams.get('options'), '-c statement_timeout=5000 -c pg_trgm.word_similarity_threshold=0.249999');
  const client = await pool.connect();
  try {
    const settings = await client.query("SELECT current_setting('pg_trgm.word_similarity_threshold') AS threshold");
    assert.ok(Math.abs(Number(settings.rows[0].threshold) - nameIndexFloor) < 1e-7);
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE index_names (id int, name_norm text);
      INSERT INTO index_names SELECT id, name_norm FROM players;
      INSERT INTO index_names VALUES
      (30001, 'cristiano ronaldo'), (30002, 'ronaldinho'), (30003, 'wesley sneijder'),
      (30004, 'mohamed salah'), (30005, 'lionel messi'), (30006, 'ilkay gundogan'),
      (30007, 'ronaldo'), (30008, 'luis pedro cavanda'), (30009, 'pedro');
      CREATE INDEX ON index_names USING gin(name_norm gin_trgm_ops); ANALYZE index_names;`);
    const queries = ['fixture hero', 'hero', 'ronaldo', 'ronaldinho', 'snayder', 'sneijder',
      'messi', 'mes', 'mohamed', 'salah', 'ilkay', 'gundogan', 'pedro', 'cavanda', '', 'z', 'abcdef'];
    for (const query of queries) {
      for (const threshold of [.25, .3, .85, 1]) {
        const original = await client.query('SELECT id FROM index_names WHERE word_similarity($1, name_norm) >= $2 ORDER BY id', [query, threshold]);
        const indexed = await client.query('SELECT id FROM index_names WHERE name_norm %> $1 AND word_similarity($1, name_norm) >= $2 ORDER BY id', [query, threshold]);
        assert.deepEqual(indexed.rows, original.rows, `${query} @ ${threshold}: no accepted candidate may disappear`);
      }
    }
    // Exercise the exact >= boundary, including lower configurable thresholds.
    for (const query of ['snayder', 'ronaldo', 'pedro']) {
      const { rows } = await client.query('SELECT word_similarity($1, name_norm) AS score FROM index_names WHERE id IN (30001,30003,30008)', [query]);
      for (const { score } of rows) {
        if (!(score > 0)) continue;
        await client.query("SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)", [String(playerNameIndexFloor(score))]);
        const original = await client.query('SELECT id FROM index_names WHERE word_similarity($1,name_norm) >= $2 ORDER BY id', [query, score]);
        const indexed = await client.query('SELECT id FROM index_names WHERE name_norm %> $1 AND word_similarity($1,name_norm) >= $2 ORDER BY id', [query, score]);
        assert.deepEqual(indexed.rows, original.rows, 'inclusive threshold boundary preserved');
      }
    }
    await client.query("SELECT set_config('pg_trgm.word_similarity_threshold', $1, true)", [String(nameIndexFloor)]);
    const plans = [];
    for (const predicate of ['word_similarity($1,name_norm) >= 0.3', 'name_norm %> $1 AND word_similarity($1,name_norm) >= 0.3']) {
      const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM players WHERE ${predicate}`, ['fixture hero']);
      plans.push(rows[0]['QUERY PLAN'][0]);
    }
    console.log(JSON.stringify({ test: 'player-name-index', comparisons: queries.length * 4,
      originalMs: plans[0]['Execution Time'], indexedMs: plans[1]['Execution Time'], plans }));
    assert.match(JSON.stringify(plans[1]), /idx_players_name_norm_trgm/, 'real schema index used without disabling sequential scans');
    await client.query('ROLLBACK');
  } finally { client.release(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closePool);
