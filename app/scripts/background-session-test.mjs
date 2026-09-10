import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BACKGROUND_SESSION_MS, backgroundSessionExpired } from '../src/performance/backgroundSession.ts';

test('foreground/short return stays warm; exact five-minute return expires even without timer execution', () => {
  assert.equal(BACKGROUND_SESSION_MS, 300_000);
  assert.equal(backgroundSessionExpired(null, 900_000), false);
  assert.equal(backgroundSessionExpired(0, 120_000), false);
  assert.equal(backgroundSessionExpired(0, 299_999), false);
  assert.equal(backgroundSessionExpired(0, 300_000), true);
  assert.equal(backgroundSessionExpired(100, 300_099), false);
  assert.equal(backgroundSessionExpired(100, 300_100), true);
  assert.equal(backgroundSessionExpired(100, 900_000), true);
  assert.equal(backgroundSessionExpired(null, 900_000), false);
});

test('client and server use the same five-minute deadline', () => {
  const server = readFileSync(new URL('../../server/src/ws/backgroundLease.ts', import.meta.url), 'utf8');
  assert.match(server, /BACKGROUND_SESSION_MS = 5 \* 60 \* 1000/);
});
