import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/ui2/products.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const mod = { exports: {} };
new Function('require', 'exports', outputText)(() => ({ UI2: {} }), mod.exports);
const { ARENAS, arenaIndexFor } = mod.exports;
for (let i = 0; i < ARENAS.length; i++) {
  assert.equal(arenaIndexFor(ARENAS[i].min), i);
  if (i) assert.equal(arenaIndexFor(ARENAS[i].min - 1), i - 1);
}
assert.equal(arenaIndexFor(100000), 6);
assert.deepEqual(ARENAS.map(a => a.reward), [50, 100, 150, 200, 300, 500, 1000]);
const road = readFileSync(new URL('../src/ui2/ArenaRoad.tsx', import.meta.url), 'utf8');
assert(road.includes('highestArenaRewarded'), 'server reward watermark is authoritative');
assert(!road.includes('claimReward'), 'no client-side reward claiming');
assert(road.includes('index > 0 ? <ArenaStairs reached={!locked} /> : null'), 'stairs link adjacent arenas but never extend below the first arena');
assert(road.includes('testID="arena-link-stairs"') && road.includes('pointerEvents="none" accessible={false}'), 'stairs are decorative, not reward or tap targets');
assert(!road.includes('useNativeDriver: false'));
assert(road.includes('translateY: reduced ? 0 : enter.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] })'), 'arena enters from below and exits downward, respecting reduced motion');
assert(!road.includes('translateX:'), 'arena no longer enters from the side');
assert(road.includes('getItemLayout'), 'stable offsets for current arena');
assert(road.includes('removeClippedSubviews={false}'), 'do not clip arena artwork during iOS scrolling');
assert(!road.includes('IcClose'), 'arena road has no top-right close icon');
assert(road.includes('arena-road-done') && road.includes("t('settings.confirm')"), 'centered localized Done button');
assert(!road.includes('requestAnimationFrame') && !road.includes('setContentReady'), 'no deferred arena opening pipeline');
assert(road.includes('contentOffset={initialOffset}'), 'current arena is positioned from the first native layout');
const tabs = readFileSync(new URL('../src/ui2/Ui2Tabs.tsx', import.meta.url), 'utf8');
assert(tabs.includes("visible={dlg === 'arenas'}"), 'arena stays prepared instead of mounting on each tap');
assert(road.includes("useMenuMotion(onClose, 'page', presented)"), 'arena starts its transition only when its image is decoded');
assert(road.includes('useImage(BACKDROP') && road.includes('source={backdrop}'), 'backdrop uses a retained native image instead of a deferred URI decode');
assert(road.includes('visible && backdrop !== null') && road.includes('opacity: presented ? 1 : 0'), 'cold opening cannot expose an empty background');
assert(road.includes("t('arenas.imageLoadError')"), 'asset failure has a recoverable error instead of an invisible modal');
assert(road.includes("pointerEvents={visible ? 'auto' : 'none'}"), 'prepared hidden arena cannot intercept touches');
assert(road.includes('<TrophyRail height={ROAD.length * ROW_H + roadPadding * 2}') && road.includes('fraction * ROW_H'), 'one continuous rail follows partial trophy progress');
assert(road.includes('rail-empty') && road.includes('styles.railMilestone'), 'empty track and trophy milestones remain visible');
assert(road.includes('ListHeaderComponent=') && road.includes('ListFooterComponent={<View style={{ height: roadPadding }}'), 'end arenas retain symmetric padding');
const rowHeight = Number(road.match(/const ROW_H = (\d+)/)[1]);
assert(rowHeight >= 520, 'full-size stairs have space below the reward and progress panels');
for (const viewport of [380, 560, 700]) {
  const padding = Math.max(0, (viewport - rowHeight) / 2);
  const contentHeight = ARENAS.length * rowHeight + padding * 2;
  for (let row = 0; row < ARENAS.length; row++) {
    const offset = row * rowHeight;
    assert(offset <= contentHeight - viewport, 'target offset does not clamp');
    if (viewport >= rowHeight) assert.equal(padding + row * rowHeight + rowHeight / 2 - offset, viewport / 2);
  }
}
console.log('7 arena boundaries, reward amounts, and road presentation checks passed.');
