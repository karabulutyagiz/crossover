// UI2 pencereleri — mock: refs/popups.png (mavi çerçeve, başlık plakası, kırmızı X, altın vurgu).
// Yerleşik katman (native Modal değil). Mod seçici, görevler, ayarlar, özel oda, satın alma onayı, istekler, lig.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, Linking, Platform, Pressable, ScrollView, Share, Text, TextInput, View, type ImageSourcePropType } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFeedbackPreferences } from '../feedback/useFeedbackPreferences';
import { LANGUAGES, currentLang, setLanguage, t, type MessageKey } from '../i18n';
import { getPushPermissionGranted, requestPushPermission } from '../notifications';
import type { GameMode } from '../protocol';
import { Avatar, AVATARS } from '../Avatar';
import { avatarPrice } from '../avatars';
import { arenaLabel } from '../screens';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { ArtWell, Bar, ChunkyButton, GemAmount, OutlinedText, Plate, Ribbon, fmt } from './primitives';
import { S, up } from './strings';
import { hasActiveSocialPack } from '../monetization';
import { arenaArt, ARENAS, ARENA_STEPS, INFO_LINKS, LEVEL_CAP, PACK_MODES, PREMIUM_ROAD_PRICE } from './products';
import { roadReward, type RoadReward } from './rewards';
import { IcCheckBadge, IcClipboard, IcCrownBig, IcGem, IcLeague, IcNavFriends, IcNavPlay, IcStar, IcSuggest, IcTrophy } from './icons-ui';
import { IcBell, IcCheck, IcChevron, IcClose, IcCopy, IcGlobe, IcLock, IcModeCountryTeam, IcModeCozKazan, IcModeGuessWho, IcModeLetterTeam, IcModeTeamTeam, IcModeXox, IcMusic, IcSound, IcVibrate } from './icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fz, LIP, mk, OUTLINE, SH, SIDE, SW } from './tokens';

// ── Kabuk ──────────────────────────────────────────────────────────────────────
export function Dialog({ title, onClose, children, accent = false, wide = false, initialScrollY = 0 }: { title: string; onClose: () => void; children: ReactNode; accent?: boolean; wide?: boolean; initialScrollY?: number }) {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets(); // Dynamic Island / ana ekran çubuğu: pencere güvenli alanın içinde kalır
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,10,40,0.74)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? mk(20) : SIDE, paddingTop: insets.top + mk(8), paddingBottom: Math.max(insets.bottom, mk(20)) }}>
      <Pressable style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} onPress={onClose} />
      <View style={{ width: '100%', maxHeight: SH - insets.top - Math.max(insets.bottom, mk(20)) - mk(8) }}>
        <Plate shrink face={C.panel} top={C.panelTop} lip={C.panelDark} radius={mk(30)} inner={{ paddingHorizontal: mk(18), paddingBottom: mk(18), paddingTop: mk(14) }}>
          <View style={{ alignItems: 'center', marginBottom: mk(12) }}>
            <Plate face={accent ? C.gold : '#1B5AE0'} top={accent ? C.goldLight : '#5A9BFF'} lip={accent ? C.goldDark : '#0B3A9E'} radius={mk(18)} style={{ alignSelf: 'stretch', marginRight: mk(30) }} inner={{ minHeight: mk(72) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
              <OutlinedText size={mk(40)} width={mk(3)} color={accent ? C.ink : C.white} outline={accent ? '#FFF6C7' : C.ink}>{title}</OutlinedText>
            </Plate>
          </View>
          <ScrollView ref={scrollRef} style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: mk(4) }} keyboardShouldPersistTaps="handled" onLayout={() => { if (initialScrollY > 0) scrollRef.current?.scrollTo({ y: initialScrollY, animated: false }); }}>{children}</ScrollView>
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
      <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(22), textAlign: 'center', marginBottom: mk(12) }}>{bot ? t('ui2.pickModeBot') : t('ui2.pickMode')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: mk(12), justifyContent: 'center' }}>
        {defs.map((m) => {
          const on = mode === m.id; const lk = PACK_MODES.includes(m.id) && !hasPack;
          return (
            <Pressable key={m.id} onPress={() => setMode(m.id)} style={{ width: '48.5%' }}>
              {/* TEK KART DİLİ: kart lacivert; modun kimlik rengi yalnız sanatın arkasındaki çukur yuvada
                  ışık olarak durur (kullanıcı 2026-09-08: 'rengarenk, amatörce'). */}
              <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={on ? C.gold : C.navy} outlineWidth={on ? mk(7) : OUTLINE} radius={mk(22)} inner={{ minHeight: mk(252) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(10), paddingTop: mk(6) }}>
                <ArtWell accent={m.face} height={mk(150)} style={{ alignSelf: 'stretch' }}>
                {m.art ? <Image source={m.art} style={{ width: mk(140), height: mk(140) }} resizeMode="contain" /> : <m.Icon size={mk(110)} />}
                </ArtWell>
                {/* Ad 1 satır, açıklama SABİT 3 satırlık kutu → tüm mod kartları AYNI yükseklikte (kullanıcı 2026-09-08) */}
                <OutlinedText size={mk(26)} width={mk(2)} numberOfLines={1} fit style={{ marginTop: mk(6) }}>{t(m.nameKey)}</OutlinedText>
                <View style={{ height: fz(19) * 3, justifyContent: 'flex-start', alignSelf: 'stretch', marginTop: mk(2) }}>
                  <Text numberOfLines={3} style={{ color: C.white, fontFamily: F.semi, fontSize: fz(15), textAlign: 'center', lineHeight: fz(19) }}>{t(m.descKey)}</Text>
                </View>
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
      <Text style={{ color: on ? C.ink : C.white, fontFamily: F.black, fontSize: fz(19) }}>{label}</Text>
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
            <Plate face={on ? '#1B5AE0' : C.panelInk} top={on ? '#5A9BFF' : '#2F63C8'} lip={on ? '#0B3A9E' : '#041A4E'} outline={on ? C.gold : C.navy} radius={mk(16)} style={{ marginBottom: mk(8) }} inner={{ minHeight: mk(76) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(16), gap: mk(12) }}>
              <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(23), flex: 1 }}>{l.name}</Text>
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
        {[t('ui2.q.daily'), t('store.weekly'), t('ui2.q.season')].map((l, i) => <View key={l} style={{ flex: 1, backgroundColor: i === 0 ? C.gold : C.panelInk, borderRadius: mk(12), borderWidth: mk(3), borderColor: i === 0 ? C.goldDark : C.navy, alignItems: 'center', paddingVertical: mk(6), opacity: i === 0 ? 1 : 0.5 }}><Text style={{ color: i === 0 ? C.ink : C.white, fontFamily: F.black, fontSize: fz(19) }}>{l}</Text></View>)}
      </View>
      {q.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), textAlign: 'center', padding: mk(10) }}>{S.loading}</Text> : null}
      {q.map((x, i) => (
        <Plate key={x.id} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ minHeight: mk(112) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
          <View style={{ width: mk(64), alignItems: 'center' }}>{i % 3 === 0 ? <IcNavPlay size={mk(58)} /> : i % 3 === 1 ? <IcTrophy size={mk(58)} /> : <IcNavFriends size={mk(58)} />}</View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: C.white, fontFamily: F.bold, fontSize: fz(20) }}>{t(x.titleKey as MessageKey, { n: String(x.target) } as any)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginTop: mk(4) }}><Bar value={x.progress} max={x.target} color={C.green} track="#04163F" height={mk(20)} radius={mk(6)} style={{ flex: 1 }} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(16) }}>{`${Math.min(x.progress, x.target)} / ${x.target}`}</Text></View>
          </View>
          <View style={{ alignItems: 'center', width: mk(70) }}><IcStar size={mk(40)} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(15) }}>{`+${x.xp} XP`}</Text></View>
          {x.claimed ? <IcCheckBadge size={mk(52)} />
            : <ChunkyButton kind={x.done ? 'green' : 'blue'} label={x.done ? S.claim : t('ui2.q.go')} height={mk(56)} size={mk(22)} style={{ width: mk(100) }} onPress={() => (x.done ? actions.claimQuest(x.id) : (onClose(), onGo()))} />}
        </Plate>
      ))}
      {q.length ? (
        <Plate face={C.gold} top={C.goldLight} lip={C.goldDark} radius={mk(18)} inner={{ minHeight: mk(100) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
          <Image source={UI2.qs_chest} style={{ width: mk(80), height: mk(70) }} resizeMode="contain" />
          <View style={{ flex: 1 }}><Text style={{ color: C.ink, fontFamily: F.black, fontSize: fz(19) }}>{t('ui2.q.completeAll')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginTop: mk(4) }}><Bar value={done} max={q.length} color={C.green} track="#6B4B00" height={mk(20)} radius={mk(6)} style={{ flex: 1 }} /><Text style={{ color: C.ink, fontFamily: F.black, fontSize: fz(16) }}>{`${done} / ${q.length}`}</Text></View></View>
          <View style={{ backgroundColor: '#1A1200', borderRadius: mk(12), paddingHorizontal: mk(12), paddingVertical: mk(6) }}><Text style={{ color: C.gold, fontFamily: F.black, fontSize: fz(20) }}>{`+${totalXp} XP`}</Text></View>
        </Plate>
      ) : null}
    </Dialog>
  );
}

