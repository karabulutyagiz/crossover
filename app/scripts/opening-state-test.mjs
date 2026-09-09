import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = new URL('../src/openingState.ts', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const mod = { exports: {} };
new Function('exports', outputText)(mod.exports);
const { openingProgress } = mod.exports;
let cases = 0;
for (let mask = 0; mask < 32; mask++) {
  const state = { fontsReady: Boolean(mask & 1), artReady: Boolean(mask & 2), bootReady: Boolean(mask & 4), complete: Boolean(mask & 8), blocked: Boolean(mask & 16) };
  const progress = openingProgress(state);
  assert(progress >= 0 && progress <= 1);
  assert.equal(progress === 1, state.fontsReady && state.artReady && state.bootReady && state.complete && !state.blocked);
  if (state.blocked) assert(progress <= 0.86);
  cases++;
}
const source = readFileSync(new URL('../src/GameOpening.tsx', import.meta.url), 'utf8');
assert(!source.includes('setInterval('), 'no frame/tick-based JS progress loop');
assert(!source.includes('useNativeDriver: false'), 'all opening animations stay native-driven');
assert(source.includes('clearTimeout(timer)'), 'scheduled callbacks are cleaned up');
assert(source.includes('reduceMotion'), 'reduced motion is supported');
console.log(`${cases} startup state combinations passed; motion/cleanup checks passed.`);
