// UI2 sekme konteyneri: damalı zemin + sekme gövdesi + alt nav + yerleşik pencere katmanı
// (native Modal DEĞİL: reklam slotu / iOS sunum zinciriyle çakışmaz).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { BottomNav, type NavKey } from './Shell';
import { TabFreeze } from './TabFreeze';
import { settledPageAt } from './navMotion';
import { useSearchTransition } from './useSearchTransition';
import { useMenuMotionPreference } from './useMenuMotion';
import { HomeSearchOverlay } from './HomeSearchOverlay';
import { CheckerBg, ChunkyButton, GemAmount, OutlinedText, Plate } from './primitives';
import { HomeTab } from './HomeTab';
import { StoreTab } from './StoreTab';
import { FriendsTab } from './FriendsTab';
import { TournamentsTab } from './TournamentsTab';
import { CollectionTab } from './CollectionTab';
import { ChatOverlay, DailyCrossoverModal } from '../screens';
import { AddFriendDialog, ConfirmDialog, FriendActionsDialog, LanguageDialog, LeagueDialog, MessagesDialog, ModeMenuDialog, PrivateRoomDialog, QuestsDialog, RequestsDialog, SettingsDialog, ArenasDialog, LevelRoadDialog, ProfileDialog, TournamentDialog, TournamentOverDialog, TournamentReadyDialog } from './Dialogs';
import { setLanguage, t } from '../i18n';
import { S, up } from './strings';
import { useStorePurchases } from './useStorePurchases';
import { C, F, fz, LIP, mk, OUTLINE, SIDE, SW } from './tokens';

const KEYS: NavKey[] = ['store', 'collection', 'play', 'friends', 'tournaments'];
type Confirm = { title: string; body: string; price?: number; priceText?: string; onYes: () => void };
export type Ui2DialogKey = 'mode' | 'bot' | 'quests' | 'settings' | 'language' | 'room' | 'requests' | 'league' | 'tournament' | 'road' | 'arenas' | 'profile' | 'dailycx' | 'addfriend' | 'messages' | 'friend' | 'friendmatch' | null;

