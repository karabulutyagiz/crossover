// Real game protocol + PostgreSQL, synthetic accounts/data, loopback only.
// node src/cli/capacity-local.mjs --clients 20 [--source /absolute/checkout]
// Does not accept a remote game/DB endpoint and never loads a production dump.
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const clientsCount = Number(option('--clients', '20'));
const varied = args.includes('--varied');
const verificationCache = option('--verification-cache', '1');
assert.ok(['0', '1'].includes(verificationCache));
assert.ok(Number.isInteger(clientsCount) && clientsCount >= 2 && clientsCount <= 1000 && clientsCount % 2 === 0, 'clients must be an even integer, 2..1000');
const source = resolve(option('--source', join(dirname(fileURLToPath(import.meta.url)), '../../..')));
const adminUrl = new URL(process.env.COF_LOAD_ADMIN_URL || 'postgres://localhost:5432/postgres');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname), 'local PostgreSQL only');
const dbName = `cof_load_${randomBytes(6).toString('hex')}`;
const dbUrl = new URL(adminUrl); dbUrl.pathname = `/${dbName}`;
const artifacts = await mkdtemp(join(tmpdir(), 'cof-capacity-'));
const admin = new pg.Client({ connectionString: adminUrl.href });
const db = new pg.Client({ connectionString: dbUrl.href });
const tokenSecret = randomBytes(32).toString('hex');
const tokenPayload = `${Buffer.from('local-capacity@test.invalid').toString('base64url')}.${Date.now() + 3600000}`;
const adminToken = `${tokenPayload}.${createHmac('sha256', tokenSecret).update(tokenPayload).digest('hex')}`;
const env = { ...process.env, DATABASE_URL: dbUrl.href, PUSH_ENABLED: '0', STORE_VERSION_CHECK_ENABLED: '0',
  FOOTBALL_VERIFICATION_CACHE: verificationCache,
  ADMIN_TOKEN: tokenSecret, MAINTENANCE_MODE: '0', OUTAGE_GIFT_ENABLED: '0',
  MATCHMAKING_DEBUG: '0', NODE_ENV: 'test', DB_POOL_MAX: '30',
  // Allow the whole wave time to find humans; bots are an assertion failure here.
  BOT_FALLBACK_ENABLED: '0', BOT_FALLBACK_MIN_DELAY_MS: '60000', BOT_FALLBACK_MAX_DELAY_MS: '60000',
  MATCHMAKING_TIMEOUT_MS: '90000' };
let server, created = false, metricsTimer;
let serverLog = '', maximumSockets = 0, maximumRooms = 0, maximumDbWaiting = 0, maximumFootballDbWaiting = 0;
const metrics = [], clients = [], timings = { login: [], search: [], answer: [], answerCold: [], answerRepeat: [], matchmaking: [], roundPreparation: [] };
const errors = [];
let endpoint;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function launch(script, extraEnv = {}) {
  const child = spawn(process.execPath, [join(source, 'server/node_modules/tsx/dist/cli.mjs'), script], {
    cwd: join(source, 'server'), env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { serverLog += chunk; });
  child.stderr.on('data', chunk => { serverLog += chunk; });
  return child;
}

class Player {
  constructor(index) {
    this.index = index; this.messages = []; this.waiters = []; this.closed = false;
    this.ws = new WebSocket(endpoint);
    this.opened = once(this.ws, 'open');
    this.ws.on('error', error => errors.push(error.message));
    this.ws.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.type === 'heartbeat') return;
      if (message.type === 'error') errors.push(message.message);
      const i = this.waiters.findIndex(waiter => waiter.matches(message));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(message);
      else this.messages.push(message);
    });
    this.ws.on('close', () => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`player ${index}: connection closed`));
    });
  }
  send(message) { this.ws.send(JSON.stringify(message)); }
  wait(type, predicate = () => true, timeout = 60000) {
    const matches = message => message.type === type && predicate(message);
    const i = this.messages.findIndex(matches);
    if (i >= 0) return Promise.resolve(this.messages.splice(i, 1)[0]);
    if (this.closed) return Promise.reject(new Error(`player ${this.index}: closed waiting for ${type}`));
    return new Promise((resolve, reject) => {
      const remove = () => { clearTimeout(timer); const i = this.waiters.indexOf(waiter); if (i >= 0) this.waiters.splice(i, 1); };
      const waiter = { matches, resolve: value => { remove(); resolve(value); }, reject: error => { remove(); reject(error); } };
      const timer = setTimeout(() => waiter.reject(new Error(`player ${this.index}: timeout waiting for ${type}`)), timeout);
      this.waiters.push(waiter);
    });
  }
}

