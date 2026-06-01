import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://localhost:5432/crossover_dev'),
  wikidataUserAgent: required(
    'WIKIDATA_USER_AGENT',
    'CrossoverGame/0.1 (dev; yagizkarabulutmedya@gmail.com)',
  ),
  // Candidate net + the floor for auto-correcting a typo to a both-teams player.
  // Kept low so phonetic misspellings (e.g. "snayder" -> Sneijder) still match;
  // false accepts are bounded because auto-correct only targets players who
  // actually played for both of the round's teams.
  verifyMatchThreshold: Number(process.env.VERIFY_MATCH_THRESHOLD ?? '0.3'),
  // Above this, the guess is treated as a confident, specific player name (not a
  // typo): we evaluate THAT player strictly. This is what keeps "Ronaldinho"
  // from being auto-corrected into "Ronaldo". Below it, a guess is treated as an
  // approximate spelling and auto-corrected to the closest both-teams player.
  verifyExactThreshold: Number(process.env.VERIFY_EXACT_THRESHOLD ?? '0.85'),
} as const;
