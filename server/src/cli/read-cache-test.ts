import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadCache } from '../performance/readCache.ts';

test('invalidation discards in-flight data and keeps the new generation', async () => {
  const cache = new ReadCache<string>(2, 1000);
  let finish!: (value: string) => void;
  const old = cache.get('key', () => new Promise<string>(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.get('key', async () => 'new'), 'new');
  finish('old'); await old;
  assert.equal(await cache.get('key', async () => 'wrong'), 'new');
});

test('a cold burst of 1,000 readers shares one load; TTL starts on completion', async () => {
  let now = 0, loads = 0;
  let finish!: (value: string[]) => void;
  const cache = new ReadCache<string[]>(4, 100, () => now);
  const load = () => { loads++; return new Promise<string[]>(resolve => { finish = resolve; }); };
  const reads = Array.from({ length: 1000 }, () => cache.get('same scope', load));
  await Promise.resolve();
  assert.equal(loads, 1);
  now = 5000;
  finish(['answer']);
  await Promise.all(reads);
  now = 5099;
  assert.deepEqual(await cache.get('same scope', load), ['answer']);
  assert.equal(loads, 1);
  now = 5100;
  assert.deepEqual(await cache.get('same scope', async () => { loads++; return ['updated']; }), ['updated']);
  assert.equal(loads, 2);
  assert.equal(cache.snapshot().coalesced, 999);
});

test('different scopes stay separate and a least-recently-used entry is evicted', async () => {
  const cache = new ReadCache<string>(2, 1000);
  const load = (key: string) => cache.get(key, async () => key);
  await load('league:tr'); await load('country:tr'); await load('league:tr'); await load('all');
  assert.equal(cache.snapshot().entries, 2);
  assert.equal(cache.snapshot().misses, 3);
  await load('country:tr');
  assert.equal(cache.snapshot().misses, 4);
});

test('failed reads can retry; an evicted failure cannot remove its replacement', async () => {
  const cache = new ReadCache<string>(1, 1000);
  let fail!: (error: Error) => void;
  const old = cache.get('a', () => new Promise((_, reject) => { fail = reject; }));
  const rejected = assert.rejects(old, /database unavailable/);
  await Promise.resolve();
  await cache.get('b', async () => 'b');
  await cache.get('a', async () => 'new a');
  fail(new Error('database unavailable'));
  await rejected;
  assert.equal(await cache.get('a', async () => 'wrong'), 'new a');
  await assert.rejects(cache.get('error', async () => { throw new Error('failed'); }), /failed/);
  assert.equal(await cache.get('error', async () => 'recovered'), 'recovered');
});
