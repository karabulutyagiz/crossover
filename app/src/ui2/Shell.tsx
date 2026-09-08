// UI2 kabuğu: üst HUD + alt navigasyon + damalı zemin. Mock: docs/design/ui2/refs/*.png
import { type ReactNode } from 'react';
import { Image, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { Avatar } from '../Avatar';
import { t, type MessageKey } from '../i18n';
import { UI2 } from './assets';
import { Bar, CheckerBg, IconSlot, OutlinedText, Plate, fitSize, fmt } from './primitives';
import { IcGear, IcGem, IcNavCollection, IcNavFriends, IcNavPlay, IcNavStore, IcPlus, IcTrophy } from './icons-ui';
import { C, F, fz, LIP, mk, OUTLINE, R, SIDE } from './tokens';

export type HudData = {
  name: string; avatarId: string | null; frameId?: string | null; level: number; xp: number; xpNext: number;
  trophies: number; diamonds: number;
};
export type HudActions = { onAvatar?: () => void; onGems?: () => void; onPlus?: () => void; onSettings?: () => void; onTrophies?: () => void };

// ── HUD: mock üst bant (avatar kutusu 130 px, ad, XP çubuğu, seviye kalkanı; sağda elmas pill + artı + dişli; altta kupa pill) ──
export function Hud({ data, actions, title, titleIcon }: { data: HudData; actions?: HudActions; title?: string; titleIcon?: ImageSourcePropType | ReactNode }) {
  const avatarBox = mk(128);
  return (
    <View style={{ paddingHorizontal: SIDE, paddingTop: mk(22) }}>
      {/* Üst bant tek eksende hizalı: avatar kutusu, ad+XP bloğu, elmas hapı ve dişli dikeyde ORTALI (kullanıcı 2026-09-08) */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* avatar kutusu + seviye kalkanı */}
        {/* ÇERÇEVE YOK: kare plaka hem fotoğrafı hem takılı elmas/kozmetik çerçeveyi bozuyordu
            (kullanıcı 2026-09-08). Yalnız fotoğraf + seviye kalkanı. */}
        <Pressable onPress={actions?.onAvatar} style={{ width: avatarBox, height: avatarBox + mk(16), alignItems: 'center', justifyContent: 'flex-start' }}>
          <Avatar avatar={data.avatarId} name={data.name} size={avatarBox} frameId={data.frameId ?? null} />
          <View style={{ position: 'absolute', right: -mk(6), bottom: 0, width: mk(60), height: mk(66), alignItems: 'center', justifyContent: 'center' }}>
            <LevelShield level={data.level} />
          </View>
        </Pressable>
        {/* ad + XP */}
        <View style={{ flex: 1, minWidth: 0, marginLeft: mk(16), marginRight: mk(12), overflow: 'hidden' }}>
          <OutlinedText size={mk(40)} width={mk(4)} align="left" numberOfLines={1}>{data.name.toLocaleUpperCase('tr')}</OutlinedText>
          {/* XP: kalın çubuk, sayı ÇUBUĞUN İÇİNDE (yanına yazınca boş hap gibi duruyordu) */}
          <View style={{ marginTop: mk(8), justifyContent: 'center' }}>
            <Bar value={data.xp} max={data.xpNext} height={mk(44)} radius={mk(14)} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
              <OutlinedText size={mk(26)} width={mk(2)} numberOfLines={1}>{`${fmt(data.xp)} / ${fmt(data.xpNext)}`}</OutlinedText>
            </View>
          </View>
        </View>
        {/* elmas pill + artı + dişli */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Artı hapın İÇİNDE: dışarıda dururken 'bardan fırlamış' gibi görünüyordu (kullanıcı 2026-09-08) */}
          <Pressable onPress={actions?.onGems}>
            <Plate face={C.panelInk} top="#2F63C8" lip="#051D52" radius={R.pill} inner={{ height: mk(84) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingLeft: mk(10), paddingRight: mk(8), gap: mk(8) }}>
              <View style={{ marginTop: -mk(4) }}><IcGem size={mk(62)} /></View>
              <OutlinedText size={mk(44)} width={mk(3.5)}>{fmt(data.diamonds)}</OutlinedText>
              <Pressable onPress={actions?.onPlus ?? actions?.onGems} hitSlop={8} style={{ marginLeft: mk(2) }}>
                <IcPlus size={mk(56)} />
              </Pressable>
            </Plate>
          </Pressable>
          {/* Dişli de elmas hapıyla AYNI yükseklikte yuvarlak buton — çıplak ikonken boşlukta duruyordu */}
          <Pressable onPress={actions?.onSettings} style={{ marginLeft: mk(10) }}>
            <Plate face={C.panelInk} top="#2F63C8" lip="#051D52" radius={R.pill} inner={{ width: mk(84) - OUTLINE * 2, height: mk(84) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
              <IcGear size={mk(58)} />
            </Plate>
          </Pressable>
        </View>
      </View>
      {/* kupa pill + sayfa başlığı */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mk(10), height: titleIcon ? mk(104) : mk(94) }}>
        <Pressable onPress={actions?.onTrophies}>
          <Plate face={C.panelInk} top="#2F63C8" lip="#051D52" radius={R.pill} inner={{ height: mk(84) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingLeft: mk(10), paddingRight: mk(24), gap: mk(8) }}>
            <View style={{ marginTop: -mk(4) }}><IcTrophy size={mk(66)} /></View>
            <OutlinedText size={mk(44)} width={mk(3.5)}>{fmt(data.trophies)}</OutlinedText>
          </Plate>
        </Pressable>
        {title ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginLeft: -mk(20) }}>
            {titleIcon ? <IconSlot icon={titleIcon} width={mk(110)} height={mk(96)} size={mk(92)} /> : null}
            <OutlinedText size={mk(62)} width={mk(5)} numberOfLines={1} style={{ letterSpacing: 0.5 }}>{title}</OutlinedText>
          </View>
        ) : <View style={{ flex: 1 }} />}
      </View>
    </View>
  );
}