// ── Ayarlar ────────────────────────────────────────────────────────────────────
export function SettingsDialog({ actions, onClose, onOpenLanguage, onDeleteAccount, onOpenFeedback }: { actions: Actions; onClose: () => void; onOpenLanguage: () => void; onDeleteAccount: () => void; onOpenFeedback?: (category?: 'sponsorship') => void }) {
  const { prefs, setPreference } = useFeedbackPreferences();
  const [push, setPush] = useState<boolean | null>(null);
  if (push === null) getPushPermissionGranted().then(setPush).catch(() => setPush(false));
  const lang = LANGUAGES.find((l) => l.code === currentLang())?.name ?? currentLang();
  const Row = ({ icon, label, right }: { icon: ReactNode; label: string; right: ReactNode }) => (
    <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ minHeight: mk(92) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(16), gap: mk(14) }}>
      <View style={{ width: mk(56), alignItems: 'center' }}>{icon}</View><Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(24), flex: 1 }}>{label}</Text>{right}
    </Plate>
  );
  return (
    <Dialog title={up(t('settings.title'))} onClose={onClose}>
      <Row icon={<IcMusic size={mk(60)} />} label={t('settings.music')} right={<Toggle on={prefs.music} onChange={(v) => setPreference('music', v)} />} />
      <Row icon={<IcSound size={mk(60)} />} label={t('settings.sfx')} right={<Toggle on={prefs.sfx} onChange={(v) => setPreference('sfx', v)} />} />
      <Row icon={<IcVibrate size={mk(60)} />} label={t('settings.haptics')} right={<Toggle on={prefs.haptics} onChange={(v) => setPreference('haptics', v)} />} />
      <Row icon={<IcBell size={mk(60)} />} label={t('ui2.notifications')} right={<Toggle on={!!push} onChange={async (v) => { if (v) { const ok = await requestPushPermission().catch(() => false); setPush(ok); if (!ok) Linking.openSettings().catch(() => {}); } else Linking.openSettings().catch(() => {}); }} />} />
      <Row icon={<IcGlobe size={mk(60)} />} label={t('settings.language')} right={<Pressable onPress={onOpenLanguage} style={{ backgroundColor: '#0A2B78', borderRadius: mk(12), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(14), paddingVertical: mk(6), flexDirection: 'row', alignItems: 'center', gap: mk(10) }}><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(20) }}>{lang}</Text><IcChevron size={mk(26)} /></Pressable>} />
      {/* Görüş & öneri, sponsorluk (geri bildirim merkezi) */}
      {onOpenFeedback ? (<>
        <Pressable onPress={() => { onClose(); onOpenFeedback(); }}><Row icon={<IcSuggest size={mk(60)} />} label={t('ui2.feedback')} right={<IcChevron size={mk(30)} />} /></Pressable>
        <Pressable onPress={() => { onClose(); onOpenFeedback('sponsorship'); }}><Row icon={<IcClipboard size={mk(60)} />} label={t('ui2.partnership')} right={<IcChevron size={mk(30)} />} /></Pressable>
      </>) : null}
      {/* Yardım & bilgi bağlantıları */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: mk(8), marginTop: mk(12), justifyContent: 'center' }}>
        {([['help', INFO_LINKS.help], ['privacy', INFO_LINKS.privacy], ['parents', INFO_LINKS.parents], ['terms', INFO_LINKS.terms], ['founders', INFO_LINKS.founders]] as const).map(([k, url]) => (
          <Pressable key={k} onPress={() => Linking.openURL(url).catch(() => {})} style={{ backgroundColor: '#0A2B78', borderRadius: mk(12), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(14), paddingVertical: mk(8) }}>
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(17) }}>{t(`settings.${k}` as MessageKey)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: mk(12), marginTop: mk(6) }}>
        <ChunkyButton kind="blue" label={t('ui2.resetDefaults')} height={mk(76)} size={mk(20)} style={{ flex: 1 }} onPress={() => { setPreference('music', true); setPreference('sfx', true); setPreference('haptics', true); }} />
        <ChunkyButton kind="red" label={t('profile.logout')} height={mk(76)} size={mk(24)} style={{ flex: 1 }} onPress={() => { onClose(); actions.logout(); }} />
      </View>
      <Pressable onPress={onDeleteAccount} style={{ alignSelf: 'center', marginTop: mk(14), padding: mk(6) }}><Text style={{ color: C.textMuted, fontFamily: F.semi, fontSize: fz(17), textDecorationLine: 'underline' }}>{t('ui2.deleteMyAccount')}</Text></Pressable>
    </Dialog>
  );
}
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!on)} style={{ flexDirection: 'row', alignItems: 'center', gap: mk(10) }}>
      <View style={{ width: mk(96), height: mk(50), borderRadius: mk(25), backgroundColor: on ? C.green : C.gray, borderWidth: mk(4), borderColor: C.navy, justifyContent: 'center', paddingHorizontal: mk(4) }}>
        <View style={{ width: mk(36), height: mk(36), borderRadius: mk(18), backgroundColor: C.white, alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </View>
      <Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(17), width: mk(130) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{on ? t('ui2.on') : t('ui2.off')}</Text>
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
      <Text style={{ color: C.white, fontFamily: F.semi, fontSize: fz(19), textAlign: 'center', lineHeight: fz(25), marginBottom: mk(12) }}>{t('ui2.roomIntro')}</Text>
      <View style={{ flexDirection: 'row', gap: mk(8), marginBottom: mk(14) }}>
        {(['create', 'join'] as const).map((k) => <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, backgroundColor: tab === k ? C.gold : C.panelInk, borderRadius: mk(12), borderWidth: mk(3), borderColor: tab === k ? C.goldDark : C.navy, alignItems: 'center', paddingVertical: mk(8) }}><Text style={{ color: tab === k ? C.ink : C.white, fontFamily: F.black, fontSize: fz(20) }}>{k === 'create' ? t('ui2.createCode') : t('ui2.joinCode')}</Text></Pressable>)}
      </View>
      {tab === 'create' ? (
        <>
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ alignItems: 'center', paddingVertical: mk(14) }}>
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(18) }}>{t('ui2.yourRoomCode')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(12), marginTop: mk(6) }}>
              <View style={{ backgroundColor: '#03123A', borderRadius: mk(12), paddingHorizontal: mk(24), paddingVertical: mk(6) }}><OutlinedText size={mk(52)} width={mk(3)} color={C.gold} style={{ letterSpacing: 3 }}>{roomCode ?? '——————'}</OutlinedText></View>
              {roomCode ? <Pressable onPress={async () => { await Clipboard.setStringAsync(roomCode).catch(() => {}); setCopied(true); }} style={{ width: mk(66), height: mk(66), borderRadius: mk(14), backgroundColor: C.blue, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><IcCopy size={mk(36)} /></Pressable> : null}
            </View>
            <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(16), marginTop: mk(6) }}>{copied ? `${t('friends.copied')} ✓` : t('ui2.shareCodeHint')}</Text>
          </Plate>
          <View style={{ marginTop: mk(14) }}>
            {roomCode ? <ChunkyButton kind="green" label={t('ui2.shareCode')} height={mk(78)} size={mk(28)} onPress={() => { void Share.share({ message: t('ui2.roomShareMsg', { code: roomCode }) }).catch(() => {}); }} />
              : <ChunkyButton kind="green" label={t('home.createRoom')} height={mk(78)} size={mk(28)} onPress={() => actions.createRoom(name)} />}
          </View>
        </>
      ) : (
        <>
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ alignItems: 'center', paddingVertical: mk(14), paddingHorizontal: mk(14) }}>
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(18) }}>{t('ui2.roomCode')}</Text>
            <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 6))} placeholder="AB12CD" placeholderTextColor={C.textMuted} autoCapitalize="characters" autoCorrect={false} maxLength={6} style={{ color: C.gold, fontFamily: F.title, fontSize: fz(50), letterSpacing: 4, textAlign: 'center', backgroundColor: '#03123A', borderRadius: mk(12), paddingHorizontal: mk(24), paddingVertical: mk(4), minWidth: mk(340), marginTop: mk(6) }} />
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
        <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mk(20)} style={{ flex: 1 }} inner={{ minHeight: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(8) }}>
          <Image source={art ?? UI2.gem_250} style={{ width: '80%', height: mk(120) }} resizeMode="contain" />
          <OutlinedText size={mk(24)} width={mk(2)} numberOfLines={2} style={{ marginTop: mk(6) }}>{title}</OutlinedText>
        </Plate>
        <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(20)} style={{ flex: 1 }} inner={{ minHeight: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(10) }}>
          <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(19), textAlign: 'center', lineHeight: fz(25) }}>{body}</Text>
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
      {state.friendRequests.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), textAlign: 'center', padding: mk(12) }}>{t('friends.noPendingRequests')}</Text> : null}
      {state.friendRequests.map((r) => (
        <Plate key={r.requestId} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ minHeight: mk(96) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(12), gap: mk(10) }}>
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
  const endsMs = lg ? new Date(lg.endsAt).getTime() - Date.now() : 0;
  const d = Math.floor(endsMs / 86_400_000); const h = Math.floor((endsMs % 86_400_000) / 3_600_000); const m = Math.max(0, Math.floor((endsMs % 3_600_000) / 60_000));
  const endsTxt = endsMs <= 0 ? t('league.endingNow') : d > 0 ? t('league.endsInDays', { d, h }) : t('league.endsInHours', { h, m });
  return (
    <Dialog title={t('league.tab')} onClose={onClose} accent wide>
      {!lg ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), textAlign: 'center', padding: mk(12) }}>{S.loading}</Text> : (
        <>
          {/* lig özeti: kademe, sıran, puan, bitiş */}
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), paddingVertical: mk(10), gap: mk(12) }}>
            <IcLeague size={mk(84)} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <OutlinedText size={mk(30)} width={mk(3)} color={C.gold} align="left" numberOfLines={1} fit>{up(lg.tierName)}</OutlinedText>
              <Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(18) }}>{`${t('ui2.yourRank')}: #${lg.yourRank} · ${t('league.points', { n: fmt(lg.yourPoints) })}`}</Text>
              <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(15) }}>{endsTxt}</Text>
            </View>
          </Plate>
          <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(15), lineHeight: fz(19), textAlign: 'center', marginVertical: mk(8) }}>{t('league.howItWorks', { n: lg.promoteCount, d: lg.demoteCount })}</Text>
          {lg.rows.map((r, i) => {
            const prev = lg.rows[i - 1]; const zoneStart = i === 0 || prev?.zone !== r.zone;
            const medal = r.rank <= 3 ? [C.gold, '#CBD5E8', '#E08A4B'][r.rank - 1] : null;
            return (
              <View key={`${r.rank}-${r.name}`}>
                {zoneStart && r.zone === 'promote' ? <ZoneLine label={t('league.promoteLine')} color={C.green} /> : null}
                {zoneStart && r.zone === 'demote' ? <ZoneLine label={t('league.demoteLine')} color={C.red} /> : null}
                <Plate face={r.isYou ? '#1B5AE0' : r.zone === 'promote' ? '#0E4A2A' : r.zone === 'demote' ? '#5A1020' : C.panelInk} top={r.isYou ? '#5A9BFF' : '#2F63C8'} lip={r.isYou ? '#0B3A9E' : '#041A4E'} outline={r.isYou ? C.gold : C.navy} radius={mk(16)} style={{ marginBottom: mk(6) }} inner={{ height: mk(84) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
                  <View style={{ width: mk(44), height: mk(44), borderRadius: mk(22), backgroundColor: medal ?? '#0A2B78', borderWidth: mk(3), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(20)} width={1.5} color={medal ? C.ink : C.white} outline={medal ? '#FFF6C7' : C.ink}>{String(r.rank)}</OutlinedText></View>
                  <View style={{ width: mk(56), height: mk(56), borderRadius: mk(12), borderWidth: mk(3), borderColor: '#7DB8FF', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Avatar avatar={r.avatar} name={r.name} size={mk(46)} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}><OutlinedText size={mk(24)} width={mk(2)} align="left" numberOfLines={1}>{r.name.toLocaleUpperCase('tr')}</OutlinedText></View>
                  <IcTrophy size={mk(30)} /><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(20) }}>{fmt(r.points)}</Text>
                </Plate>
              </View>
            );
          })}
          <Text style={{ color: C.textMuted, fontFamily: F.semi, fontSize: fz(14), textAlign: 'center', marginTop: mk(6) }}>{t('league.footer')}</Text>
        </>
      )}
    </Dialog>
  );
}
function ZoneLine({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginVertical: mk(6) }}>
      <View style={{ flex: 1, height: 2, backgroundColor: color, opacity: 0.7 }} /><Text style={{ color, fontFamily: F.black, fontSize: fz(14), letterSpacing: 0.5 }}>{label}</Text><View style={{ flex: 1, height: 2, backgroundColor: color, opacity: 0.7 }} />
    </View>
  );
}

