// ============================================================================
// YOL DEVİR GERİ ÖDEMESİ (2026-09-01) — tek seferlik onarım.
//
// Sezon 1 Eylül'de döndü ve ensureSeason, ulaşılmış ama TOPLANMAMIŞ yol
// ödüllerini vermeden sildi (bugünkü düzeltmeden ÖNCE devri yaşayan herkes).
// Bu CLI, o oyunculara silinen ödülleri geri yazar.
//
// KİMLER: season_id = güncel sezon OLAN (yani devri yaşamış) ve geçen sezon
// için season_summaries.best_level kaydı bulunan herkes.
//
// NE KADAR: 1..best_level arası v2 ödül tablosu, ŞU düşülerek:
//   - elmas taşıyan seviyelerden geçen sezon defterde LEVEL_CLAIM kaydı
//     olanlar (idempotency_key = levelclaim:{uid}:{sezon|legacy}:{şerit}:{n})
//   - yalnız güç taşıyan seviyelerin toplanıp toplanmadığı BİLİNEMEZ (deftere
//     düşmezler) — oyuncu lehine verilir; en kötü durumda birkaç tek
//     kullanımlık güç mükerrer olur, elmas mükerrer OLMAZ.
// Premium şerit yalnız geçen sezon premium izi olanlara (premium claim ya da
// PREMIUM_ROAD_PURCHASE defter kaydı) işlenir.
//
// GÜVENCE: kullanıcı başına idempotency_key = seasonroadgrant:{uid}:{sezon} —
// hem bu CLI'ın tekrar çalıştırılmasına hem yeni rollover koduyla çakışmaya
// karşı. Kayıt varsa oyuncu ATLANIR. Kozmetik/çerçeve DISTINCT merge; sahip
// olunana telafi elması yazılmaz.
//
// Kullanım:
//   npx tsx src/cli/road-rollover-refund.ts            # KURU ÇALIŞMA (yazmaz)
//   npx tsx src/cli/road-rollover-refund.ts --apply    # gerçekten yazar
// ============================================================================
import { pool, closePool } from '../db/pool.ts';
import { roadLeftovers } from '../game/level.ts';
import { currentSeasonId } from '../game/rank.ts';

const APPLY = process.argv.includes('--apply');

function oncekiSezon(cur: string): string {
  const [y, m] = cur.split('-').map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) - 1, 1));
  return d.toISOString().slice(0, 7);
}

