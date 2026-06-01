# Crossover — Server (Phase 2: data + verification)

The core of the game: a football database built from **Wikidata** and a
`verifyPlayer` engine that answers *"did this player play for both teams?"* with
fuzzy, Turkish/accent-insensitive name matching.

## Stack
- Node.js 20 + TypeScript (run with `tsx`, no build step in dev)
- PostgreSQL 16 + `pg_trgm` + `unaccent` (local now → AWS Aurora Serverless v2 later — same SQL)

## Setup
```bash
cd server
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
createdb crossover_dev        # if it doesn't exist
npm run migrate               # create schema + extensions + indexes
npm run ingest                # pull seed clubs from Wikidata (~3 min, network)
```

## Commands
| Command | What it does |
|---|---|
| `npm run migrate` | Apply `src/db/schema.sql` (idempotent) |
| `npm run ingest` | Pull all `SEED_CLUBS` + their players' full club histories from Wikidata |
| `npm run renormalize` | Recompute `name_norm` after editing `normalize.ts` (no re-fetch) |
| `npm run verify -- "<Team A>" "<Team B>" "<Player>"` | Test a guess from the CLI |
| `npm run typecheck` | `tsc --noEmit` |

### Example
```bash
npm run verify -- "Galatasaray" "Inter" "Sneijder"   # ✅
npm run verify -- "Barcelona" "Inter" "Ronaldinho"   # ❌ (Barça yes, Inter no)
```

## How verification works
1. **Club resolution** (`searchClubs`): fuzzy match on `name_norm`, ranked by
   **member count** so the canonical club wins over Wikidata duplicates
   (e.g. "Futbol Club Barcelona" over the city "Barcelona", or "Galatasaray S.K."
   over an empty duplicate). National teams are excluded.
2. **Player matching**: `word_similarity` so a surname ("Sneijder") matches the
   full stored name ("Wesley Sneijder").
3. **Two thresholds** (`config.ts`):
   - `VERIFY_MATCH_THRESHOLD` (0.4) — surfaces "what you meant" for the wrong-answer screen.
   - `VERIFY_ACCEPT_THRESHOLD` (0.7) — a guess is **correct** only if a *strongly*
     matching player played both teams. Stops "Ronaldinho" matching "Ronaldo".

## Data notes
- Source: Wikidata `P54` (member of sports team) with start/end year qualifiers.
- Seed-based ingest (`src/ingest/seedClubs.ts`): for each seed club we pull every
  player + each player's full history → dense cross-links between popular clubs.
  Current seeds: Turkish + top-5 leagues + NL/PT giants.
- **Coverage is prototype-level**, not yet "every player worldwide". To expand:
  add seeds, or switch to a paginated all-players sweep / Wikidata dump.
- National teams are flagged (`is_national`) and excluded from club play.
- Wikidata has duplicate/related club entities (B/C teams, women's, sections);
  popularity ranking handles this for resolution. True entity merging is a
  possible later improvement.

## Known calibration items (Phase 2 open questions)
- Threshold tuning: hard misspellings ("snayder" → "Sneijder") are currently
  rejected as too far. Trade-off between typo-tolerance and false accepts.
- Same club, same player, multiple spells (loans) are kept as separate rows.
