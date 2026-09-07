// UI2 kabuğu: üst HUD + alt navigasyon + damalı zemin. Mock: docs/design/ui2/refs/*.png
import { type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../Avatar';
import { t, type MessageKey } from '../i18n';
import { Bar, CheckerBg, IconSlot, OutlinedText, Plate, fmt } from './primitives';
import { IcGear, IcGem, IcNavCollection, IcNavFriends, IcNavPlay, IcNavStore, IcPlus, IcTrophy } from './icons-ui';
import { C, F, LIP, OUTLINE, R, SIDE, mk } from './tokens';

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
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* avatar kutusu + seviye kalkanı */}
        <Pressable onPress={actions?.onAvatar} style={{ width: avatarBox + mk(14), height: avatarBox + mk(20) }}>
          <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mk(26)} inner={{ width: avatarBox - OUTLINE * 2, height: avatarBox - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar avatar={data.avatarId} name={data.name} size={avatarBox - mk(30)} frameId={data.frameId ?? null} />
          </Plate>
          <View style={{ position: 'absolute', right: -mk(6), bottom: 0, width: mk(60), height: mk(66), alignItems: 'center', justifyContent: 'center' }}>
            <LevelShield level={data.level} />
          </View>
        </Pressable>
        {/* ad + XP */}
        <View style={{ flex: 1, minWidth: 0, marginLeft: mk(18), marginTop: mk(6), overflow: 'hidden' }}>
          <OutlinedText size={mk(40)} width={mk(4)} align="left" numberOfLines={1}>{data.name.toLocaleUpperCase('tr')}</OutlinedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mk(10) }}>
            <Bar value={data.xp} max={data.xpNext} style={{ width: mk(185) }} height={mk(30)} />
            <Text numberOfLines={1} style={{ color: C.white, fontFamily: F.bold, fontSize: mk(21), marginLeft: mk(10) }}>{fmt(data.xp)} / {fmt(data.xpNext)}</Text>
          </View>
        </View>
        {/* elmas pill + artı + dişli */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mk(8) }}>
          <Pressable onPress={actions?.onGems}>
            <Plate face={C.panelInk} top="#2F63C8" lip="#051D52" radius={R.pill} inner={{ height: mk(66) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingLeft: mk(8), paddingRight: mk(18), gap: mk(6) }}>
              <View style={{ marginTop: -mk(4) }}><IcGem size={mk(50)} /></View>
              <OutlinedText size={mk(36)} width={mk(3)}>{fmt(data.diamonds)}</OutlinedText>
            </Plate>
          </Pressable>
          <Pressable onPress={actions?.onPlus ?? actions?.onGems} style={{ marginLeft: -mk(14), marginTop: -mk(2) }}>
            <IcPlus size={mk(56)} />
          </Pressable>
          <Pressable onPress={actions?.onSettings} style={{ marginLeft: mk(10) }}>
            <IcGear size={mk(78)} />
          </Pressable>
        </View>
      </View>
      {/* kupa pill + sayfa başlığı */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mk(8), height: mk(96) }}>
        <Pressable onPress={actions?.onTrophies}>
          <Plate face={C.panelInk} top="#2F63C8" lip="#051D52" radius={R.pill} inner={{ height: mk(64) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingLeft: mk(8), paddingRight: mk(20), gap: mk(6) }}>
            <View style={{ marginTop: -mk(4) }}><IcTrophy size={mk(56)} /></View>
            <OutlinedText size={mk(36)} width={mk(3)}>{fmt(data.trophies)}</OutlinedText>
          </Plate>
        </Pressable>
        {title ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginLeft: -mk(20) }}>
            {titleIcon ? <IconSlot icon={titleIcon} width={mk(130)} height={mk(110)} size={mk(104)} /> : null}
            <OutlinedText size={mk(80)} width={mk(6)} style={{ letterSpacing: 1 }}>{title}</OutlinedText>
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
const NAV: { key: NavKey; Icon: (p: { size?: number }) => ReactNode; labelKey: MessageKey }[] = [
  { key: 'store', Icon: IcNavStore, labelKey: 'tab.store' as MessageKey },
  { key: 'collection', Icon: IcNavCollection, labelKey: 'tab.collection' as MessageKey },
  { key: 'play', Icon: IcNavPlay, labelKey: 'ui2.play' as MessageKey },
  { key: 'friends', Icon: IcNavFriends, labelKey: 'tab.friends' as MessageKey },
  { key: 'tournaments', Icon: IcTrophy, labelKey: 'tab.tournaments' as MessageKey },
];
export const NAV_H = mk(150);
export function BottomNav({ active, onPress, labels, badges }: { active: NavKey; onPress: (k: NavKey) => void; labels?: Partial<Record<NavKey, string>>; badges?: Partial<Record<NavKey, number>> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: C.navBar, paddingBottom: Math.max(insets.bottom, mk(10)), paddingTop: mk(14), paddingHorizontal: mk(10), flexDirection: 'row', alignItems: 'flex-end', gap: mk(8), borderTopWidth: mk(5), borderTopColor: C.navy }}>
      {NAV.map((n) => {
        const on = n.key === active; const badge = badges?.[n.key];
        return (
          <Pressable key={n.key} onPress={() => onPress(n.key)} style={{ flex: 1, minWidth: 0, marginTop: on ? -mk(22) : 0 }}>
            <Plate face={on ? C.navActive : C.navTile} top={on ? '#8CC4FF' : C.navTileTop} lip={on ? C.gold : '#082F80'} outline={on ? C.gold : C.navy} radius={R.tile} outlineWidth={on ? mk(7) : OUTLINE} lipHeight={mk(14)}
              inner={{ height: (on ? NAV_H + mk(12) : NAV_H) - mk(14) - OUTLINE * 2, alignItems: 'center', justifyContent: 'center', paddingTop: mk(6) }}>
              <View style={{ height: mk(78), justifyContent: 'center' }}><n.Icon size={mk(74)} /></View>
              <OutlinedText size={mk(30)} width={mk(3)} family={F.title} style={{ marginTop: mk(2) }} numberOfLines={1}>{labels?.[n.key] ?? t(n.labelKey)}</OutlinedText>
            </Plate>
            {badge ? (
              <View style={{ position: 'absolute', top: -mk(8), right: mk(6), minWidth: mk(44), height: mk(44), borderRadius: mk(22), backgroundColor: C.red, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
                <OutlinedText size={mk(24)} width={1}>{String(badge)}</OutlinedText>
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
