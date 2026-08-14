import { runMatchSimulation } from '../matchmaking/simulation.ts';

const matches = Number(process.env.MATCHES ?? '10000');
const seed = process.env.SEED ?? 'cof-production-opponent-system';
const summary = runMatchSimulation(matches, seed);

console.log(JSON.stringify(summary, null, 2));
if (summary.impossibleResults.length > 0) {
  console.error(`Simulation flagged ${summary.impossibleResults.length} impossible results.`);
  process.exit(1);
}
