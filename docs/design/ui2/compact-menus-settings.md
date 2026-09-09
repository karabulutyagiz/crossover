# Compact menus and settings — 2026-09-09

Active simulator source: `/private/tmp/cof-ship-20260906/ui2/app`.
No production/OTA/push performed. Preserve other pending changes in this checkout.

## Changes

- Shared UI2 geometry density 0.90, font multiplier 1.18 (previously 1.26), body text floor 12 pt; semibold descriptions instead of ExtraBold everywhere.
- Thinner shared panel outlines and lower bevels. Actual viewport/pager width and navigation animation math unchanged.
- Home arena art centered at 88% of viewport width; primary play button reduced separately.
- Settings grouped flat rows instead of one beveled panel per row, full-row language action, plain help links, 44 pt switch targets and settings target. Existing icons retained.
- Music note gets its missing left stem and padded SVG viewport. Settings permission read moved from render into a cleanup-safe mount effect; no permissions or preferences changed during testing.
- Collection power-set heading and hint stacked to avoid collisions. Friends invite text no longer truncated in Turkish. Tournament description now participates in intrinsic layout rather than overflowing a fixed-height absolute panel; tournament rows can accommodate 44 pt buttons.

## Verification

- iOS 26.3, booted iPhone 16 Pro simulator: settings, all five top-level tabs, collection powers/emotes/cosmetics (empty inventory) visually inspected.
- Rechecked collection heading, friends description and tournament banner after corrective patches. Home checked after arena/play-button size reduction.
- TypeScript and navigation/arena regression scripts run. Navigation checks cover 2,005 positions and five viewport widths.
- No purchases, logout, account deletion, notification permission prompts, reward claims or live matches triggered.

Scope is shared UI2 menu/dialog styling, not a redesign or exhaustive verification of every legacy in-match screen. Additional devices, long translations, populated cosmetic inventory and all offscreen dialog states still require release QA. This is a compact visual calibration, not a claim of pixel-identical Clash Royale measurements.
