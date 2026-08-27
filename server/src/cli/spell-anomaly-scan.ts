// ============================================================================
// SPELL ANOMALİ TARAMASI (2026-08-27) — Wikidata vandalizmi avcısı.
//
// Tetikleyici olay: İlkay Gündoğan'a sahte Beşiktaş 2016/2021 + Orduspor 2018
// spell'leri eklenmiş (Man City 2016-2023 ile çakışık). Böyle veriler hem maç
// doğrulamasında yanlış cevapları KABUL ettirir hem klip/günlük soru reveal'ını
// rezil eder. OTOMATİK SİLME YOK — kiralık transferler meşru çakışma üretir;
// bu araç yalnız İNSAN İNCELEMESİ için şüpheli liste basar.
//
// Sinyal: aynı oyuncunun FARKLI ÜLKELERDEKİ iki kulüpte ≥2 yıl çakışan spell'i
// (kiralıklar tipik ≤1 yıl). Şüpheliler kariyer derinliğine göre sıralanır —
// vandalizm yıldızları hedefler, liste başı en kritik olandır.
//
// Kullanım: npx tsx src/cli/spell-anomaly-scan.ts [--min-overlap 2] [--limit 50]
// Temizlik: çıktıdaki spell'ler elle doğrulanıp SQL ile silinir (deploy/ notu).
// ============================================================================
import { pool, closePool } from '../db/pool.ts';

function arg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

async function main(): Promise<void> {
  const minOverlap = arg('--min-overlap', 2);
  const limit = arg('--limit', 50);
  const { rows } = await pool.query<{
    player: string; player_id: number; career: number;
    anomaly_count: number; club_a: string; country_a: string; span_a: string;
    club_b: string; country_b: string; span_b: string;
    overlap: number;
  }>(
    `WITH spans AS (
       -- Açık uçlu spell (end_year NULL) bugünün yılına KIRPILIR: "hâlâ orada"
       -- kayıtları 2100'e uzatmak 75 yıllık sahte çakışmalar üretiyordu.
       SELECT pc.player_id, pc.club_id, pc.start_year,
              COALESCE(pc.end_year, EXTRACT(YEAR FROM now())::int) AS end_eff,
              pc.end_year, c.name AS club, c.country
         FROM player_clubs pc JOIN clubs c ON c.id = pc.club_id
        WHERE c.is_national = FALSE AND pc.start_year IS NOT NULL AND c.country IS NOT NULL
     ), hits AS (
       SELECT a.player_id,
              a.club AS club_a, a.country AS country_a, a.start_year || '-' || COALESCE(a.end_year::text, '…') AS span_a,
              b.club AS club_b, b.country AS country_b, b.start_year || '-' || COALESCE(b.end_year::text, '…') AS span_b,
              LEAST(a.end_eff, b.end_eff) - GREATEST(a.start_year, b.start_year) AS overlap
         FROM spans a
         JOIN spans b ON b.player_id = a.player_id AND b.club_id > a.club_id AND b.country <> a.country
        WHERE LEAST(a.end_eff, b.end_eff) - GREATEST(a.start_year, b.start_year) >= $1
     )
     -- Oyuncu başına EN KÖTÜ çakışma + toplam şüpheli sayısı (liste boğulmasın).
     SELECT DISTINCT ON (h.player_id)
            p.name AS player, p.id AS player_id,
            (SELECT COUNT(*) FROM player_clubs x WHERE x.player_id = p.id) AS career,
            (SELECT COUNT(*) FROM hits h2 WHERE h2.player_id = h.player_id) AS anomaly_count,
            h.club_a, h.country_a, h.span_a, h.club_b, h.country_b, h.span_b, h.overlap
       FROM hits h JOIN players p ON p.id = h.player_id
      ORDER BY h.player_id, h.overlap DESC`,
    [minOverlap],
  ).then((res) => ({ rows: res.rows.sort((x, y) => Number(y.career) - Number(x.career)).slice(0, limit) }));
  if (!rows.length) {
    console.log('Şüpheli çapraz-ülke spell çakışması bulunamadı.');
    return;
  }
  console.log(`${rows.length} şüpheli çakışma (≥${minOverlap} yıl, farklı ülke) — İNSAN İNCELEMESİ GEREKİR:\n`);
  for (const r of rows) {
    console.log(`  ${r.player} [id ${r.player_id}, kariyer ${r.career}, ${r.anomaly_count} şüpheli çift]`);
    console.log(`    ${r.club_a} (${r.country_a}) ${r.span_a}  ×  ${r.club_b} (${r.country_b}) ${r.span_b}  — çakışma ${r.overlap} yıl`);
  }
  console.log('\nSilme şablonu (spell doğrulandıktan SONRA):');
  console.log(`  DELETE FROM player_clubs WHERE player_id = <id> AND club_id = (SELECT id FROM clubs WHERE name = '<club>') AND start_year = <yıl>;`);
}

main().catch((err) => { console.error('scan failed:', err); process.exitCode = 1; }).finally(closePool);
