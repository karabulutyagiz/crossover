// players.fame — CASUAL TANINIRLIK metriği (kullanıcı geri bildirimi 2026-08-31:
// "Messi/Haaland gibi çok ünlüler gelmiyor, bilinmeyenler geliyor").
//
// ESKİ metrik (DISTINCT kulüp prestij TOPLAMI) yanlıştı: çok kulüp gezen JOURNEYMAN'ları
// (Carlos Vinícius, Anelka) ödüllendirip, sadık yıldızları (Messi=37, Haaland=37,
// Kane=32) cezalandırıyordu. YENİ metrik: her kulüp döneminin
//   prestij × (o kulüpteki yıl sayısı) × (güncellik) toplamı
// → BÜYÜK kulüpte, UZUN süre, YAKIN zamanda oynayan = ünlü. Journeyman'ın kısa
// dönemleri düşük kalır. market_value (dolduğunda) küçük bonus. is_national HARİÇ.
// (server) npx tsx src/cli/populate-fame.ts
import { pool } from '../db/pool.ts';

// BİRLEŞMİŞ KAYIT FİLTRESİ (2026-09-01): aynı isimli onlarca farklı oyuncu tek
// kayıtta birleşmiş olabiliyor — 'Mehmet Yılmaz' 163 kulüp kaydıyla fame 1375
// alıp Messi'yi (271) beşe katlıyor ve Çöz Kazan'ın "çok ünlü" havuzunu
// zehirliyordu. Gerçek bir kariyerde ~15 kulüp olur; üstü veri hatasıdır ve
// fame'i 0 sayılır (havuzlara hiç girmez).
const { rowCount } = await pool.query(`
  UPDATE players p SET fame =
    CASE WHEN (SELECT count(*) FROM player_clubs pc2 WHERE pc2.player_id = p.id) > 15 THEN 0 ELSE
    COALESCE((
      SELECT SUM(
        c.prestige
        * GREATEST(1, LEAST(15, COALESCE(pc.end_year, 2025) - COALESCE(pc.start_year, pc.end_year)))  -- kulüpteki yıl (1..15)
        * GREATEST(0.25, LEAST(1.25, (COALESCE(pc.end_year, 2025) - 1998) / 27.0))                    -- güncellik (2000 sonrası ağır)
      )
      FROM player_clubs pc
      JOIN clubs c ON c.id = pc.club_id AND c.is_national = false
      WHERE pc.player_id = p.id
    ), 0)
    + COALESCE(p.market_value, 0) / 5000000.0
    END
`);
console.log(`fame (yeni tanınırlık metriği) güncellendi: ${rowCount} oyuncu`);

const { rows: pct } = await pool.query<{ p90: number; p95: number; p98: number }>(`
  SELECT percentile_cont(0.90) WITHIN GROUP (ORDER BY fame) p90,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY fame) p95,
         percentile_cont(0.98) WITHIN GROUP (ORDER BY fame) p98
  FROM players WHERE image_url IS NOT NULL AND fame > 0`);
console.log('yüzdelikler (resimli):', JSON.stringify(pct[0]));

const { rows } = await pool.query<{ name: string; fame: string }>(
  'SELECT name, fame FROM players WHERE image_url IS NOT NULL ORDER BY fame DESC LIMIT 20');
console.log('en ünlü 20:', rows.map((r) => `${r.name}:${Number(r.fame).toFixed(0)}`).join(', '));
await pool.end();
