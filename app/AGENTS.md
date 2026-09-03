# Expo HAS CHANGED

This app currently uses Expo SDK 55 (`expo ~55.0.26`, React Native 0.83).
Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing code that depends on Expo APIs.

# COF UI Foundation (Step 01 — 2026-09-02; tokens/spec v1.0.1 — 2026-09-03)

- Canonical design tokens: `src/cof/01_COF_UI_TOKENS.json` (semantic source of truth). Typed adapter: `src/cof/theme.ts`. Primitives: `src/cof/primitives.tsx` (CofText, CofSurface/CofCard, CofButton, CofSectionHeader, CofSegmentedTabs, CofBadge). Formatters: `src/cof/format.ts` (`formatNumber` → `135.480`, `formatDate` → `3 Eyl 2026`). Binding rules: `../docs/ui/01_COF_UI_FOUNDATION_SPEC.md`.
- Rule: do NOT add fresh hard-coded colors, spacing, radii, shadows or durations in new/migrated UI. Read them from `cof` (`import { cof } from './cof'`). If a value is missing, add it to the tokens JSON first.
- Fonts: `COFDisplay` = Poppins-ExtraBold, `COFUI` = Poppins-SemiBold (already bundled; never download/substitute). Poppins-Black remains in legacy code for later cleanup.
- Legacy `theme` (src/theme.ts) and legacy primitives (Btn, GamePanel, SegmentedTabs in screens.tsx) stay untouched until their screens are migrated in later steps. iOS and Android consume the same token source; the only platform branch is shadow→elevation inside `cofElevation`.

## v1.0.1 contract (Step 01.1)

- **Foreground colors are computed, never hand-picked.** `src/cof/policy.ts` reads `component.button.foregroundByVariant` from the tokens and verifies the pair against `accessibility.minimumBodyContrast` (4.5:1) using `src/cof/contrast.ts`; if the declared color fails, it falls back to the variant's semantic `text.on*`. Bright surfaces (emerald, gold, gem, success/warning/error/info/streak) get dark navy text; never white-by-default on a bright fill.
- **Known token conflict:** the tokens map `button.danger -> text.onSecondary` (light), which measures 2.85:1 on `semantic.error`. The verification rejects it and uses `text.onError` (6.04:1), per the Step 01.1 brief.
- **Secondary/outlined controls** use `stroke.control` (#7089C5, 3.83:1 on `surface.raised`). Decorative card borders keep `stroke.subtle`/`stroke.default` — do not brighten them.
- **Label fit:** primary CTA never auto-shrinks and stays on one line (copy/layout must fit; a `__DEV__` warning fires if it truncates). Secondary/compact may shrink to a floor of **0.90**, or pass `allowTwoLines` for a documented two-line layout. Never go below 0.90.
- **Numbers:** the bundled Poppins files have no `tnum` and proportional digits (measured: ExtraBold 387–691/1000 em). `tabularNumbers` stays false. For counters that update in place use `<CofNumber stableWidth />`, which puts each digit in a fixed cell (`DIGIT_CELL_RATIO`). Do not add or replace fonts.
- **Contract test:** `cd app && npx --prefix ../server tsx scripts/cof-foundation-test.ts` (66 assertions: contrast targets, per-variant button/badge foregrounds, label policy, digit metrics). No new dependency — it reuses the server's tsx.

