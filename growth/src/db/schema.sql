-- Crossover Growth OS — şema.
-- Oyunla AYNI veritabanında yaşar; çakışmayı önlemek için tüm tablolar
-- growth_ önekini taşır (oyun tarafında users/messages gibi isimler dolu).
-- Oyunun clubs/players/player_clubs tabloları içerik motoru tarafından
-- SALT OKUNUR kullanılır (gerçek ortak-futbolcu çiftleri oradan gelir).

-- ── Kimlik & RBAC ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_users (
  email         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'VIEWER'
                CHECK (role IN ('ADMIN','MARKETING','VIEWER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Platform hesapları (owned) ───────────────────────────────────────────
-- Token/secret'lar BURADA TUTULMAZ — env/secret manager'da yaşar. Bu tablo
-- yalnızca hangi hesabın bağlı olduğunu ve durumunu izler.
CREATE TABLE IF NOT EXISTS growth_social_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     TEXT NOT NULL CHECK (platform IN
               ('x','instagram','telegram','facebook','reddit','discord',
                'youtube','eksisozluk','threads','tiktok')),
  handle       TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'OWNED' CHECK (kind IN ('OWNED')),
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','TOKEN_EXPIRED','DISABLED')),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

-- ── Topluluklar (earned media) + CRM ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_communities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT NOT NULL,
  external_id         TEXT,                       -- subreddit adı, tg chat id...
  name                TEXT NOT NULL,
  url                 TEXT,
  football_category   TEXT,                       -- superlig / premierleague / genel...
  language            TEXT NOT NULL DEFAULT 'tr',
  member_estimate     INTEGER,
  engagement_score    REAL,
  audience_fit_score  REAL,                       -- 0-100 (AudienceFitScore)
  fit_breakdown       JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority            TEXT GENERATED ALWAYS AS (
                        CASE
                          WHEN audience_fit_score >= 75 THEN 'HIGH'
                          WHEN audience_fit_score >= 50 THEN 'MEDIUM'
                          ELSE 'LOW'
                        END) STORED,
  -- Reddit tarzı kural alanları (platforma göre boş kalabilir)
  rules               JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { self_promotion_allowed, self_promotion_rules, minimum_karma,
  --   account_age_requirement, allowed_days, allowed_flairs }
  admin_contact       TEXT,
  relationship_status TEXT NOT NULL DEFAULT 'DISCOVERED'
                      CHECK (relationship_status IN
                        ('DISCOVERED','CONTACTED','APPROVED','ACTIVE','PAUSED','BLACKLISTED')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, name)
);

-- İzin modeli topluluk başına AYRI tutulur; varsayılan MANUAL_APPROVAL_REQUIRED.
CREATE TABLE IF NOT EXISTS growth_community_permissions (
  community_id     UUID PRIMARY KEY REFERENCES growth_communities(id) ON DELETE CASCADE,
  promotion_policy TEXT NOT NULL DEFAULT 'MANUAL_APPROVAL_REQUIRED'
                   CHECK (promotion_policy IN
                     ('AUTO_POST_ALLOWED','MANUAL_APPROVAL_REQUIRED','DO_NOT_POST')),
  approval_status  TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (approval_status IN ('PENDING','APPROVED','REJECTED')),
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  notes            TEXT
);

-- ── Kampanyalar ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_campaigns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  channel    TEXT NOT NULL DEFAULT 'OWNED' CHECK (channel IN ('OWNED','COMMUNITY','PAID')),
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  utm_campaign TEXT NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── İçerik ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_content_templates (
  id          TEXT PRIMARY KEY,          -- ör: x_challenge_v1
  platform    TEXT NOT NULL,
  pillar      TEXT NOT NULL,
  body        TEXT NOT NULL,             -- {{teamA}} {{teamB}} {{player}} yer tutucuları
  language    TEXT NOT NULL DEFAULT 'tr',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Üretilen her içerik: bölüm 33'teki structured output alanları.
CREATE TABLE IF NOT EXISTS growth_content_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            TEXT NOT NULL,
  content_type        TEXT NOT NULL,               -- post / reel / poll / manual...
  pillar              TEXT NOT NULL,               -- challenge / guess_path / derby...
  hook                TEXT NOT NULL DEFAULT '',
  hook_type           TEXT NOT NULL DEFAULT '',
  body                TEXT NOT NULL,
  cta                 TEXT NOT NULL DEFAULT '',
  cta_id              TEXT NOT NULL DEFAULT '',
  hashtags            TEXT[] NOT NULL DEFAULT '{}',
  media_brief         JSONB,
  target_audience     TEXT,
  teams               TEXT[] NOT NULL DEFAULT '{}',
  players             TEXT[] NOT NULL DEFAULT '{}',
  football_context    TEXT,
  posting_reason      TEXT,
  suggested_time      TIMESTAMPTZ,
  risk_score          REAL NOT NULL DEFAULT 0,
  predicted_engagement REAL,
  hook_quality_score  REAL,
  language            TEXT NOT NULL DEFAULT 'tr',
  template_id         TEXT,
  campaign_id         UUID REFERENCES growth_campaigns(id),
  experiment_id       UUID,
  content_signature   TEXT NOT NULL,               -- yorgunluk/duplicate imzası
  status              TEXT NOT NULL DEFAULT 'REQUIRES_APPROVAL'
                      CHECK (status IN
                        ('DRAFT','REQUIRES_APPROVAL','APPROVED','REJECTED','ARCHIVED')),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_content_signature
  ON growth_content_items (content_signature, created_at);
CREATE INDEX IF NOT EXISTS idx_growth_content_status
  ON growth_content_items (status, platform, created_at);

-- Aynı içeriğin hook/CTA varyantları (A/B deney kolları buraya bağlanır).
CREATE TABLE IF NOT EXISTS growth_content_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES growth_content_items(id) ON DELETE CASCADE,
  hook            TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  cta             TEXT NOT NULL DEFAULT '',
  variant_key     TEXT NOT NULL DEFAULT 'A',
  experiment_variant_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Yayın kuyruğu ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_scheduled_posts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id  UUID NOT NULL REFERENCES growth_content_items(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  account_id       UUID REFERENCES growth_social_accounts(id),
  community_id     UUID REFERENCES growth_communities(id),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN
                     ('PENDING','PROCESSING','PUBLISHED','FAILED',
                      'REQUIRES_APPROVAL','RETRY_SCHEDULED','CANCELLED','MANUAL')),
  -- Idempotency: aynı içerik + hedef + slot iki kez yayınlanamaz.
  idempotency_key  TEXT NOT NULL UNIQUE,
  attempt          INTEGER NOT NULL DEFAULT 0,
  next_retry_at    TIMESTAMPTZ,
  last_error       TEXT,
  tracking_code    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_sched_due
  ON growth_scheduled_posts (status, scheduled_at);

CREATE TABLE IF NOT EXISTS growth_published_posts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id UUID NOT NULL REFERENCES growth_scheduled_posts(id),
  content_item_id   UUID NOT NULL REFERENCES growth_content_items(id),
  platform          TEXT NOT NULL,
  external_id       TEXT,                        -- tweet id / ig media id / tg message id
  external_url      TEXT,
  tracking_code     TEXT,
  published_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheduled_post_id)
);
CREATE INDEX IF NOT EXISTS idx_growth_pub_platform
  ON growth_published_posts (platform, published_at);

-- API ile yayın yapılamayan platformlar için insan görevleri.
CREATE TABLE IF NOT EXISTS growth_manual_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id UUID REFERENCES growth_scheduled_posts(id),
  platform         TEXT NOT NULL,
  title            TEXT NOT NULL,
  instructions     TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status           TEXT NOT NULL DEFAULT 'OPEN'
                   CHECK (status IN ('OPEN','DONE','DISMISSED')),
  done_by          TEXT,
  done_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Metrikler & atıf ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_platform_metrics (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published_post_id UUID NOT NULL REFERENCES growth_published_posts(id) ON DELETE CASCADE,
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  impressions       BIGINT,
  views             BIGINT,
  likes             BIGINT,
  comments          BIGINT,
  shares            BIGINT,
  saves             BIGINT,
  profile_visits    BIGINT,
  link_clicks       BIGINT,
  raw               JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_growth_metrics_post
  ON growth_platform_metrics (published_post_id, captured_at);

-- Tracking linkleri: /r/<code> -> hedef (UTM'li). Her scheduled post'a bir kod.
CREATE TABLE IF NOT EXISTS growth_tracking_links (
  code         TEXT PRIMARY KEY,
  target_url   TEXT NOT NULL,
  utm_source   TEXT NOT NULL,
  utm_medium   TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  utm_content  TEXT NOT NULL,
  scheduled_post_id UUID REFERENCES growth_scheduled_posts(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_link_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL REFERENCES growth_tracking_links(code) ON DELETE CASCADE,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash     TEXT,
  user_agent  TEXT,
  store       TEXT                                  -- ios / android / web (yönlenen hedef)
);
CREATE INDEX IF NOT EXISTS idx_growth_clicks_code ON growth_link_clicks (code, clicked_at);

-- İndirme/aktivasyon atıfı. Store içi install verisi MMP olmadan birebir
-- izlenemez; buradaki kayıtlar store yönlendirmesi (gerçek) + elle/ileride
-- API'den girilen install/activation sayılarıdır. Sahte veri üretilmez.
CREATE TABLE IF NOT EXISTS growth_conversion_attribution (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code  TEXT REFERENCES growth_tracking_links(code),
  day            DATE NOT NULL,
  store_visits   INTEGER NOT NULL DEFAULT 0,
  installs       INTEGER NOT NULL DEFAULT 0,
  registrations  INTEGER NOT NULL DEFAULT 0,
  first_matches  INTEGER NOT NULL DEFAULT 0,        -- activated player: >=1 maç
  source         TEXT NOT NULL DEFAULT 'redirect'   -- redirect / manual / api
                 CHECK (source IN ('redirect','manual','api')),
  UNIQUE (tracking_code, day, source)
);

-- ── Deneyler ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_experiments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  dimension   TEXT NOT NULL,             -- hook / cta / posting_time / team_pairing...
  status      TEXT NOT NULL DEFAULT 'RUNNING'
              CHECK (status IN ('RUNNING','CONCLUDED','ABANDONED')),
  conclusion  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_experiment_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES growth_experiments(id) ON DELETE CASCADE,
  variant_key   TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (experiment_id, variant_key)
);

-- ── Creator / influencer CRM ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_creator_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  platform         TEXT NOT NULL,
  handle           TEXT NOT NULL,
  followers        INTEGER,
  avg_views        INTEGER,
  engagement_rate  REAL,
  football_relevance REAL,
  turkey_audience_pct REAL,
  gaming_overlap   REAL,
  estimated_cost   TEXT,
  score            REAL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, handle)
);

CREATE TABLE IF NOT EXISTS growth_creator_outreach (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id   UUID NOT NULL REFERENCES growth_creator_profiles(id) ON DELETE CASCADE,
  draft        TEXT NOT NULL,             -- AI taslağı; ONAYSIZ gönderilmez
  status       TEXT NOT NULL DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT','APPROVED','SENT','REPLIED','DECLINED')),
  approved_by  TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Rate limit & audit ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_provider_rate_limits (
  platform        TEXT PRIMARY KEY,
  max_per_day     INTEGER NOT NULL,
  max_per_hour    INTEGER NOT NULL,
  min_interval_minutes INTEGER NOT NULL,
  backoff_until   TIMESTAMPTZ,            -- 429 sonrası exponential backoff hedefi
  backoff_level   INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS growth_audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor      TEXT NOT NULL,               -- e-posta veya 'system'
  action     TEXT NOT NULL,               -- approve / reject / publish / login...
  entity     TEXT,
  entity_id  TEXT,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_audit_time ON growth_audit_logs (created_at);

-- ── Yorum fırsatları (comment marketing) ─────────────────────────────────
-- Başkalarının viral futbol içeriklerine COF hesabından doğal yanıt/yorum.
-- X: resmi API ile otomatik yanıt (onay sonrası). IG/TikTok/YouTube: resmi
-- API başkasının gönderisine yorumu desteklemez → kopyala-yapıştır insan
-- görevi. Spam frenleri: hedef başına TEK yanıt (unique), günlük yanıt
-- tavanı, marka adı dozu, link yok.
CREATE TABLE IF NOT EXISTS growth_comment_opportunities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform     TEXT NOT NULL CHECK (platform IN ('x','instagram','tiktok','youtube')),
  target_url   TEXT NOT NULL,
  external_id  TEXT,                        -- x: tweet id (URL'den ayrıştırılır)
  author       TEXT,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { teams, topic, note }
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','search')),
  engagement   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- keşif anındaki like/rt sayıları
  status       TEXT NOT NULL DEFAULT 'DRAFTED'
               CHECK (status IN ('NEW','DRAFTED','QUEUED','DONE','DISMISSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, target_url)
);

CREATE TABLE IF NOT EXISTS growth_comment_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES growth_comment_opportunities(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  variant_key    TEXT NOT NULL DEFAULT 'A',
  mentions_brand BOOLEAN NOT NULL DEFAULT FALSE,
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT','APPROVED','REJECTED','PUBLISHED','MANUAL','FAILED')),
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  published_external_id TEXT,
  published_at   TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_growth_comment_drafts_opp
  ON growth_comment_drafts (opportunity_id, status);
-- Hedef başına tek aktif yanıt: aynı fırsatta ikinci taslak onaylanamaz.
CREATE UNIQUE INDEX IF NOT EXISTS uq_growth_comment_one_approved
  ON growth_comment_drafts (opportunity_id)
  WHERE status IN ('APPROVED','PUBLISHED','MANUAL');

-- ── Öğrenme durumu ───────────────────────────────────────────────────────
-- Günlük öğrenme döngüsü boyut başına ağırlıkları burada tutar:
-- { "pillar": {"challenge": 1.4, ...}, "hook_type": {...}, "cta": {...}, "slot": {"20:00": 1.2} }
CREATE TABLE IF NOT EXISTS growth_learning_state (
  platform   TEXT PRIMARY KEY,
  weights    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
