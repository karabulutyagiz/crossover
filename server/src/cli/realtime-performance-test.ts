// Isolated loopback tests. Never imports/starts the game server or contacts production.
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { HeartbeatState } from '../ws/socketHealth.ts';
import { sendSocketData } from '../ws/send.ts';
import { assessHumanCandidateRisks } from '../matchmaking/antiFarm.ts';
import { liveOpsConfig } from '../matchmaking/liveOpsConfig.ts';

test('healthy protocol pongs do not suppress 20-second application heartbeats', () => {
  const state = new HeartbeatState();
  let heartbeats = 0;
  for (let tick = 1; tick <= 150; tick++) {
    const result = state.tick();
    assert.equal(result.terminate, false);
    if (result.applicationHeartbeat) heartbeats++;
    state.pong();
  }
  assert.equal(heartbeats, 30);
});

test('dead sockets expire; a recovered mobile connection retains its grace period', () => {
  const dead = new HeartbeatState();
  for (let i = 0; i < 6; i++) assert.equal(dead.tick().terminate, false);
  assert.equal(dead.tick().terminate, true);
  const recovered = new HeartbeatState();
  for (let i = 0; i < 5; i++) recovered.tick();
  recovered.pong();
  assert.equal(recovered.tick().terminate, false);
  assert.equal(recovered.missedPongs, 1);
});

test('slow consumers are bounded, close once, and never receive more queued frames', () => {
  const events = new EventEmitter();
  const socket = Object.assign(events, {
    readyState: WebSocket.OPEN, OPEN: WebSocket.OPEN, bufferedAmount: 1024,
    sends: 0, closes: 0,
    send() { this.sends++; },
    close(code: number) { assert.equal(code, 1013); this.closes++; events.emit('close'); },
    terminate() { events.emit('close'); },
  });
  assert.equal(sendSocketData(socket as unknown as WebSocket, 'frame', 1024), false);
  assert.equal(sendSocketData(socket as unknown as WebSocket, 'frame', 1024), false);
  assert.equal(socket.sends, 0);
  assert.equal(socket.closes, 1);
});

test('candidate risk uses one parameterized query, preserving per-pair scores', async () => {
  let calls = 0;
  const cfg = liveOpsConfig();
  assert.equal(cfg.killSwitches.antiFarmEnabled, true);
  const fakeDb = {
    query: async (_sql: string, args: unknown[]) => {
      calls++;
      assert.deepEqual(args, [['a:b', 'a:c', 'a:d'], 'a']);
      return { rows: [
        { pair_key: 'a:b', matches_24h: 6, one_way: 4 },
        { pair_key: 'a:c', matches_24h: 1, one_way: 0 },
      ] };
    },
  };
  const result = await assessHumanCandidateRisks('a', ['b', 'c', 'd', 'b'], fakeDb as unknown as Parameters<typeof assessHumanCandidateRisks>[2]);
  assert.equal(calls, 1);
  const expected = Math.min(1, Math.max(0, 6 - cfg.antiFarm.pairDecayStart + 1) * 0.14 + 0.18 + 4 * 0.025);
  assert.equal(result.get('b'), Number(expected.toFixed(4)));
  assert.equal(result.get('c'), Number(Math.max(0, 1 - cfg.antiFarm.pairDecayStart + 1) * 0.14));
  assert.equal(result.get('d'), 0);
  await assessHumanCandidateRisks('a', [], fakeDb as unknown as Parameters<typeof assessHumanCandidateRisks>[2]);
  assert.equal(calls, 1, 'empty queue makes no database request');
});

test('oversized inbound frame is rejected by WS before application JSON parsing', async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 1024, perMessageDeflate: false });
  await once(server, 'listening');
  let received = 0;
  server.on('connection', (ws) => { ws.on('error', () => {}); ws.on('message', () => received++); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  try {
    await once(client, 'open');
    const closed = once(client, 'close');
    client.send('x'.repeat(2048));
    const [code] = await closed;
    assert.equal(code, 1009);
    assert.equal(received, 0);
  } finally {
    client.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('250 simultaneous local sockets exchange 5,000 ordered frames without losses', { timeout: 30_000 }, async () => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 1024, perMessageDeflate: false });
  const delay = monitorEventLoopDelay({ resolution: 10 });
  delay.enable();
  await once(server, 'listening');
  let echoed = 0;
  server.on('connection', (ws) => {
    ws.on('error', () => {});
    ws.on('message', (data) => { if (sendSocketData(ws, data.toString())) echoed++; });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const endpoint = `ws://127.0.0.1:${address.port}`;
  const latencies: number[] = [];
  const clients: WebSocket[] = [];
  const started = performance.now();
  try {
    await Promise.all(Array.from({ length: 250 }, () => new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(endpoint);
      clients.push(ws);
      let sequence = 0;
      let sentAt = 0;
      const sendNext = () => { sentAt = performance.now(); ws.send(JSON.stringify({ sequence })); };
      ws.on('open', sendNext);
      ws.on('error', reject);
      ws.on('message', (data) => {
        try {
          assert.equal(JSON.parse(data.toString()).sequence, sequence);
          latencies.push(performance.now() - sentAt);
          if (++sequence < 20) sendNext(); else ws.close();
        } catch (err) { reject(err); }
      });
      ws.on('close', () => { if (sequence === 20) resolve(); else reject(new Error(`early close after ${sequence} frames`)); });
    })));
    assert.equal(echoed, 5000);
    assert.equal(latencies.length, 5000);
    latencies.sort((a, b) => a - b);
    const percentile = (p: number) => Number(latencies[Math.floor((latencies.length - 1) * p)]!.toFixed(2));
    console.log(JSON.stringify({ scope: 'loopback transport only; not production capacity', clients: 250, frames: echoed,
      elapsedMs: Math.round(performance.now() - started), rttMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) },
      eventLoopP99Ms: Number((delay.percentile(99) / 1e6).toFixed(2)), rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024) }));
  } finally {
    delay.disable();
    for (const ws of clients) ws.terminate();
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
