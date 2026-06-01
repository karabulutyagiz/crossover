import { Platform } from 'react-native';

// WebSocket URL of the game server (server/).
// - iOS simulator reaches your Mac via localhost.
// - Android emulator uses the 10.0.2.2 alias for the host machine.
// - A physical device needs your Mac's LAN IP (set EXPO_PUBLIC_SERVER_URL).
export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ??
  (Platform.OS === 'android' ? 'ws://10.0.2.2:8080' : 'ws://localhost:8080');

// Same host over HTTP, for REST endpoints like /scopes.
export const HTTP_URL = SERVER_URL.replace(/^ws/, 'http');
