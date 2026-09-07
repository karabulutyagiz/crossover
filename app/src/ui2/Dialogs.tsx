// UI2 pencereleri — mock: refs/popups.png (mavi çerçeve, başlık plakası, kırmızı X, altın vurgu).
// Yerleşik katman (native Modal değil). Mod seçici, görevler, ayarlar, özel oda, satın alma onayı, istekler, lig.
import { useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Share, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFeedbackPreferences } from '../feedback/useFeedbackPreferences';
import { LANGUAGES, currentLang, setLanguage, t, type MessageKey } from '../i18n';
import { getPushPermissionGranted, requestPushPermission } from '../notifications';
import type { GameMode } from '../protocol';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { Bar, ChunkyButton, GemAmount, OutlinedText, Plate, fmt } from './primitives';
import { S, up } from './strings';
import { hasActiveSocialPack } from '../monetization';
import { PACK_MODES } from './products';
import { IcCheckBadge, IcNavFriends, IcNavPlay, IcStar, IcTrophy } from './icons-ui';
import { IcBell, IcCheck, IcChevron, IcClose, IcCopy, IcGlobe, IcLock, IcModeCountryTeam, IcModeCozKazan, IcModeGuessWho, IcModeLetterTeam, IcModeTeamTeam, IcModeXox, IcMusic, IcSound, IcVibrate } from './icons';
import { C, F, LIP, OUTLINE, SIDE, mk } from './tokens';

// ── Kabuk ──────────────────────────────────────────────────────────────────────
export function Dialog({ title, onClose, children, accent = false, wide = false }: { title: string; onClose: () => void; children: ReactNode; accent?: boolean; wide?: boolean }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,10,40,0.74)', alignItems: 'center', justifyContent: 'center', padding: wide ? mk(20) : SIDE }}>
      <Pressable style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} onPress={onClose} />
      <View style={{ width: '100%', maxHeight: '92%' }}>
        <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} inner={{ paddingHorizontal: mk(18), paddingBottom: mk(18), paddingTop: mk(14) }}>
          <View style={{ alignItems: 'center', marginBottom: mk(12) }}>
            <Plate face={accent ? C.gold : '#1B5AE0'} top={accent ? C.goldLight : '#5A9BFF'} lip={accent ? C.goldDark : '#0B3A9E'} radius={mk(18)} style={{ alignSelf: 'stretch', marginRight: mk(30) }} inner={{ height: mk(72) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
              <OutlinedText size={mk(36)} width={mk(3)} color={accent ? C.ink : C.white} outline={accent ? '#FFF6C7' : C.ink}>{title}</OutlinedText>
            </Plate>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: mk(4) }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Plate>
        <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: -mk(6), right: -mk(6), width: mk(74), height: mk(74), borderRadius: mk(37), backgroundColor: C.red, borderWidth: mk(5), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
          <IcClose size={mk(46)} />
        </Pressable>
      </View>
    </View>
  );
}

