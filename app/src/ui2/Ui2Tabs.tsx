// UI2 sekme konteyneri: damalı zemin + sekme gövdesi + alt nav + yerleşik pencere katmanı
// (native Modal DEĞİL: reklam slotu / iOS sunum zinciriyle çakışmaz).
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Actions, GameState } from './types';
import { BottomNav, type NavKey } from './Shell';
import { CheckerBg, ChunkyButton, GemAmount, OutlinedText, Plate } from './primitives';
import { HomeTab } from './HomeTab';
import { StoreTab } from './StoreTab';
import { FriendsTab } from './FriendsTab';
import { TournamentsTab } from './TournamentsTab';
import { CollectionTab } from './CollectionTab';
import { ConfirmDialog, LanguageDialog, LeagueDialog, ModeMenuDialog, PrivateRoomDialog, QuestsDialog, RequestsDialog, SettingsDialog } from './Dialogs';
import { setLanguage } from '../i18n';
import { useStorePurchases } from './useStorePurchases';
import { C, F, LIP, OUTLINE, SIDE, mk } from './tokens';

const KEYS: NavKey[] = ['store', 'collection', 'play', 'friends', 'tournaments'];
type Confirm = { title: string; body: string; price?: number; priceText?: string; onYes: () => void };
export type Ui2DialogKey = 'mode' | 'bot' | 'quests' | 'settings' | 'language' | 'room' | 'requests' | 'league' | null;

export function Ui2Tabs({ state, actions, activeTab, goToTab, onOpenLevelRoad, onLanguageChange, onDiamondCelebration, initialScrollY = 0, initialDialog = null }: {
  state: GameState; actions: Actions; activeTab: number; goToTab: (i: number) => void;
  onOpenLevelRoad: () => void; onLanguageChange?: () => void; onDiamondCelebration?: (c: { amount: number }) => void; initialScrollY?: number; initialDialog?: Ui2DialogKey;
}) {
  const insets = useSafeAreaInsets();
  const store = useStorePurchases(state, actions, onDiamondCelebration);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string; onYes?: () => void; yesLabel?: string } | null>(null);
  const [dlg, setDlg] = useState<Ui2DialogKey>(initialDialog);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (initialScrollY) setTimeout(() => scrollRef.current?.scrollTo({ y: initialScrollY, animated: false }), 50); }, [initialScrollY, activeTab]);
  const active = KEYS[activeTab] ?? 'play';
  const say = useCallback((title: string, body: string) => setNotice({ title, body }), []);
  const common = { state, actions, onOpenSettings: () => setDlg('settings'), onOpenProfile: () => actions.openProfile(), onOpenArenas: () => actions.openArenas() };
  let body: ReactNode;
  if (active === 'store') body = <StoreTab {...common} store={store} onConfirm={(c) => setConfirm(c)} />;
  else if (active === 'play') body = <HomeTab {...common} onOpenLevelRoad={onOpenLevelRoad} onOpenStore={() => goToTab(0)} onOpenQuests={() => { actions.getDailyQuests(); setDlg('quests'); }} onOpenModes={() => setDlg('mode')} onOpenBot={() => setDlg('bot')} />;
  else if (active === 'friends') body = <FriendsTab {...common} onOpenRequests={() => setDlg('requests')} onOpenAddFriend={() => say('ARKADAŞ EKLE', 'Aşağıdaki arama kutusundan oyuncu adıyla ara.')} onNotice={say} />;
  else if (active === 'tournaments') body = <TournamentsTab {...common} onOpenLevelRoad={onOpenLevelRoad} onOpenLeague={() => { actions.getLeague(); setDlg('league'); }} onOpenTournament={(id) => { actions.getTournament(id); say('TURNUVA', 'Eşleşme ağacı penceresi hazırlanıyor.'); }} onNotice={say} />;
  else body = <CollectionTab {...common} onOpenStore={() => goToTab(0)} onNotice={say} />;

  const closeDlg = () => setDlg(null);
  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      <ScrollView key={active} ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: mk(40) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <BottomNav active={active} onPress={(k) => { setDlg(null); goToTab(KEYS.indexOf(k)); }} badges={{ friends: state.friendRequests.length || undefined }} />

      {/* ── pencereler ── */}
      {dlg === 'mode' || dlg === 'bot' ? <ModeMenuDialog state={state} actions={actions} bot={dlg === 'bot'} onClose={closeDlg} onLocked={() => setNotice({ title: 'SOSYAL PAKET GEREKLİ', body: 'Bu mod Sosyal Paket ile açılır: tüm modlar + reklamsız oyun.', yesLabel: 'MAĞAZA', onYes: () => goToTab(0) })} /> : null}
      {dlg === 'language' ? <LanguageDialog onClose={() => setDlg('settings')} onPick={(code) => { setLanguage(code); setDlg(null); onLanguageChange?.(); }} /> : null}
      {dlg === 'quests' ? <QuestsDialog state={state} actions={actions} onClose={closeDlg} onGo={() => goToTab(2)} /> : null}
      {dlg === 'settings' ? <SettingsDialog actions={actions} onClose={closeDlg} onOpenLanguage={() => setDlg('language')} onDeleteAccount={() => { setDlg(null); setNotice({ title: 'HESABI SİL', body: 'Hesabın ve tüm verilerin KALICI olarak silinecek. Emin misin?', yesLabel: 'SİL', onYes: () => actions.deleteAccount() }); }} /> : null}
      {dlg === 'room' ? <PrivateRoomDialog state={state} actions={actions} onClose={closeDlg} /> : null}
      {dlg === 'requests' ? <RequestsDialog state={state} actions={actions} onClose={closeDlg} /> : null}
      {dlg === 'league' ? <LeagueDialog state={state} onClose={closeDlg} /> : null}
      {confirm ? <ConfirmDialog title={confirm.title} body={confirm.body} price={confirm.price} priceText={confirm.priceText} onClose={() => setConfirm(null)} onYes={() => { const c = confirm; setConfirm(null); c.onYes(); }} /> : null}
      {(notice || (store.dialogOpen && store.dialog)) ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,10,40,0.72)', alignItems: 'center', justifyContent: 'center', padding: SIDE }}>
          <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} style={{ width: '100%' }} inner={{ padding: mk(28), alignItems: 'center' }}>
            <OutlinedText size={mk(40)} width={mk(4)}>{notice?.title ?? store.dialog?.title ?? ''}</OutlinedText>
            <Text style={{ color: C.white, fontFamily: F.semi, fontSize: mk(24), textAlign: 'center', lineHeight: mk(32), marginTop: mk(14) }}>{notice?.body ?? store.dialog?.body ?? ''}</Text>
            <View style={{ flexDirection: 'row', gap: mk(16), marginTop: mk(26), alignSelf: 'stretch' }}>
              {notice?.onYes ? (
                <>
                  <ChunkyButton kind="gray" label="VAZGEÇ" height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => setNotice(null)} />
                  <ChunkyButton kind="red" label={notice.yesLabel ?? 'EVET'} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { const n = notice; setNotice(null); n.onYes?.(); }} />
                </>
              ) : <ChunkyButton kind="gold" label="TAMAM" height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={() => { setNotice(null); store.closeDialog(); }} />}
            </View>
          </Plate>
        </View>
      ) : null}
    </View>
  );
}
export { GemAmount, LIP, OUTLINE };
