# Crossover — Mobile App (Expo / React Native)

Phase 1 skeleton: connects to the game server over WebSocket and walks through
the full flow — Home → Lobby → Countdown → Pick team → Reveal → Guess → Result.

## Run it

1. **Start the server** (separate terminal):
   ```bash
   cd ../server
   npm run dev          # ws://localhost:8080 (+ /health)
   ```

2. **Start the app**:
   ```bash
   npm install          # first time only
   npm start            # Expo dev server
   ```
   Then press `i` (iOS simulator), `a` (Android emulator), or `w` (web).

3. **Two players on one machine** (easiest for testing):
   - Open one client in the **iOS simulator** (`i`) and another in the **web**
     browser (`w`) — both reach the server via `localhost`.
   - Player 1 → "Oda Kur" → shares the 6-char code. Player 2 → enters code → "Katıl".

### Connecting from a physical phone
A real device can't use `localhost`. Set your Mac's LAN IP:
```bash
EXPO_PUBLIC_SERVER_URL=ws://192.168.1.X:8080 npm start
```
(see `src/config.ts`). Android emulator uses `ws://10.0.2.2:8080` automatically.

## Structure
```
App.tsx              phase-based router (no nav library yet)
src/
  config.ts          server URL (per-platform)
  protocol.ts        client mirror of server/src/protocol.ts (keep in sync)
  useCrossover.ts    WebSocket connection + game state (useReducer)
  screens.tsx        Home / Lobby / Countdown / PickTeam / Guess / Result
  theme.ts           colors
```

## Notes / next
- Phase 6 will add the iOS-only **Game Center**, **Live Activities** and
  **Dynamic Island** features — these need native modules + a Widget Extension,
  so the app must run via an **EAS dev build** (not Expo Go) at that point.
- The protocol types are duplicated between app and server for now; a shared
  package can be extracted later.
