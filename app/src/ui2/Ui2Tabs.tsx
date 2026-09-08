// UI2 sekme konteyneri: damalı zemin + sekme gövdesi + alt nav + yerleşik pencere katmanı
// (native Modal DEĞİL: reklam slotu / iOS sunum zinciriyle çakışmaz).
import { useCallback, useEffect, useRef, useState, type ReactNode, useLayoutEffect } from 'react';
import { ScrollView, Text, View, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { BottomNav, type NavKey } from './Shell';
import { CheckerBg, ChunkyButton, GemAmount, OutlinedText, Plate } from './primitives';
import { HomeTab } from './HomeTab';
import { StoreTab } from './StoreTab';
import { FriendsTab } from './FriendsTab';
import { TournamentsTab } from './TournamentsTab';
import { CollectionTab } from './CollectionTab';
import { DailyCrossoverModal } from '../screens';
import { ConfirmDialog, LanguageDialog, LeagueDialog, ModeMenuDialog, PrivateRoomDialog, QuestsDialog, RequestsDialog, SettingsDialog, ArenasDialog, LevelRoadDialog, ProfileDialog, TournamentDialog, TournamentOverDialog, TournamentReadyDialog } from './Dialogs';
import { setLanguage, t } from '../i18n';
import { S, up } from './strings';
import { useStorePurchases } from './useStorePurchases';
import { C, F, fz, LIP, mk, OUTLINE, SIDE, SW } from './tokens';

const KEYS: NavKey[] = ['store', 'collection', 'play', 'friends', 'tournaments'];
type Confirm = { title: string; body: string; price?: number; priceText?: string; onYes: () => void };
export type Ui2DialogKey = 'mode' | 'bot' | 'quests' | 'settings' | 'language' | 'room' | 'requests' | 'league' | 'tournament' | 'road' | 'arenas' | 'profile' | 'dailycx' | null;

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
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (initialScrollY) setTimeout(() => scrollRef.current?.scrollTo({ y: initialScrollY, animated: false }), 50); }, [initialScrollY, activeTab]);
  const active = KEYS[activeTab] ?? 'play';
  // Sekme geçişi: gövde yönlü kayar + belirir (CR sayfa kaydırma hissi); nav genişlemesi LayoutAnimation ile.
  const slide = useRef(new Animated.Value(0)).current; const fade = useRef(new Animated.Value(1)).current; const prevTab = useRef(activeTab);
  useLayoutEffect(() => {
    const dir = activeTab > prevTab.current ? 1 : activeTab < prevTab.current ? -1 : 0; prevTab.current = activeTab;
    if (!dir) return;
    slide.setValue(dir * SW * 0.22); fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [activeTab, slide, fade]);
  const say = useCallback((title: string, body: string) => setNotice({ title, body }), []);
  const common = { state, actions, onOpenSettings: () => setDlg('settings'), onOpenProfile: () => setDlg('profile'), onOpenArenas: () => setDlg('arenas') };
  let body: ReactNode;
  if (active === 'store') body = <StoreTab {...common} store={store} onConfirm={(c) => setConfirm(c)} />;
  else if (active === 'play') body = <HomeTab {...common} onOpenLevelRoad={() => setDlg('road')} onOpenStore={() => goToTab(0)} onOpenQuests={() => { actions.getDailyQuests(); setDlg('quests'); }} onOpenModes={() => setDlg('mode')} onOpenBot={() => setDlg('bot')} onOpenDailyQuestion={() => { actions.startDailyCrossover(); setDlg('dailycx'); }} />;
  else if (active === 'friends') body = <FriendsTab {...common} onOpenRequests={() => setDlg('requests')} onOpenAddFriend={() => say(t('friends.addSection'), t('ui2.addFriendHint'))} onNotice={say} />;
  else if (active === 'tournaments') body = <TournamentsTab {...common} onOpenLevelRoad={() => setDlg('road')} onOpenLeague={() => { actions.getLeague(); setDlg('league'); }} onOpenTournament={(id) => { actions.getTournament(id); setTourId(id); setDlg('tournament'); }} onNotice={say} />;
  else body = <CollectionTab {...common} onOpenStore={() => goToTab(0)} onNotice={say} initialSub={initialCollectionSub} />;

  const closeDlg = () => setDlg(null);
  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateX: slide }] }}>
      {active === 'play' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>{body}</View>
      ) : (
        <ScrollView key={active} ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: mk(40) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {body}
        </ScrollView>
      )}
      </Animated.View>
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