async function captureMetrics(base) {
  const response = await fetch(`${base}/admin/api/performance`, { headers: { authorization: `Bearer ${adminToken}` }, signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  const separateReads = snapshot.footballDatabasePool?.reserved > 0 ? snapshot.footballDatabasePool.total : 0;
  assert.ok(snapshot.databasePool.total + separateReads <= 30, 'total server connection budget must stay bounded');
  metrics.push(snapshot);
  maximumSockets = Math.max(maximumSockets, snapshot.sockets);
  maximumRooms = Math.max(maximumRooms, snapshot.rooms);
  maximumDbWaiting = Math.max(maximumDbWaiting, snapshot.databasePool.waiting);
  maximumFootballDbWaiting = Math.max(maximumFootballDbWaiting, snapshot.footballDatabasePool?.waiting ?? 0);
}

function percentiles(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const at = p => sorted.length ? Number(sorted[Math.floor((sorted.length - 1) * p)].toFixed(2)) : null;
  return { samples: sorted.length, p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`); created = true;
  const migration = launch('src/db/migrate.ts');
  const [migrationCode] = await once(migration, 'exit');
  assert.equal(migrationCode, 0, `migration failed: ${serverLog.slice(-4000)}`);
  await db.connect();
  // Approximate production row counts, but fabricated football identities.
  // Six known club names + one synthetic hero are the deterministic test round.
  await db.query(`
    INSERT INTO clubs(id, name, name_norm, country, league, logo_url, popularity)
    SELECT i, 'Load Club ' || i, 'load club ' || i, 'England', 'Premier League',
           'https://fixture.invalid/club.png', 1000000 FROM generate_series(1,14000) i;
    UPDATE clubs SET name=n.name, name_norm=lower(n.name)
      FROM (VALUES (1,'Galatasaray'),(2,'Inter Milan'),(3,'Chelsea'),(4,'Real Madrid'),(5,'Barcelona'),(6,'Liverpool')) n(id,name)
      WHERE clubs.id=n.id;
    INSERT INTO players(id, name, name_norm, nationality, image_url)
    SELECT i, md5(i::text), md5(i::text), 'England', 'https://fixture.invalid/player.png'
      FROM generate_series(1,30000) i;
    UPDATE players SET name='Fixture Hero', name_norm='fixture hero' WHERE id=1;
    INSERT INTO player_clubs(player_id,club_id,start_year,end_year)
    SELECT i, 7 + ((i * 11 + j * 997) % 13994), 2010+j, 2011+j
      FROM generate_series(2,30000) i CROSS JOIN generate_series(0,6) j;
    INSERT INTO player_clubs(player_id,club_id,start_year,end_year)
    SELECT 1, i, 2000+i, 2001+i FROM generate_series(1,6) i;
    ANALYZE;
  `);
  // Finish bulk-load GIN maintenance before comparing steady-state query plans.
  // Otherwise a random autovacuum timing changes the pending-list cost between runs.
  await db.query('VACUUM (ANALYZE) players');
  if (await access(join(source, 'server/src/cli/player-name-index-test.ts')).then(() => true, () => false)) {
    const checks = launch('src/cli/player-name-index-test.ts');
    const [code] = await once(checks, 'exit');
    assert.equal(code, 0, `player index validation failed: ${serverLog.slice(-5000)}`);
  }
  if (await access(join(source, 'server/src/cli/verification-cache-test.ts')).then(() => true, () => false)) {
    const results = [];
    for (const enabled of ['0', '1']) {
      const start = serverLog.length;
      const checks = launch('src/cli/verification-cache-test.ts', { FOOTBALL_VERIFICATION_CACHE: enabled });
      const [code] = await once(checks, 'exit');
      assert.equal(code, 0, `verification cache validation failed: ${serverLog.slice(-5000)}`);
      const line = serverLog.slice(start).split('\n').find(line => line.startsWith('{"test":"verification-cache"'));
      assert.ok(line, 'verification digest missing'); results.push(JSON.parse(line));
    }
    assert.equal(results[0].digest, results[1].digest, 'cached and uncached decision/results must match');
  }
  if (varied) {
    const pairs = clientsCount / 2;
    await db.query('DELETE FROM player_clubs WHERE player_id <= $1', [pairs]);
    await db.query("UPDATE players SET name='Capacity Striker ' || id, name_norm='capacity striker ' || id WHERE id <= $1", [pairs]);
    await db.query(`INSERT INTO player_clubs(player_id,club_id,start_year,end_year)
      SELECT i, (i-1)*6+j, 2000+j, 2001+j FROM generate_series(1,$1::int) i CROSS JOIN generate_series(1,6) j`, [pairs]);
    await db.query('VACUUM (ANALYZE) players');
  }
  const portServer = createServer(); portServer.listen(0, '127.0.0.1'); await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise(resolve => portServer.close(resolve));
  endpoint = `ws://127.0.0.1:${port}`;
  const base = `http://127.0.0.1:${port}`;
  server = launch('src/index.ts', { PORT: String(port), LISTEN_HOST: '127.0.0.1' });
  for (let attempt = 0; ; attempt++) {
    try { const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) }); if (r.ok) break; } catch {}
    assert.ok(attempt < 100 && server.exitCode == null, 'test server did not start');
    await delay(100);
  }
  if (await access(join(source, 'server/src/cli/verification-cache-test.ts')).then(() => true, () => false)) {
    const invalidateUrl = `${base}/admin/api/football-cache/invalidate`;
    assert.equal((await fetch(invalidateUrl, { method: 'POST' })).status, 401);
    const headers = { authorization: `Bearer ${adminToken}` };
    assert.equal((await fetch(invalidateUrl, { headers })).status, 405);
    const invalidated = await fetch(invalidateUrl, { method: 'POST', headers });
    assert.equal(invalidated.status, 200);
    assert.equal(typeof (await invalidated.json()).revision, 'string');
  }
  let sampling = false;
  metricsTimer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    captureMetrics(base).catch(error => errors.push(`metrics: ${error.message}`)).finally(() => { sampling = false; });
  }, 1000);
  const started = performance.now();
  console.log(`Testing ${clientsCount} synthetic players / ${clientsCount / 2} ranked matches. Artifacts: ${artifacts}`);
  // Stagger connection bursts, then synchronize searches and gameplay below.
  for (let offset = 0; offset < clientsCount; offset += 50) {
    await Promise.all(Array.from({ length: Math.min(50, clientsCount - offset) }, async (_, j) => {
      const player = new Player(offset + j); clients.push(player);
      const start = performance.now();
      await player.opened; player.send({ type: 'guest', caps: ['wrongopen', 'wrongretry'] });
      const profile = await player.wait('profile'); player.userId = profile.profile.userId;
      timings.login.push(performance.now() - start);
    }));
  }
  console.log('Login wave complete; entering real matchmaking.');
  await Promise.all(clients.map(async player => {
    const start = performance.now();
    player.send({ type: 'find_match', userId: player.userId, options: { mode: 'team-team' }, caps: ['wrongopen', 'wrongretry'] });
    const message = await player.wait('room_state', m => m.room.players.length === 2);
    timings.matchmaking.push(performance.now() - start);
    player.room = message.room;
  }));
  const rooms = new Map();
  for (const player of clients) { const room = rooms.get(player.room.code) || []; room.push(player); rooms.set(player.room.code, room); }
  assert.equal(rooms.size, clientsCount / 2, 'all opponents must be real load-test clients');
  for (const room of rooms.values()) assert.equal(room.length, 2);
  await captureMetrics(base);
  console.log('All human pairs formed; cold autocomplete burst.');
  await Promise.all(clients.map(async player => {
    const start = performance.now();
    player.send({ type: 'search_clubs', reqId: 'capacity', q: '' });
    const result = await player.wait('club_results', m => m.reqId === 'capacity');
    assert.ok(result.clubs.length > 0);
    timings.search.push(performance.now() - start);
  }));
  console.log('Autocomplete complete; playing three rounds in every room.');
  await Promise.all([...rooms.values()].map(async ([a, b], roomIndex) => {
    for (let round = 0; round < 3; round++) {
      await Promise.all([a.wait('pick_phase'), b.wait('pick_phase')]);
      const preparationStarted = performance.now();
      const clubOffset = varied ? roomIndex * 6 : 0;
      a.send({ type: 'pick_team', clubId: clubOffset + round * 2 + 1 });
      b.send({ type: 'pick_team', clubId: clubOffset + round * 2 + 2 });
      await Promise.all([a.wait('guess_phase'), b.wait('guess_phase')]);
      timings.roundPreparation.push(performance.now() - preparationStarted);
      const start = performance.now();
      a.send({ type: 'submit_guess', text: varied ? `Capacity Striker ${roomIndex + 1}` : 'Fixture Hero' });
      const [ra, rb] = await Promise.all([a.wait('result'), b.wait('result')]);
      const answerMs = performance.now() - start;
      timings.answer.push(answerMs);
      (round === 0 ? timings.answerCold : timings.answerRepeat).push(answerMs);
      assert.equal(ra.result.correct, true); assert.equal(rb.result.correct, true);
      assert.equal(ra.result.answeredById, a.room.youId);
      assert.equal(ra.matchOver, round === 2);
      if (round < 2) { a.send({ type: 'ready' }); b.send({ type: 'ready' }); }
    }
    const [ta, tb] = await Promise.all([a.wait('trophy_update'), b.wait('trophy_update')]);
    assert.equal(ta.matchId, tb.matchId);
    assert.ok(ta.delta > 0); assert.ok(tb.delta <= 0);
  }));
  await captureMetrics(base);
  const settlements = await db.query('SELECT count(*)::int AS count FROM match_settlements');
  assert.equal(settlements.rows[0].count, clientsCount / 2, 'exactly one settlement per match');
  const ledger = await db.query('SELECT count(*)::int AS count FROM trophy_ledger');
  assert.equal(ledger.rows[0].count, clientsCount, 'exactly one ledger entry per player');
  assert.deepEqual(errors, [], 'no protocol or telemetry failures');
  assert.doesNotMatch(serverLog, /"level":"error"/, 'no server error logs during the workload');
  const report = { scope: 'local real ranked games with synthetic data; NOT production capacity or mobile network latency',
    source, varied, verificationCache, clients: clientsCount, completedMatches: rooms.size, completedRounds: rooms.size * 3,
    elapsedMs: Math.round(performance.now() - started), maximumSockets, maximumRooms, maximumDbWaiting, maximumFootballDbWaiting,
    timings: Object.fromEntries(Object.entries(timings).map(([key, values]) => [key, percentiles(values)])),
    runtime: metrics.at(-1), eventLoopP99MaxMs: Math.max(...metrics.map(m => m.eventLoop.p99Ms)),
    peakServerRssMB: Math.round(Math.max(...metrics.map(m => m.memoryBytes.rss)) / 1024 / 1024),
    settlements: settlements.rows[0].count, ledgerEntries: ledger.rows[0].count };
  await writeFile(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  process.exitCode = 1;
  console.error(error);
  console.error(`Artifacts: ${artifacts}`);
} finally {
  clearInterval(metricsTimer);
  for (const player of clients) player.ws.terminate();
  if (server && server.exitCode == null) {
    const exited = once(server, 'exit'); server.kill('SIGTERM');
    const forced = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited; clearTimeout(forced);
  }
  await writeFile(join(artifacts, 'server.log'), serverLog);
  await writeFile(join(artifacts, 'metrics.json'), JSON.stringify(metrics, null, 2));
  await db.end().catch(() => {});
  // Only this invocation's randomly named database can reach the cleanup path.
  if (created && /^cof_load_[a-f0-9]{12}$/.test(dbName)) await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
}
