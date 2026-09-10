// Disposable local fixtures only. Harness compares cache OFF and ON digests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pool, footballReadPool, closePool } from '../db/pool.ts';
import { config } from '../config.ts';
import { verifyGuess, prepareTeamPair, invalidateFootballReadCaches, commonPlayersDetailed } from '../game/verify.ts';

async function main() {
  const url = new URL(config.databaseUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /^\/cof_load_[a-f0-9]{12}$/);
  await pool.query(`INSERT INTO clubs(id,name,name_norm,logo_url,popularity) VALUES
    (14001,'Alpha','alpha','fixture',100),(14002,'Beta','beta','fixture',200),(14003,'Gamma','gamma','fixture',300);
    INSERT INTO players(id,name,name_norm) VALUES
    (30001,'Cristiano Ronaldo','cristiano ronaldo'),(30002,'Ronaldinho','ronaldinho'),
    (30003,'Wesley Sneijder','wesley sneijder'),(30004,'Lionel Messi','lionel messi'),
    (30005,'Pedro','pedro'),(30006,'Luis Pedro Cavanda','luis pedro cavanda');
    INSERT INTO player_clubs(player_id,club_id,start_year) VALUES
    (30001,14001,2000),(30001,14002,2001),(30002,14001,2000),(30002,14003,2001),
    (30003,14001,2000),(30003,14002,2001),(30004,14002,2000),(30004,14003,2001),
    (30005,14001,2000),(30005,14002,2001),(30006,14001,2000),(30006,14003,2001);`);
  let queries = 0;
  const original = pool.query.bind(pool);
  (pool as any).query = (...args: any[]) => { queries++; return (original as any)(...args); };
  if (footballReadPool !== pool) {
    const originalRead = footballReadPool.query.bind(footballReadPool);
    (footballReadPool as any).query = (...args: any[]) => { queries++; return (originalRead as any)(...args); };
    await assert.rejects(footballReadPool.query('UPDATE clubs SET popularity=0 WHERE false'), /read-only/);
  }
  try {
    invalidateFootballReadCaches();
    const results = [];
    for (const [a,b] of [[14001,14002],[14002,14001],[14001,14003],[14002,14003]]) {
      const prepared = await prepareTeamPair(a!, b!);
      assert.ok(Object.isFrozen(prepared.answers) && Object.isFrozen(prepared.teamA));
      for (const text of ['ronaldo','cristiano ronaldo','ronaldinho','snayder','sneijder','messi',
        'pedro','luis pedro cavanda','pdero','zzzzzzz','', 'ron']) {
        const cold = await verifyGuess(a!, b!, text, prepared);
        const before = queries;
        const warm = await verifyGuess(a!, b!, text, prepared);
        assert.deepEqual(warm, cold, 'warm answer must equal cold');
        if (process.env.FOOTBALL_VERIFICATION_CACHE !== '0') assert.equal(queries, before, 'warm verification requires no SQL');
        results.push(cold);
      }
    }
    assert.equal((await verifyGuess(14001,14002,'cristiano ronaldo')).correct, true);
    assert.equal((await verifyGuess(14001,14002,'ronaldinho')).correct, false);
    assert.equal((await verifyGuess(14001,14002,'luis pedro cavanda')).correct, false);
    // Caller-owned results must not mutate shared careers or club records.
    const returned = await verifyGuess(14001,14002,'cristiano ronaldo');
    returned.teamA.name = 'CORRUPTED'; returned.allClubs[0]!.clubName = 'CORRUPTED';
    const again = await verifyGuess(14001,14002,'cristiano ronaldo');
    assert.notEqual(again.teamA.name, 'CORRUPTED'); assert.notEqual(again.allClubs[0]!.clubName, 'CORRUPTED');
    const common = await commonPlayersDetailed(14001,14002);
    common[0]!.name = 'CORRUPTED';
    assert.notEqual((await commonPlayersDetailed(14001,14002))[0]!.name, 'CORRUPTED');
    const digest = createHash('sha256').update(JSON.stringify(results)).digest('hex');
    const prepared = await prepareTeamPair(14001,14002);
    await pool.query('DELETE FROM player_clubs WHERE player_id=30001 AND club_id=14002');
    invalidateFootballReadCaches();
    assert.equal((await verifyGuess(14001,14002,'cristiano ronaldo',prepared)).correct, false, 'invalidated prepared data cannot accept removed career');
    console.log(JSON.stringify({ test: 'verification-cache', digest, comparisons: results.length, queries,
      enabled: process.env.FOOTBALL_VERIFICATION_CACHE !== '0' }));
  } finally {
    await pool.query('DELETE FROM player_clubs WHERE player_id BETWEEN 30001 AND 30006');
    await pool.query('DELETE FROM players WHERE id BETWEEN 30001 AND 30006');
    await pool.query('DELETE FROM clubs WHERE id BETWEEN 14001 AND 14003');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(closePool);
