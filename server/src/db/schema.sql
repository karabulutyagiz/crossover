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

CREATE INDEX IF NOT EXISTS idx_users_trophies ON users (trophies DESC);
CREATE INDEX IF NOT EXISTS idx_users_game_center ON users (game_center_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users (apple_sub) WHERE apple_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_sub ON users (facebook_sub) WHERE facebook_sub IS NOT NULL;

-- Social pack subscription (unlocks country-team & letter-team in friend matches).
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_pack_until TIMESTAMPTZ;

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
  rounds          JSONB NOT NULL DEFAULT '[]',     -- winning rounds: [{teamA, teamALogo, teamB, teamBLogo, player, playerImageUrl, answeredBy}]
  played_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_history_player ON match_history (player_id, played_at DESC);

-- Migration: add player_name column if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'match_history' AND column_name = 'player_name') THEN
    ALTER TABLE match_history ADD COLUMN player_name TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

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