// ── Turnuva: durum + katıl/ayrıl + ELEME AĞACI (sunucu tournament_state; klasik bracket geometrisi) ──
const TB_W = mk(236); const TB_H = mk(108); const TB_GAP = mk(16);
type TourMatch = { id: string; round: number; slot: number; aId: string | null; aName: string | null; bId: string | null; bName: string | null; winnerId: string | null; status: string };
export function TournamentDialog({ state, actions, id, onClose }: { state: GameState; actions: Actions; id: string; onClose: () => void }) {
  const tour = state.tournament && state.tournament.id === id ? state.tournament : null;
  const item = (state.tournaments ?? []).find((x) => x.id === id) ?? null;
  const youId = state.profile?.userId ?? null;
  const name = tour?.name ?? item?.name ?? '';
  const status = tour?.status ?? item?.status ?? 'registration';
  const size = tour?.size ?? item?.size ?? 0; const joined = tour?.joined ?? item?.joined ?? 0; const youJoined = tour?.youJoined ?? item?.youJoined ?? false;
  const p1 = tour?.prizeFirst ?? item?.prizeFirst ?? 0; const p2 = tour?.prizeSecond ?? item?.prizeSecond ?? 0; const fee = tour?.entryFee ?? item?.entryFee ?? 0;
  const matches: TourMatch[] = tour?.matches ?? [];
  const rounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 0;
  const roundLabel = (r: number) => { const fromEnd = rounds - r; return t(fromEnd === 0 ? 'tour.round.3' : fromEnd === 1 ? 'tour.round.2' : 'tour.round.1'); };
  const statusKey = status === 'live' ? 'tour.live' : status === 'finished' ? 'tour.finished' : 'tour.registration';
  const statusColor = status === 'live' ? C.red : status === 'finished' ? C.gray : C.green;
  return (
    <Dialog title={up(name || t('ui2.tournament'))} onClose={onClose} wide accent={status === 'live'}>
      {/* durum satırı */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(10), marginBottom: mk(10), flexWrap: 'wrap' }}>
        <Ribbon label={t(statusKey as MessageKey)} color={statusColor} size={mk(17)} />
        <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(19) }}>{t('tour.joined', { n: joined, size })}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ color: fee > 0 ? C.gold : C.textSub, fontFamily: F.black, fontSize: fz(17) }}>{fee > 0 ? t('tour.entryFee', { fee }) : t('tour.freeEntry')}</Text>
      </View>
      <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), paddingVertical: mk(10), gap: mk(12) }}>
        <GemAmount amount={p1} size={mk(34)} color={C.gold} />
        <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(17), flex: 1 }}>{t('tour.prize', { p1, p2 })}</Text>
      </Plate>
      {tour?.winnerName || item?.winnerName ? (
        <Plate face={C.gold} top={C.goldLight} lip={C.goldDark} radius={mk(18)} style={{ marginTop: mk(10) }} inner={{ alignItems: 'center', paddingVertical: mk(8), flexDirection: 'row', justifyContent: 'center', gap: mk(10) }}>
          <IcTrophy size={mk(40)} /><OutlinedText size={mk(26)} width={mk(2)} color={C.ink} outline="#FFF6C7">{t('tour.champion', { name: tour?.winnerName ?? item?.winnerName ?? '' })}</OutlinedText>
        </Plate>
      ) : null}
      {/* kayıt: katıl / ayrıl */}
      {status === 'registration' ? (
        <View style={{ marginTop: mk(12) }}>
          {youJoined ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(12) }}>
              <Text style={{ color: C.green, fontFamily: F.black, fontSize: fz(19), flex: 1 }}>{`✓ ${t('tour.waiting')}`}</Text>
              <ChunkyButton kind="gray" label={up(t('tour.leave'))} height={mk(64)} size={mk(22)} style={{ width: mk(170) }} onPress={() => actions.leaveTournament(id)} />
            </View>
          ) : (
            <ChunkyButton kind="green" gem={fee > 0} label={fee > 0 ? t('tour.joinFee', { fee }) : t('tour.join')} height={mk(80)} size={mk(30)} onPress={() => actions.joinTournament(id)} />
          )}
        </View>
      ) : null}
      {/* eleme ağacı */}
      {matches.length ? (
        <View style={{ marginTop: mk(14) }}>
          <OutlinedText size={mk(30)} width={mk(3)} align="left">{t('tour.bracket')}</OutlinedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: mk(8), paddingRight: mk(16) }}>
            {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
              const ms = matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
              const stride = (TB_H + TB_GAP) * Math.pow(2, r - 1); const offset = (stride - TB_H) / 2;   // her tur önceki iki kutunun ORTASINA
              return (
                <View key={r} style={{ marginRight: mk(30) }}>
                  <Text style={{ color: C.textSub, fontFamily: F.black, fontSize: fz(15), letterSpacing: 0.6, textAlign: 'center', marginBottom: mk(8) }}>{roundLabel(r)}</Text>
                  <View>
                    {ms.map((m, i) => (
                      <View key={m.id} style={{ marginTop: i === 0 ? offset : stride - TB_H }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TourBox m={m} youId={youId} />
                          {r < rounds ? (
                            <>
                              <View pointerEvents="none" style={{ width: mk(14), height: mk(3), backgroundColor: '#5A7BC0' }} />
                              <View pointerEvents="none" style={{ position: 'absolute', left: TB_W + mk(12), width: mk(3), height: stride / 2 + mk(2), backgroundColor: '#5A7BC0', top: i % 2 === 0 ? TB_H / 2 - 1 : undefined, bottom: i % 2 === 1 ? TB_H / 2 - 1 : undefined }} />
                            </>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : tour == null ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), textAlign: 'center', padding: mk(12) }}>{S.loading}</Text> : null}
    </Dialog>
  );
}
function TourBox({ m, youId }: { m: TourMatch; youId: string | null }) {
  const decided = m.winnerId != null; const live = m.status === 'playing';
  const row = (nm: string | null, pid: string | null) => {
    const you = youId != null && pid === youId; const win = decided && m.winnerId === pid; const lost = decided && !win && pid != null;
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(6) }}>
        <Text numberOfLines={1} style={{ flex: 1, color: lost ? C.textMuted : you ? C.gold : C.white, fontFamily: you || win ? F.black : F.bold, fontSize: fz(17) }}>{nm ?? '—'}</Text>
        {win ? <IcCheckBadge size={mk(20)} /> : null}
      </View>
    );
  };
  return (
    <View style={{ width: TB_W, height: TB_H, backgroundColor: C.panelInk, borderRadius: mk(14), borderWidth: mk(3), borderColor: live ? C.gold : (youId != null && (m.aId === youId || m.bId === youId)) ? '#8CC4FF' : C.navy, overflow: 'hidden' }}>
      {row(m.aName, m.aId)}
      <View style={{ height: mk(2), backgroundColor: C.navy }} />
      {row(m.bName, m.bId)}
      {live ? <View pointerEvents="none" style={{ position: 'absolute', right: mk(6), top: mk(6), width: mk(10), height: mk(10), borderRadius: mk(5), backgroundColor: C.gold }} /> : null}
    </View>
  );
}

