// Run with Node 22+: node --experimental-strip-types scripts/ui2-nav-motion-test.mjs
import assert from 'node:assert/strict';
import { navFrameAt, settledPageAt } from '../src/ui2/navMotion.ts';
import { deadlineSnapshot } from '../src/performance/deadline.ts';

let positions = 0;
for (const width of [320, 390, 402, 430, 768]) {
  for (let step = 0; step <= 400; step++) {
    const page = step / 100;
    let edge = 0;
    for (let index = 0; index < 5; index++) {
      const frame = navFrameAt(page, index, width);
      assert.ok(Math.abs(frame.left - edge) < 1e-8, 'no gaps or overlaps');
      const transformedLeft = index * width / 6 + frame.translateX - (frame.width - width / 6) / 2;
      assert.ok(Math.abs(transformedLeft - frame.left) < 1e-8, 'native center-origin scaling matches layout');
      edge = frame.left + frame.width;
    }
    assert.ok(Math.abs(edge - width) < 1e-8, 'tabs fill the entire bar');
    positions++;
  }
  for (let selected = 0; selected < 5; selected++) {
    assert.equal(navFrameAt(selected, selected, width).width, width / 3);
  }
  assert.deepEqual(navFrameAt(-1, 0, width), navFrameAt(0, 0, width));
  assert.deepEqual(navFrameAt(5, 4, width), navFrameAt(4, 4, width));
}
console.log(`PASS: ${positions} page positions, five viewport widths, selected width and overscroll bounds`);
assert.equal(settledPageAt(390, 390, 4), null, 'stale completion cannot cancel the latest tap');
assert.equal(settledPageAt(390 * 4, 390, 4), 4);
assert.equal(settledPageAt(390, 390, null), 1, 'manual drag owns selection after interrupting a tap');
assert.equal(settledPageAt(600, 390, null), null, 'do not settle between pages');
assert.equal(settledPageAt(NaN, 390, null), null);
assert.equal(settledPageAt(100, 0, null), null);
assert.equal(settledPageAt(390 * 5, 390, null), null);
assert.deepEqual(deadlineSnapshot(null, 100), { remainingMs: 0, seconds: 0, nextSecondMs: null });
assert.equal(deadlineSnapshot(Infinity, 100).seconds, 0);
assert.equal(deadlineSnapshot(5100, 100).seconds, 5);
assert.equal(deadlineSnapshot(5100, 1101).seconds, 4);
assert.equal(deadlineSnapshot(5100, 5100).seconds, 0);
assert.equal(deadlineSnapshot(5100, 8000).seconds, 0, 'foreground resumes against wall clock');
assert.equal(deadlineSnapshot(5100, 1100).nextSecondMs, 1001);
assert.equal(deadlineSnapshot(5100, 1050).nextSecondMs, 51);
console.log('PASS: interrupted navigation, partial pages, deadline boundaries and foreground catch-up');
