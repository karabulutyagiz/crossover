# Menu motion v4 — 2026-09-09

Simulator source: `/private/tmp/cof-ship-20260906/ui2/app`. No deployment or push.

- Arena backdrop covers the full device, including transparent header/footer. Removed the large whole-screen zoom and long crossfade.
- Arena initial offset and end padding are known on mount. Removed the content-size/layout/permission/double-frame gate before opening. Native entrance is 240 ms with a 20 pt content slide; backdrop opacity reaches full early, rather than leaving two arenas superimposed throughout.
- Left 3 pt rail fills according to actual trophy progress between arena gates. No intermediate rewards introduced. Removed decorative central steps.
- Shared dialogs animate their dimmer and panel (18 pt slide); close via scrim/X uses a guarded 160 ms exit. Actions that intentionally switch screens or dismiss a parent remain owned by their existing callbacks.
- Shared ChunkyButton press feedback animates 2 pt down/up on the native driver (65/110 ms), without delaying onPress. Touch sizes and assets preserved.
- Motion preference warmed in Ui2Tabs. Native horizontal pager and its linked navbar animation were preserved, not replaced by competing animations.

Verified on booted iPhone 16 Pro iOS 26.3 simulator: arena open/Done/reopen from home and friends, full-screen backdrop and current gate, settings open/close, mode dialog open/close, home-to-friends navigation. Recorded `menu-motion-v4.mp4` and inspected transition frames. TypeScript, arena invariants and 2,005 navigation-position checks pass. The recording is a simulator capture, not a device frame-time benchmark. Live matches, all translations and all legacy overlays not exhaustively tested.

Reference consulted: https://support.supercell.com/clash-royale/en/articles/trophy-road-5.html (progression context only; animation timings are our own calibration, not measured Supercell timings).
