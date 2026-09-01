// Admin paneli kişi-bazlı Sosyal Paket görünürlüğü duman testi.
// getAdminStats'a SENTETİK bir canlı XOX maçı (paket-gerektiren mod) + online liste
// veriyoruz; çıktıda her oyuncuya GERÇEK social_pack_until VE paket KAYNAĞI
// (Production/Sandbox/iade) iliştirilmiş mi doğruluyoruz. Kendi test kullanıcılarını
// kurar ve sonda TEMİZLER — gerçek veriyi kirletmez. (Sunucuyu ayağa kaldırmaz.)
import { getAdminStats } from '../game/admin.ts';
import { pool } from '../db/pool.ts';
import { randomUUID } from 'node:crypto';

const sandboxUser = randomUUID();   // aktif paket + SANDBOX (test) alımı → "aldığı görünmüyor ama oynuyor"
const noPackUser = randomUUID();    // paketi yok → paket-gerektiren modda ⚠️ kırmızı bayrak
const txId = 'smoke-sandbox-' + sandboxUser;

async function setup() {
  await pool.query(`INSERT INTO users (id, display_name, social_pack_until) VALUES ($1,'PackSmokeSandbox', now() + interval '3 days')`, [sandboxUser]);
  await pool.query(`INSERT INTO users (id, display_name, social_pack_until) VALUES ($1,'PackSmokeNone', NULL)`, [noPackUser]);
  await pool.query(
    `INSERT INTO processed_transactions (transaction_id, user_id, product_id, diamonds, environment, purchase_date)
     VALUES ($1,$2,'com.crossover.socialpack.weekly',0,'Sandbox', now())`,
    [txId, sandboxUser],
  );
}
async function cleanup() {
  await pool.query(`DELETE FROM processed_transactions WHERE transaction_id = $1`, [txId]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [[sandboxUser, noPackUser]]);
}

async function main() {
  await setup();
  const fakeMatch = {
    code: 'TEST01', status: 'guess', gameMode: 'xox' as const, bot: false, ranked: true, humans: 2,
    players: [
      { name: 'PackSmokeSandbox', userId: sandboxUser, trophies: 1200, score: 1, connected: true, isBot: false },
      { name: 'PackSmokeNone',    userId: noPackUser,   trophies: 900,  score: 0, connected: true, isBot: false },
    ],
  };
  const stats: any = await getAdminStats({
    online: 2, queue: 0, rooms: 1, playersInMatch: 2, inLobby: 0, botMatches: 0, byStatus: {},
    matches: [fakeMatch as any],
    onlineUserIds: [sandboxUser, noPackUser],
  });

  const m = stats.live.matches[0];
  const A = m.players.find((p: any) => p.userId === sandboxUser);
  const B = m.players.find((p: any) => p.userId === noPackUser);
  console.log('── MAÇ OYUNCULARI (XOX = gated) ──');
  console.log(`  ${A.name.padEnd(18)} until=${A.socialPackUntil ?? 'YOK'}  kaynak=${A.packSource ?? '—'}  iade=${A.packRevoked}`);
  console.log(`  ${B.name.padEnd(18)} until=${B.socialPackUntil ?? 'YOK'}  kaynak=${B.packSource ?? '—'}  iade=${B.packRevoked}`);

  const okActive = typeof A.socialPackUntil === 'string' && new Date(A.socialPackUntil).getTime() > Date.now();
  const okSource = A.packSource === 'Sandbox';                 // ← "aldığı görünmüyor" = test alımı, gelire sayılmaz
  const okNone = B.socialPackUntil === null && B.packSource === null;
  console.log('\n── SONUÇ ──');
  console.log(`  paketli oyuncu aktif damga taşıyor: ${okActive ? '✅' : '❌'}`);
  console.log(`  kaynak SANDBOX olarak görünüyor (panelde "📦 aktif · TEST"): ${okSource ? '✅' : '❌'}`);
  console.log(`  paketsiz oyuncu null (panelde ⚠️ "paket yok"): ${okNone ? '✅' : '❌'}`);
  if (!(okActive && okSource && okNone)) throw new Error('Doğrulama BAŞARISIZ');
  console.log('\n✅ TÜM DOĞRULAMALAR GEÇTİ — panel gerçek paket durumunu + kaynağını görüyor.');
}

main()
  .then(cleanup)
  .then(() => pool.end())
  .catch(async (e) => { console.error('❌', e); try { await cleanup(); } catch { /* ignore */ } await pool.end(); process.exit(1); });
