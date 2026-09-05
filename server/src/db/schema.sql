-- Crossover — football data schema (Phase 2)
-- Source: Wikidata. Identifiers are Wikidata QIDs (numeric part).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Clubs / teams a player can be a member of (P54).
CREATE TABLE IF NOT EXISTS clubs (
  id          BIGINT PRIMARY KEY,            -- Wikidata QID numeric part
  name        TEXT   NOT NULL,               -- display label (en/tr)
  name_norm   TEXT   NOT NULL,               -- normalized for fuzzy search
  country     TEXT,
  is_national BOOLEAN NOT NULL DEFAULT FALSE, -- national team (excluded from club play)
  aliases     TEXT[] NOT NULL DEFAULT '{}',
  logo_url    TEXT                            -- Wikimedia Commons logo (raster thumb)
);

-- For databases created before these columns existed.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS league TEXT;

CREATE INDEX IF NOT EXISTS idx_clubs_league ON clubs (league);
CREATE INDEX IF NOT EXISTS idx_clubs_country ON clubs (country);

-- Football players.
CREATE TABLE IF NOT EXISTS players (
  id           BIGINT PRIMARY KEY,           -- Wikidata QID numeric part
  name         TEXT   NOT NULL,
  name_norm    TEXT   NOT NULL,
  aliases      TEXT[] NOT NULL DEFAULT '{}',
  birth_year   INT,
  nationality  TEXT
);

-- For databases created before this column existed.
ALTER TABLE players ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Player <-> club spells (one row per membership statement).
CREATE TABLE IF NOT EXISTS player_clubs (
  player_id  BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  club_id    BIGINT NOT NULL REFERENCES clubs(id)   ON DELETE CASCADE,
  start_year INT,
  end_year   INT
);

-- A player can have multiple distinct spells at the same club (loans, returns),
-- so we key on the start year. start_year may be NULL -> coalesce to a sentinel
-- because NULLs are not comparable in a unique constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_clubs
  ON player_clubs (player_id, club_id, (COALESCE(start_year, -1)));

CREATE INDEX IF NOT EXISTS idx_player_clubs_club ON player_clubs (club_id);
CREATE INDEX IF NOT EXISTS idx_player_clubs_player ON player_clubs (player_id);

-- Trigram indexes power fuzzy name lookups.
CREATE INDEX IF NOT EXISTS idx_players_name_norm_trgm
  ON players USING gin (name_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clubs_name_norm_trgm
  ON clubs USING gin (name_norm gin_trgm_ops);

-- ---- User accounts & ranking ----

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   TEXT NOT NULL,
  game_center_id TEXT UNIQUE,              -- Apple Game Center player ID
  trophies       INT NOT NULL DEFAULT 0,   -- Clash Royale-style cups
  diamonds       INT NOT NULL DEFAULT 100, -- includes the one-time Mahalle Sahası reward (50 base + 50 gift)
  wins           INT NOT NULL DEFAULT 0,
  losses         INT NOT NULL DEFAULT 0,
  owned_emotes   TEXT[] NOT NULL DEFAULT '{}',  -- premium emote ids the user has bought
  apple_sub      TEXT UNIQUE,              -- Sign in with Apple subject id
  google_sub     TEXT UNIQUE,              -- Google account subject id
  facebook_sub   TEXT UNIQUE,              -- Facebook (Limited Login) subject id
  email          TEXT,                     -- from the auth provider (may be null/private)
  username_set   BOOLEAN NOT NULL DEFAULT false, -- has the user chosen their unique username?
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns to pre-existing databases (no-ops once they exist).
ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_emotes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_emotes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_avatars TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_avatar TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_set BOOLEAN NOT NULL DEFAULT false;

-- Usernames are unique case-insensitively, once chosen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (lower(display_name)) WHERE username_set = true;

-- Visible names must not collide either: social/provider-created accounts keep
-- username_set = false until onboarding, but their display_name is still shown in
-- matches and friends lists. Rename old duplicate provisional rows before adding
-- the all-row unique index so deploys do not fail on legacy data.
WITH ranked_display_names AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(display_name)
           ORDER BY username_set DESC, created_at ASC, id ASC
         ) AS rn
    FROM users
)
UPDATE users u
   SET display_name = 'Oyuncu ' || replace(u.id::text, '-', '')
  FROM ranked_display_names r
 WHERE u.id = r.id
   AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name_lower
  ON users (lower(display_name));