// ── Mod seçici — BÜYÜK pencere, gerçek oyun modları (kullanıcı 2026-09-07). bot=true: Bot Maçı ──
// Çevrimiçi listede Takım-Takım YOK: HEMEN OYNA zaten yalnız Takım-Takım eşleştirir (kullanıcı 2026-09-07); bot maçında kalır.
// art: kullanıcının mod rozeti (indirilenler, 2026-09-07); yoksa vektör ikon.
type ModeDef = { id: GameMode; nameKey: MessageKey; descKey: MessageKey; Icon: (p: { size?: number }) => ReactNode; art?: ImageSourcePropType; face: string; top: string; lip: string };
const MODE_DEFS: ModeDef[] = [
  { id: 'team-team', nameKey: 'mode.teamTeam', descKey: 'ui2.md.teamTeam', Icon: IcModeTeamTeam, art: UI2.mode_team_team, face: '#1E7BFF', top: '#7DB8FF', lip: '#0E4FB8' },
  { id: 'country-team', nameKey: 'mode.countryTeam', descKey: 'ui2.md.countryTeam', Icon: IcModeCountryTeam, art: UI2.mode_country_team, face: '#E8443A', top: '#FF9C8F', lip: '#9E2118' },
  { id: 'letter-team', nameKey: 'mode.letterTeam', descKey: 'ui2.md.letterTeam', Icon: IcModeLetterTeam, art: UI2.mode_letter_team, face: '#E8B400', top: '#FFE98A', lip: '#A67900' },
  { id: 'xox', nameKey: 'mode.xox', descKey: 'ui2.md.xox', Icon: IcModeXox, art: UI2.mode_xox, face: '#22C55E', top: '#86EFAC', lip: '#15803D' },
  { id: 'cozkazan', nameKey: 'mode.cozkazan', descKey: 'ui2.md.cozkazan', Icon: IcModeCozKazan, art: UI2.mode_cozkazan, face: '#8E2BEA', top: '#C58BFF', lip: '#4B0F9E' },
  { id: 'guess-who', nameKey: 'mode.guessWho', descKey: 'ui2.md.guessWho', Icon: IcModeGuessWho, art: UI2.mode_guess_who, face: '#FF7A1A', top: '#FFB472', lip: '#C24E00' },
];
export function ModeMenuDialog({ state, actions, onClose, bot = false, onLocked }: { state: GameState; actions: Actions; onClose: () => void; bot?: boolean; onLocked: (mode: GameMode) => void }) {
  const defs = bot ? MODE_DEFS : MODE_DEFS.filter((m) => m.id !== 'team-team');
  const [mode, setMode] = useState<GameMode>(bot ? 'team-team' : 'country-team');
  const [diff, setDiff] = useState<'easy' | 'medium' | 'hard'>('medium');
  const hasPack = hasActiveSocialPack(state.profile);
  const name = state.profile?.displayName ?? t('ui2.player');
  const locked = PACK_MODES.includes(mode) && !hasPack;
  const play = () => {
    if (locked) { onClose(); onLocked(mode); return; }
    onClose();
    if (bot) actions.createSolo(name, { mode, difficulty: diff }); else actions.findMatch({ mode });
  };
  return (
    <Dialog title={up(bot ? t('home.solo') : t('ui2.gameModes'))} onClose={onClose} wide>
      <Text style={{ color: C.white, fontFamily: F.bold, fontSize: mk(22), textAlign: 'center', marginBottom: mk(12) }}>{bot ? t('ui2.pickModeBot') : t('ui2.pickMode')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: mk(12), justifyContent: 'center' }}>
        {defs.map((m) => {
          const on = mode === m.id; const lk = PACK_MODES.includes(m.id) && !hasPack;
          return (
            <Pressable key={m.id} onPress={() => setMode(m.id)} style={{ width: '48.5%' }}>
              <Plate face={m.face} top={m.top} lip={m.lip} outline={on ? C.gold : C.navy} outlineWidth={on ? mk(7) : OUTLINE} radius={mk(22)} inner={{ height: mk(252) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(10), paddingTop: mk(6) }}>
                {m.art ? <Image source={m.art} style={{ width: mk(142), height: mk(142) }} resizeMode="contain" /> : <m.Icon size={mk(110)} />}
                <OutlinedText size={mk(26)} width={mk(2)} numberOfLines={1} style={{ marginTop: mk(4) }}>{t(m.nameKey)}</OutlinedText>
                <Text numberOfLines={2} style={{ color: C.white, fontFamily: F.semi, fontSize: mk(15), textAlign: 'center', lineHeight: mk(19), marginTop: mk(2) }}>{t(m.descKey)}</Text>
              </Plate>
              {lk ? <View style={{ position: 'absolute', top: -mk(6), right: -mk(4), width: mk(52), height: mk(52), borderRadius: mk(26), backgroundColor: C.panelInk, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><IcLock size={mk(32)} /></View> : null}
            </Pressable>
          );
        })}
      </View>
      {bot ? <View style={{ flexDirection: 'row', gap: mk(8), marginTop: mk(14), justifyContent: 'center' }}>{(['easy', 'medium', 'hard'] as const).map((d) => <Chip key={d} label={t(`difficulty.${d}` as MessageKey)} on={diff === d} onPress={() => setDiff(d)} />)}</View> : null}
      <View style={{ marginTop: mk(16) }}><ChunkyButton kind={locked ? 'gold' : 'green'} label={locked ? t('friends.inviteNeedsPackTitle') : t('ui2.playBtn')} height={mk(88)} size={locked ? mk(28) : mk(36)} onPress={play} /></View>
    </Dialog>
  );
}
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: on ? C.gold : C.panelInk, borderRadius: mk(14), borderWidth: mk(3), borderColor: on ? C.goldDark : C.navy, paddingHorizontal: mk(16), paddingVertical: mk(7) }}>
      <Text style={{ color: on ? C.ink : C.white, fontFamily: F.black, fontSize: mk(19) }}>{label}</Text>
    </Pressable>
  );
}

