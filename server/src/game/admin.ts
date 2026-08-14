// Admin paneli istatistikleri — tüm toplamalar tek yerden.
//
// %100 GERÇEK istatistik kuralı (kullanıcı talebi):
//   1) Yayın tarihi ÖNCESİ sayılmaz. Oyun 04.08.2026'da yayınlandı; öncesi test
//      aşamasıdır. Her sorgu bu tarihten itibaren (İstanbul) filtrelenir.
//   2) Test/dev hesapları hariç (satın alımlar dahil). Kaynak: rank.ts DEV_ACCOUNTS.
// Canlı sayaçlar (o an çevrimiçi / maçta / kuyrukta) bellekten `live` gelir.
// Yetkilendirme ws/server.ts'te (ADMIN_TOKEN) yapılır.
import { pool } from '../db/pool.ts';
import type { MatchInfo } from '../rooms/manager.ts';

// ── %100 gerçek filtreleri ──────────────────────────────────────────────────
// Yayın günü (Europe/Istanbul). Değişirse burayı güncelle.
const LAUNCH_TS = `(TIMESTAMP '2026-08-04 00:00' AT TIME ZONE 'Europe/Istanbul')`;
// Test/dev hesapları — istatistiklerin tamamından çıkarılır. Yeni test hesabı
// eklemek istersen buraya adını (küçük harf) ekle.
const TEST_ACCOUNTS = ['yagiz', 'bloodsucker'];
// SQL parça: verilen display_name sütununun test hesabı OLMADIĞINI garanti eder.
// Sabit liste (kullanıcı girdisi değil) — enjeksiyon riski yok.
const notTest = (col = 'display_name') =>
  `lower(${col}) NOT IN (${TEST_ACCOUNTS.map((a) => `'${a}'`).join(', ')})`;

// Ürün → müşteri fiyatı (₺, brüt — Apple kesintisi/vergi HARİÇ). App'teki
// DIAMOND_PACKS / SOCIAL_PACK / COPASS fallback fiyatlarıyla birebir.
const PRICE_TRY: Record<string, number> = {
  'com.crossover.diamonds.100': 29.99,
  'com.crossover.diamonds.500': 79.99,
  'com.crossover.diamonds.1200': 149.99,
  'com.crossover.diamonds.5000': 449.99,
  'com.crossover.diamonds.15000': 999.99,
  'com.crossover.diamonds.50000': 2499.99,
  'com.crossover.socialpack.weekly': 24.99,
  'com.crossover.socialpack.monthly': 89.99,
  'com.crossover.copass': 350,
};

const PRODUCT_LABEL: Record<string, string> = {
  'com.crossover.diamonds.100': '100 Elmas',
  'com.crossover.diamonds.500': '500 Elmas',
  'com.crossover.diamonds.1200': '1.200 Elmas',
  'com.crossover.diamonds.5000': '5.000 Elmas',
  'com.crossover.diamonds.15000': '15.000 Elmas',
  'com.crossover.diamonds.50000': '50.000 Elmas',
  'com.crossover.socialpack.weekly': 'Sosyal Paket (Haftalık)',
  'com.crossover.socialpack.monthly': 'Sosyal Paket (Aylık)',
  'com.crossover.copass': 'CO Pass',
};

const ARENA_NAMES = [
  'Mahalle Sahası', 'Amatör Lig', 'Profesyonel Lig', 'Şampiyonlar Ligi',
  'Efsaneler Arası', 'Dünya Klasmanı', 'GOAT',
];

const priceOf = (pid: string) => PRICE_TRY[pid] ?? 0;
const labelOf = (pid: string) => PRODUCT_LABEL[pid] ?? pid;

export interface LiveStats {
  online: number;
  queue: number;
  rooms: number;
  playersInMatch: number;
  inLobby: number;
  botMatches: number;
  byStatus: Record<string, number>;
  matches?: MatchInfo[];       // o an açık odalar — kim kime karşı (bellekten)
  onlineUserIds?: string[];    // çevrimiçi hesap id'leri — isim/kupa DB'den çözülür
}

