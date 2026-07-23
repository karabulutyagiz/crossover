// Web substitute for native-only packages (wired up in metro.config.js).
// Throwing at import time triggers the same try/catch fallbacks the app
// already uses when these modules are missing in Expo Go.
throw new Error('native-only module unavailable on web');