function LevelShield({ level }: { level: number }) {
  // Mock: mavi kalkan, koyu kontur, beyaz sayı.
  return (
    <View style={{ width: mk(58), height: mk(66), alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: mk(58), height: mk(52), top: 0, backgroundColor: C.navy, borderRadius: mk(10) }} />
      <View style={{ position: 'absolute', width: mk(58), height: mk(58), top: mk(8), backgroundColor: C.navy, borderRadius: mk(29), transform: [{ scaleY: 0.9 }] }} />
      <View style={{ position: 'absolute', width: mk(46), height: mk(42), top: mk(6), backgroundColor: '#2F8CFF', borderRadius: mk(8) }} />
      <View style={{ position: 'absolute', width: mk(46), height: mk(46), top: mk(12), backgroundColor: '#2F8CFF', borderRadius: mk(23), transform: [{ scaleY: 0.9 }] }} />
      <OutlinedText size={mk(30)} width={mk(3)}>{String(level)}</OutlinedText>
    </View>
  );
}

// ── Alt navigasyon: 5 plaka; aktif olan altın çerçeveli + açık mavi yüz, yukarı taşar ──
export type NavKey = 'store' | 'collection' | 'play' | 'friends' | 'tournaments';
// Alt çubuk ikonları: kullanıcının çizdirdiği 5 rozet (assets/ui2/nav-*.png; 2026-09-08).
function NavImg({ source, size = mk(96) }: { source: ImageSourcePropType; size?: number }) {
  return <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />;
}
const NAV: { key: NavKey; Icon: (p: { size?: number }) => ReactNode; labelKey: MessageKey }[] = [
  { key: 'store', Icon: (p) => <NavImg source={UI2.nav_store} size={p.size} />, labelKey: 'tab.store' as MessageKey },
  { key: 'collection', Icon: (p) => <NavImg source={UI2.nav_collection} size={p.size} />, labelKey: 'tab.collection' as MessageKey },
  { key: 'play', Icon: (p) => <NavImg source={UI2.nav_play} size={p.size} />, labelKey: 'ui2.play' as MessageKey },
  { key: 'friends', Icon: (p) => <NavImg source={UI2.nav_friends} size={p.size} />, labelKey: 'tab.friends' as MessageKey },
  { key: 'tournaments', Icon: (p) => <NavImg source={UI2.nav_tournaments} size={p.size} />, labelKey: 'tab.tournaments' as MessageKey },
];
export const NAV_H = mk(152);
// Clash Royale alt çubuğu — kullanıcının CR ekran görüntülerinden birebir (2026-09-08):
// koyu kurşuni bar (#3F4757), sekmeler arasında ince çizgiler, yalnız ikon; AKTİF sekme 2 kat geniş,
// üstten açık maviye geçişli zemin (#86C3DC → #5F7FA1), yanlarda açık mavi ok uçları, altında sekme adı.
// OYNA sekmesi (CR'deki Savaş) her zaman altın zeminli.
const NAV_BAR = '#3F4757';
// Zemin: CR'de aktif sekmenin rengi ALTTA yoğun, yukarı doğru sönümlenir (üstte neredeyse bar rengi);
// kenardaki sekmelerde dış alt köşe telefon köşesi gibi yuvarlanır.
function NavFill({ from, to, fromOpacity = 1, corner }: { from: string; to: string; fromOpacity?: number; corner?: 'left' | 'right' }) {
  const r = mk(120);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderBottomLeftRadius: corner === 'left' ? r : 0, borderBottomRightRadius: corner === 'right' ? r : 0 }]}>
      <Svg width="100%" height="100%">
        <Defs><SvgLinearGradient id={`navg_${from.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={from} stopOpacity={fromOpacity} /><Stop offset="1" stopColor={to} stopOpacity={1} /></SvgLinearGradient></Defs>
        <Rect width="100%" height="100%" fill={`url(#navg_${from.replace(/[^a-z0-9]/gi, '')})`} />
      </Svg>
    </View>
  );
}
function NavArrow({ dir }: { dir: 'left' | 'right' }) {
  const w = mk(16); const h = mk(26);
  return (
    <Svg width={w} height={h} viewBox="0 0 16 26" style={{ position: 'absolute', top: '50%', marginTop: -h / 2, [dir]: mk(6) }} pointerEvents="none">
      <Polygon points={dir === 'left' ? '16,0 0,13 16,26' : '0,0 16,13 0,26'} fill="#A4E2FC" />
    </Svg>
  );
}
export function BottomNav({ active, onPress, labels, badges }: { active: NavKey; onPress: (k: NavKey) => void; labels?: Partial<Record<NavKey, string>>; badges?: Partial<Record<NavKey, number>> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: NAV_BAR, flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: '#6E7C94' }}>
      {/* barın kendisi de hafif geçişli: üstte biraz açık, altta koyu (CR) */}
      <NavFill from="#525E73" to="#3A4252" />
      {NAV.map((n, i) => {
        const on = n.key === active; const play = n.key === 'play'; const badge = badges?.[n.key];
        const label = labels?.[n.key] ?? t(n.labelKey);
        const corner = i === 0 ? 'left' : i === NAV.length - 1 ? 'right' : undefined;
        return (
          <Pressable key={n.key} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity')); onPress(n.key); }} style={{ flex: on ? 2 : 1, minWidth: 0, height: NAV_H + Math.max(insets.bottom, mk(8)), paddingBottom: Math.max(insets.bottom, mk(8)), alignItems: 'center', justifyContent: 'center', borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: '#2A3140' }}>
            {on ? <NavFill from="#6385A6" to="#6E92B4" fromOpacity={0.08} corner={corner} /> : play ? <NavFill from="#D9AF5A" to="#E8C56A" corner={corner} /> : null}
            {/* oklar yalnız gidilebilecek yöne: en solda sağ ok, en sağda sol ok (CR) */}
            {on && i > 0 ? <NavArrow dir="left" /> : null}
            {on && i < NAV.length - 1 ? <NavArrow dir="right" /> : null}
            <View style={{ alignItems: 'center', marginTop: on ? -mk(8) : 0 }}>
              <n.Icon size={on ? mk(114) : mk(106)} />
              {on ? <OutlinedText size={fitSize(mk(30), label, 12)} width={mk(3)} family={F.title} style={{ marginTop: -mk(4) }} numberOfLines={1} fit>{label}</OutlinedText> : null}
            </View>
            {badge ? (
              <View style={{ position: 'absolute', top: mk(8), right: on ? '28%' : mk(10), minWidth: mk(40), height: mk(40), borderRadius: mk(10), backgroundColor: C.red, borderWidth: mk(3), borderColor: '#7A1020', alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
                <OutlinedText size={mk(22)} width={1}>{String(badge)}</OutlinedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Ekran çerçevesi: zemin + safe area + kaydırılabilir gövde ────────────────────
export function Frame({ children, scroll = true, bottomPad = mk(40) }: { children: ReactNode; scroll?: boolean; bottomPad?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <CheckerBg />
      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: bottomPad }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top }}>{children}</View>
      )}
    </View>
  );
}
export const shellStyles = StyleSheet.create({ side: { paddingHorizontal: SIDE } });
