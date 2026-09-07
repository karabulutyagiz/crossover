// UI2 web önizleme fixture'ı: ağ/IAP yok, sahte state ile sekmeleri çizer (yalnız __DEV__ + web).
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { Ui2Tabs } from './Ui2Tabs';

const profile = {
  userId: 'u1', displayName: 'Yağız', trophies: 2450, diamonds: 250, wins: 120, losses: 80, selectedAvatar: 'pp3', ownedAvatars: ['pp3'], ownedEmotes: ['footballer'], equippedEmotes: [], usernameSet: true, socialPackUntil: null,
  arena: { name: 'Şampiyonlar Ligi', icon: '🏟️', minTrophies: 1000 }, avatar: 'pp3', xp: 420, level: 12, xpForNext: 1000, selectedFrame: null, claimedLevels: [], ownedCosmetics: ['night_stadium'], premiumRoad: false,
};
const state = {
  phase: 'home', profile, error: null, friendRequests: [], friends: [], storeCatalogStatus: 'success',
  storeCatalog: { version: 1, serverTime: '', dailyResetAt: '', weeklyResetAt: '', featured: [], items: [
    { id: 'neon_pitch', type: 'match_background', name: 'Neon Saha', description: '', rarity: 'epic', diamondPrice: 650 },
    { id: 'night_stadium', type: 'match_background', name: 'Gece Stadyumu', description: '', rarity: 'rare', diamondPrice: 400 },
    { id: 'goat_arena', type: 'match_background', name: 'GOAT Arena', description: '', rarity: 'mythic', diamondPrice: 1800 },
    { id: 'ice_frame', type: 'frame', name: 'Buz Çerçeve', description: '', rarity: 'rare', diamondPrice: 350 },
    { id: 'goat_frame', type: 'frame', name: 'GOAT Çerçeve', description: '', rarity: 'mythic', diamondPrice: 1400 },
  ] },
  dailyQuests: { day: 1, resetAt: '', quests: [{ id: 'q1', titleKey: 'x', target: 3, progress: 3, xp: 50, done: true, claimed: false }, { id: 'q2', titleKey: 'y', target: 1, progress: 1, xp: 50, done: true, claimed: false }] },
} as unknown as GameState;
const actions = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { console.log('[ui2 preview] action', String(k), a); return Promise.resolve(); } }) as unknown as Actions;

export default function Ui2Preview() {
  const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initial = Number(qs?.get('tab') ?? '2'); const sy = Number(qs?.get('sy') ?? '0');
  const [tab, setTab] = useState(Number.isFinite(initial) ? initial : 2);
  const [fontsLoaded] = useFonts({
    'Poppins-Black': require('../../assets/fonts/Poppins-Black.ttf'), 'Poppins-ExtraBold': require('../../assets/fonts/Poppins-ExtraBold.ttf'), 'Poppins-SemiBold': require('../../assets/fonts/Poppins-SemiBold.ttf'), 'LilitaOne-Regular': require('../../assets/fonts/LilitaOne-Regular.ttf'),
  });
  if (!fontsLoaded) return <Text>fonts…</Text>;
  return (
    <SafeAreaProvider>
      <View style={{ width: 430, height: 932, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#000' }}>
        <Ui2Tabs state={state} actions={actions} activeTab={tab} goToTab={setTab} onOpenLevelRoad={() => console.log('level road')} onOpenSettings={() => console.log('settings')} initialScrollY={sy} />
      </View>
    </SafeAreaProvider>
  );
}
