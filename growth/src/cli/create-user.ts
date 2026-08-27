import { upsertUser } from '../api/auth.ts';
import { closePool } from '../db/pool.ts';
import type { Role } from '../core/types.ts';

// Kullanım: npm run user -- email@ornek.com sifre [ADMIN|MARKETING|VIEWER]
const [email, password, roleArg] = process.argv.slice(2);
const role = (roleArg ?? 'ADMIN').toUpperCase() as Role;

if (!email || !password || !['ADMIN', 'MARKETING', 'VIEWER'].includes(role)) {
  console.error('Kullanım: npm run user -- <email> <şifre> [ADMIN|MARKETING|VIEWER]');
  process.exit(1);
}

upsertUser(email, password, role)
  .then(() => {
    console.log(`✓ Growth kullanıcısı hazır: ${email} (${role})`);
    return closePool();
  })
  .catch(async (err) => {
    console.error('Kullanıcı oluşturulamadı:', err);
    await closePool();
    process.exit(1);
  });
