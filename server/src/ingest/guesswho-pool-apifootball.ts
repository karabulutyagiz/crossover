// "Ben Kimim?" havuzunu API-FOOTBALL'dan tamamlar (TM API tüneli gerekmez; free
// plan = 100 istek/gün → bütçe korumalı ve TEKRAR ÇALIŞTIRILABİLİR tasarım).
// Neden: TM-tabanlı guesswho-pool.ts yalnız players tablosunda FOTOLU kayıtları
// alıyordu — hiç transfer geçmişi olmayan akademi çıkışları (ör. Lamine Yamal,
// 2026-09-03 kullanıcı raporu) players'ta yok diye havuza hiç giremiyordu.
// Akış (lig lig, argümanla seçilir):
//   /teams?league&season=2023   → lig kulüpleri (free plan 2021-23 sezonlarına izinli;
//                                 kulüp id'leri sezondan bağımsız, terfi edenler eksik olabilir)
//   /players/squads?team=X      → GÜNCEL kadro: ad + forma no + yaş + foto (kulüp başı 1 istek)
//   /players/profiles?player=X  → yalnız YENİ oyuncular için doğum tarihi + uyruk (oyuncu başı 1)
// Eşleştirme: önce KULÜP bağlamında (pool + player_clubs) soyad/trigram, sonra global
// trigram. Bulunamayan → players'a SENTETİK id ile eklenir (legends deseni: 990100000+apiId).
// Bütçe biterse kalan profiller .cache/gw-af-pending.json'a yazılır — ertesi gün
// aynı komut kaldığı yerden tamamlar. Taze kulüpler (≤3 gün) atlanır → tekrar bedava.
// Kullanım: tsx src/ingest/guesswho-pool-apifootball.ts [ES1 TR1 GB1 IT1 L1 FR1 NL1 PO1]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pool } from '../db/pool.ts';
import { normalize } from '../game/normalize.ts';

const KEY = process.env.API_FOOTBALL_KEY ?? '';
const BASE = 'https://v3.football.api-sports.io';
const MAX_REQ = Number(process.env.GW_AF_MAX ?? '80');
const SYN_BASE = 990_100_000; // sentetik players.id = SYN_BASE + apiFootballId (legends 990000000+ ile çakışmaz)
const PENDING_FILE = new URL('../../.cache/gw-af-pending.json', import.meta.url).pathname;
const FETCHED_FILE = new URL('../../.cache/gw-af-fetched.json', import.meta.url).pathname;
const FRESH_DAYS = 3;
// API-Football kulüp adı → bizim clubs.name_norm (trigram/kapsamanın tutmadığı bilinen adlar)
const CLUB_ALIAS: Record<string, string> = { 'athletic club': 'athletic bilbao' };

// Lig kodu (clubs.league) → API-Football lig id (verify.ts LEAGUE_LOGOS ile aynı id'ler)
const AF_LEAGUE: Record<string, number> = { GB1: 39, ES1: 140, IT1: 135, L1: 78, FR1: 61, TR1: 203, NL1: 88, PO1: 94 };
const DEFAULT_ORDER = ['ES1', 'TR1', 'GB1', 'IT1', 'L1', 'FR1', 'NL1', 'PO1'];
const COARSE_POS: Record<string, string> = { Goalkeeper: 'GK', Defender: 'CB', Midfielder: 'MF', Attacker: 'ST' };

let used = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Free plan: 100/GÜN ve 10/DAKİKA — her istekten önce ~6,3 sn beklenir; dakika
// limitine takılırsa bütçe SAYILMADAN 62 sn bekleyip yeniden denenir (ilk sürüm
// limit hatalarını da bütçeden düşüp günü boşa harcamıştı, 2026-09-03).
async function af(path: string): Promise<any | null> {
  if (used >= MAX_REQ) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(6300);
    try {
      const res = await fetch(BASE + path, { headers: { 'x-apisports-key': KEY } });
      if (!res.ok) { used++; return null; }
      const j = (await res.json()) as any;
      if (j.errors && Object.keys(j.errors).length) {
        if (JSON.stringify(j.errors).includes('rateLimit')) { console.log('  dakika limiti — 62 sn bekleniyor'); await sleep(62_000); continue; }
        console.log('  API hatası:', JSON.stringify(j.errors)); used++; return null;
      }
      used++;
      return j;
    } catch { await sleep(3000); }
  }
  used++;
  return null;
}

