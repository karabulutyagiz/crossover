// Development-only native fixture; never contacts the matchmaking queue.
import { useEffect, useRef } from 'react';
import { Text } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SearchingView } from './SearchingView';

export default function SearchPreview({ onExit }: { onExit: () => void }) {
  const eta = useRef({ seconds: 45, at: Date.now() }).current;
  const [ready] = useFonts({
    'LilitaOne-Regular': require('../../assets/fonts/LilitaOne-Regular.ttf'),
    'Poppins-SemiBold': require('../../assets/fonts/Poppins-SemiBold.ttf'),
  });
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  return <SafeAreaProvider>
    <StatusBar style="light" />
    {ready ? <SearchingView eta={eta} onCancel={onExit} /> : <Text>Loading…</Text>}
  </SafeAreaProvider>;
}
