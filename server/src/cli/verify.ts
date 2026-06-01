import { closePool } from '../db/pool.ts';
import { searchClubs, verifyGuess, type SpellInfo } from '../game/verify.ts';

function fmtSpell(s: SpellInfo): string {
  const years =
    s.startYear || s.endYear ? ` (${s.startYear ?? '?'}–${s.endYear ?? '?'})` : '';
  return `${s.clubName}${years}`;
}

async function main(): Promise<void> {
  const [teamAArg, teamBArg, ...guessParts] = process.argv.slice(2);
  const guess = guessParts.join(' ');
  if (!teamAArg || !teamBArg || !guess) {
    console.error('Usage: npm run verify -- "<Team A>" "<Team B>" "<Player guess>"');
    console.error('Example: npm run verify -- "Galatasaray" "Inter" "Sneijder"');
    process.exitCode = 1;
    return;
  }

  const [aHits, bHits] = await Promise.all([searchClubs(teamAArg), searchClubs(teamBArg)]);
  const teamA = aHits[0];
  const teamB = bHits[0];
  if (!teamA) {
    console.error(`No club matched "${teamAArg}". Is it ingested?`);
    process.exitCode = 1;
    return;
  }
  if (!teamB) {
    console.error(`No club matched "${teamBArg}". Is it ingested?`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nTeams: ${teamA.name}  +  ${teamB.name}`);
  console.log(`Guess: "${guess}"`);

  const result = await verifyGuess(teamA.id, teamB.id, guess);
  const mp = result.matchedPlayer;

  if (result.reason === 'no_match') {
    console.log('\n❌  No player matched that name (try a closer spelling).');
    return;
  }

  if (result.correct) {
    console.log(`\n✅  CORRECT — ${mp!.name} (match ${mp!.sim.toFixed(2)})`);
    console.log(`   ${result.teamA.name}: ${result.spellsA.map(fmtSpell).join(', ')}`);
    console.log(`   ${result.teamB.name}: ${result.spellsB.map(fmtSpell).join(', ')}`);
  } else {
    console.log(`\n❌  WRONG — closest match: ${mp!.name} (match ${mp!.sim.toFixed(2)})`);
    const inA = result.spellsA.length > 0;
    const inB = result.spellsB.length > 0;
    console.log(`   Played ${result.teamA.name}? ${inA ? 'yes' : 'no'}`);
    console.log(`   Played ${result.teamB.name}? ${inB ? 'yes' : 'no'}`);
    const clubs = result.allClubs.map(fmtSpell);
    console.log(`   ${mp!.name}'s clubs: ${clubs.length ? clubs.join(', ') : '(none recorded)'}`);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exitCode = 1;
  })
  .finally(closePool);
