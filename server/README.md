# Crossover — Server

The core of the game: a football database built from **Transfermarkt** and a
`verifyPlayer` engine that answers *"did this player play for both teams?"* with
fuzzy, Turkish/accent-insensitive name matching.

## Stack
- Node.js 20 + TypeScript (run with `tsx`, no build step in dev)
- PostgreSQL 16 + `pg_trgm` + `unaccent`
- Data source: **Transfermarkt** via `felipeall/transfermarkt-api`

## Setup
```bash
cd server
cp .env.example .env          # adjust DATABASE_URL if needed
npm install
createdb crossover_dev        # if it doesn't exist
npm run migrate               # create schema + extensions + indexes

# Start the Transfermarkt API (required for ingest)
docker run -d -p 8000:8000 felipeall/transfermarkt-api

# Full rebuild: ingest → swap to live → market values → offline export
npm run rebuild
```

## Commands
| Command | What it does |
|---|---|
| `npm run migrate` | Apply `src/db/schema.sql` (idempotent) |
| `npm run ingest` | Transfermarkt 3-phase ingest (discover → careers → club profiles) into staging tables |
| `npm run ingest:swap` | Atomic swap: replace live tables with TM staging data |
| `npm run ingest:marketvalue` | Fetch squad market values for popularity ranking |
| `npm run export:offline` | Export `data.json` for the React Native offline bot mode |
| `npm run rebuild` | **Full pipeline**: ingest + swap + market values + offline export |
| `npm run renormalize` | Recompute `name_norm` after editing `normalize.ts` |
| `npm run verify -- "<Team A>" "<Team B>" "<Player>"` | Test a guess from the CLI |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run ingest:wikidata` | Legacy Wikidata ingest (not used by default) |

### Example
```bash
npm run verify -- "Galatasaray" "Inter" "Sneijder"   # ✅
npm run verify -- "Barcelona" "Inter" "Ronaldinho"   # ❌ (Barça yes, Inter no)
```

## Transfermarkt ingest

The `tm-rebuild.ts` pipeline has 3 resumable phases:
1. **Phase A (discover):** For each competition × season, list clubs and squads → collect all club & player IDs
2. **Phase C (careers):** For each player, fetch profile (name, photo, birth year, nationality) + full transfer history → career spells
3. **Phase B (club profiles):** Fetch logo, country, league for every club

Data is written to staging tables (`tm_clubs`, `tm_players`, `tm_player_clubs`).
Progress is journaled in `tm_state` so a restart continues where it stopped.

After verification, `npm run ingest:swap` atomically replaces live tables.

### Coverage (36 competitions, 2006–2025)
Turkey, England (PL + Championship), Spain (La Liga + Liga 2), Italy (A + B),
Germany (1. + 2. Bundesliga), France (L1 + L2), Portugal, Netherlands, Belgium,
Scotland, Switzerland, Austria, Denmark, Norway, Sweden, Poland, Czech Republic,
Croatia, Serbia, Romania, Greece, Ukraine, Saudi Arabia, MLS, Liga MX,
Brazil (A + B), Argentina, Japan, South Korea, Australia, Champions League, Europa League.

### Env vars
| Var | Default | Description |
|---|---|---|
| `TM_API` | `http://127.0.0.1:8000` | Transfermarkt API base URL |
| `TM_DELAY_MS` | `700` | Delay between requests (ms) |
| `TM_CONCURRENCY` | `5` | Parallel workers |
| `TM_SEASON_FROM` | `2006` | Oldest season to scan |
| `TM_SEASON_TO` | `2025` | Newest season to scan |
| `TM_COMPETITIONS` | (all 36) | Comma-separated competition codes |
| `TM_PHASE` | (all) | Run only one phase: `A`, `B`, or `C` |

## How verification works
1. **Club resolution** (`searchClubs`): fuzzy match on `name_norm`, ranked by
   **market value** (popularity) so famous clubs win over obscure ones. National
   teams are excluded.
2. **Player matching**: `word_similarity` so a surname ("Sneijder") matches the
   full stored name ("Wesley Sneijder").
3. **Two thresholds** (`config.ts`):
   - `VERIFY_MATCH_THRESHOLD` (0.3) — candidate net + typo auto-correct floor.
   - `VERIFY_EXACT_THRESHOLD` (0.85) — above this, treated as a specific name
     and judged strictly. Stops "Ronaldinho" matching "Ronaldo".
