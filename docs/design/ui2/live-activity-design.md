# COF Live Activity redesign — 2026-09-09

## Source and release

- Canonical source: `app/targets/offer-activity/index.swift` and `Info.plist` in `/private/tmp/cof-ship-20260906/ui2`.
- Native WidgetKit extension: requires a new iOS/TestFlight build. OTA cannot deliver this design. No production publication or server change was made.
- ActivityKit attributes and bridge signatures remain identical. Offer title, price, expiry and app-opening behavior are preserved.
- Lock screen: vector COF football crest, blue/navy gradient, subtle pitch markings, readable two-line offer title, lilac price, gold system timer.
- Compact/minimal island: cyan COF wordmark; expanded island: crest, offer details and countdown. The island background remains system-owned black.
- Turkish/English headings use preferred device language; declared extension localizations avoid English-only fallback. App-selected language separate from device language is not synchronized by the current payload.

## Verification

- Native Debug and Release simulator extension builds passed (arm64, iOS SDK installed in Xcode).
- `node app/scripts/live-activity-design-test.mjs` passed static guards, including exact bridge/widget payload parity.
- Used the actual compiled WidgetKit extension with a separately installed offline host `com.crossover.livepreview`; did not replace the user's COF app or alter real offers/account data. Temporary host sources/build are `/private/tmp/cof-live-preview.6xQUjE`.
- Visually checked actual iPhone 16 Pro / iOS 26.3 Simulator Live Activity: compact with one-hour and 24-hour timers; lock screen with Turkish headings and a long two-line title. Reduced spacing to preserve top/bottom padding inside the height limit.
- `live-activity-lock-final.png` is the final long-title lock screen screenshot. `live-activity-compact.png` shows compact mode. Dashes in seconds on Always-On are system timer redaction, not truncation.
- Expiry test reached 0:00 without negative counting. Simulator did not immediately refresh `context.isStale` into the expired-label layout. The stale layout is implemented, but immediate system refresh is not guaranteed or verified.
- Expanded/minimal layouts compiled; expanded visual check awaits manual long-press because CUA has no long-press API. No physical-device, extreme Dynamic Type, or production build integration claim.

Reference: https://developer.apple.com/design/human-interface-guidelines/live-activities
101 Okey Plus Live Activity reference could not be independently located; this is an original COF design, not a verified reproduction.
