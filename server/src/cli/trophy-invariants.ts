import { randomUUID } from 'node:crypto';
import {
  clampFinalTrophyDelta,
  TROPHY_GAIN_MAX,
  TROPHY_GAIN_MIN,
  TROPHY_LOSS_MAX,
  TROPHY_LOSS_MIN,
  trophyDeltaExpectedScore,
} from '../matchmaking/trophyIntegrity.ts';
import { SeededRandom } from '../matchmaking/random.ts';

let failed = false;

function check(cond: boolean, msg: string): void {
  console.log(`${cond ? 'OK' : 'FAIL'} ${msg}`);
  if (!cond) failed = true;
}

function assertWinRange(delta: number, msg: string): void {
  check(delta >= TROPHY_GAIN_MIN && delta <= TROPHY_GAIN_MAX, `${msg} (${delta})`);
}

function assertLossRange(delta: number, msg: string): void {
  check(delta <= -TROPHY_LOSS_MIN && delta >= -TROPHY_LOSS_MAX, `${msg} (${delta})`);
}

const muchWeakerWin = trophyDeltaExpectedScore({ playerSkillMean: 1550, opponentSkillMean: 800, won: true, playerTrophies: 1200 });
check(muchWeakerWin.delta === TROPHY_GAIN_MIN, 'win vs much weaker opponent gives minimum +28');

const equalWin = trophyDeltaExpectedScore({ playerSkillMean: 1100, opponentSkillMean: 1100, won: true, playerTrophies: 1200 });
assertWinRange(equalWin.delta, 'win vs equal opponent stays in +28..+35');

const muchStrongerWin = trophyDeltaExpectedScore({ playerSkillMean: 800, opponentSkillMean: 1550, won: true, playerTrophies: 1200 });
check(muchStrongerWin.delta === TROPHY_GAIN_MAX, 'win vs much stronger opponent gives maximum +35');

const muchStrongerLoss = trophyDeltaExpectedScore({ playerSkillMean: 800, opponentSkillMean: 1550, won: false, playerTrophies: 1200 });
check(muchStrongerLoss.delta === -TROPHY_LOSS_MIN, 'loss vs much stronger opponent gives minimum -15');

const equalLoss = trophyDeltaExpectedScore({ playerSkillMean: 1100, opponentSkillMean: 1100, won: false, playerTrophies: 1200 });
assertLossRange(equalLoss.delta, 'loss vs equal opponent stays in -15..-20');

const muchWeakerLoss = trophyDeltaExpectedScore({ playerSkillMean: 1550, opponentSkillMean: 800, won: false, playerTrophies: 1200 });
check(muchWeakerLoss.delta === -TROPHY_LOSS_MAX, 'loss vs much weaker opponent gives maximum -20');

check(clampFinalTrophyDelta({ rawDelta: 2, won: true, currentTrophies: 500 }) === TROPHY_GAIN_MIN, 'post-modifier tiny win reward clamps to +28');
check(clampFinalTrophyDelta({ rawDelta: 50, won: true, currentTrophies: 500 }) === TROPHY_GAIN_MAX, 'post-modifier huge win reward clamps to +35');
check(clampFinalTrophyDelta({ rawDelta: -5, won: false, currentTrophies: 500 }) === -TROPHY_LOSS_MIN, 'post-modifier tiny loss clamps to -15');
check(clampFinalTrophyDelta({ rawDelta: -30, won: false, currentTrophies: 500 }) === -TROPHY_LOSS_MAX, 'post-modifier huge loss clamps to -20');
check(clampFinalTrophyDelta({ rawDelta: -17, won: false, currentTrophies: 8 }) === -8, 'zero trophy floor reports actual -8 delta');
check(clampFinalTrophyDelta({ rawDelta: -17, won: false, currentTrophies: 0 }) === 0, 'zero trophy floor never produces negative zero');

const rng = new SeededRandom('trophy-invariants');
for (let i = 0; i < 1500; i++) {
  const playerSkillMean = Math.round(650 + rng.next() * 1250);
  const opponentSkillMean = Math.round(650 + rng.next() * 1250);
  const won = rng.next() >= 0.5;
  const playerTrophies = 500 + Math.round(rng.next() * 4500);
  const delta = trophyDeltaExpectedScore({
    playerSkillMean,
    opponentSkillMean,
    playerSkillUncertainty: 70 + rng.next() * 280,
    opponentSkillUncertainty: 70 + rng.next() * 280,
    won,
    playerTrophies,
  }).delta;
  if (won) {
    if (delta < TROPHY_GAIN_MIN || delta > TROPHY_GAIN_MAX) {
      check(false, `simulated win delta out of range (${delta})`);
      break;
    }
  } else if (Math.abs(delta) < TROPHY_LOSS_MIN || Math.abs(delta) > TROPHY_LOSS_MAX) {
    check(false, `simulated loss delta out of range (${delta})`);
    break;
  }
}
check(!failed, '1500 simulated ranked deltas stay in required ranges');

for (const rawDelta of [2, 11, 20, 27, 28, 31, 35, 50, -1, -5, -14, -15, -18, -20, -30]) {
  const won = rawDelta >= 0;
  const before = 900;
  const finalTrophyDelta = clampFinalTrophyDelta({ rawDelta, won, currentTrophies: before });
  const databaseAfter = before + finalTrophyDelta;
  const serverEvent = { matchId: randomUUID(), delta: finalTrophyDelta, trophies: databaseAfter };
  const uiDelta = serverEvent.delta;
  const databaseChange = databaseAfter - before;
  const leaderboardChange = serverEvent.trophies - before;
  check(
    uiDelta === finalTrophyDelta && finalTrophyDelta === databaseChange && databaseChange === leaderboardChange,
    `single source final delta is reused everywhere for raw ${rawDelta}`,
  );
}

if (failed) process.exit(1);
