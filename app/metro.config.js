const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bu makinede watchman bozuk (iCloud) — bundling Node crawler ile yapilir.
config.resolver.useWatchman = false;

// Native-only packages that crash the web bundle. They resolve to a stub that
// throws at import time, so the app's existing Expo Go try/catch fallbacks
// kick in (an empty module would instead overwrite those fallbacks with
// undefined exports and crash at render).
const NATIVE_ONLY = [
  'react-native-google-mobile-ads',
  'react-native-iap',
  'react-native-nitro-modules',
  // expo-sqlite's web build needs wasm + COOP/COEP headers, which would in
  // turn block cross-origin club logos; offline mode is native-only anyway.
  'expo-sqlite',
];

const stubPath = require.resolve('./web-native-stub.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    NATIVE_ONLY.some((m) => moduleName === m || moduleName.startsWith(m + '/'))
  ) {
    return { type: 'sourceFile', filePath: stubPath };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
