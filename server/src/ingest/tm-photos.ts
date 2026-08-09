// Oyuncu portrelerini Transfermarkt'tan YENİDEN ÇEK ve players.image_url'e yaz.
//
// Neden: eski crossoverfootball.com/media/players/*.jpg dosyaları AWS→yeni sunucu
// taşımasında kayboldu (hepsi 404). TM portre URL'leri (img.a.transfermarkt.technology)
// telefonda DOĞRUDAN açılıyor; burada her oyuncu için güncel (zaman-damgalı) URL'yi
// TM API'sinden alıp DB'ye yazıyoruz. Uygulama güncellemesi GEREKMEZ — geldikçe canlıda görünür.
//
// Öncelik: kulüp popülerliğine (fame) göre ÜNLÜ oyuncular önce → maçlarda çıkanlar hızlı dolar.
// Dayanıklı: yalnız bozuk/eksik fotoları hedefler; tekrar çalıştırılınca kaldığı yeri toplar.
import { pool, closePool } from '../db/pool.ts';

const TM_API = process.env.TM_API ?? 'http://tm-api:8000';
const CONCURRENCY = Number(process.env.TM_PHOTO_CONCURRENCY ?? '4');
const DELAY = Number(process.env.TM_PHOTO_DELAY ?? '250');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Result = { kind: 'url'; url: string } | { kind: 'none' } | { kind: 'error' };

async function fetchImage(id: number): Promise<Result> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 30000);
  try {
    const r = await fetch(`${TM_API}/players/${id}/profile`, { signal: c.signal });
    if (!r.ok) return { kind: 'error' };
    const d = (await r.json()) as { imageUrl?: string; imageURL?: string; image?: string };
    const u = d.imageUrl ?? d.imageURL ?? d.image ?? null;
    if (typeof u === 'string' && u.startsWith('http') && !/default/i.test(u)) return { kind: 'url', url: u };
    return { kind: 'none' }; // profil geldi ama gerçek foto yok → temiz fallback
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

async function run(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(`
    SELECT p.id
    FROM players p
    JOIN player_clubs pc ON pc.player_id = p.id
    JOIN clubs c ON c.id = pc.club_id
    WHERE p.image_url IS NULL OR p.image_url LIKE '%crossoverfootball.com%'
    GROUP BY p.id
    ORDER BY COALESCE(MAX(c.popularity), 0) DESC`);
  console.log(`TM photos: ${rows.length} players to (re)fetch — famous first`);

  let idx = 0;
  let done = 0;
  let ok = 0;
  let none = 0;
  let err = 0;

  async function worker(): Promise<void> {
    while (idx < rows.length) {
      const id = Number(rows[idx++]!.id);
      const res = await fetchImage(id);
      if (res.kind === 'url') {
        await pool.query('UPDATE players SET image_url = $2 WHERE id = $1', [id, res.url]);
        ok++;
      } else if (res.kind === 'none') {
        // Kesin foto yok → NULL yap ki uygulama bozuk görsel yerine temiz kişi-ikonu göstersin.
        await pool.query(`UPDATE players SET image_url = NULL WHERE id = $1`, [id]);
        none++;
      } else {
        err++; // geçici hata (TM engeli/timeout) → dokunma, sonraki çalıştırma tekrar dener
      }
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${rows.length}  ok=${ok} none=${none} err=${err}`);
      await sleep(DELAY);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`TM photos DONE: ${ok} güncellendi, ${none} fotosuz(→null), ${err} hata (tekrar denenebilir)`);
}

run()
  .catch((err) => { console.error('tm-photos failed:', err); process.exitCode = 1; })
  .finally(closePool);