/** "W. Szczęsny" → soyad kısmı ("szczesny"); tam adlarda son iki kelimeye kadar. */
function surnameOf(norm: string): string {
  const parts = norm.replace(/\b[a-z]\b/g, '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(-Math.min(2, parts.length)).join(' ') || norm;
}

interface Pending { apiId: number; name: string; number: number | null; age: number | null; tmClubId: number; pos: string | null; photo: string }

async function upsertPool(playerId: number, tmClubId: number, jersey: number | null, birth: string | null, pos: string | null): Promise<void> {
  // Mevcut İYİ veri korunur: TM'den gelen gerçek doğum tarihi / ince mevki, buradaki
  // yaklaşık değerlerle EZİLMEZ. Forma no güncel kadrodan geldiği için tazelenir.
  await pool.query(
    `INSERT INTO guess_who_pool (player_id, current_club_id, jersey_number, birth_date, position, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (player_id) DO UPDATE SET
       current_club_id=EXCLUDED.current_club_id,
       jersey_number=COALESCE(EXCLUDED.jersey_number, guess_who_pool.jersey_number),
       birth_date=COALESCE(guess_who_pool.birth_date, EXCLUDED.birth_date),
       position=COALESCE(guess_who_pool.position, EXCLUDED.position), updated_at=now()`,
    [playerId, tmClubId, jersey, birth, pos],
  );
}

/** Profil isteğiyle YENİ oyuncuyu tam veriyle yaz; bütçe yoksa yaklaşıkla (yaş→1 Tem doğum). */
async function insertNew(p: Pending, withProfile: boolean): Promise<boolean> {
  const synId = SYN_BASE + p.apiId;
  let birth: string | null = p.age != null ? `${new Date().getFullYear() - p.age}-07-01` : null;
  let nat: string | null = null;
  let name = p.name;
  let pos = p.pos;
  if (withProfile) {
    const prof = await af(`/players/profiles?player=${p.apiId}`);
    const pl = prof?.response?.[0]?.player;
    if (pl) {
      if (typeof pl.birth?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pl.birth.date)) {
        birth = pl.birth.date;
        // Sentetik kayıt daha önce YAKLAŞIK doğumla girdiyse kesin tarih onu ezsin
        // (upsertPool COALESCE eskiyi korur; profil verisi her zaman daha doğru).
        await pool.query('UPDATE guess_who_pool SET birth_date=$2 WHERE player_id=$1', [synId, birth]);
      }
      nat = pl.nationality ?? null;
      if (pl.name) name = pl.name;
      pos = COARSE_POS[pl.position as string] ?? pos;
    } else if (used >= MAX_REQ) return false; // bütçe bitti → pending'de kalsın
  }
  await pool.query(
    `INSERT INTO players (id, name, name_norm, nationality, image_url, birth_year)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET
       nationality=COALESCE(players.nationality, EXCLUDED.nationality),
       image_url=COALESCE(players.image_url, EXCLUDED.image_url),
       birth_year=COALESCE(players.birth_year, EXCLUDED.birth_year)`,
    [synId, name, normalize(name), nat, p.photo, birth ? Number(birth.slice(0, 4)) : null],
  );
  await upsertPool(synId, p.tmClubId, p.number, birth, pos);
  return true;
}

