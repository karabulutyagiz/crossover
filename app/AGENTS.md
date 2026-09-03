# Expo HAS CHANGED

This app currently uses Expo SDK 55 (`expo ~55.0.26`, React Native 0.83).
Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing code that depends on Expo APIs.

# COF UI Foundation (Step 01 — 2026-09-02)

- Canonical design tokens: `src/cof/01_COF_UI_TOKENS.json` (semantic source of truth). Typed adapter: `src/cof/theme.ts`. Primitives: `src/cof/primitives.tsx` (CofText, CofSurface/CofCard, CofButton, CofSectionHeader, CofSegmentedTabs, CofBadge). Formatters: `src/cof/format.ts` (`formatNumber` → `135.480`, `formatDate` → `3 Eyl 2026`). Binding rules: `../docs/ui/01_COF_UI_FOUNDATION_SPEC.md`.
- Rule: do NOT add fresh hard-coded colors, spacing, radii, shadows or durations in new/migrated UI. Read them from `cof` (`import { cof } from './cof'`). If a value is missing, add it to the tokens JSON first.
- Fonts: `COFDisplay` = Poppins-ExtraBold, `COFUI` = Poppins-SemiBold (already bundled; never download/substitute). Poppins-Black remains in legacy code for later cleanup.
- Legacy `theme` (src/theme.ts) and legacy primitives (Btn, GamePanel, SegmentedTabs in screens.tsx) stay untouched until their screens are migrated in later steps. iOS and Android consume the same token source; the only platform branch is shadow→elevation inside `cofElevation`.
