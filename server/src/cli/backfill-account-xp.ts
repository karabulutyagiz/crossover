// ============================================================================
// HESAP XP GERİ DOLDURMA (2026-09-02) — tek seferlik.
//
// total_xp sütunu yeni; mevcut oyuncuların geçmiş emeği şuralarda yaşıyor:
//   - users.level / users.xp        → İÇİNDE bulunulan sezonun ilerlemesi
//   - season_summaries.best_level   → GEÇMİŞ sezonların zirve seviyeleri
// (Sezonlardan önce level hiç sıfırlanmıyordu; o birikim ilk devirde 2026-08
// özetine yazıldı — çift sayım yok.)
//
// total_xp = cumXpToLevel(users.level) + users.xp
//          + Σ geçmiş sezonlar cumXpToLevel(best_level)
//
// GREATEST mantığı: total_xp = GREATEST(mevcut, hesaplanan). Hesaplanan değer
// her koşuda GÜNCEL sezon ilerlemesini içerdiği için tekrar koşmak güvenlidir
// ve sunucu yeniden başlatılana kadar biriken arayı da kapatır (yeni kod
// devreye girmeden kazanılan XP total_xp'e işlenmiyor; deploy sonrası bir kez
// daha koşmak o boşluğu GREATEST ile kapatır).
//
// Kullanım:
//   npx tsx src/cli/backfill-account-xp.ts            # kuru çalışma
//   npx tsx src/cli/backfill-account-xp.ts --apply    # yazar
// ============================================================================
import { pool, closePool } from '../db/pool.ts';
import { cumXpToLevel } from '../game/level.ts';

const APPLY = process.argv.includes('--apply');

async function main(): Promise<void> {
  const { rows } = await pool.query<{
    id: string; display_name: string; level: number | null; xp: number | null;
    gecmis_seviyeler: number[] | null;
  }>(
    `SELECT u.id, u.display_name, u.level, u.xp,
            (SELECT array_agg(s.best_level) FROM season_summaries s
              WHERE s.user_id = u.id AND s.season_id IS DISTINCT FROM u.season_id) AS gecmis_seviyeler
       FROM users u`,
  );
  console.log(`aday: ${rows.length} oyuncu · kip: ${APPLY ? 'YAZILIYOR' : 'kuru çalışma'}`);

  let yazilan = 0;
  for (const u of rows) {
    let toplam = cumXpToLevel(u.level ?? 1) + (u.xp ?? 0);
    for (const bl of u.gecmis_seviyeler ?? []) toplam += cumXpToLevel(bl ?? 1);
    if (toplam <= 0) continue;
    yazilan += 1;
    if (yazilan <= 12 || toplam > 9000) {
      console.log(`  ${u.display_name.padEnd(20)} sezon L${u.level ?? 1}+${u.xp ?? 0}xp · geçmiş [${(u.gecmis_seviyeler ?? []).join(',')}] → ${toplam} XP`);
    }
    if (!APPLY) continue;
    await pool.query(
      `UPDATE users SET total_xp = GREATEST(total_xp, $2) WHERE id = $1`,
      [u.id, toplam],
    );
  }
  console.log(`\n${APPLY ? 'YAZILDI' : 'kuru çalışma bitti'}: ${yazilan} oyuncu`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