async function main() {
  if (!KEY) { console.error('API_FOOTBALL_KEY yok'); process.exit(1); }
  const leagues = (process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ORDER).filter((l) => AF_LEAGUE[l]);
  mkdirSync(new URL('../../.cache', import.meta.url).pathname, { recursive: true });
  let pending: Pending[] = [];
  try { pending = JSON.parse(readFileSync(PENDING_FILE, 'utf8')); } catch { /* ilk çalıştırma */ }
  const carried = pending.length; // dosyadan devralınan (bu koşuda keşfedilenler sona eklenir)
  let fetched: Record<string, number> = {};
  try { fetched = JSON.parse(readFileSync(FETCHED_FILE, 'utf8')); } catch { /* ilk çalıştırma */ }

  // 1) Önceki günden kalan YENİ-oyuncu profilleri (bütçenin yarısına kadar;
  //    çok küçük bütçeli acil çalıştırmalarda atlanır — kadrolar önceliklidir)
  let drained = 0;
  while (MAX_REQ >= 30 && pending.length && used < Math.floor(MAX_REQ / 2)) {
    const p = pending[0]!;
    if (await insertNew(p, true)) { pending.shift(); drained++; } else break;
  }
  if (drained) console.log(`bekleyenden tamamlanan: ${drained} (kalan ${pending.length})`);

  let matched = 0, added = 0, newQueued = 0, skippedAmb = 0;
  for (const lg of leagues) {
    if (used >= MAX_REQ - 1) break;
    const teams = await af(`/teams?league=${AF_LEAGUE[lg]}&season=2023`);
    // Düşük API id ≈ köklü/büyük kulüp (Barcelona 529 gibi) — bütçe kısıtlıysa
    // yıldız kadrolar önce işlensin diye id'ye göre sıralanır.
    const list: { id: number; name: string }[] = (teams?.response ?? []).map((r: any) => r.team).sort((a: any, b: any) => a.id - b.id);
    console.log(`\n=== ${lg}: ${list.length} kulüp (API-Football) — istek ${used}/${MAX_REQ} ===`);
    for (const team of list) {
      if (used >= MAX_REQ - 1) { console.log('bütçe doldu — kalan kulüpler yarınki çalıştırmada'); break; }
      // API kulübü → bizim clubs (aynı ligde ad benzerliği)
      const tnorm = CLUB_ALIAS[normalize(team.name)] ?? normalize(team.name);
      // Benzerlik VEYA kapsama: bizim ad kısaysa ("psv" ⊂ "psv eindhoven") trigram düşük kalıyor.
      const crow = (await pool.query(
        `SELECT id, name, similarity(name_norm, $2) s,
                (name_norm <> '' AND (position(name_norm in $2) > 0 OR position($2 in name_norm) > 0)) AS contained
           FROM clubs WHERE league=$1 ORDER BY contained DESC, s DESC LIMIT 1`,
        [lg, tnorm],
      )).rows[0];
      if (!crow || (Number(crow.s) < 0.35 && !crow.contained)) { console.log(`  ? kulüp eşleşmedi: ${team.name}`); continue; }
      const tmClubId = Number(crow.id);
      // Tazelik: BU SCRIPT'in kendi durum dosyası (pool.updated_at olmaz — TM ingest'i
      // de dokunuyor, dünkü koşuda ES1'i komple yanlış atlattı, 2026-09-03).
      const last = fetched[String(team.id)];
      if (last && Date.now() - last < FRESH_DAYS * 86_400_000) continue;
      const squad = await af(`/players/squads?team=${team.id}`);
      const players: any[] = squad?.response?.[0]?.players ?? [];
      if (!players.length) continue;
      fetched[String(team.id)] = Date.now();
      writeFileSync(FETCHED_FILE, JSON.stringify(fetched));
      // Kulüp bağlamı: havuzdaki + transfer geçmişi bu kulübü içeren oyuncular
      const ctx = (await pool.query(
        `SELECT DISTINCT p.id, p.name_norm FROM players p
          WHERE p.id IN (SELECT player_id FROM guess_who_pool WHERE current_club_id=$1
                         UNION SELECT player_id FROM player_clubs WHERE club_id=$1)`,
        [tmClubId],
      )).rows.map((r: any) => ({ id: Number(r.id), norm: String(r.name_norm) }));
      let clubAdd = 0;
      for (const sp of players) {
        const norm = normalize(String(sp.name));
        const surname = surnameOf(norm);
        const coarse = COARSE_POS[sp.position as string] ?? null;
        // 1) kulüp bağlamında soyad içeren adaylar
        const inCtx = ctx.filter((c) => c.norm.includes(surname));
        if (inCtx.length === 1) {
          matched++; clubAdd++;
          await pool.query(`UPDATE players SET image_url=COALESCE(image_url, $2) WHERE id=$1`, [inCtx[0]!.id, String(sp.photo ?? '') || null]);
          await upsertPool(inCtx[0]!.id, tmClubId, sp.number ?? null, sp.age != null ? `${new Date().getFullYear() - sp.age}-07-01` : null, coarse);
          continue;
        }
        // 2) global trigram (tam ad) — kısaltmalı adlar genelde 1'de çözülür
        const g = (await pool.query(
          `SELECT id, similarity(name_norm, $1) s FROM players WHERE name_norm % $1 ORDER BY s DESC LIMIT 2`,
          [norm],
        )).rows;
        const s0 = g[0] ? Number(g[0].s) : 0; const s1 = g[1] ? Number(g[1].s) : 0;
        if (g[0] && s0 >= 0.62 && s0 - s1 >= 0.12) {
          matched++; clubAdd++;
          await pool.query(`UPDATE players SET image_url=COALESCE(image_url, $2) WHERE id=$1`, [Number(g[0].id), String(sp.photo ?? '') || null]);
          await upsertPool(Number(g[0].id), tmClubId, sp.number ?? null, sp.age != null ? `${new Date().getFullYear() - sp.age}-07-01` : null, coarse);
        } else if (s0 < 0.45 && inCtx.length === 0) {
          // Gerçek YENİ oyuncu (Yamal deseni) — profil kuyruğuna
          pending.push({ apiId: Number(sp.id), name: String(sp.name), number: sp.number ?? null, age: sp.age ?? null, tmClubId, pos: coarse, photo: String(sp.photo ?? '') });
          newQueued++;
        } else skippedAmb++; // belirsiz — yanlış birleştirme riskine girme
      }
      console.log(`  ${crow.name}: eşleşen +${clubAdd}, kadro ${players.length} — istek ${used}/${MAX_REQ}`);
    }
  }

  // 2) Yeni oyuncular: kalan bütçeyle profil çek; yetmeyenler yaklaşık veriyle girer
  //    ve pending'e yazılır → yarın profille zenginleşir (players/pool COALESCE korur).
  const stillPending: Pending[] = [];
  // Bu koşuda keşfedilen YENİLER önce (kullanıcının raporladığı eksikler tazedir);
  // devralınanlar kalan bütçeyle, yetmezse yarına devreder.
  for (const p of [...pending.slice(carried), ...pending.slice(0, carried)]) {
    const withProfile = used < MAX_REQ;
    await insertNew(p, withProfile);
    added++;
    if (!withProfile) stillPending.push(p);
  }
  writeFileSync(PENDING_FILE, JSON.stringify(stillPending));
  const cnt = (await pool.query('SELECT count(*) FROM guess_who_pool')).rows[0];
  console.log(`\n✓ Bitti. eşleşen=${matched}, yeni eklenen=${added} (profilsiz kalan=${stillPending.length}), belirsiz atlanan=${skippedAmb}, istek=${used}/${MAX_REQ}, havuz=${cnt.count}`);
  await pool.end();
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
