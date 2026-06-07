import type { ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useCrossover } from './src/useCrossover';
import {
  HomeScreen,
  LeaderboardScreen,
  SearchingScreen,
  LobbyScreen,
  CountdownScreen,
  PickTeamScreen,
  GuessScreen,
  ResultScreen,
} from './src/screens';
import { theme } from './src/theme';

export default function App() {
  const { state, actions } = useCrossover();
  const props = { state, actions };

  let screen: ReactNode;
  switch (state.phase) {
    case 'leaderboard':
      screen = <LeaderboardScreen {...props} />;
      break;
    case 'searching':
      screen = <SearchingScreen {...props} />;
      break;
    case 'lobby':
      screen = <LobbyScreen {...props} />;
      break;
    case 'countdown':
      screen = <CountdownScreen {...props} />;
      break;
    case 'pick':
      screen = <PickTeamScreen {...props} />;
      break;
    case 'reveal':
    case 'guess':
      screen = <GuessScreen {...props} />;
      break;
    case 'result':
      screen = <ResultScreen {...props} />;
      break;
    case 'home':
    default:
      screen = <HomeScreen {...props} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 44 }}>
      <StatusBar style="light" />
      {screen}
    </View>
  );
}
