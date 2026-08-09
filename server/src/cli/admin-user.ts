// Admin paneli kullanıcısı oluştur/güncelle.
// Şifreyi argümanla değil ENV ile geç (process listesinde görünmesin):
//   ADMIN_EMAIL=... ADMIN_PW=... npx tsx src/cli/admin-user.ts
import { upsertAdminUser } from '../game/adminAuth.ts';
import { closePool } from '../db/pool.ts';

const email = process.env.ADMIN_EMAIL ?? process.argv[2] ?? '';
const pw = process.env.ADMIN_PW ?? process.argv[3] ?? '';

if (!email || !pw) {
  console.error('Kullanım: ADMIN_EMAIL=<e-posta> ADMIN_PW=<şifre> npx tsx src/cli/admin-user.ts');
  process.exit(1);
}

upsertAdminUser(email, pw)
  .then(() => console.log('✓ admin kullanıcısı kaydedildi:', email.trim().toLowerCase()))
  .catch((e) => { console.error('HATA:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closePool);
