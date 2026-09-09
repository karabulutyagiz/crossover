# Arena road — 2026-09-09

Replaces the Home arena popup with a full-screen, vertically connected arena road.
Existing arena artwork, thresholds, diamond amounts and server reward rules are unchanged.
There are seven arena gates and no intermediate reward milestones. Rewards are display-only;
the existing server grants them automatically and `highestArenaRewarded` marks receipts.

## Files

- `app/src/ui2/ArenaRoad.tsx`: memoized gates, fixed-layout virtualized list, current-arena position/button, safe-area header/footer, native-driven entrance/exit, reduced-motion and Android back handling.
- `app/src/ui2/Dialogs.tsx`: existing `ArenasDialog` export now points to the road.
- `app/scripts/arena-road-test.mjs`: thresholds, reward values and presentation guards.

## Verification

- `tsc --noEmit`: passed.
- `node scripts/arena-road-test.mjs`: passed.
- iOS Simulator: Home arena tap opens the new road at Mahalle Sahası; heading, current marker, 0/200 progress and gate-only rewards visually checked.
- Automated CUA drag/scroll acted as a click in Simulator. User manually confirmed scrolling works.
- Reopen, current-arena button at the current position, and close-to-Home tested in Simulator. Return from a distant scroll offset was not independently automated.
- No backend writes, reward claims, deployment or commit performed.

Implementation is in `/private/tmp/cof-ship-20260906/ui2` (`redesign-ui2`). The Desktop checkout has no `src/ui2` tree; do not overwrite its separate Classic interface with these modules.
