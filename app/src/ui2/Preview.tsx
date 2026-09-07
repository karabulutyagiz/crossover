// UI2 web önizleme fixture'ı: ağ/IAP yok, sahte state ile sekmeleri çizer (yalnız __DEV__ + web).
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { currentLang, setLanguage } from '../i18n';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { Ui2Tabs } from './Ui2Tabs';

const profile = {
  userId: 'u1', displayName: 'Yağız', trophies: 2450, diamonds: 250, wins: 120, losses: 80, selectedAvatar: 'pp3', ownedAvatars: ['pp3'], ownedEmotes: ['footballer'], equippedEmotes: [], usernameSet: true, socialPackUntil: null,
  arena: { name: 'Şampiyonlar Ligi', icon: '🏟️', minTrophies: 1000 }, avatar: 'pp3', xp: 420, level: 12, xpForNext: 1000, selectedFrame: null, claimedLevels: [], ownedCosmetics: ['night_stadium'], premiumRoad: false,
};
const state = {
  phase: 'home', profile, error: null, storeCatalogStatus: 'success', userSearchResults: [], room: null, league: null,
  friendRequests: [{ requestId: 'r1', fromId: 'x', fromName: 'Kerem', createdAt: '' }, { requestId: 'r2', fromId: 'y', fromName: 'Ali', createdAt: '' }],
  friends: [
    { userId: 'f1', displayName: 'Mert', selectedAvatar: 'pp1', avatar: 'pp1', trophies: 3120, arena: { name: 'Dünya Klasmanı', icon: '', minTrophies: 3500 }, online: true },
    { userId: 'f2', displayName: 'Efe', selectedAvatar: 'pp2', avatar: 'pp2', trophies: 2980, arena: { name: 'Efsaneler Arenası', icon: '', minTrophies: 2000 }, online: true },
    { userId: 'f3', displayName: 'Emir', selectedAvatar: 'pp4', avatar: 'pp4', trophies: 2760, arena: { name: 'Efsaneler Arenası', icon: '', minTrophies: 2000 }, online: true },
    { userId: 'f4', displayName: 'Can', selectedAvatar: 'pp5', avatar: 'pp5', trophies: 2410, arena: { name: 'Efsaneler Arenası', icon: '', minTrophies: 2000 }, online: false, lastSeen: new Date(Date.now() - 60000).toISOString() },
    { userId: 'f5', displayName: 'Deniz', selectedAvatar: 'pp6', avatar: 'pp6', trophies: 1950, arena: { name: 'Şampiyonlar Ligi', icon: '', minTrophies: 1000 }, online: false, lastSeen: new Date(Date.now() - 12 * 60000).toISOString() },
  ],
  tournaments: [
    { id: 't1', name: 'Şampiyonlar Kupası', size: 16, joined: 9, youJoined: false, status: 'registration', prizeFirst: 1000, prizeSecond: 300, entryFee: 0 },
    { id: 't2', name: 'Haftalık Kupa', size: 16, joined: 16, youJoined: true, status: 'live', prizeFirst: 300, prizeSecond: 100, entryFee: 0 },
    { id: 't3', name: 'Süper Lig Turnuvası', size: 32, joined: 20, youJoined: false, status: 'registration', prizeFirst: 500, prizeSecond: 150, entryFee: 50 },
    { id: 't4', name: 'Dostluk Kupası', size: 8, joined: 3, youJoined: false, status: 'registration', prizeFirst: 200, prizeSecond: 50, entryFee: 0 },
  ],
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
  const initial = Number(qs?.get('tab') ?? '2'); const sy = Number(qs?.get('sy') ?? '0'); const dlg = (qs?.get('dlg') ?? null) as any; const sub = (qs?.get('sub') ?? undefined) as any;
  // ?lang=de → o dilde çiz (21 dil kontrolü için); render öncesi tek sefer
  const lang = qs?.get('lang'); if (lang && currentLang() !== lang) setLanguage(lang);
  const [tab, setTab] = useState(Number.isFinite(initial) ? initial : 2);
  const [fontsLoaded] = useFonts({
    'Poppins-Black': require('../../assets/fonts/Poppins-Black.ttf'), 'Poppins-ExtraBold': require('../../assets/fonts/Poppins-ExtraBold.ttf'), 'Poppins-SemiBold': require('../../assets/fonts/Poppins-SemiBold.ttf'), 'LilitaOne-Regular': require('../../assets/fonts/LilitaOne-Regular.ttf'),
  });
  if (!fontsLoaded) return <Text>fonts…</Text>;
  return (
    <SafeAreaProvider>
      <View style={{ width: 430, height: 932, alignSelf: 'center', overflow: 'hidden', backgroundColor: '#000' }}>
        <Ui2Tabs state={state} actions={actions} activeTab={tab} goToTab={setTab} onOpenLevelRoad={() => console.log('level road')} initialScrollY={sy} initialDialog={dlg} initialCollectionSub={sub} />
      </View>
    </SafeAreaProvider>
  );
}
