# Matchmaking, Bots, Trophy Economy

This system is server-authoritative. The mobile client sends actions only; it never supplies winners, trophy deltas, opponent type, MMR, bot difficulty, or economy state.

## Lifecycle

1. `find_match` enters the in-memory queue in `server/src/ws/server.ts`.
2. Queue candidates are scored by hidden skill, trophies, queue urgency, diversity, and farm risk.
3. A real human is preferred whenever a viable candidate exists.
4. If queue health is poor and configured bot policy allows it, `BotDirector` logic selects an adaptive bot profile.
5. The match is played normally in `Room`; bot answers come from the same message path as clients.
6. Settlement is idempotent through `match_settlements` and audited in `trophy_ledger`.
7. Skill, question difficulty, opponent history, bot exposure, and telemetry are updated after the match.

## Hidden Skill

`player_skill_profiles` stores hidden skill (`skill_mean`) and uncertainty, plus performance EMAs such as accuracy, response time, timeout rate, and form. Visible trophies remain progression, not the only skill input.

New or migrated accounts start from a trophy-based prior with high uncertainty. Strong early performance moves hidden skill faster than visible trophies, which helps smurf calibration without exposing MMR.

## Queue Health

`queueHealth.ts` estimates available candidates, nearby skill density, acceptable opponent count, real-opponent probability, and expected wait. Dynamic MMR/trophy windows expand smoothly over elapsed queue time. Bot fallback is based on queue health and progression policy, not a fixed “every N matches” rule.

## Bot Fallback

Explicit bot mode (`create_solo`) keeps the existing BOT ribbon and player-facing behavior. Fallback bots injected through normal `find_match` use normal player presentation: internally `opponentType = BOT`, but `isBot` is not exposed to the client for those opponents.

Bot profiles are selected from hidden MMR, trophies, uncertainty, recent pressure, progression, and economy state. The bot decision engine uses question difficulty, answer popularity, persona knowledge domains, match pressure, reaction distributions, mistakes, hesitation, and timeout probabilities. It never receives a forced win/loss target.

## Trophy Settlement

Ranked trophy changes use expected outcome from hidden skill. Settlement applies configured multipliers for anti-farm and bot economy pressure, then writes an idempotent `trophy_ledger` row containing before/delta/after, source, opponent type, expected win probability, multipliers, and risk metadata.

Sources include:

- `HUMAN_TO_HUMAN_TRANSFER`
- `BOT_TO_HUMAN_INJECTION`
- `HUMAN_TO_BOT_SINK`

Forfeits and disconnect losses are also ledgered and recorded in opponent history.

## Anti-Farm

`antiFarm.ts` tracks repeated pair exposure, one-way transfer pressure, and bot exposure. It returns a risk score and multipliers rather than banning from a single signal. Risk levels are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`.

Repeated legitimate rematches stay mostly normal. Dense one-way transfers or repeated bot farming progressively reduce progression value. The client never receives exact thresholds.

## Trophy Economy

`trophyEconomy.ts` reads the trophy ledger to classify economy state as `DEFLATIONARY`, `HEALTHY`, `MILD_INFLATION`, or `HIGH_INFLATION`. Bot injection budget pressure gradually lowers bot rewards and availability; it does not suddenly make bots unbeatable.

## LiveOps Config

`liveOpsConfig.ts` validates server-side thresholds and kill switches. Invalid values are rejected by retaining the last known good config.

Emergency switches:

- `BOT_MATCHMAKING_ENABLED`
- `ADAPTIVE_DIFFICULTY_ENABLED`
- `ANTI_FARM_ENABLED`
- `TROPHY_ECONOMY_CONTROLLER_ENABLED`
- `RECOVERY_MATCHES_ENABLED`

Rollout supports a stable percentage bucket via player id and experiment salt.

## Observability

Internal diagnostics are written to:

- `match_telemetry`
- `match_decision_traces`
- `trophy_ledger`
- `opponent_history`
- `player_bot_exposure`

Admin KPI endpoint `/admin/api/opponent-kpis` includes matchmaking, bot, trophy economy, and anti-farm aggregates. Sensitive values are not sent to normal clients.

## Validation

Use the existing CLI-invariant style:

```bash
cd server
npm run typecheck
npm run check:protocol
npm run test:opponent-system
npm run test:hybrid-matchmaking
npm run sim:opponent
```