CREATE INDEX IF NOT EXISTS idx_users_trophies ON users (trophies DESC);
CREATE INDEX IF NOT EXISTS idx_users_game_center ON users (game_center_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_sub ON users (facebook_sub) WHERE facebook_sub IS NOT NULL;

-- Social pack subscription (unlocks country-team & letter-team in friend matches).
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_pack_until TIMESTAMPTZ;

-- Günlük Fırsat: pencere başına tek satın alma kilidi (PK çift almayı engeller).
CREATE TABLE IF NOT EXISTS daily_offer_claims (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_idx bigint NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_idx)
);

-- Kesinti telafisi hediyesi: ilk verilisinde damgalanir, boylece ayni hesaba
-- ikinci kez verilemez (grantOutageGiftIfNeeded bu sutuna bakar).
ALTER TABLE users ADD COLUMN IF NOT EXISTS outage_gift_at TIMESTAMPTZ;

-- 5 Eylul 2026 bakim telafisi, onceki kesinti kampanyasindan bagimsizdir.
ALTER TABLE users ADD COLUMN IF NOT EXISTS apology_gift_20260905_at TIMESTAMPTZ;

-- Chosen profile-picture id (e.g. 'pp7'); null = default person icon.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Last time the user was online (updated on connect + disconnect) for "last seen".
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Rewarded-ad diamond grants: daily counter (resets per UTC day) + last grant time,
-- used to cap abuse (no AdMob server-side verification yet).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_reward_day DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ad_reward_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ad_reward_at TIMESTAMPTZ;

-- Highest arena milestone already rewarded. Backfill existing users once with the
-- Mahalle Sahası gift so everyone starts from the same baseline.
ALTER TABLE users ADD COLUMN IF NOT EXISTS highest_arena_rewarded INT;
UPDATE users
   SET diamonds = diamonds + 50,
       highest_arena_rewarded = 0
 WHERE highest_arena_rewarded IS NULL;
ALTER TABLE users ALTER COLUMN highest_arena_rewarded SET DEFAULT 0;

-- ---- Friend requests (pending invitations) ----
CREATE TABLE IF NOT EXISTS friend_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests (to_user);

-- ---- Friendships (mutual: a row is stored in both directions on accept) ----
CREATE TABLE IF NOT EXISTS friendships (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships (user_id);

-- ---- Match history (one row per player per match) ----
CREATE TABLE IF NOT EXISTS match_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL DEFAULT '',
  opponent_id     UUID,                            -- NULL for bot matches
  opponent_name   TEXT NOT NULL,
  player_score    INT NOT NULL,
  opponent_score  INT NOT NULL,
  won             BOOLEAN NOT NULL,
  player_trophies INT NOT NULL DEFAULT 0,
  opponent_trophies INT NOT NULL DEFAULT 0,
  game_mode       TEXT NOT NULL DEFAULT 'team-team',
  ranked          BOOLEAN NOT NULL DEFAULT FALSE,
  rounds          JSONB NOT NULL DEFAULT '[]',     -- winning rounds: [{teamA, teamALogo, teamB, teamBLogo, player, playerImageUrl, answeredBy}]
  played_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_history_player ON match_history (player_id, played_at DESC);

-- Idempotency guard for server-authoritative match settlement. Additive only:
-- existing match/trophy/profile data is untouched. A room inserts its match_id
-- once before applying trophies/XP; duplicate timers/events cannot settle twice.
CREATE TABLE IF NOT EXISTS match_settlements (
  match_id   UUID PRIMARY KEY,
  room_code  TEXT NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_settlements_created_at ON match_settlements (created_at DESC);

-- Migration: add player_name column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'player_name') THEN
    ALTER TABLE match_history ADD COLUMN player_name TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Migration: match_history.ranked — yalnız hızlı eşleşme/dereceli maçlar profil
-- mod istatistiklerinde sayılır; bot/dostluk kayıtları history'de kalır ama
-- profil kırılımına girmez.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'ranked') THEN
    ALTER TABLE match_history ADD COLUMN ranked BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- One-time safe backfill for old history rows created before `ranked` existed.
