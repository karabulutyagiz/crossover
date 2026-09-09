# Arena backdrop preparation — 2026-09-09

The previous persistent native view improved warm opens but did not explicitly retain a decoded image or gate presentation on readiness. Earlier recordings had shown an empty background during entry; the warm baseline captured this turn did not reproduce it.

ArenaRoad now loads its unchanged backdrop using Expo SDK 55 `useImage`, retaining the native ImageRef (887 px maximum width). The full-page native-driver transition starts only once that reference exists. Until then the home screen remains visible. Load failure closes the pending arena, shows a localized error, and allows retry on the next open. Hidden/preparing content is excluded from accessibility.

Simulator verification: terminated and relaunched com.crossover.football on the iOS 26.3 iPhone 16 Pro simulator, opened the arena, closed via Tamam, and reopened. Inspected actual recorded frames, not resampled duplicate frames. Both opening sequences show the backdrop throughout the captured slide; no gray/empty frame observed. First opening was after the home screen had settled, not an artificially delayed-asset test. Failure handling was reviewed but not fault-injected.

Artifacts: `arena-decoded-backdrop.mp4`, `arena-decoded-first-frames.png`, `arena-decoded-repeat-frames.png`. No browser app testing or production deployment.

Checks: TypeScript, arena-road-test.mjs, ui2-nav-motion-test.mjs passed. Static arena assertions cover the decoded reference and presentation gate; they are not runtime rendering tests.
