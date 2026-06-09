// WebSocket URL of the game server (server/).
//
// Defaults to the LIVE production server (AWS EC2 + Caddy auto-HTTPS) so every
// build — yours and your friend's — connects to the same online server with no
// extra setup. iOS requires a secure wss:// connection to a public host, which
// is why this is a TLS endpoint and not a raw IP.
//
// For LOCAL development against your own machine, override it, e.g.:
//   EXPO_PUBLIC_SERVER_URL=ws://localhost:8080 npx expo start   (iOS simulator)
//   EXPO_PUBLIC_SERVER_URL=ws://10.0.2.2:8080  npx expo start   (Android emulator)
//
// When a real domain is bought, just swap this default (and the Caddyfile host).
export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? 'wss://15-237-97-221.nip.io';

// Same host over HTTP(S), for REST endpoints like /scopes and /leaderboard.
export const HTTP_URL = SERVER_URL.replace(/^ws/, 'http');
