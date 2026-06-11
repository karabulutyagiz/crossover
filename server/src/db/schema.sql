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
  diamonds       INT NOT NULL DEFAULT 50,  -- in-game currency (start with 50 free)
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
  opponent_id     UUID,                            -- NULL for bot matches
  opponent_name   TEXT NOT NULL,
  player_score    INT NOT NULL,
  opponent_score  INT NOT NULL,
  won             BOOLEAN NOT NULL,
  player_trophies INT NOT NULL DEFAULT 0,
  opponent_trophies INT NOT NULL DEFAULT 0,
  game_mode       TEXT NOT NULL DEFAULT 'team-team',
  rounds          JSONB NOT NULL DEFAULT '[]',     -- winning rounds only: [{teamA, teamB, player, answeredBy}]
  played_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_history_player ON match_history (player_id, played_at DESC);

-- Bookkeeping for ingest runs.
CREATE TABLE IF NOT EXISTS ingest_log (
  id          BIGSERIAL PRIMARY KEY,
  seed_club   TEXT,
  qid         BIGINT,
  rows_seen   INT,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Club popularity ----
-- popularity = number of players we have for the club. Drives bot difficulty
-- (easy = most popular clubs) and search ranking (famous clubs first). Refreshed
-- by the data pipeline (see tm-swap.sql).
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS popularity INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_clubs_popularity ON clubs (popularity DESC);
