import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const errors = [];
const warnings = [];

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost:5432/crossover_dev';
const matchThreshold = Number(process.env.VERIFY_MATCH_THRESHOLD ?? '0.3');
const exactThreshold = Number(process.env.VERIFY_EXACT_THRESHOLD ?? '0.85');

if (!databaseUrl) errors.push('DATABASE_URL is required');
if (Number.isNaN(matchThreshold) || matchThreshold <= 0 || matchThreshold >= 1) {
  errors.push('VERIFY_MATCH_THRESHOLD must be between 0 and 1');
}
if (Number.isNaN(exactThreshold) || exactThreshold <= 0 || exactThreshold > 1) {
  errors.push('VERIFY_EXACT_THRESHOLD must be between 0 and 1');
}
if (matchThreshold >= exactThreshold) {
  errors.push('VERIFY_MATCH_THRESHOLD must be lower than VERIFY_EXACT_THRESHOLD');
}
if (!process.env.GOOGLE_CLIENT_IDS) warnings.push('GOOGLE_CLIENT_IDS is empty; Google login will fail');
if (!process.env.FACEBOOK_APP_ID) warnings.push('FACEBOOK_APP_ID is empty; Facebook login will fail');
if (!process.env.APPLE_BUNDLE_ID) warnings.push('APPLE_BUNDLE_ID is using default com.crossover.football');
if (process.env.MAINTENANCE_MODE === '1') warnings.push('MAINTENANCE_MODE is enabled');

for (const cert of ['AppleRootCA-G3.cer', 'AppleRootCA-G2.cer', 'AppleComputerRootCertificate.cer']) {
  if (!existsSync(join(process.cwd(), 'certs', cert))) warnings.push(`missing Apple root cert: ${cert}`);
}

for (const w of warnings) console.warn(`WARN ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  process.exitCode = 1;
} else {
  console.log('Production check passed');
}