-- `users.wins/losses` were always updated only by ranked quick matches, so for
-- each user we mark at most that many recent non-bot Team-Team rows as ranked.
-- Social/friendly modes and bot rows stay excluded from profile mode stats.
WITH ranked_counts AS (
  SELECT player_id, count(*)::int AS n
    FROM match_history
   WHERE ranked = TRUE
   GROUP BY player_id
), needs AS (
  SELECT u.id AS user_id, GREATEST(0, (u.wins + u.losses) - COALESCE(rc.n, 0))::int AS need
    FROM users u
    LEFT JOIN ranked_counts rc ON rc.player_id = u.id
   WHERE (u.wins + u.losses) > COALESCE(rc.n, 0)
), candidates AS (
  SELECT mh.id,
         row_number() OVER (PARTITION BY mh.player_id ORDER BY mh.played_at DESC, mh.id DESC) AS rn,
         n.need
    FROM match_history mh
    JOIN needs n ON n.user_id = mh.player_id
   WHERE mh.ranked = FALSE
     AND mh.opponent_id IS NOT NULL
     AND mh.game_mode = 'team-team'
)
UPDATE match_history mh
   SET ranked = TRUE
  FROM candidates c
 WHERE mh.id = c.id
   AND c.rn <= c.need;

-- Bookkeeping for ingest runs.
CREATE TABLE IF NOT EXISTS ingest_log (
  id          BIGSERIAL PRIMARY KEY,
  seed_club   TEXT,
  qid         BIGINT,
  rows_seen   INT,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Club popularity ----
-- popularity = a fame score = the club's Transfermarkt squad market value (EUR),
-- far better than raw player count (which measures squad churn). Drives bot
-- difficulty (easy = most popular) and search ranking. Filled by tm-marketvalue.ts.
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS popularity BIGINT NOT NULL DEFAULT 0;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS market_value BIGINT;
CREATE INDEX IF NOT EXISTS idx_clubs_popularity ON clubs (popularity DESC);

-- ---- In-App Purchases (Apple StoreKit) ----
-- One row per Apple transaction we've already granted, so a receipt can never be
-- redeemed twice (the PK enforces idempotency). diamonds/product_id are recorded
-- for audit. The receipt itself is validated with Apple before insert.
CREATE TABLE IF NOT EXISTS processed_transactions (
  transaction_id TEXT PRIMARY KEY,        -- Apple's original_transaction_id / transaction_id
  user_id        UUID NOT NULL REFERENCES users(id),
  product_id     TEXT NOT NULL,
  diamonds       INT  NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Apple ortamı ('Production' | 'Sandbox') ve gerçek satın alma zamanı. Admin
-- paneli sandbox/test alımlarını (environment='Sandbox') gelirden çıkarır.
-- Bu takipten ÖNCEKİ eski satırlarda environment NULL kalır; onlar yayın+test
-- filtresini geçtiyse gerçek sayılır (kullanıcı teyidi). Yeni alımlarda ortam
-- doğrulayıcıdan geldiği için asla NULL olmaz.
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS environment TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS purchase_date TIMESTAMPTZ;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS price_milliunits BIGINT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS storefront TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS transaction_reason TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS transaction_type TEXT;
ALTER TABLE processed_transactions ADD COLUMN IF NOT EXISTS revocation_date TIMESTAMPTZ;

-- ---- Ödüllü reklam izleme günlüğü (admin paneli) ----
-- users tablosundaki ad_reward_count her gün sıfırlanır; tarihsel toplam ve
-- günlük seri için her başarılı ödül burada bir satırdır. Tablo eklendiği
-- günden itibaren sayar (geçmişe dönük veri yok).
CREATE TABLE IF NOT EXISTS ad_rewards (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_rewards_at ON ad_rewards (granted_at);

-- ---- Direct messages between friends ----
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  read_at     TIMESTAMPTZ,                    -- NULL = unread
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (LEAST(from_user, to_user), GREATEST(from_user, to_user), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (to_user, read_at) WHERE read_at IS NULL;

-- ---- Push notifications (Expo) ----
-- One row per device push token. A user may have several devices; a token
-- belongs to exactly one user (re-login on the same device re-points it).
CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,             -- Expo push token (ExponentPushToken[...])
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   TEXT NOT NULL,                -- 'ios' | 'android'
  lang       TEXT NOT NULL DEFAULT 'tr',   -- device language for localized copy
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);

-- Last time we sent this user a re-engagement push (rate-limits the cron).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reengage_at TIMESTAMPTZ;

-- Tiny key/value store for cron bookkeeping (e.g. last store-refresh push date).
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---- Seviye sistemi (2026-07): kupadan bağımsız, asla düşmeyen XP merdiveni ----
-- xp = mevcut seviye İÇİNDEKİ ilerleme; level 1..50. bot_xp_* günlük bot tavanı,
-- last_win_day günün ilk gerçek galibiyeti bonusu için.
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_win_day TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_xp_day TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bot_xp_today INT NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS selected_frame TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_levels INT[] NOT NULL DEFAULT '{}';

-- Özel güçler (Seviye Yolu ödülü; tek kullanımlık, stoklanabilir envanter)
ALTER TABLE users ADD COLUMN IF NOT EXISTS power_xp2x INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS power_shield INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_boost_until TIMESTAMPTZ; -- aktif 2x XP penceresinin bitişi
ALTER TABLE users ADD COLUMN IF NOT EXISTS shield_armed BOOLEAN NOT NULL DEFAULT FALSE; -- kuşanılmış kupa kalkanı

-- Galibiyet serisi (yalnız dereceli maçlar): güncel seri + tüm zamanların en iyisi
ALTER TABLE users ADD COLUMN IF NOT EXISTS win_streak INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS best_streak INT NOT NULL DEFAULT 0;

-- Seri Geri Yükleme gücü: envanter adedi + son kırılan serinin değeri
ALTER TABLE users ADD COLUMN IF NOT EXISTS power_streak INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lost_streak INT NOT NULL DEFAULT 0;

-- Premium Seviye Yolu: 1000 elmasla açılan paralel ödül şeridi
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_road BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS claimed_premium INT[] NOT NULL DEFAULT '{}';

-- Aylık sezonlar: yol ilerlemesi + premium her ay sıfırlanır; kozmetikler kalır
ALTER TABLE users ADD COLUMN IF NOT EXISTS season_id TEXT; -- 'YYYY-MM' (Europe/Istanbul)
ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_frames TEXT[] NOT NULL DEFAULT '{}'; -- kalıcı çerçeve sahipliği
-- Tek seferlik geri doldurma: bu güne dek claim edilmiş ×10 seviyeleri kalıcı sahipliğe çevir
UPDATE users SET owned_frames = (
  SELECT COALESCE(array_agg(DISTINCT f), '{}') FROM (
    SELECT CASE lv WHEN 10 THEN 'bronze' WHEN 20 THEN 'silver' WHEN 30 THEN 'gold' WHEN 40 THEN 'diamond' WHEN 50 THEN 'goat' END AS f
    FROM unnest(claimed_levels) AS lv WHERE lv % 10 = 0
  ) s WHERE f IS NOT NULL
)
WHERE owned_frames = '{}' AND EXISTS (SELECT 1 FROM unnest(claimed_levels) lv WHERE lv % 10 = 0);

-- Antrenman Bileti: kullanıldığı gün bot maçlarındaki 60 XP günlük tavanını kaldırır
ALTER TABLE users ADD COLUMN IF NOT EXISTS power_training INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_boost_day TEXT; -- (eski, artık kullanılmıyor)
ALTER TABLE users ADD COLUMN IF NOT EXISTS training_boost_until TIMESTAMPTZ; -- aktif Antrenman Bileti penceresinin bitişi (1 saat)

-- ---------------------------------------------------------------------------
-- Kullanıcı içeriği güvenliği (App Store Guideline 1.2)
-- Apple, anonim içerik üretilebilen uygulamalarda engelleme, şikâyet, kendi
-- içeriğini silme ve 24 saat içinde işlem yapma mekanizmalarını ZORUNLU tutuyor.
-- ---------------------------------------------------------------------------

-- Engelleme tek yönlüdür (A, B'yi engeller) ama kapılar ÇİFT yönlü uygulanır:
-- engellenen taraf da engelleyene ulaşamaz.
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
-- "beni kim engelledi" yönü de sorgulanıyor (send_message kapısı çift yönlü).
CREATE INDEX IF NOT EXISTS idx_blocked_reverse ON blocked_users (blocked_id);

-- Şikâyetler. body_snapshot kasıtlı: şikâyet edilen mesaj silinse bile
-- moderasyon kaydı içeriği korur, yoksa 24 saatlik inceleme anlamsız kalır.
CREATE TABLE IF NOT EXISTS content_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  message_id    UUID,           -- NULL = mesaj değil, kullanıcı şikâyeti
  body_snapshot TEXT,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',  -- open | actioned | dismissed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_open ON content_reports (status, created_at DESC);

-- Kendi mesajını kaldırma: satır silinmez, işaretlenir — şikâyet incelemesi ve
-- karşı tarafın tutarlı görünümü için.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- İhlal eden hesabın erişiminin sonlandırılması (24 saat taahhüdünün yaptırımı).
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- EULA onayı: Apple, kullanıcıların koşulları KABUL ETMESİNİ şart koşuyor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Admin paneli kullanıcıları (e-posta + şifre girişi). Şifre ASLA düz metin
-- saklanmaz: scrypt ile `salt:hash` (hex) olarak tutulur. Oyuncu 'users'
-- tablosundan tamamen ayrıdır — bunlar yalnız istatistik panelinin yöneticileri.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  email         TEXT PRIMARY KEY,           -- küçük harfe normalize edilmiş e-posta
  password_hash TEXT NOT NULL,              -- scrypt: 'salt:hash' (hex)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Oturum günlüğü (admin istatistikleri): bağlantı başına "oyunda kalınan süre".
-- ws bağlantısı kimlik bağladıysa kapanışta tek satır yazılır (ws/server.ts).
-- 5 sn'den kısa oturumlar gürültüdür (anlık reconnect) — hiç yazılmaz;
-- süre 6 saatte kırpılır (askıda kalmış soket şişirmesin).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS play_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_secs INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_play_sessions_user    ON play_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_sessions_started ON play_sessions (started_at);

-- Migration: match_history.duration_secs — maç süresi (sn). Eski kayıtlar 0 = bilinmiyor;
-- ortalamalar duration_secs > 0 filtresiyle alınır.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'duration_secs') THEN
    ALTER TABLE match_history ADD COLUMN duration_secs INT NOT NULL DEFAULT 0;
  END IF;
END $$;
