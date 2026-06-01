# Crossover ⚽

A two-player, real-time football trivia game: both players pick a club, then race
to name a footballer who played for **both** teams. First correct answer wins.

> Türkçe: İki oyuncu birer takım seçer, sonra ikisi de o iki takımda da oynamış bir
> futbolcuyu yazmaya yarışır — ilk doğru yazan kazanır.

## Monorepo layout
| Path | What |
|---|---|
| `app/` | React Native + Expo client (iOS/Android) — see [`app/README.md`](app/README.md) |
| `server/` | Node.js + TypeScript game server (WebSocket) + data layer — see [`server/README.md`](server/README.md) |
| `PLAN.md` | Architecture & roadmap |

## How it works
- **Data**: ~52k players / ~12k clubs / ~350k spells, ingested from **Wikidata**
  (`P54` member of sports team). Club logos + league/country from Wikimedia Commons
  and API-Football. Fuzzy, Turkish/accent-insensitive name matching via Postgres
  `pg_trgm`; typos are auto-corrected to the closest valid player.
- **Server**: in-memory rooms + a state machine (countdown → pick → reveal → guess →
  result), WebSocket transport, "first valid answer locks the round". Play vs a
  friend (room code) or a practice **bot** (easy/medium/hard).
- **Scope**: restrict a game to a single league (e.g. Süper Lig) or country (e.g.
  Spain), or all teams.

## Quick start (local)
```bash
# DB (PostgreSQL 16 + pg_trgm)
createdb crossover_dev

# Server
cd server && cp .env.example .env && npm install
npm run migrate && npm run ingest        # pull data from Wikidata
npm run dev                               # ws://localhost:8080

# App
cd ../app && npm install && npm start     # press i (iOS) / a (Android) / w (web)
```

## Status
Prototype / work in progress. Tech: React Native (Expo), Node.js, PostgreSQL.
Target deploy: AWS (EC2 + Postgres) and iOS TestFlight.