// ── Dil seçimi — ayrı pencere (Clash Royale usulü liste) ──
export function LanguageDialog({ onClose, onPick }: { onClose: () => void; onPick: (code: string) => void }) {
  const cur = currentLang();
  return (
    <Dialog title={up(t('settings.language'))} onClose={onClose}>
      {LANGUAGES.map((l) => {
        const on = l.code === cur;
        return (
          <Pressable key={l.code} onPress={() => onPick(l.code)}>
            <Plate face={on ? '#1B5AE0' : C.panelInk} top={on ? '#5A9BFF' : '#2F63C8'} lip={on ? '#0B3A9E' : '#041A4E'} outline={on ? C.gold : C.navy} radius={mk(16)} style={{ marginBottom: mk(8) }} inner={{ height: mk(76) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(16), gap: mk(12) }}>
              <Text style={{ color: C.white, fontFamily: F.bold, fontSize: mk(23), flex: 1 }}>{l.name}</Text>
              {on ? <IcCheck size={mk(40)} /> : <View style={{ width: mk(36), height: mk(36), borderRadius: mk(18), borderWidth: mk(3), borderColor: '#5A7BC0' }} />}
            </Plate>
          </Pressable>
        );
      })}
    </Dialog>
  );
}

// ── Görevler ───────────────────────────────────────────────────────────────────
export function QuestsDialog({ state, actions, onClose, onGo }: { state: GameState; actions: Actions; onClose: () => void; onGo: () => void }) {
  const q = state.dailyQuests?.quests ?? [];
  const done = q.filter((x) => x.claimed).length;
  const totalXp = q.reduce((a, x) => a + x.xp, 0);
  return (
    <Dialog title={t('ui2.quests')} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: mk(8), marginBottom: mk(12) }}>
        {[t('ui2.q.daily'), t('store.weekly'), t('ui2.q.season')].map((l, i) => <View key={l} style={{ flex: 1, backgroundColor: i === 0 ? C.gold : C.panelInk, borderRadius: mk(12), borderWidth: mk(3), borderColor: i === 0 ? C.goldDark : C.navy, alignItems: 'center', paddingVertical: mk(6), opacity: i === 0 ? 1 : 0.5 }}><Text style={{ color: i === 0 ? C.ink : C.white, fontFamily: F.black, fontSize: mk(19) }}>{l}</Text></View>)}
      </View>
      {q.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), textAlign: 'center', padding: mk(10) }}>{S.loading}</Text> : null}
      {q.map((x, i) => (
        <Plate key={x.id} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ height: mk(112) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
          <View style={{ width: mk(64), alignItems: 'center' }}>{i % 3 === 0 ? <IcNavPlay size={mk(58)} /> : i % 3 === 1 ? <IcTrophy size={mk(58)} /> : <IcNavFriends size={mk(58)} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: C.white, fontFamily: F.bold, fontSize: mk(20) }}>{t(x.titleKey as MessageKey, { n: String(x.target) } as any)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginTop: mk(4) }}><Bar value={x.progress} max={x.target} color={C.green} track="#04163F" height={mk(20)} radius={mk(6)} style={{ flex: 1 }} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(16) }}>{`${Math.min(x.progress, x.target)} / ${x.target}`}</Text></View>
          </View>
          <View style={{ alignItems: 'center', width: mk(70) }}><IcStar size={mk(40)} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(15) }}>{`+${x.xp} XP`}</Text></View>
          {x.claimed ? <IcCheckBadge size={mk(52)} />
            : <ChunkyButton kind={x.done ? 'green' : 'blue'} label={x.done ? S.claim : t('ui2.q.go')} height={mk(56)} size={mk(22)} style={{ width: mk(100) }} onPress={() => (x.done ? actions.claimQuest(x.id) : (onClose(), onGo()))} />}
        </Plate>
      ))}
      {q.length ? (
        <Plate face={C.gold} top={C.goldLight} lip={C.goldDark} radius={mk(18)} inner={{ height: mk(100) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
          <Image source={UI2.qs_chest} style={{ width: mk(80), height: mk(70) }} resizeMode="contain" />
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontFamily: F.black, fontSize: mk(19) }}>{t('ui2.q.completeAll')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginTop: mk(4) }}><Bar value={done} max={q.length} color={C.green} track="#6B4B00" height={mk(20)} radius={mk(6)} style={{ flex: 1 }} /><Text style={{ color: C.ink, fontFamily: F.black, fontSize: mk(16) }}>{`${done} / ${q.length}`}</Text></View></View>
          <View style={{ backgroundColor: '#1A1200', borderRadius: mk(12), paddingHorizontal: mk(12), paddingVertical: mk(6) }}><Text style={{ color: C.gold, fontFamily: F.black, fontSize: mk(20) }}>{`+${totalXp} XP`}</Text></View>
        </Plate>
      ) : null}
    </Dialog>
  );
}