function dayBoundsSql(day: string | null | undefined): { startSql: string; endSql: string; label: string } {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') ? day! : new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  return {
    startSql: `(DATE '${safe}'::timestamp AT TIME ZONE 'Europe/Istanbul')`,
    endSql: `((DATE '${safe}' + INTERVAL '1 day')::timestamp AT TIME ZONE 'Europe/Istanbul')`,
    label: safe,
  };
}

export async function getAdminStats(live: LiveStats, day?: string) {
  const selectedDay = dayBoundsSql(day);
  const [
    users,
    byProduct,
    salesDaily,
    usersDaily,
    matches,
    modes,
    arenas,
    reports,
    messages,
    purchases,
    ads,
    adsDaily,
    playtime,
    playtimeTop,
    playtimeDaily,
    matchDur,
  ] = await Promise.all([
    // ── Kullanıcılar / aktiflik (yayın sonrası, test hariç) ──
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE created_at >= ${selectedDay.startSql} AND created_at < ${selectedDay.endSql})::int  AS new_today,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int  AS new_7d,
        count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS new_30d,
        count(*) FILTER (WHERE apple_sub IS NOT NULL OR google_sub IS NOT NULL OR facebook_sub IS NOT NULL)::int AS identified,
        count(*) FILTER (WHERE apple_sub IS NULL AND google_sub IS NULL AND facebook_sub IS NULL AND game_center_id IS NULL)::int AS guests,
        count(*) FILTER (WHERE last_seen >= ${selectedDay.startSql} AND last_seen < ${selectedDay.endSql})::int  AS dau,
        count(*) FILTER (WHERE last_seen >= now() - interval '7 days')::int AS wau,
        COALESCE(sum(diamonds),0)::bigint AS diamonds_circulating,
        count(*) FILTER (WHERE social_pack_until > now())::int AS active_social_pack,
        count(*) FILTER (WHERE premium_road = true)::int AS premium_road_active,
        count(*) FILTER (WHERE banned_at IS NOT NULL)::int AS banned
      FROM users
      WHERE created_at >= ${LAUNCH_TS} AND ${notTest()}`),

    // ── Ürün bazında satış (yayın sonrası; Production + eski etiketsiz kayıtlar; sandbox ve test hesap hariç) ──
    pool.query<{ product_id: string; sales: number; diamonds: string }>(`
      SELECT pt.product_id, count(*)::int AS sales, COALESCE(sum(pt.diamonds),0)::bigint AS diamonds
      FROM processed_transactions pt
      JOIN users u ON u.id = pt.user_id
      WHERE COALESCE(pt.purchase_date, pt.created_at) >= ${LAUNCH_TS}
        AND (pt.environment = 'Production' OR pt.environment IS NULL)
        AND ${notTest('u.display_name')}
      GROUP BY pt.product_id
      ORDER BY sales DESC`),

    // ── Günlük satış serisi (yayından bugüne; Production + eski etiketsiz; sandbox hariç) ──
    pool.query<{ day: string; product_id: string; sales: number }>(`
      SELECT to_char(date_trunc('day', COALESCE(pt.purchase_date, pt.created_at) AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
             pt.product_id, count(*)::int AS sales
      FROM processed_transactions pt
      JOIN users u ON u.id = pt.user_id
      WHERE COALESCE(pt.purchase_date, pt.created_at) >= ${LAUNCH_TS}
        AND (pt.environment = 'Production' OR pt.environment IS NULL)
        AND ${notTest('u.display_name')}
      GROUP BY 1, 2
      ORDER BY 1`),

    // ── Günlük yeni kullanıcı serisi ──
    pool.query<{ day: string; n: number }>(`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
             count(*)::int AS n
      FROM users
      WHERE created_at >= ${LAUNCH_TS} AND ${notTest()}
      GROUP BY 1
      ORDER BY 1`),

    // ── Maç kayıtları (yayın sonrası, test oyuncular hariç) ──
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE mh.played_at >= ${selectedDay.startSql} AND mh.played_at < ${selectedDay.endSql})::int  AS today,
        count(*) FILTER (WHERE mh.played_at >= now() - interval '7 days')::int AS last7d
      FROM match_history mh
      JOIN users u ON u.id = mh.player_id
      WHERE mh.played_at >= ${LAUNCH_TS} AND ${notTest('u.display_name')}`),

    // ── Mod dağılımı ──
    pool.query<{ game_mode: string; n: number }>(`
      SELECT mh.game_mode, count(*)::int AS n
      FROM match_history mh
      JOIN users u ON u.id = mh.player_id
      WHERE mh.played_at >= ${LAUNCH_TS} AND ${notTest('u.display_name')}
      GROUP BY mh.game_mode ORDER BY n DESC`),

    // ── Arena (kupa) dağılımı ──
    pool.query(`
      SELECT
        count(*) FILTER (WHERE trophies < 200)::int                        AS a0,
        count(*) FILTER (WHERE trophies >= 200  AND trophies < 500)::int   AS a1,
        count(*) FILTER (WHERE trophies >= 500  AND trophies < 1000)::int  AS a2,
        count(*) FILTER (WHERE trophies >= 1000 AND trophies < 2000)::int  AS a3,
        count(*) FILTER (WHERE trophies >= 2000 AND trophies < 3500)::int  AS a4,
        count(*) FILTER (WHERE trophies >= 3500 AND trophies < 5000)::int  AS a5,
        count(*) FILTER (WHERE trophies >= 5000)::int                      AS a6
      FROM users
      WHERE created_at >= ${LAUNCH_TS} AND ${notTest()}`),

    // ── Moderasyon: açık şikâyet (yayın sonrası) ──
    pool.query(`SELECT count(*)::int AS open FROM content_reports WHERE status = 'open' AND created_at >= ${LAUNCH_TS}`),

    // ── Mesajlar (yayın sonrası) ──
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE created_at >= ${selectedDay.startSql} AND created_at < ${selectedDay.endSql})::int AS today
      FROM messages
      WHERE created_at >= ${LAUNCH_TS}`),

    // ── Tek tek satın alımlar (kim, ne aldı) — gelirle AYNI gerçek-satın-alım filtresi ──
    pool.query<{ display_name: string; product_id: string; at: string }>(`
      SELECT u.display_name, pt.product_id, COALESCE(pt.purchase_date, pt.created_at) AS at
      FROM processed_transactions pt
      JOIN users u ON u.id = pt.user_id
      WHERE COALESCE(pt.purchase_date, pt.created_at) >= ${LAUNCH_TS}
        AND (pt.environment = 'Production' OR pt.environment IS NULL)
        AND ${notTest('u.display_name')}
      ORDER BY at DESC
      LIMIT 500`),

    // ── Ödüllü reklam izlemeleri (ad_rewards günlüğü; test hesapları hariç).
    //    Tablo 10.08.2026'da eklendi — öncesi sayılamaz (geçmiş günlük yoktu). ──
    pool.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE ar.granted_at >= ${selectedDay.startSql} AND ar.granted_at < ${selectedDay.endSql})::int  AS today,
        count(*) FILTER (WHERE ar.granted_at >= now() - interval '7 days')::int AS last7d,
        count(DISTINCT ar.user_id)::int AS unique_users
      FROM ad_rewards ar
      JOIN users u ON u.id = ar.user_id
      WHERE ${notTest('u.display_name')}`),

    // ── Günlük reklam izleme serisi ──
    pool.query<{ day: string; n: number }>(`
      SELECT to_char(date_trunc('day', ar.granted_at AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
             count(*)::int AS n
      FROM ad_rewards ar
      JOIN users u ON u.id = ar.user_id
      WHERE ${notTest('u.display_name')}
      GROUP BY 1
      ORDER BY 1`),

    // ── Oyunda kalınan süre (play_sessions günlüğü; 10.08.2026'da açıldı —
    //    öncesi ölçülemez). Test hesapları hariç. ──
    pool.query(`
      SELECT
        COALESCE(sum(ps.duration_secs), 0)::bigint AS total_secs,
        COALESCE(sum(ps.duration_secs) FILTER (WHERE ps.started_at >= ${selectedDay.startSql} AND ps.started_at < ${selectedDay.endSql}), 0)::bigint  AS secs_today,
        COALESCE(sum(ps.duration_secs) FILTER (WHERE ps.started_at >= now() - interval '7 days'), 0)::bigint AS secs_7d,
        count(*)::int AS sessions,
        count(*) FILTER (WHERE ps.started_at >= ${selectedDay.startSql} AND ps.started_at < ${selectedDay.endSql})::int AS sessions_today,
        count(DISTINCT ps.user_id) FILTER (WHERE ps.started_at >= ${selectedDay.startSql} AND ps.started_at < ${selectedDay.endSql})::int AS users_today,
        COALESCE(avg(ps.duration_secs), 0)::float AS avg_secs
      FROM play_sessions ps
      JOIN users u ON u.id = ps.user_id
      WHERE ${notTest('u.display_name')}`),

    // ── En çok oynayanlar (toplam süre, tüm zaman) ──
    pool.query<{ display_name: string; secs: string; sessions: number }>(`
      SELECT u.display_name, sum(ps.duration_secs)::bigint AS secs, count(*)::int AS sessions
      FROM play_sessions ps
      JOIN users u ON u.id = ps.user_id
      WHERE ${notTest('u.display_name')}
      GROUP BY u.display_name
      ORDER BY secs DESC
      LIMIT 20`),

    // ── Günlük toplam oyun süresi serisi (dk) ──
    pool.query<{ day: string; minutes: number; users: number }>(`
      SELECT to_char(date_trunc('day', ps.started_at AT TIME ZONE 'Europe/Istanbul'), 'YYYY-MM-DD') AS day,
             round(sum(ps.duration_secs) / 60.0)::int AS minutes,
             count(DISTINCT ps.user_id)::int AS users
      FROM play_sessions ps
      JOIN users u ON u.id = ps.user_id
      WHERE ${notTest('u.display_name')}
      GROUP BY 1
      ORDER BY 1`),

    // ── Ortalama maç süresi (yalnız süresi ölçülmüş kayıtlar; 0 = eski kayıt).
    //    PvP ve bot ayrımı opponent_id NULL'dan. ──
    pool.query(`
      SELECT
        COALESCE(avg(mh.duration_secs) FILTER (WHERE mh.duration_secs > 0), 0)::float AS avg_secs,
        COALESCE(avg(mh.duration_secs) FILTER (WHERE mh.duration_secs > 0 AND mh.opponent_id IS NOT NULL), 0)::float AS avg_pvp_secs,
        COALESCE(avg(mh.duration_secs) FILTER (WHERE mh.duration_secs > 0 AND mh.opponent_id IS NULL), 0)::float AS avg_bot_secs,
        count(*) FILTER (WHERE mh.duration_secs > 0)::int AS measured
      FROM match_history mh
      JOIN users u ON u.id = mh.player_id
      WHERE mh.played_at >= ${LAUNCH_TS} AND ${notTest('u.display_name')}`),
  ]);

  const u = users.rows[0] as any;

  const products = byProduct.rows.map((r) => ({
    productId: r.product_id,
    label: labelOf(r.product_id),
    sales: r.sales,
    diamonds: Number(r.diamonds),
    priceTry: priceOf(r.product_id),
    revenueTry: +(r.sales * priceOf(r.product_id)).toFixed(2),
  }));
  const totalRevenue = +products.reduce((s, p) => s + p.revenueTry, 0).toFixed(2);
  const totalSales = products.reduce((s, p) => s + p.sales, 0);

  // Tek tek satın alımlar: kim, hangi ürünü, ne zaman aldı.
  const purchaseList = purchases.rows.map((r) => ({
    user: r.display_name,
    label: labelOf(r.product_id),
    productId: r.product_id,
    priceTry: priceOf(r.product_id),
    at: r.at,
  }));

  const dayMap = new Map<string, { day: string; sales: number; revenue: number }>();
  for (const r of salesDaily.rows) {
    const cur = dayMap.get(r.day) ?? { day: r.day, sales: 0, revenue: 0 };
    cur.sales += r.sales;
    cur.revenue += r.sales * priceOf(r.product_id);
    dayMap.set(r.day, cur);
  }
  const dailySales = [...dayMap.values()]
    .map((d) => ({ ...d, revenue: +d.revenue.toFixed(2) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const selectedSalesDay = dailySales.find((d) => d.day === selectedDay.label) ?? null;
  const revenueToday = selectedSalesDay ? selectedSalesDay.revenue : 0;
  const salesToday = selectedSalesDay ? selectedSalesDay.sales : 0;

  const arenaRow = arenas.rows[0] as any;
  const arenaDist = ARENA_NAMES.map((name, i) => ({ name, count: Number(arenaRow[`a${i}`] ?? 0) }));

  const m = matches.rows[0] as any;
  const msg = messages.rows[0] as any;

  // Çevrimiçi kullanıcıların isim/kupası (canlı liste). id'ler bellekten geldi,
  // isim DB'den çözülür — kupaya göre azalan sırada.
  const { onlineUserIds, ...liveRest } = live;
  let onlineList: { userId: string; name: string; trophies: number }[] = [];
  if (onlineUserIds && onlineUserIds.length) {
    const onl = await pool.query(
      `SELECT id::text AS id, display_name, trophies FROM users
        WHERE id::text = ANY($1) ORDER BY trophies DESC, display_name`,
      [onlineUserIds],
    );
    onlineList = onl.rows.map((r: any) => ({ userId: r.id, name: r.display_name, trophies: r.trophies }));
  }

  return {
    generatedAt: new Date().toISOString(),
    since: '2026-08-04', // istatistiklerin başlangıç (yayın) tarihi — panelde gösterilir
    selectedDay: selectedDay.label,
    live: { ...liveRest, onlineUsers: onlineList },
    users: {
      total: u.total,
      newToday: u.new_today,
      new7d: u.new_7d,
      new30d: u.new_30d,
      identified: u.identified,
      guests: u.guests,
      dau: u.dau,
      wau: u.wau,
      banned: u.banned,
      diamondsCirculating: Number(u.diamonds_circulating),
      activeSocialPack: u.active_social_pack,
      premiumRoadActive: u.premium_road_active,
    },
    revenue: {
      totalTry: totalRevenue,
      totalSales,
      revenueToday,
      salesToday,
      byProduct: products,
      purchases: purchaseList,
      daily: dailySales,
    },
    ads: {
      total: (ads.rows[0] as any).total,
      today: (ads.rows[0] as any).today,
      last7d: (ads.rows[0] as any).last7d,
      uniqueUsers: (ads.rows[0] as any).unique_users,
      daily: adsDaily.rows,
      rewardPerView: 5, // +5 elmas/izleme — app'teki AD_REWARD ile senkron
    },
    matches: { total: m.total, today: m.today, last7d: m.last7d, modes: modes.rows },
    playtime: {
      totalSecs: Number((playtime.rows[0] as any).total_secs),
      secsToday: Number((playtime.rows[0] as any).secs_today),
      secs7d: Number((playtime.rows[0] as any).secs_7d),
      sessions: (playtime.rows[0] as any).sessions,
      sessionsToday: (playtime.rows[0] as any).sessions_today,
      usersToday: (playtime.rows[0] as any).users_today,
      avgSessionSecs: Math.round((playtime.rows[0] as any).avg_secs),
      topPlayers: playtimeTop.rows.map((r) => ({ user: r.display_name, secs: Number(r.secs), sessions: r.sessions })),
      daily: playtimeDaily.rows,
    },
    matchDuration: {
      avgSecs: Math.round((matchDur.rows[0] as any).avg_secs),
      avgPvpSecs: Math.round((matchDur.rows[0] as any).avg_pvp_secs),
      avgBotSecs: Math.round((matchDur.rows[0] as any).avg_bot_secs),
      measured: (matchDur.rows[0] as any).measured,
    },
    arenas: arenaDist,
    usersDaily: usersDaily.rows,
    moderation: { openReports: (reports.rows[0] as any).open },
    messages: { total: msg.total, today: msg.today },
  };
}

// İstanbul saatine göre bugünün 'YYYY-MM-DD' anahtarı (sabit UTC+3).
function istanbulToday(): string {
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}
