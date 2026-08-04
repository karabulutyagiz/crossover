// Static regression test: the three bot difficulty tiers must stay clearly distinct.
// Pure — no DB, no network. Run:  npm run test:difficulty
// Exits non-zero if the tiers ever collapse (the recurring "all feel the same" bug).
//
// NOTE: importing bot.ts already runs validateDifficulty() at load and THROWS on a
// collapsed config, so if this file even starts, the hard guard has passed. We then
// re-assert explicitly for a readable pass/fail report of the exact game contract.
import { DIFFICULTY } from '../rooms/bot.ts';

const { easy, medium, hard } = DIFFICULTY;
const checks: [string, boolean][] = [
  ['HARD is fastest: hard.max <= medium.min', hard.delayMs[1] <= medium.delayMs[0]],
  ['MEDIUM faster than EASY: medium.max <= easy.min', medium.delayMs[1] <= easy.delayMs[0]],
  ['easy delay band valid', easy.delayMs[0] < easy.delayMs[1]],
  ['medium delay band valid', medium.delayMs[0] < medium.delayMs[1]],
  ['hard delay band valid', hard.delayMs[0] < hard.delayMs[1]],
  ['knowBase increases easy<medium<hard', easy.knowBase < medium.knowBase && medium.knowBase < hard.knowBase],
  ['fameBaseTeam increases easy<medium<hard', easy.fameBaseTeam < medium.fameBaseTeam && medium.fameBaseTeam < hard.fameBaseTeam],
  ['HARD always knows (know=fame=1)', hard.knowBase === 1 && hard.fameBaseTeam === 1],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}
console.log(
  `\nEASY   ${easy.delayMs.join('-')}ms  know ${Math.round(easy.knowBase * 100)}%` +
  `\nMEDIUM ${medium.delayMs.join('-')}ms  know ${Math.round(medium.knowBase * 100)}%` +
  `\nHARD   ${hard.delayMs.join('-')}ms  know ${Math.round(hard.knowBase * 100)}%`,
);
if (!ok) {
  console.error('\n❌ Bot difficulty tiers are NOT clearly distinct — this is the regression. Fix DIFFICULTY in src/rooms/bot.ts.');
  process.exit(1);
}
console.log('\n✅ Bot difficulty tiers are clearly distinct.');
process.exit(0);
