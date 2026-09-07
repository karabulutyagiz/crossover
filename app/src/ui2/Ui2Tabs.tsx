// UI2 sekme konteyneri: damalı zemin + kaydırılabilir sekme gövdesi + alt nav + yerleşik
// pencere katmanı (native Modal DEĞİL: reklam slotu/iOS sunum zinciriyle çakışmaz).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { BottomNav, type NavKey } from './Shell';
import { CheckerBg, ChunkyButton, GemAmount, OutlinedText, Plate } from './primitives';
import { HomeTab } from './HomeTab';
import { StoreTab } from './StoreTab';
import { useStorePurchases } from './useStorePurchases';
import { C, F, LIP, OUTLINE, SIDE, mk } from './tokens';

const KEYS: NavKey[] = ['store', 'collection', 'play', 'friends', 'tournaments'];
type Confirm = { title: string; body: string; price?: number; onYes: () => void };

export function Ui2Tabs({ state, actions, activeTab, goToTab, onOpenLevelRoad, onOpenSettings, onDiamondCelebration, initialScrollY = 0 }: {
  state: GameState; actions: Actions; activeTab: number; goToTab: (i: number) => void;
  onOpenLevelRoad: () => void; onOpenSettings?: () => void; onDiamondCelebration?: (c: { amount: number }) => void; initialScrollY?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (initialScrollY) setTimeout(() => scrollRef.current?.scrollTo({ y: initialScrollY, animated: false }), 50); }, [initialScrollY, activeTab]);
  const insets = useSafeAreaInsets();
  const store = useStorePurchases(state, actions, onDiamondCelebration);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const openConfirm = useCallback((c: Confirm) => setConfirm(c), []);
  const active = KEYS[activeTab] ?? 'play';
  const common = { state, actions, onOpenSettings: onOpenSettings ?? (() => setNotice({ title: 'AYARLAR', body: 'Ayarlar penceresi yeni tasarımda hazırlanıyor.' })), onOpenProfile: () => actions.openProfile(), onOpenArenas: () => actions.openArenas() };
  let body: ReactNode;
  if (active === 'store') body = <StoreTab {...common} store={store} onConfirm={openConfirm} />;
  else if (active === 'play') body = <HomeTab {...common} onOpenLevelRoad={onOpenLevelRoad} onOpenStore={() => goToTab(0)} onOpenQuests={() => { actions.getDailyQuests(); setNotice({ title: 'GÖREVLER', body: 'Görev penceresi yeni tasarımda hazırlanıyor.' }); }} onOpenModes={() => setNotice({ title: 'OYUN MODLARI', body: 'Mod seçici yeni tasarımda hazırlanıyor.' })} onOpenFriendPlay={() => setNotice({ title: 'ARKADAŞLA OYNA', body: 'Özel oda penceresi yeni tasarımda hazırlanıyor.' })} />;
  else body = <Placeholder label={active === 'collection' ? 'KOLEKSİYON' : active === 'friends' ? 'ARKADAŞLAR' : 'TURNUVALAR'} />;

  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      <ScrollView key={active} ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: mk(40) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <BottomNav active={active} onPress={(k) => goToTab(KEYS.indexOf(k))} badges={{ friends: state.friendRequests.length || undefined }} />
      {/* ── yerleşik pencere katmanı ── */}
      {(confirm || notice || (store.dialogOpen && store.dialog)) ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,10,40,0.72)', alignItems: 'center', justifyContent: 'center', padding: SIDE }}>
          <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} style={{ width: '100%' }} inner={{ padding: mk(28), alignItems: 'center' }}>
            <OutlinedText size={mk(44)} width={mk(4)}>{confirm?.title ?? notice?.title ?? store.dialog?.title ?? ''}</OutlinedText>
            <Text style={{ color: C.white, fontFamily: F.semi, fontSize: mk(26), textAlign: 'center', lineHeight: mk(34), marginTop: mk(14) }}>{confirm?.body ?? notice?.body ?? store.dialog?.body ?? ''}</Text>
            {confirm?.price != null ? <View style={{ marginTop: mk(14) }}><GemAmount amount={confirm.price} size={mk(36)} /></View> : null}
            <View style={{ flexDirection: 'row', gap: mk(16), marginTop: mk(26), alignSelf: 'stretch' }}>
              {confirm ? (
                <>
                  <ChunkyButton kind="gray" label="VAZGEÇ" height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => setConfirm(null)} />
                  <ChunkyButton kind="green" label="SATIN AL" height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { const c = confirm; setConfirm(null); c.onYes(); }} />
                </>
              ) : (
                <ChunkyButton kind="gold" label="TAMAM" height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { setNotice(null); store.closeDialog(); }} />
              )}
            </View>
          </Plate>
        </View>
      ) : null}
    </View>
  );
}
function Placeholder({ label }: { label: string }) {
  return (
    <View style={{ marginHorizontal: SIDE, marginTop: mk(200), alignItems: 'center' }}>
      <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} inner={{ padding: mk(30), alignItems: 'center', height: mk(260) - OUTLINE * 2 - LIP, justifyContent: 'center' }}>
        <OutlinedText size={mk(48)} width={mk(4)}>{label}</OutlinedText>
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(26), marginTop: mk(10) }}>Yeni tasarımda hazırlanıyor</Text>
      </Plate>
    </View>
  );
}
