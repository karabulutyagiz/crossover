// Admin paneli kişi-bazlı paket görünürlüğü duman testi:
// getAdminStats'a SENTETİK bir canlı XOX maçı (paket-gerektiren mod) + online liste
// veriyoruz; çıktıda her oyuncuya/online kullanıcıya GERÇEK social_pack_until
// iliştirilmiş mi doğruluyoruz. (Gerçek DB'den okur — sunucuyu ayağa kaldırmaz.)
import { getAdminStats } from '../game/admin.ts';
import { pool } from '../db/pool.ts';

async function main() {
  // Biri paketli, biri paketsiz iki gerçek kullanıcı seç.
  const withPack = (await pool.query(`SELECT id::text AS id, display_name FROM users WHERE social_pack_until > now() LIMIT 1`)).rows[0];
  const noPack = (await pool.query(`SELECT id::text AS id, display_name FROM users WHERE social_pack_until IS NULL LIMIT 1`)).rows[0];
  if (!withPack || !noPack) throw new Error('Test için paketli+paketsiz kullanıcı bulunamadı');

  // Sentetik canlı maç: XOX (gated), iki insan + hiç bot yok.
  const fakeMatch = {
    code: 'TEST01', status: 'guess', gameMode: 'xox' as const, bot: false, ranked: true, humans: 2,
    players: [
      { name: withPack.display_name, userId: withPack.id, trophies: 1200, score: 1, connected: true, isBot: false },
      { name: noPack.display_name,   userId: noPack.id,   trophies: 900,  score: 0, connected: true, isBot: false },
    ],
  };

  const stats: any = await getAdminStats({
    online: 2, queue: 0, rooms: 1, playersInMatch: 2, inLobby: 0, botMatches: 0, byStatus: {},
    matches: [fakeMatch as any],
    onlineUserIds: [withPack.id, noPack.id],
  });

  const m = stats.live.matches[0];
  const p0 = m.players[0], p1 = m.players[1];
  console.log('── MAÇ OYUNCULARI (XOX = gated) ──');
  console.log(`  ${p0.name.padEnd(16)} socialPackUntil=${p0.socialPackUntil ?? 'YOK'}`);
  console.log(`  ${p1.name.padEnd(16)} socialPackUntil=${p1.socialPackUntil ?? 'YOK'}`);
  console.log('── ONLINE LİSTE ──');
  for (const o of stats.live.onlineUsers) console.log(`  ${o.name.padEnd(16)} socialPackUntil=${o.socialPackUntil ?? 'YOK'}`);

  // Doğrulamalar
  const okHas = typeof p0.socialPackUntil === 'string' && new Date(p0.socialPackUntil).getTime() > Date.now();
  const okNo = p1.socialPackUntil === null;
  const onlineHas = stats.live.onlineUsers.find((o: any) => o.userId === withPack.id)?.socialPackUntil;
  const okOnline = typeof onlineHas === 'string';
  console.log('\n── SONUÇ ──');
  console.log(`  paketli oyuncu aktif damga taşıyor: ${okHas ? '✅' : '❌'}`);
  console.log(`  paketsiz oyuncu null (panelde ⚠️ kırmızı bayrak): ${okNo ? '✅' : '❌'}`);
  console.log(`  online listede paket damgası taşınıyor: ${okOnline ? '✅' : '❌'}`);
  if (!(okHas && okNo && okOnline)) throw new Error('Doğrulama BAŞARISIZ');
  console.log('\n✅ TÜM DOĞRULAMALAR GEÇTİ — panel gerçek paket durumunu görüyor.');
  await pool.end();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
