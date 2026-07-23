import { registerRootComponent } from 'expo';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import App from './App';

// GestureHandlerRootView: required once above any RNGH gesture (the chat's
// swipe-back pan runs at the native gesture level so it wins over ScrollViews).
function Root() {
  return React.createElement(GestureHandlerRootView, { style: { flex: 1 } }, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
