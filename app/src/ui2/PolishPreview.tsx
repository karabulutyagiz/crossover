// Offline native QA fixture. Never enabled in production.
import { useEffect, useRef, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { Animated, Pressable, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeSearchOverlay } from './HomeSearchOverlay';
import { OutlinedText } from './primitives';
import { GameOpening } from '../GameOpening';

export default function PolishPreview() {
  const [page, setPage] = useState('letters');
  const [round, setRound] = useState(0);
  const progress = useRef(new Animated.Value(1)).current;
  const [loaded] = useFonts({
    'LilitaOne-Regular': require('../../assets/fonts/COFDisplay-Regular.ttf'),
    'Poppins-Black': require('../../assets/fonts/Poppins-Black.ttf'),
    'Poppins-ExtraBold': require('../../assets/fonts/Poppins-ExtraBold.ttf'),
    'Poppins-SemiBold': require('../../assets/fonts/Poppins-SemiBold.ttf'),
  });
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return <SafeAreaProvider><View style={{ flex: 1, backgroundColor: '#0B1838' }}>
    {page === 'letters' ? <View style={{ marginTop: 155, gap: 24, padding: 16 }}>
      <OutlinedText size={42}>İPTAL</OutlinedText>
      <OutlinedText size={42}>{'I\u0307PTAL'}</OutlinedText>
      <Text style={{ fontFamily: 'LilitaOne-Regular', fontSize: 42, color: 'white', textAlign: 'center' }}>İPTAL</Text>
      <OutlinedText size={28}>İ ı Ş ş Ğ ğ Ç ç Ö ö Ü ü</OutlinedText>
      <OutlinedText size={28}>BİLİYOR MUYDUN?</OutlinedText>
    </View> : page === 'search' ? <HomeSearchOverlay searching progress={progress} moving eta={null} onCancel={() => setPage('letters')} />
      : <GameOpening key={round} fontsReady bootReady={false} />}
    <View style={{ position: 'absolute', top: 62, left: 8, right: 8, flexDirection: 'row', gap: 6 }}>
      {['letters', 'search', 'opening'].map(key => <Pressable key={key} onPress={() => { setPage(key); setRound(x => x + 1); }} style={{ padding: 10, backgroundColor: '#294E7B', borderRadius: 5 }}><Text style={{ color: 'white' }}>{key}</Text></Pressable>)}
    </View>
  </View></SafeAreaProvider>;
}