export function Ui2Tabs({ state, actions, activeTab, goToTab, onOpenLevelRoad, onLanguageChange, onDiamondCelebration, onOpenFeedback, onOpenMatchHistory, onOpenLeaderboard, initialScrollY = 0, initialDialog = null, initialCollectionSub }: {
  state: GameState; actions: Actions; activeTab: number; goToTab: (i: number) => void;
  onOpenLevelRoad: () => void; onLanguageChange?: () => void; onDiamondCelebration?: (c: { amount: number }) => void; onOpenFeedback?: (category?: 'sponsorship') => void; onOpenMatchHistory?: () => void; onOpenLeaderboard?: () => void; initialScrollY?: number; initialDialog?: Ui2DialogKey; initialCollectionSub?: 'powers' | 'cosmetics' | 'emotes';
}) {
  const insets = useSafeAreaInsets();
  useMenuMotionPreference();
  const searching = state.phase === 'searching';
  const search = useSearchTransition(searching);
  const searchLockRef = useRef(search.locked);
  searchLockRef.current = search.locked;
  const store = useStorePurchases(state, actions, onDiamondCelebration);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string; onYes?: () => void; yesLabel?: string } | null>(null);
  const [dlg, setDlg] = useState<Ui2DialogKey>(initialDialog);
  const [tourId, setTourId] = useState<string | null>(initialDialog === 'tournament' ? 't2' : null);
  const [friend, setFriend] = useState<{ userId: string; displayName: string } | null>(null);
  useEffect(() => { if (initialScrollY) setTimeout(() => pageRefs.current[activeTab]?.scrollTo({ y: initialScrollY, animated: false }), 60); }, [initialScrollY, activeTab]);
  const active = KEYS[activeTab] ?? 'play';
  // ── CLASH ROYALE SAYFA ÇEVİRİCİ: sekmeler yan yana; parmakla kaydırılır, nav'a dokununca kayar. ──
  // Sekmeler bir kez ziyaret edilince MOUNT'TA KALIR: geçişte yeniden kurulum yok (eski 'glitch' buydu).
  const { width: pageW } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const pageSurfaces = useRef<(View | null)[]>([]);
  const surfaceCacheTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cacheMovingSurfaces = useCallback((enabled: boolean) => {
    // Cache layered text/art only for the native slide, then release textures.
    // Imperative native props avoid a React tree render at gesture start.
    clearTimeout(surfaceCacheTimer.current);
    const apply = (value: boolean) => {
      for (const surface of pageSurfaces.current) surface?.setNativeProps({
        shouldRasterizeIOS: value, renderToHardwareTextureAndroid: value,
      });
    };
    apply(enabled);
    // An interrupted native animation may omit its end event. Never retain
    // screen textures indefinitely; this watchdog changes no navigation state.
    if (enabled) surfaceCacheTimer.current = setTimeout(() => apply(false), 1500);
  }, []);
  useEffect(() => () => clearTimeout(surfaceCacheTimer.current), []);
  const pageRefs = useRef<(ScrollView | null)[]>([]);
  const settledIdxRef = useRef(activeTab);
  const requestedIdxRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const canWarmPage = useCallback(() => !searchLockRef.current && requestedIdxRef.current === null && !draggingRef.current, []);
  const [settledIdx, setSettledIdx] = useState(activeTab);
  const scrollX = useRef(new Animated.Value(activeTab * pageW)).current;
  // contentOffset is an initial position, never a controlled selected-tab prop:
  // changing it on every tap teleports iOS before scrollTo can animate.
  const initialOffset = useRef({ x: activeTab * pageW, y: 0 }).current;
  const previousWidth = useRef(pageW);
  useEffect(() => {
    if (!searching) return;
    setDlg(null);
    requestedIdxRef.current = null;
    draggingRef.current = false;
    cacheMovingSurfaces(false);
    previousWidth.current = pageW;
    settledIdxRef.current = 2;
    setSettledIdx(2);
    pagerRef.current?.scrollTo({ x: 2 * pageW, animated: false });
    scrollX.setValue(2 * pageW);
    if (activeTab !== 2) goToTab(2);
  }, [searching, activeTab, pageW, scrollX, goToTab, cacheMovingSurfaces]);
  useEffect(() => {
    // Search owns the pager position, including searches started from a dialog
    // on another tab. Do not let the previous active tab animate it back.
    if (searching) return;
    if (previousWidth.current !== pageW) {
      previousWidth.current = pageW;
      pagerRef.current?.scrollTo({ x: activeTab * pageW, animated: false });
      scrollX.setValue(activeTab * pageW);
      settledIdxRef.current = activeTab;
      requestedIdxRef.current = null;
      draggingRef.current = false;
      cacheMovingSurfaces(false);
      setSettledIdx(activeTab);
    } else if (settledIdxRef.current !== activeTab && requestedIdxRef.current !== activeTab) {
      requestedIdxRef.current = activeTab;
      cacheMovingSurfaces(true);
      pagerRef.current?.scrollTo({ x: activeTab * pageW, animated: true });
    }
  }, [searching, activeTab, pageW, scrollX, cacheMovingSurfaces]);
  // No JS scroll listener: the native pager drives every visual frame, even at
  // 120 Hz. React/parent/game state changes only after the page has settled.
  const onPagerScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
    [scrollX],
  );
  const onPageSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (searchLockRef.current) return;
    const i = settledPageAt(e.nativeEvent.contentOffset.x, pageW, requestedIdxRef.current, KEYS.length);
    if (i === null) return;
    requestedIdxRef.current = null;
    draggingRef.current = false;
    cacheMovingSurfaces(false);
    settledIdxRef.current = i;
    setSettledIdx(i);
    setDlg(null);
    if (i !== activeTab) goToTab(i);
  }, [goToTab, pageW, activeTab, cacheMovingSurfaces]);
  const onPageDrag = useCallback(() => {
    if (searchLockRef.current) return;
    requestedIdxRef.current = null;
    draggingRef.current = true;
    cacheMovingSurfaces(true);
  }, [cacheMovingSurfaces]);
  const selectPage = useCallback((key: NavKey) => {
    if (searchLockRef.current) return;
    const index = KEYS.indexOf(key);
    setDlg(null);
    if (index === settledIdxRef.current && canWarmPage()) return;
    // Start native motion before the destination's state update/render.
    requestedIdxRef.current = index;
    cacheMovingSurfaces(true);
    pagerRef.current?.scrollTo({ x: index * pageW, animated: true });
  }, [pageW, canWarmPage, cacheMovingSurfaces]);
  const say = useCallback((title: string, body: string) => setNotice({ title, body }), []);
  const common = useMemo(() => ({ state, actions, onOpenSettings: () => setDlg('settings'), onOpenProfile: () => setDlg('profile'), onOpenArenas: () => setDlg('arenas') }), [state, actions]);
  const pageFor = (i: number): ReactNode => {
    const k = KEYS[i];
    if (k === 'store') return <StoreTab {...common} store={store} onConfirm={(c) => setConfirm(c)} />;
    if (k === 'collection') return <CollectionTab {...common} onOpenStore={() => goToTab(0)} onNotice={say} initialSub={initialCollectionSub} />;
    if (k === 'play') return <HomeTab {...common} onOpenLeaderboard={onOpenLeaderboard} searchMotion={search.progress} searchLocked={search.locked} onOpenLevelRoad={() => setDlg('road')} onOpenStore={() => goToTab(0)} onOpenQuests={() => { actions.getDailyQuests(); setDlg('quests'); }} onOpenModes={() => setDlg('mode')} onOpenBot={() => setDlg('bot')} onOpenDailyQuestion={() => { actions.startDailyCrossover(); setDlg('dailycx'); }} />;
    if (k === 'friends') return <FriendsTab {...common} onOpenRequests={() => setDlg('requests')} onOpenAddFriend={() => { actions.searchUsers(''); setDlg('addfriend'); }} onOpenMessages={() => setDlg('messages')} onOpenFriend={(f) => { setFriend(f); setDlg('friend'); }} onNotice={say} />;
    return <TournamentsTab {...common} onOpenLevelRoad={() => setDlg('road')} onOpenLeague={() => { actions.getLeague(); setDlg('league'); }} onOpenTournament={(id) => { actions.getTournament(id); setTourId(id); setDlg('tournament'); }} onNotice={say} />;
  };

  const closeDlg = () => setDlg(null);
  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      <Animated.ScrollView ref={pagerRef} horizontal pagingEnabled scrollEnabled={!search.locked} showsHorizontalScrollIndicator={false} bounces={false}
        contentOffset={initialOffset} onMomentumScrollEnd={onPageSettled} onScrollEndDrag={onPageSettled} onScrollBeginDrag={onPageDrag} onScroll={onPagerScroll} scrollEventThrottle={16}
        removeClippedSubviews={false} decelerationRate="fast" directionalLockEnabled
        keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {KEYS.map((k, i) => (
          <View key={k} ref={(view) => { pageSurfaces.current[i] = view; }} collapsable={false} style={{ width: pageW }} accessibilityElementsHidden={settledIdx !== i} importantForAccessibility={settledIdx === i ? 'auto' : 'no-hide-descendants'}>
            {/* Pasif sekme DONDURULUR: mount'ta kalır ama yeniden çizilmez (beş ağacı birden çizmek yerine bir tane) */}
            <TabFreeze active={settledIdx === i} freezeKey={k === 'play' ? searching : undefined} warmDelay={220 + i * 120} canWarm={canWarmPage}>
              {k === 'play' ? (
                <View style={{ flex: 1, paddingTop: insets.top }}>{pageFor(i)}</View>
              ) : (
                <ScrollView ref={(r) => { pageRefs.current[i] = r; }} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: mk(40) }}
                  showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {pageFor(i)}
                </ScrollView>
              )}
            </TabFreeze>
          </View>
        ))}
      </Animated.ScrollView>
      <Animated.View pointerEvents={search.locked ? 'none' : 'auto'} accessibilityElementsHidden={search.locked} importantForAccessibility={search.locked ? 'no-hide-descendants' : 'auto'} style={{ opacity: search.progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0, 0] }), transform: [{ translateY: search.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 150] }) }] }}>
        <BottomNav scrollX={scrollX} pageW={pageW} active={KEYS[settledIdx] ?? active} onPress={selectPage} badges={{ friends: state.friendRequests.length || undefined }} />
      </Animated.View>
      <HomeSearchOverlay searching={searching} progress={search.progress} moving={search.moving} eta={state.searchEta} onCancel={actions.cancelSearch} />

      {/* ── pencereler ── */}
      {dlg === 'mode' || dlg === 'bot' ? <ModeMenuDialog state={state} actions={actions} bot={dlg === 'bot'} onClose={closeDlg} onLocked={() => setNotice({ title: t('friends.inviteNeedsPackTitle'), body: t('ui2.packLockedBody'), yesLabel: S.store, onYes: () => goToTab(0) })} /> : null}
      {dlg === 'language' ? <LanguageDialog onClose={() => setDlg('settings')} onPick={(code) => { setLanguage(code); setDlg(null); onLanguageChange?.(); }} /> : null}
      {dlg === 'quests' ? <QuestsDialog state={state} actions={actions} onClose={closeDlg} onGo={() => goToTab(2)} /> : null}
      {dlg === 'settings' ? <SettingsDialog actions={actions} onClose={closeDlg} onOpenFeedback={onOpenFeedback} onOpenLanguage={() => setDlg('language')} onDeleteAccount={() => { setDlg(null); setNotice({ title: up(t('profile.deleteAccount')), body: t('profile.deleteAccountConfirm'), yesLabel: t('ui2.delete'), onYes: () => actions.deleteAccount() }); }} /> : null}
      {dlg === 'room' ? <PrivateRoomDialog state={state} actions={actions} onClose={closeDlg} /> : null}
      {dlg === 'requests' ? <RequestsDialog state={state} actions={actions} onClose={closeDlg} /> : null}
      {dlg === 'league' ? <LeagueDialog state={state} onClose={closeDlg} /> : null}
      {dlg === 'tournament' && tourId ? <TournamentDialog state={state} actions={actions} id={tourId} onClose={closeDlg} /> : null}
      {/* Günün Crossover'ı — eski pencere bileşeni, UI2 derisiyle (GameModal) çiziliyor */}
      <DailyCrossoverModal visible={dlg === 'dailycx'} cx={state.dailyCx} wrong={state.dailyCxWrong} reward={state.dailyCxReward}
        onGuess={actions.guessDailyCrossover} onClose={() => { setDlg(null); actions.clearDailyCxReward(); }} />
      {dlg === 'road' ? <LevelRoadDialog state={state} actions={actions} onOpenStore={() => goToTab(0)} onClose={closeDlg} /> : null}
      <ArenasDialog state={state} onClose={closeDlg} visible={dlg === 'arenas'} />
      {dlg === 'addfriend' ? <AddFriendDialog state={state} actions={actions} onClose={closeDlg} onNotice={say} /> : null}
      {dlg === 'messages' ? <MessagesDialog state={state} actions={actions} onClose={closeDlg} /> : null}
      {dlg === 'friend' && friend ? <FriendActionsDialog friend={friend} actions={actions} onClose={closeDlg} onFriendlyMatch={() => setDlg('friendmatch')} onOpenMessages={() => {}} /> : null}
      {dlg === 'friendmatch' && friend ? <ModeMenuDialog state={state} actions={actions} invite={{ userId: friend.userId, name: friend.displayName }} onClose={closeDlg} onLocked={() => setNotice({ title: t('friends.inviteNeedsPackTitle'), body: t('friends.socialPackRequiredBody') })} /> : null}
      {/* Sohbet ekranı: UI2 kabuğunda her zaman mount — state.chatWith dolunca açılır */}
      <ChatOverlay state={state} actions={actions} />
      {dlg === 'profile' ? <ProfileDialog state={state} actions={actions} onOpenMatchHistory={onOpenMatchHistory} onClose={closeDlg} onConfirm={(c) => setConfirm(c)} onNotice={say} onOpenStore={() => goToTab(0)} onOpenCollection={() => goToTab(1)} /> : null}
      {state.tournamentReady ? <TournamentReadyDialog state={state} actions={actions} /> : null}
      {state.tournamentOver ? <TournamentOverDialog state={state} actions={actions} /> : null}
      {confirm ? <ConfirmDialog title={confirm.title} body={confirm.body} price={confirm.price} priceText={confirm.priceText} onClose={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); c.onYes(); }} /> : null}
      {(notice || (store.dialogOpen && store.dialog)) ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,10,40,0.72)', alignItems: 'center', justifyContent: 'center', padding: SIDE }}>
          <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} style={{ width: '100%' }} inner={{ padding: mk(28), alignItems: 'center' }}>
            <OutlinedText size={mk(40)} width={mk(4)}>{notice?.title ?? store.dialog?.title ?? ''}</OutlinedText>
            <Text style={{ color: C.white, fontFamily: F.semi, fontSize: fz(24), textAlign: 'center', lineHeight: fz(32), marginTop: mk(14) }}>{notice?.body ?? store.dialog?.body ?? ''}</Text>
            <View style={{ flexDirection: 'row', gap: mk(16), marginTop: mk(26), alignSelf: 'stretch' }}>
              {notice?.onYes ? (
                <>
                  <ChunkyButton kind="gray" label={up(t('searching.cancel'))} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => setNotice(null)} />
                  <ChunkyButton kind="red" label={notice.yesLabel ?? up(t('common.yes'))} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { const n = notice; setNotice(null); n.onYes?.(); }} />
                </>
              ) : <ChunkyButton kind="gold" label={up(t('settings.confirm'))} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { setNotice(null); store.closeDialog(); }} />}
            </View>
          </Plate>
        </View>
      ) : null}
    </View>
  );
}
export { GemAmount, LIP, OUTLINE };