// ── Ayarlar ────────────────────────────────────────────────────────────────────
export function SettingsDialog({ actions, onClose, onOpenLanguage, onDeleteAccount }: { actions: Actions; onClose: () => void; onOpenLanguage: () => void; onDeleteAccount: () => void }) {
  const { prefs, setPreference } = useFeedbackPreferences();
  const [push, setPush] = useState<boolean | null>(null);
  if (push === null) getPushPermissionGranted().then(setPush).catch(() => setPush(false));
  const lang = LANGUAGES.find((l) => l.code === currentLang())?.name ?? currentLang();
  const Row = ({ icon, label, right }: { icon: ReactNode; label: string; right: ReactNode }) => (
    <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ height: mk(92) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(16), gap: mk(14) }}>
      <View style={{ width: mk(56), alignItems: 'center' }}>{icon}</View><Text style={{ color: C.white, fontFamily: F.bold, fontSize: mk(24), flex: 1 }}>{label}</Text>{right}
    </Plate>
  );
  return (
    <Dialog title={up(t('settings.title'))} onClose={onClose}>
      <Row icon={<IcMusic size={mk(60)} />} label={t('settings.music')} right={<Toggle on={prefs.music} onChange={(v) => setPreference('music', v)} />} />
      <Row icon={<IcSound size={mk(60)} />} label={t('settings.sfx')} right={<Toggle on={prefs.sfx} onChange={(v) => setPreference('sfx', v)} />} />
      <Row icon={<IcVibrate size={mk(60)} />} label={t('settings.haptics')} right={<Toggle on={prefs.haptics} onChange={(v) => setPreference('haptics', v)} />} />
      <Row icon={<IcBell size={mk(60)} />} label={t('ui2.notifications')} right={<Toggle on={!!push} onChange={async (v) => { if (v) { const ok = await requestPushPermission().catch(() => false); setPush(ok); if (!ok) Linking.openSettings().catch(() => {}); } else Linking.openSettings().catch(() => {}); }} />} />
      <Row icon={<IcGlobe size={mk(60)} />} label={t('settings.language')} right={<Pressable onPress={onOpenLanguage} style={{ backgroundColor: '#0A2B78', borderRadius: mk(12), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(14), paddingVertical: mk(6), flexDirection: 'row', alignItems: 'center', gap: mk(10) }}><Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(20) }}>{lang}</Text><IcChevron size={mk(26)} /></Pressable>} />
      <View style={{ flexDirection: 'row', gap: mk(12), marginTop: mk(6) }}>
        <ChunkyButton kind="blue" label={t('ui2.resetDefaults')} height={mk(76)} size={mk(20)} style={{ flex: 1 }} onPress={() => { setPreference('music', true); setPreference('sfx', true); setPreference('haptics', true); }} />
        <ChunkyButton kind="red" label={t('profile.logout')} height={mk(76)} size={mk(24)} style={{ flex: 1 }} onPress={() => { onClose(); actions.logout(); }} />
      </View>
      <Pressable onPress={onDeleteAccount} style={{ alignSelf: 'center', marginTop: mk(14), padding: mk(6) }}><Text style={{ color: C.textMuted, fontFamily: F.semi, fontSize: mk(17), textDecorationLine: 'underline' }}>{t('ui2.deleteMyAccount')}</Text></Pressable>
    </Dialog>
  );
}
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!on)} style={{ flexDirection: 'row', alignItems: 'center', gap: mk(10) }}>
      <View style={{ width: mk(96), height: mk(50), borderRadius: mk(25), backgroundColor: on ? C.green : C.gray, borderWidth: mk(4), borderColor: C.navy, justifyContent: 'center', paddingHorizontal: mk(4) }}>
        <View style={{ width: mk(36), height: mk(36), borderRadius: mk(18), backgroundColor: C.white, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
      <Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(17), width: mk(92) }} numberOfLines={1}>{on ? t('ui2.on') : t('ui2.off')}</Text>
    </Pressable>
  );
}

