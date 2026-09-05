// "Ben Kimim?" havuz ingest'i: 5 büyük lig + Süper Lig GÜNCEL kadrolarını
// Transfermarkt'tan çekip guess_who_pool'a yazar.
//   /competitions/{comp}/clubs  → ligdeki güncel kulüpler
//   /clubs/{id}/players         → kadro (yaş/doğum, uyruk, mevki, kulüp) TEK çağrı
//   /players/{id}/jersey_numbers→ güncel forma no (oyuncu-başı, yavaş; rate-limit'li)
// Havuza YALNIZ DB'de fotoğrafı olan + kulübü clubs tablosunda bulunan oyuncular girer
// (foto mod için şart). Resume: guess_who_pool'da olan oyuncu tekrar jersey ÇEKMEZ.
// Kullanım: tsx src/ingest/guesswho-pool.ts [maxClubsPerLeague]
//   TM_API_URL (varsayılan http://localhost:8000) — lokal geliştirmede SSH tüneli.
import { pool } from '../db/pool.ts';

const TM = process.env.TM_API_URL ?? 'http://localhost:8000';
const LEAGUES: { comp: string; name: string }[] = [
  { comp: 'GB1', name: 'Premier League' },
  { comp: 'ES1', name: 'LaLiga' },
  { comp: 'IT1', name: 'Serie A' },
  { comp: 'L1', name: 'Bundesliga' },
  { comp: 'FR1', name: 'Ligue 1' },
  { comp: 'TR1', name: 'Süper Lig' },
];
const MAX_CLUBS = Number(process.argv[2] ?? '0') || Infinity; // test için lig başı kulüp sınırı

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tmGet<T = any>(path: string, tries = 6): Promise<T | null> {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(TM + path);
      if (res.status === 403 || res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) return null; // 404 vb. → yok say
      return (await res.json()) as T;
    } catch {
      await sleep([1500, 3000, 6000, 10000, 15000, 20000][Math.min(a, 5)] ?? 20000);
    }
  }
  return null;
}

// TM mevki metni → 8-kod (player_positions ile aynı: GK|CB|RB|LB|MF|LW|RW|ST)
function posCode(s: string | null | undefined): string | null {
  const p = (s ?? '').toLowerCase();
  if (!p) return null;
  if (p.includes('goalkeeper')) return 'GK';
  if (p.includes('left-back') || p.includes('left back')) return 'LB';
  if (p.includes('right-back') || p.includes('right back')) return 'RB';
  if (p.includes('back') || p.includes('defender') || p.includes('sweeper')) return 'CB';
  if (p.includes('left winger')) return 'LW';
  if (p.includes('right winger')) return 'RW';
  if (p.includes('midfield')) return 'MF';
  if (p.includes('winger')) return p.includes('left') ? 'LW' : 'RW';
  if (p.includes('striker') || p.includes('forward')) return 'ST';
  return null;
}

function currentJersey(jerseys: { season?: string; club?: string; jerseyNumber?: number }[], clubId: number): number | null {
  if (!jerseys.length) return null;
  // En yeni sezon önce gelir; önce güncel kulübe ait olanı, yoksa en yeniyi al.
  const forClub = jerseys.find((j) => Number(j.club) === clubId && j.jerseyNumber != null);
  const pick = forClub ?? jerseys.find((j) => j.jerseyNumber != null);
  return pick?.jerseyNumber ?? null;
}

async function main() {
  let added = 0, skippedNoPhoto = 0, skippedNoClub = 0, examined = 0;
  const t0 = Date.now();
  for (const lg of LEAGUES) {
    const comp = await tmGet<{ clubs?: { id: string; name: string }[] }>(`/competitions/${lg.comp}/clubs`);
    const clubs = (comp?.clubs ?? []).slice(0, MAX_CLUBS);
    console.log(`\n=== ${lg.name}: ${clubs.length} kulüp ===`);
    for (const club of clubs) {
      const clubId = Number(club.id);
      // Kulüp bizim clubs tablosunda mı? (logo + lig için şart)
      const clubRow = (await pool.query('SELECT id FROM clubs WHERE id=$1', [clubId])).rows[0];
      if (!clubRow) { skippedNoClub++; continue; }
      const squad = await tmGet<{ players?: any[] }>(`/clubs/${clubId}/players`);
      const players = squad?.players ?? [];
      let clubAdded = 0;
      for (const sp of players) {
        examined++;
        const pid = Number(sp.id);
        if (!Number.isFinite(pid)) continue;
        // Foto şart: DB'de var mı + image_url dolu mu?
        const prow = (await pool.query('SELECT id, image_url, nationality FROM players WHERE id=$1', [pid])).rows[0];
        if (!prow || !prow.image_url) { skippedNoPhoto++; continue; }
        // Zaten havuzdaysa jersey'i tekrar çekme (resume)
        const exists = (await pool.query('SELECT 1 FROM guess_who_pool WHERE player_id=$1', [pid])).rowCount;
        let jersey: number | null = null;
        if (!exists) {
          const jn = await tmGet<{ jerseyNumbers?: any[] }>(`/players/${pid}/jersey_numbers`);
          jersey = currentJersey(jn?.jerseyNumbers ?? [], clubId);
          await sleep(120);
        }
        const birth = typeof sp.dateOfBirth === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.dateOfBirth) ? sp.dateOfBirth : null;
        const pos = posCode(sp.position);
        // Uyruk DB'de eksikse kadrodan doldur (mod players.nationality okur)
        if ((!prow.nationality || prow.nationality === '') && Array.isArray(sp.nationality) && sp.nationality[0]) {
          await pool.query('UPDATE players SET nationality=$2 WHERE id=$1', [pid, String(sp.nationality[0])]);
        }
        await pool.query(
          `INSERT INTO guess_who_pool (player_id, current_club_id, jersey_number, birth_date, position, updated_at)
           VALUES ($1,$2,$3,$4,$5, now())
           ON CONFLICT (player_id) DO UPDATE SET
             current_club_id=EXCLUDED.current_club_id, birth_date=EXCLUDED.birth_date,
             position=COALESCE(EXCLUDED.position, guess_who_pool.position),
             jersey_number=COALESCE(EXCLUDED.jersey_number, guess_who_pool.jersey_number), updated_at=now()`,
          [pid, clubId, jersey, birth, pos],
        );
        added++; clubAdded++;
      }
      console.log(`  ${club.name} (${clubId}): +${clubAdded} (kadro ${players.length})`);
    }
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`\n✓ Bitti. eklenen/güncellenen=${added}, fotosuz atlanan=${skippedNoPhoto}, kulüpsüz=${skippedNoClub}, incelenen=${examined}, süre=${secs}s`);
  await pool.end();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