// ── Turnuva maçın hazır: OYNA (iki taraf da basınca oda kurulur) ──
export function TournamentReadyDialog({ state, actions }: { state: GameState; actions: Actions }) {
  const r = state.tournamentReady; if (!r) return null;
  return (
    <Dialog title={t('tour.readyTitle')} onClose={() => actions.clearTournamentReady()} accent>
      <View style={{ alignItems: 'center', gap: mk(12) }}>
        <IcTrophy size={mk(120)} />
        <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(22), textAlign: 'center', lineHeight: fz(29) }}>{t('tour.readyBody', { t: r.tournamentName, opp: r.opponentName })}</Text>
        {r.youReady ? (
          <Text style={{ color: C.textSub, fontFamily: F.black, fontSize: fz(19), textAlign: 'center' }}>{t('tour.readyWaiting')}</Text>
        ) : (
          <>
            {r.oppReady ? <Text style={{ color: C.green, fontFamily: F.black, fontSize: fz(19) }}>{t('tour.oppReady')}</Text> : null}
            <ChunkyButton kind="green" label={t('tour.readyBtn')} height={mk(88)} size={mk(36)} style={{ alignSelf: 'stretch' }} onPress={() => actions.tournamentReady(r.matchId)} />
          </>
        )}
      </View>
    </Dialog>
  );
}

