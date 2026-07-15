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
  // Apple In-App Purchase: app-specific shared secret (App Store Connect → App
  // Information → App-Specific Shared Secret). Used to validate consumable receipts
  // with Apple before granting diamonds. Empty = IAP grants are refused.
  iapSharedSecret: process.env.IAP_SHARED_SECRET ?? '',
  maintenanceMode: process.env.MAINTENANCE_MODE === '1',
  // Expo push notifications. '0' turns off all sending + the push crons
  // (token registration is skipped too); defaults to on.
  pushEnabled: (process.env.PUSH_ENABLED ?? '1') === '1',
  minIosBuild: Number(process.env.MIN_IOS_BUILD ?? '1'),
  minAndroidVersionCode: Number(process.env.MIN_ANDROID_VERSION_CODE ?? '1'),
} as const;