async function main(): Promise<void> {
  const cur = currentSeasonId();
  const eski = oncekiSezon(cur);
  console.log(`sezon: ${eski} → ${cur} · kip: ${APPLY ? 'YAZILIYOR' : 'kuru çalışma'}`);

  const { rows: adaylar } = await pool.query<{
    id: string; display_name: string; best_level: number;
    owned_cosmetics: string[] | null;
  }>(
    `SELECT u.id, u.display_name, s.best_level, u.owned_cosmetics
       FROM users u
       JOIN season_summaries s ON s.user_id = u.id AND s.season_id = $2
      WHERE u.season_id = $1
        AND s.best_level >= 1
        AND NOT EXISTS (SELECT 1 FROM diamond_ledger dl
                         WHERE dl.idempotency_key = 'seasonroadgrant:' || u.id || ':' || $2)
      ORDER BY s.best_level DESC`,
    [cur, eski],
  );
  console.log(`aday: ${adaylar.length} oyuncu (devri yaşamış, geri ödemesi yazılmamış)`);

  let toplamElmas = 0; let islenen = 0;
  for (const u of adaylar) {
    // Geçen sezonun defter kayıtlarından toplanmış seviyeleri çıkar.
    const { rows: defter } = await pool.query<{ idempotency_key: string }>(
      `SELECT idempotency_key FROM diamond_ledger
        WHERE user_id = $1 AND reason = 'LEVEL_CLAIM'
          AND (idempotency_key LIKE 'levelclaim:' || $1 || ':' || $2 || ':%'
            OR idempotency_key LIKE 'levelclaim:' || $1 || ':legacy:%')`,
      [u.id, eski],
    );
    const toplananFree: number[] = []; const toplananPrem: number[] = [];
    for (const r of defter) {
      const m = /:(free|premium):(\d+)$/.exec(r.idempotency_key);
      if (!m) continue;
      (m[1] === 'premium' ? toplananPrem : toplananFree).push(Number(m[2]));
    }
    const { rows: prem } = await pool.query<{ var: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM diamond_ledger
                       WHERE user_id = $1
                         AND (reason = 'PREMIUM_ROAD_PURCHASE'
                           OR idempotency_key LIKE 'levelclaim:' || $1 || ':%:premium:%')) AS var`,
      [u.id],
    );
    const premiumVardi = prem[0]?.var === true;

    const kalan = roadLeftovers(u.best_level, toplananFree, toplananPrem, premiumVardi);
    // ELMASSIZ (kullanıcı kararı 2026-09-01): bu tek seferlik onarımda yalnız
    // güç + çerçeve + kozmetik verilir. 323 oyuncuya toplu 75.460💎 basmak
    // ekonomi kararıydı ve "elmassız ver" dendi. İleriki sezon devirlerinde
    // rank.ts'teki otomatik toplama tam verir (oyuncu elle toplasa aynısını
    // alırdı) — yalnız 2026-08→09 geçişi bu kararla elmassız.
    kalan.diamonds = 0;
    // Sahip olunan kozmetiği çıkar — merge zaten korur ama log dürüst olsun.
    kalan.cosmetics = kalan.cosmetics.filter((c) => !(u.owned_cosmetics ?? []).includes(c));
    if (kalan.claimedCount === 0) continue;

    toplamElmas += kalan.diamonds; islenen += 1;
    const guclar = Object.entries(kalan.columnBumps).map(([c, n]) => `${c}+${n}`).join(' ');
    console.log(`  ${u.display_name.padEnd(20)} L${String(u.best_level).padStart(2)}${premiumVardi ? ' [premium]' : ''} → ${kalan.diamonds}💎 ${guclar}${kalan.frames.length ? ' çerçeve:' + kalan.frames.join(',') : ''}${kalan.cosmetics.length ? ' kozmetik:' + kalan.cosmetics.join(',') : ''}`);

    if (!APPLY) continue;
    const sets: string[] = []; const params: unknown[] = [u.id];
    if (kalan.diamonds > 0) { params.push(kalan.diamonds); sets.push(`diamonds = diamonds + $${params.length}`); }
    for (const [col, adet] of Object.entries(kalan.columnBumps)) {
      if (!/^(power|sp)_[a-z0-9_]+$/.test(col)) continue;
      sets.push(`${col} = ${col} + ${Number(adet)}`);
    }
    if (kalan.frames.length) { params.push(kalan.frames); sets.push(`owned_frames = (SELECT ARRAY(SELECT DISTINCT f FROM unnest(owned_frames || $${params.length}::text[]) AS f))`); }
    if (kalan.cosmetics.length) { params.push(kalan.cosmetics); sets.push(`owned_cosmetics = (SELECT ARRAY(SELECT DISTINCT c FROM unnest(owned_cosmetics || $${params.length}::text[]) AS c))`); }
    if (!sets.length) continue;
    const { rows: sonuc } = await pool.query<{ diamonds: number }>(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING diamonds`, params);
    // İdempotens kaydı elmas 0 olsa bile yazılır (amount=0 ile) — tekrar koşuda atlanır.
    await pool.query(
      `INSERT INTO diamond_ledger (idempotency_key, user_id, amount, balance_before, balance_after, reason, reference_id, metadata)
       VALUES ($1, $2, $3, $4, $5, 'LEVEL_CLAIM', $6, '{}'::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [`seasonroadgrant:${u.id}:${eski}`, u.id, kalan.diamonds,
       Number(sonuc[0]?.diamonds ?? 0) - kalan.diamonds, Number(sonuc[0]?.diamonds ?? 0),
       `seasonrollover:${eski}`],
    );
  }
  console.log(`\n${APPLY ? 'YAZILDI' : 'kuru çalışma bitti'}: ${islenen} oyuncu · toplam ${toplamElmas}💎`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closePool());