// ── Turnuva bitti: şampiyon / finalist ödülü ──
export function TournamentOverDialog({ state, actions }: { state: GameState; actions: Actions }) {
  const o = state.tournamentOver; if (!o) return null;
  return (
    <Dialog title={t(o.youWon ? 'tour.wonTitle' : 'tour.secondTitle')} onClose={() => actions.clearTournamentOver()} accent>
      <View style={{ alignItems: 'center', gap: mk(12) }}>
        {o.youWon ? <IcTrophy size={mk(150)} /> : <IcCrownBig size={mk(130)} color="#D7DCE6" base="#9AA3B5" />}
        <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(22), textAlign: 'center', lineHeight: fz(29) }}>{t(o.youWon ? 'tour.wonBody' : 'tour.secondBody', { t: o.tournamentName, p: o.prize })}</Text>
        {o.prize > 0 ? <GemAmount amount={`+${fmt(o.prize)}`} size={mk(40)} color={C.gold} /> : null}
        <ChunkyButton kind="gold" label={up(t('common.continue'))} height={mk(84)} size={mk(32)} style={{ alignSelf: 'stretch' }} onPress={() => actions.clearTournamentOver()} />
      </View>
    </Dialog>
  );
}

// ── Seviye Yolu: 50 seviye, ücretsiz + CO PASS şeridi, TOPLA ──
const ROAD_ROW = mk(200);
export function LevelRoadDialog({ state, actions, onOpenStore, onClose }: { state: GameState; actions: Actions; onOpenStore: () => void; onClose: () => void }) {
  const p = state.profile; const level = p?.level ?? 1; const xp = p?.xp ?? 0; const xpNext = (p as any)?.xpForNext ?? 1000;
  const claimed = new Set(p?.claimedLevels ?? []); const claimedP = new Set(p?.claimedPremium ?? []); const prem = !!p?.premiumRoad;
  const rows = Array.from({ length: LEVEL_CAP }, (_, i) => i + 1).map((n) => ({ n, free: roadReward(p, n, 'free'), premium: roadReward(p, n, 'premium') })).filter((r) => r.free || r.premium);
  const curIdx = Math.max(0, rows.findIndex((r) => r.n >= level)); const scrollY = Math.max(0, (curIdx - 1) * (ROAD_ROW + mk(10)) + mk(150));
  return (
    <Dialog title={up(t('level.roadTitle'))} onClose={onClose} wide accent initialScrollY={scrollY}>
      {/* seviye + XP */}
      <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), paddingVertical: mk(10), gap: mk(12) }}>
        <View style={{ width: mk(64), height: mk(64), borderRadius: mk(32), backgroundColor: '#2F8CFF', borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(30)} width={mk(3)}>{String(level)}</OutlinedText></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(20) }}>{t('level.levelN', { n: level })}</Text>
          <Bar value={xp} max={xpNext} height={mk(22)} style={{ marginTop: mk(4) }} />
          <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(15), marginTop: mk(3) }}>{level >= LEVEL_CAP ? t('level.maxed') : t('level.toNext', { n: fmt(Math.max(0, xpNext - xp)) })}</Text>
        </View>
      </Plate>
      {/* CO PASS durumu */}
      {/* CO PASS TEKLİF KARTI: mor/altın çerçeve, taç ile başlık aynı hizada, TAM GENİŞLİK altın satın alma butonu.
          Eskiden satırın ucunda küçük bir butondu; kullanıcı "göze batmıyor, alıcı olmuyor" dedi (2026-09-08). */}
      <Plate face={prem ? C.gold : '#3B1A7A'} top={prem ? C.goldLight : '#7A45D9'} lip={prem ? C.goldDark : '#220A4E'} outline={C.gold} radius={mk(22)} style={{ marginTop: mk(12) }} inner={{ paddingHorizontal: mk(14), paddingVertical: mk(12) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(12) }}>
          <IcCrownBig size={mk(78)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <OutlinedText size={mk(46)} width={mk(4)} color={prem ? C.ink : C.gold} outline={prem ? '#FFF6C7' : C.ink} align="left" numberOfLines={1} fit>{prem ? `CO PASS · ${t('store.badgeActive')}` : 'CO PASS'}</OutlinedText>
            <Text numberOfLines={2} style={{ color: prem ? C.ink : C.white, fontFamily: F.bold, fontSize: fz(18), lineHeight: fz(22) }}>{t('ui2.cpLine')}</Text>
          </View>
        </View>
        {!prem ? (
          <View style={{ marginTop: mk(12) }}>
            <ChunkyButton kind="gold" gem label={up(t('store.diamonds', { n: fmt(PREMIUM_ROAD_PRICE) }))} sub={up(t('ui2.unlockAllRewards'))} height={mk(130)} size={mk(40)} subSize={mk(22)} onPress={() => { onClose(); onOpenStore(); }} />
          </View>
        ) : null}
      </Plate>
      {/* şerit başlıkları */}
      <View style={{ flexDirection: 'row', marginTop: mk(12), marginBottom: mk(6), paddingLeft: mk(70) }}>
        <Text style={{ flex: 1, color: C.textSub, fontFamily: F.black, fontSize: fz(14), textAlign: 'center', letterSpacing: 0.6 }}>{up(t('ui2.free'))}</Text>
        <Text style={{ flex: 1, color: C.gold, fontFamily: F.black, fontSize: fz(14), textAlign: 'center', letterSpacing: 0.6 }}>CO PASS</Text>
      </View>
      {rows.map((r) => {
        const reached = r.n <= level; const cur = r.n === level;
        return (
          <View key={r.n} style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), marginBottom: mk(10), minHeight: ROAD_ROW }}>
            <View style={{ width: mk(60), alignItems: 'center' }}>
              <View style={{ width: mk(58), height: mk(58), borderRadius: mk(29), backgroundColor: cur ? C.gold : reached ? C.green : C.panelInk, borderWidth: mk(4), borderColor: cur ? C.goldDark : C.navy, alignItems: 'center', justifyContent: 'center' }}>
                <OutlinedText size={mk(26)} width={mk(2)} color={cur ? C.ink : C.white} outline={cur ? '#FFF6C7' : C.ink}>{String(r.n)}</OutlinedText>
              </View>
            </View>
            <RoadCard reward={r.free} reached={reached} claimed={claimed.has(r.n)} locked={false} premium={false} onClaim={() => actions.claimLevelReward(r.n, 'free')} />
            <RoadCard reward={r.premium} reached={reached} claimed={claimedP.has(r.n)} locked={!prem} premium onClaim={() => actions.claimLevelReward(r.n, 'premium')} onLocked={() => { onClose(); onOpenStore(); }} />
          </View>
        );
      })}
    </Dialog>
  );
}
function RoadCard({ reward, reached, claimed, locked, premium, onClaim, onLocked }: { reward: RoadReward | null; reached: boolean; claimed: boolean; locked: boolean; premium: boolean; onClaim: () => void; onLocked?: () => void }) {
  if (!reward) return <View style={{ flex: 1 }} />;
  const claimable = reached && !claimed && !locked; const dim = !reached || claimed || locked;
  return (
    <Pressable style={{ flex: 1 }} onPress={locked ? onLocked : claimable ? onClaim : undefined}>
      <Plate face={premium ? '#3B1A7A' : C.card} top={premium ? '#7A45D9' : C.cardTop} lip={premium ? '#220A4E' : C.cardDark} outline={claimable ? C.green : premium ? C.gold : C.navy} radius={mk(18)} style={{ opacity: dim && !claimable ? 0.62 : 1 }} inner={{ minHeight: ROAD_ROW - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
        <Image source={reward.art} style={{ width: mk(170), height: claimable ? mk(86) : mk(110), marginTop: claimable ? mk(6) : 0 }} resizeMode="contain" />
        <OutlinedText size={mk(20)} width={1.5} numberOfLines={1} fit style={{ marginTop: mk(2) }}>{reward.label}</OutlinedText>
        {claimable ? <View style={{ width: '92%', marginTop: mk(4), marginBottom: mk(6) }}><ChunkyButton kind="green" label={up(t('level.claimShort'))} height={mk(70)} size={mk(22)} onPress={onClaim} compact /></View> : null}
      </Plate>
      {claimed ? <View style={{ position: 'absolute', top: -mk(6), right: -mk(4) }}><IcCheckBadge size={mk(36)} /></View> : null}
      {locked ? <View style={{ position: 'absolute', top: -mk(6), right: -mk(4), width: mk(36), height: mk(36), borderRadius: mk(18), backgroundColor: C.panelInk, borderWidth: mk(3), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><IcLock size={mk(20)} /></View> : null}
    </Pressable>
  );
}

// ── Arkadaş Ekle: İSİMLE ARA → çıkan oyuncuları listeden ekle (kullanıcı 2026-09-08) ──
export function AddFriendDialog({ state, actions, onClose, onNotice }: { state: GameState; actions: Actions; onClose: () => void; onNotice: (t: string, b: string) => void }) {
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<string[]>([]);
  const search = () => { const v = q.trim(); if (v) actions.searchUsers(v); };
  const results = state.userSearchResults;
  return (
    <Dialog title={up(t('friends.addSection'))} onClose={onClose} wide>
      <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} inner={{ minHeight: mk(84) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), gap: mk(10) }}>
        <TextInput value={q} onChangeText={setQ} placeholder={t('ui2.searchByName')} placeholderTextColor={C.textMuted}
          autoCapitalize="none" autoCorrect={false} autoFocus returnKeyType="search" onSubmitEditing={search}
          style={{ flex: 1, color: C.white, fontFamily: F.bold, fontSize: fz(22), padding: 0 }} />
        <ChunkyButton kind="blue" label={S.search} height={mk(64)} size={mk(24)} style={{ width: mk(150) }} onPress={search} />
      </Plate>
      {results.length === 0 && q.trim() ? (
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(19), textAlign: 'center', paddingVertical: mk(20) }}>{t('ui2.noUsersFound')}</Text>
      ) : null}
      {results.map((u) => {
        const done = sent.includes(u.userId);
        return (
          <Plate key={u.userId} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginTop: mk(10) }} inner={{ minHeight: mk(88) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
            <View style={{ width: mk(62), height: mk(62), borderRadius: mk(14), borderWidth: mk(3), borderColor: '#7DB8FF', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}><Avatar avatar={null} name={u.displayName} size={mk(52)} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><OutlinedText size={mk(28)} width={mk(2)} align="left" numberOfLines={1} fit>{u.displayName.toLocaleUpperCase('tr')}</OutlinedText></View>
            <ChunkyButton kind={done ? 'gray' : 'green'} label={done ? t('ui2.requestSent') : S.add} height={mk(64)} size={mk(24)} style={{ width: mk(190) }} disabled={done}
              onPress={() => { actions.sendFriendRequest(undefined, u.displayName); setSent((s) => [...s, u.userId]); onNotice(t('friends.addSection'), `${u.displayName}: ${t('ui2.requestSent')}`); }} />
          </Plate>
        );
      })}
    </Dialog>
  );
}

// ── Mesajlar: sohbet listesi; dokununca eski sohbet ekranı açılır (akış aynı) ──
export function MessagesDialog({ state, actions, onClose }: { state: GameState; actions: Actions; onClose: () => void }) {
  const rows = state.conversations;
  return (
    <Dialog title={up(t('ui2.messages'))} onClose={onClose} wide>
      {rows.length === 0 ? (
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(19), textAlign: 'center', paddingVertical: mk(24) }}>{t('ui2.noConversations')}</Text>
      ) : null}
      {rows.map((c) => (
        <Pressable key={c.userId} onPress={() => { onClose(); actions.openChat(c.userId); }}>
          <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(18)} style={{ marginBottom: mk(10) }} inner={{ minHeight: mk(96) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
            <View style={{ width: mk(66), height: mk(66), borderRadius: mk(14), borderWidth: mk(3), borderColor: '#7DB8FF', backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
              <Avatar avatar={c.avatar ?? c.selectedAvatar ?? null} name={c.displayName} size={mk(56)} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <OutlinedText size={mk(28)} width={mk(2)} align="left" numberOfLines={1}>{c.displayName.toLocaleUpperCase('tr')}</OutlinedText>
              <Text numberOfLines={1} style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(17) }}>{c.lastMessage}</Text>
            </View>
            {c.unreadCount > 0 ? (
              <View style={{ minWidth: mk(46), height: mk(46), borderRadius: mk(23), backgroundColor: C.red, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
                <OutlinedText size={mk(24)} width={1}>{String(c.unreadCount)}</OutlinedText>
              </View>
            ) : <IcChevron size={mk(30)} />}
          </Plate>
        </Pressable>
      ))}
    </Dialog>
  );
}

// ── Arenalar (Clash Royale düzeni): en üstte en yüksek arena; büyük arena sanatı, kupa aralığı, maç başı kupa, ulaşma ödülü;
//    bulunduğun arena altın çerçeveli + ilerleme çubuğu; kilitliler soluk + gerekli kupa; geçilenler onaylı ──
const ARENA_KEYS = ['mahalle', 'amator', 'profesyonel', 'sampiyonlar', 'efsaneler', 'dunya', 'goat'] as const;
const ARENA_CARD_H = mk(250);
export function ArenasDialog({ state, onClose }: { state: GameState; onClose: () => void }) {
  const p = state.profile; const trophies = p?.trophies ?? 0;
  const curIdx = ARENAS.reduce((acc, a, i) => (trophies >= a.min ? i : acc), 0);
  const rewarded = p?.highestArenaRewarded ?? 0;
  const scrollY = Math.max(0, (ARENAS.length - 1 - curIdx) * (ARENA_CARD_H + mk(10)) - mk(40));
  return (
    <Dialog title={up(t('arenas.title'))} onClose={onClose} wide initialScrollY={scrollY}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(8), marginBottom: mk(10) }}><IcTrophy size={mk(40)} /><OutlinedText size={mk(34)} width={mk(3)} color={C.gold}>{fmt(trophies)}</OutlinedText></View>
      {[...ARENAS].map((a, i) => ({ ...a, i })).reverse().map((a) => {
        const cur = a.i === curIdx; const passed = a.i < curIdx; const locked = a.i > curIdx; const key = ARENA_KEYS[a.i]!;
        const next = ARENAS[a.i + 1]; const pct = cur && next ? Math.max(0, Math.min(1, (trophies - a.min) / (next.min - a.min))) : 1;
        const claimed = a.i <= rewarded;
        return (
          <Plate key={key} face={cur ? '#1B5AE0' : locked ? '#0A2B78' : C.panelInk} top={cur ? '#5A9BFF' : '#2F63C8'} lip={cur ? '#0B3A9E' : '#041A4E'} outline={cur ? C.gold : C.navy} radius={mk(22)} style={{ marginBottom: mk(10) }} inner={{ minHeight: ARENA_CARD_H - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(8), paddingVertical: mk(10), gap: mk(8) }}>
            <View style={{ width: mk(300), height: mk(230), alignItems: 'center', justifyContent: 'center' }}>
              <Image source={arenaArt(key)} style={{ width: mk(300), height: mk(230), opacity: locked ? 0.45 : 1 }} resizeMode="contain" />
              {locked ? <View style={{ position: 'absolute', width: mk(64), height: mk(64), borderRadius: mk(32), backgroundColor: C.panelInk, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><IcLock size={mk(32)} /></View> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <OutlinedText size={mk(28)} width={mk(2.5)} align="left" numberOfLines={2} fit>{up(t(`arena.${key}` as MessageKey))}</OutlinedText>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(6), marginTop: mk(2) }}><IcTrophy size={mk(24)} /><Text style={{ color: C.gold, fontFamily: F.black, fontSize: fz(17) }}>{a.max >= 99999 ? `${fmt(a.min)}+` : `${fmt(a.min)} – ${fmt(a.max)}`}</Text></View>
              <Text numberOfLines={2} style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(15), lineHeight: fz(19), marginTop: mk(2) }}>{t(`arena.${key}.desc` as MessageKey)}</Text>
              <Text style={{ color: C.white, fontFamily: F.bold, fontSize: fz(14), marginTop: mk(2) }}>{t('ui2.winLoss', { w: `+${a.win}`, l: `-${a.loss}` })}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(6), marginTop: mk(4), opacity: claimed ? 0.55 : 1 }}>
                <IcGem size={mk(26)} /><Text style={{ color: claimed ? C.textMuted : C.white, fontFamily: F.black, fontSize: fz(16) }}>{claimed ? t('ui2.rewardTaken') : `${t('ui2.arenaReward')}: +${a.reward}`}</Text>
              </View>
              {cur ? (
                <View style={{ marginTop: mk(6) }}>
                  <Bar value={pct} max={1} color={C.gold} track="#04163F" height={mk(20)} radius={mk(6)} />
                  <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(14), marginTop: mk(2) }}>{next ? t('ui2.toNextArena', { n: fmt(Math.max(0, next.min - trophies)) }) : t('level.maxed')}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ position: 'absolute', top: mk(8), right: mk(8) }}>
              {cur ? <Ribbon label={t('arenas.here')} color={C.gold} size={mk(13)} /> : passed ? <IcCheckBadge size={mk(40)} /> : <Ribbon label={t('ui2.trophiesN', { n: fmt(a.min) })} color={C.gray} size={mk(12)} />}
            </View>
          </Plate>
        );
      })}
    </Dialog>
  );
}

