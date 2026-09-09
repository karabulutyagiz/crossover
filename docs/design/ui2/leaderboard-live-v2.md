# Leaderboard and Live Activity revision — 2026-09-09

- Home: leaderboard moved into the right rail below Daily Question, keeping the existing trophy and search transition.
- Leaderboard: UI2 blue beveled shell/header, bottom confirmation button, blue ranking rows with reserved avatar-frame space. Existing profile callbacks, ranking data, virtualized list and legacy UI fallback remain.
- Live Activity: compact COF badge with cyan/white face, gold clock symbol and system-driven timer; expanded blue gradient offer card with football crest and pitch markings; minimal crest. Payload contract is unchanged.

Simulator: verified home placement, live leaderboard data, revised rows and confirmation dismissal. Verified compact Live Activity using the separate offline `com.crossover.livepreview` host. Expanded view compiled but its long-press visual verification still requires the user to open it; requested in the task. No live offer or purchase was created.

Validation: TypeScript, leaderboard design checks, ActivityKit contract/design checks passed. Widget extension built successfully with Xcode for arm64 Simulator.

Native Live Activity changes require a new iOS binary, not OTA. The system-owned black camera gap in compact Dynamic Island cannot be replaced with app artwork. No deployment performed.
