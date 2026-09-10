// Loopback only; does not start the game server or use a database.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { BACKGROUND_SESSION_MS, BackgroundLease } from '../ws/backgroundLease.ts';
import { validateClientMsg } from '../ws/validateClientMsg.ts';

function fixture() {
  let now = 0;
  let expirations = 0;
  const lease = new BackgroundLease(() => expirations++, BACKGROUND_SESSION_MS, () => now);
  return { lease, at: (time: number) => { now = time; }, count: () => expirations };
}

test('background expires exactly at five minutes, once; duplicate frames do not extend it', () => {
  const f = fixture();
  try {
    f.lease.background();
    f.at(299_999);
    f.lease.background();
    assert.equal(f.lease.check(), false);
    f.at(300_000);
    f.lease.active();
    assert.equal(f.lease.check(), true);
    assert.equal(f.count(), 1);
    f.lease.background();
    assert.equal(f.count(), 1);
  } finally { f.lease.dispose(); }
});

test('short foreground return cancels expiry; next background gets a new deadline', () => {
  const f = fixture();
  try {
    f.lease.background();
    f.at(120_000); f.lease.active();
    f.at(900_000); assert.equal(f.lease.check(), false);
    f.lease.background();
    f.at(1_199_999); assert.equal(f.lease.check(), false);
    f.at(1_200_000); assert.equal(f.lease.check(), true);
    assert.equal(f.count(), 1);
  } finally { f.lease.dispose(); }
});

test('old clients without bglease do not need foreground renewal', () => {
  const f = fixture();
  try {
    f.at(24 * 60 * 60 * 1000);
    assert.equal(f.lease.check(), false);
    assert.equal(f.count(), 0);
  } finally { f.lease.dispose(); }
});

test('JS foreground heartbeats renew lease; lost background notification still expires', () => {
  const f = fixture();
  try {
    f.lease.enableForegroundLease();
    for (let i = 1; i <= 100; i++) {
      f.at(i * 20_000); f.lease.active();
      assert.equal(f.lease.check(), false);
    }
    f.at(2_299_999); assert.equal(f.lease.check(), false);
    f.at(2_300_000); assert.equal(f.lease.check(), true);
    assert.equal(f.count(), 1);
  } finally { f.lease.dispose(); }
});

test('explicit background gets five minutes from transition, not last heartbeat', () => {
  const f = fixture();
  try {
    f.lease.enableForegroundLease();
    f.at(19_000); f.lease.background();
    f.at(300_000); assert.equal(f.lease.check(), false);
    f.at(319_000); assert.equal(f.lease.check(), true);
  } finally { f.lease.dispose(); }
});

test('disposed connections cannot schedule another expiry', () => {
  const f = fixture();
  f.lease.enableForegroundLease();
  f.lease.dispose();
  f.lease.active(); f.lease.background();
  f.at(900_000); f.lease.check();
  assert.equal(f.count(), 0);
});

test('protocol accepts only active/background lifecycle states', () => {
  for (const state of ['active', 'background']) assert.equal(validateClientMsg({ type: 'app_state', state }).ok, true);
  for (const state of ['inactive', '', null, undefined, 1, {}, []]) assert.equal(validateClientMsg({ type: 'app_state', state }).ok, false);
});

test('real socket expires despite healthy native pongs when JS stops renewing', { timeout: 5000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let pongs = 0;
  let expirations = 0;
  const online = new Set<WebSocket>();
  server.on('connection', ws => {
    online.add(ws);
    const lease = new BackgroundLease(() => {
      expirations++;
      online.delete(ws);
      ws.terminate();
    }, 100);
    // Start after the first successful pong: no dependence on socket startup speed.
    ws.on('pong', () => { pongs++; lease.enableForegroundLease(); });
    const ping = setInterval(() => ws.ping(), 5);
    ws.on('close', () => { lease.dispose(); clearInterval(ping); online.delete(ws); });
  });
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await once(client, 'open');
    await once(client, 'close');
    assert.ok(pongs > 0);
    assert.equal(expirations, 1);
    assert.equal(online.size, 0);
  } finally {
    client.terminate();
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