// ── Profil: avatar + çerçeve + seviye + arena, istatistikler, profil fotoğrafları (kullan / satın al) ──
const PP_COL = Math.floor((SW - mk(20) * 2 - OUTLINE * 2 - mk(18) * 2 - mk(10) * 3) / 4);
export function ProfileDialog({ state, actions, onClose, onConfirm, onNotice, onOpenStore, onOpenCollection, onOpenMatchHistory }: { state: GameState; actions: Actions; onClose: () => void; onOpenMatchHistory?: () => void; onConfirm: (d: { title: string; body: string; price?: number; onYes: () => void }) => void; onNotice: (title: string, body: string) => void; onOpenStore: () => void; onOpenCollection: () => void }) {
  const p = state.profile; if (!p) return null;
  useEffect(() => { actions.loadMyStats(); }, [actions]);
  const avatarId = p.avatar ?? p.selectedAvatar ?? null; const owned = new Set(p.ownedAvatars ?? []);
  const wins = state.myStats?.wins ?? p.wins ?? 0; const losses = state.myStats?.losses ?? p.losses ?? 0; const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const ids = Object.keys(AVATARS);
  const pick = (id: string) => {
    if (owned.has(id) || avatarPrice(id) === 0) { actions.setAvatar(id); return; }
    const price = avatarPrice(id);
    if ((p.diamonds ?? 0) < price) { onNotice(t('profile.notEnoughTitle'), t('profile.notEnoughGemsBody')); return; }
    onConfirm({ title: t('profile.buyTitle'), body: t('profile.buyConfirm', { price }), price, onYes: () => actions.buyAvatar(id) });
  };
  return (
    <Dialog title={up(t('profile.title'))} onClose={onClose} wide>
      <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(20)} inner={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(14), paddingVertical: mk(12), gap: mk(14) }}>
        <View style={{ width: mk(150), height: mk(150), alignItems: 'center', justifyContent: 'center' }}>
          <Avatar avatar={avatarId} name={p.displayName} size={mk(136)} frameId={p.selectedFrame ?? null} />
          <View style={{ position: 'absolute', right: -mk(4), bottom: -mk(2), width: mk(52), height: mk(52), borderRadius: mk(26), backgroundColor: '#2F8CFF', borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(24)} width={mk(2)}>{String(p.level ?? 1)}</OutlinedText></View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <OutlinedText size={mk(34)} width={mk(3)} align="left" numberOfLines={1} fit>{up(p.displayName ?? '')}</OutlinedText>
          <Text numberOfLines={1} style={{ color: C.textSub, fontFamily: F.black, fontSize: fz(17), marginTop: mk(2) }}>{arenaLabel(p.arena?.name ?? '')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(6), marginTop: mk(6) }}><IcTrophy size={mk(30)} /><OutlinedText size={mk(26)} width={mk(2)} color={C.gold}>{fmt(p.trophies ?? 0)}</OutlinedText></View>
        </View>
      </Plate>
      <View style={{ flexDirection: 'row', gap: mk(8), marginTop: mk(10) }}>
        {([[t('stats.wins'), String(wins), C.green], [t('stats.losses'), String(losses), C.red], [t('stats.winRateShort'), `%${rate}`, C.gold], [t('stats.bestStreak'), state.myStats ? String(state.myStats.bestStreak) : '—', '#8CE0FF']] as [string, string, string][]).map(([k, v, c]) => (
          <Plate key={k} face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mk(14)} style={{ flex: 1 }} inner={{ alignItems: 'center', paddingVertical: mk(8), paddingHorizontal: mk(4) }}>
            <OutlinedText size={mk(26)} width={mk(2)} color={c}>{v}</OutlinedText>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(13) }}>{k}</Text>
          </Plate>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: mk(10), marginTop: mk(10) }}>
        <ChunkyButton kind="blue" label={t('collection.tabCosmetics')} height={mk(62)} size={mk(20)} style={{ flex: 1 }} onPress={() => { onClose(); onOpenCollection(); }} />
        <ChunkyButton kind="blue" label={up(t('home.matchHistoryHint'))} height={mk(76)} size={mk(22)} style={{ flex: 1 }} onPress={() => { onClose(); if (onOpenMatchHistory) onOpenMatchHistory(); else actions.openMatchHistory(); }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mk(14), marginBottom: mk(8) }}>
        <OutlinedText size={mk(28)} width={mk(3)} align="left">{up(t('profile.pictures'))}</OutlinedText>
        <View style={{ flex: 1 }} /><GemAmount amount={p.diamonds ?? 0} size={mk(22)} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: mk(10) }}>
        {ids.map((id) => {
          const inUse = id === avatarId; const has = owned.has(id) || avatarPrice(id) === 0; const price = avatarPrice(id);
          return (
            <Pressable key={id} onPress={() => pick(id)} style={{ width: PP_COL }}>
              <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={inUse ? C.gold : C.navy} radius={mk(16)} inner={{ alignItems: 'center', paddingTop: mk(8), paddingBottom: mk(6), gap: mk(4) }}>
                <Avatar avatar={id} size={PP_COL - mk(30)} />
                {inUse ? <Ribbon label={t('profile.inUse')} color={C.gold} size={mk(11)} /> : has ? <IcCheckBadge size={mk(24)} /> : <GemAmount amount={price} size={mk(16)} />}
              </Plate>
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}