// ── Özel oda ───────────────────────────────────────────────────────────────────
export function PrivateRoomDialog({ state, actions, onClose }: { state: GameState; actions: Actions; onClose: () => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const name = state.profile?.displayName ?? t('ui2.player');
  const roomCode = state.room?.code ?? null;
  return (
    <Dialog title={t('ui2.privateRoom')} onClose={onClose}>
      <Text style={{ color: C.white, fontFamily: F.semi, fontSize: mk(19), textAlign: 'center', lineHeight: mk(25), marginBottom: mk(12) }}>{t('ui2.roomIntro')}</Text>
      <View style={{ flexDirection: 'row', gap: mk(8), marginBottom: mk(14) }}>
        {(['create', 'join'] as const).map((k) => <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, backgroundColor: tab === k ? C.gold : C.panelInk, borderRadius: mk(12), borderWidth: mk(3), borderColor: tab === k ? C.goldDark : C.navy, alignItems: 'center', paddingVertical: mk(8) }}><Text style={{ color: tab === k ? C.ink : C.white, fontFamily: F.black, fontSize: mk(20) }}>{k === 'create' ? t('ui2.createCode') : t('ui2.joinCode')}</Text></Pressable>)}
      </View>
      {tab === 'create' ? (
        <>
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ alignItems: 'center', paddingVertical: mk(14) }}>
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(18) }}>{t('ui2.yourRoomCode')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(12), marginTop: mk(6) }}>
              <View style={{ backgroundColor: '#03123A', borderRadius: mk(12), paddingHorizontal: mk(24), paddingVertical: mk(6) }}><OutlinedText size={mk(52)} width={mk(3)} color={C.gold} style={{ letterSpacing: 3 }}>{roomCode ?? '——————'}</OutlinedText></View>
              {roomCode ? <Pressable onPress={async () => { await Clipboard.setStringAsync(roomCode).catch(() => {}); setCopied(true); }} style={{ width: mk(66), height: mk(66), borderRadius: mk(14), backgroundColor: C.blue, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><IcCopy size={mk(36)} /></Pressable> : null}
            </View>
            <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(16), marginTop: mk(6) }}>{copied ? `${t('friends.copied')} ✓` : t('ui2.shareCodeHint')}</Text>
          </Plate>
          <View style={{ marginTop: mk(14) }}>
            {roomCode ? <ChunkyButton kind="green" label={t('ui2.shareCode')} height={mk(78)} size={mk(28)} onPress={() => { void Share.share({ message: t('ui2.roomShareMsg', { code: roomCode }) }).catch(() => {}); }} />
              : <ChunkyButton kind="green" label={t('home.createRoom')} height={mk(78)} size={mk(28)} onPress={() => actions.createRoom(name)} />}
          </View>
        </>
      ) : (
        <>
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ alignItems: 'center', paddingVertical: mk(14), paddingHorizontal: mk(14) }}>
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(18) }}>{t('ui2.roomCode')}</Text>
            <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 6))} placeholder="AB12CD" placeholderTextColor={C.textMuted} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={{ color: C.gold, fontFamily: F.title, fontSize: mk(50), letterSpacing: 4, textAlign: 'center', backgroundColor: '#03123A', borderRadius: mk(12), paddingHorizontal: mk(24), paddingVertical: mk(4), minWidth: mk(340), marginTop: mk(6) }} />
          </Plate>
          <View style={{ marginTop: mk(14) }}><ChunkyButton kind="green" label={t('home.joinRoom')} height={mk(78)} size={mk(28)} disabled={code.length < 4} onPress={() => { onClose(); actions.joinRoom(code.trim(), name); }} /></View>
        </>
      )}
    </Dialog>
  );
}

