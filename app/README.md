# Crossover — Mobile App (Expo / React Native)

Connects to the game server over WebSocket and walks through the full flow:
Home → Lobby → Countdown → Pick team → Reveal → Guess → Result.

Supports 19 languages, bot matches, friend system, DMs, store, emotes, avatars,
arena rankings, and more.

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
App.tsx              phase-based router
src/
  screens.tsx        All screens (Home, Lobby, Countdown, Pick, Guess, Result,
                     Store, Collection, Friends, Profile, Settings, Chat, etc.)
  useCrossover.ts    WebSocket connection + game state (useReducer)
  i18n.ts            i18n system (19 languages)
  i18n-locales/      Per-language JSON dictionaries
  protocol.ts        Client mirror of server/src/protocol.ts (keep in sync)
  config.ts          Server URL (per-platform)
  theme.ts           Colors
  offline/           Bot mode offline database
```

## Notes
- The protocol types are duplicated between app and server for now; a shared
  package can be extracted later.
- Game Center, Live Activities and Dynamic Island are planned but not yet implemented.
