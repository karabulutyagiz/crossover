// UI2 sekme konteyneri: damalı zemin + sekme gövdesi + alt nav + yerleşik pencere katmanı
// (native Modal DEĞİL: reklam slotu / iOS sunum zinciriyle çakışmaz).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { BottomNav, type NavKey } from './Shell';
import { CheckerBg, ChunkyButton, GemAmount, OutlinedText, Plate } from './primitives';
import { HomeTab } from './HomeTab';
import { StoreTab } from './StoreTab';
import { FriendsTab } from './FriendsTab';
import { TournamentsTab } from './TournamentsTab';
import { CollectionTab } from './CollectionTab';
import { ChatOverlay, DailyCrossoverModal } from '../screens';
import { AddFriendDialog, ConfirmDialog, LanguageDialog, LeagueDialog, MessagesDialog, ModeMenuDialog, PrivateRoomDialog, QuestsDialog, RequestsDialog, SettingsDialog, ArenasDialog, LevelRoadDialog, ProfileDialog, TournamentDialog, TournamentOverDialog, TournamentReadyDialog } from './Dialogs';
import { setLanguage, t } from '../i18n';
import { S, up } from './strings';
import { useStorePurchases } from './useStorePurchases';
import { C, F, fz, LIP, mk, OUTLINE, SIDE, SW } from './tokens';

const KEYS: NavKey[] = ['store', 'collection', 'play', 'friends', 'tournaments'];
type Confirm = { title: string; body: string; price?: number; priceText?: string; onYes: () => void };
export type Ui2DialogKey = 'mode' | 'bot' | 'quests' | 'settings' | 'language' | 'room' | 'requests' | 'league' | 'tournament' | 'road' | 'arenas' | 'profile' | 'dailycx' | 'addfriend' | 'messages' | null;

export function Ui2Tabs({ state, actions, activeTab, goToTab, onOpenLevelRoad, onLanguageChange, onDiamondCelebration, onOpenFeedback, onOpenMatchHistory, initialScrollY = 0, initialDialog = null, initialCollectionSub }: {
  state: GameState; actions: Actions; activeTab: number; goToTab: (i: number) => void;
  onOpenLevelRoad: () => void; onLanguageChange?: () => void; onDiamondCelebration?: (c: { amount: number }) => void; onOpenFeedback?: (category?: 'sponsorship') => void; onOpenMatchHistory?: () => void; initialScrollY?: number; initialDialog?: Ui2DialogKey; initialCollectionSub?: 'powers' | 'cosmetics' | 'emotes';
}) {
  const insets = useSafeAreaInsets();
  const store = useStorePurchases(state, actions, onDiamondCelebration);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string; onYes?: () => void; yesLabel?: string } | null>(null);
  const [dlg, setDlg] = useState<Ui2DialogKey>(initialDialog);
  const [tourId, setTourId] = useState<string | null>(initialDialog === 'tournament' ? 't2' : null);
  useEffect(() => { if (initialScrollY) setTimeout(() => pageRefs.current[activeTab]?.scrollTo({ y: initialScrollY, animated: false }), 60); }, [initialScrollY, activeTab]);
  const active = KEYS[activeTab] ?? 'play';
  // ── CLASH ROYALE SAYFA ÇEVİRİCİ: sekmeler yan yana; parmakla kaydırılır, nav'a dokununca kayar. ──
  // Sekmeler bir kez ziyaret edilince MOUNT'TA KALIR: geçişte yeniden kurulum yok (eski 'glitch' buydu).
  const { width: pageW } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const pageRefs = useRef<(ScrollView | null)[]>([]);
  const [visited, setVisited] = useState<number[]>([activeTab]);
  const lastIdx = useRef(activeTab);
  useEffect(() => {
    setVisited((v) => (v.includes(activeTab) ? v : [...v, activeTab]));
    if (lastIdx.current !== activeTab) {
      pagerRef.current?.scrollTo({ x: activeTab * pageW, animated: true });
      lastIdx.current = activeTab;
    }
  }, [activeTab, pageW]);
  const onPageSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageW));
    if (i !== lastIdx.current && i >= 0 && i < KEYS.length) { lastIdx.current = i; setDlg(null); goToTab(i); }
  }, [goToTab, pageW]);
  const say = useCallback((title: string, body: string) => setNotice({ title, body }), []);
  const common = useMemo(() => ({ state, actions, onOpenSettings: () => setDlg('settings'), onOpenProfile: () => setDlg('profile'), onOpenArenas: () => setDlg('arenas') }), [state, actions]);
  const pageFor = (i: number): ReactNode => {
    const k = KEYS[i];
    if (k === 'store') return <StoreTab {...common} store={store} onConfirm={(c) => setConfirm(c)} />;
    if (k === 'collection') return <CollectionTab {...common} onOpenStore={() => goToTab(0)} onNotice={say} initialSub={initialCollectionSub} />;
    if (k === 'play') return <HomeTab {...common} onOpenLevelRoad={() => setDlg('road')} onOpenStore={() => goToTab(0)} onOpenQuests={() => { actions.getDailyQuests(); setDlg('quests'); }} onOpenModes={() => setDlg('mode')} onOpenBot={() => setDlg('bot')} onOpenDailyQuestion={() => { actions.startDailyCrossover(); setDlg('dailycx'); }} />;
    if (k === 'friends') return <FriendsTab {...common} onOpenRequests={() => setDlg('requests')} onOpenAddFriend={() => { actions.searchUsers(''); setDlg('addfriend'); }} onOpenMessages={() => setDlg('messages')} onNotice={say} />;
    return <TournamentsTab {...common} onOpenLevelRoad={() => setDlg('road')} onOpenLeague={() => { actions.getLeague(); setDlg('league'); }} onOpenTournament={(id) => { actions.getTournament(id); setTourId(id); setDlg('tournament'); }} onNotice={say} />;
  };

  const closeDlg = () => setDlg(null);
  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
        contentOffset={{ x: activeTab * pageW, y: 0 }} onMomentumScrollEnd={onPageSettled} scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {KEYS.map((k, i) => (
          <View key={k} style={{ width: pageW }}>
            {!visited.includes(i) ? null : k === 'play' ? (
              <View style={{ flex: 1, paddingTop: insets.top }}>{pageFor(i)}</View>
            ) : (
              <ScrollView ref={(r) => { pageRefs.current[i] = r; }} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: mk(40) }}
                showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {pageFor(i)}
              </ScrollView>
            )}
          </View>
        ))}
      </ScrollView>
      <BottomNav active={active} onPress={(k) => { setDlg(null); goToTab(KEYS.indexOf(k)); }} badges={{ friends: state.friendRequests.length || undefined }} />

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
      {dlg === 'arenas' ? <ArenasDialog state={state} onClose={closeDlg} /> : null}
      {dlg === 'addfriend' ? <AddFriendDialog state={state} actions={actions} onClose={closeDlg} onNotice={say} /> : null}
      {dlg === 'messages' ? <MessagesDialog state={state} actions={actions} onClose={closeDlg} /> : null}
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