// ── Satın alma onayı ──────────────────────────────────────────────────────────
export function ConfirmDialog({ title, body, price, priceText, art, onYes, onClose }: { title: string; body: string; price?: number; priceText?: string; art?: ImageSourcePropType; onYes: () => void; onClose: () => void }) {
  return (
    <Dialog title={t('ui2.purchaseConfirm')} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: mk(14) }}>
        <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mk(20)} style={{ flex: 1 }} inner={{ height: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(8) }}>
          <Image source={art ?? UI2.gem_250} style={{ width: '80%', height: mk(120) }} resizeMode="contain" />
          <OutlinedText size={mk(24)} width={mk(2)} numberOfLines={2} style={{ marginTop: mk(6) }}>{title}</OutlinedText>
        </Plate>
        <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(20)} style={{ flex: 1 }} inner={{ height: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(10) }}>
          <Text style={{ color: C.white, fontFamily: F.bold, fontSize: mk(19), textAlign: 'center', lineHeight: mk(25) }}>{body}</Text>
          <View style={{ marginTop: mk(14) }}>{price != null ? <GemAmount amount={price} size={mk(40)} color={C.gold} /> : <OutlinedText size={mk(40)} width={mk(3)} color={C.gold}>{priceText ?? ''}</OutlinedText>}</View>
        </Plate>
      </View>
      <View style={{ flexDirection: 'row', gap: mk(14), marginTop: mk(16) }}>
        <ChunkyButton kind="red" label={t('settings.cancel')} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={onClose} />
        <ChunkyButton kind="green" label={t('profile.buyTitle')} height={mk(80)} size={mk(28)} style={{ flex: 1 }} onPress={onYes} />
      </View>
    </Dialog>
  );
}

// ── Arkadaşlık istekleri ──────────────────────────────────────────────────────
export function RequestsDialog({ state, actions, onClose }: { state: GameState; actions: Actions; onClose: () => void }) {
  return (
    <Dialog title={up(t('friends.tabRequests'))} onClose={onClose}>
      {state.friendRequests.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), textAlign: 'center', padding: mk(12) }}>{t('friends.noPendingRequests')}</Text> : null}
      {state.friendRequests.map((r) => (
        <Plate key={r.requestId} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ height: mk(96) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(12), gap: mk(10) }}>
          <View style={{ flex: 1, minWidth: 0 }}><OutlinedText size={mk(26)} width={mk(2)} align="left" numberOfLines={1}>{up(r.fromName)}</OutlinedText></View>
          <ChunkyButton kind="green" label={t('ui2.accept')} height={mk(58)} size={mk(20)} style={{ width: mk(120) }} onPress={() => actions.respondFriendRequest(r.requestId, true)} />
          <ChunkyButton kind="red" label={t('ui2.decline')} height={mk(58)} size={mk(20)} style={{ width: mk(120) }} onPress={() => actions.respondFriendRequest(r.requestId, false)} />
        </Plate>
      ))}
    </Dialog>
  );
}

// ── Haftalık lig tablosu ──────────────────────────────────────────────────────
export function LeagueDialog({ state, onClose }: { state: GameState; onClose: () => void }) {
  const lg = state.league;
  return (
    <Dialog title={t('league.tab')} onClose={onClose} accent>
      {!lg ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), textAlign: 'center', padding: mk(12) }}>{S.loading}</Text> : (
        <>
          <Text style={{ color: C.white, fontFamily: F.bold, fontSize: mk(20), textAlign: 'center', marginBottom: mk(10) }}>{t('ui2.leagueLine', { tier: lg.tierName, rank: lg.yourRank, points: fmt(lg.yourPoints) })}</Text>
          {lg.rows.map((r) => (
            <View key={`${r.rank}-${r.name}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: r.isYou ? '#1B5AE0' : C.panelInk, borderRadius: mk(12), borderWidth: mk(3), borderColor: r.zone === 'promote' ? C.green : r.zone === 'demote' ? C.red : C.navy, paddingHorizontal: mk(12), paddingVertical: mk(6), marginBottom: mk(6), gap: mk(10) }}>
              <Text style={{ color: C.gold, fontFamily: F.black, fontSize: mk(20), width: mk(40) }}>{r.rank}</Text>
              <Text numberOfLines={1} style={{ color: C.white, fontFamily: F.bold, fontSize: mk(20), flex: 1 }}>{r.name}</Text>
              <Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(20) }}>{fmt(r.points)}</Text>
            </View>
          ))}
        </>
      )}
    </Dialog>
  );
}
