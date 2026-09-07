// UI2 — OYNA sekmesi. Mock: docs/design/ui2/refs/home.png (853 px, mh()).
import { Image, Pressable, Text, View } from 'react-native';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { Bar, ChunkyButton, OutlinedText, Plate, fmt } from './primitives';
import { Hud } from './Shell';
import { LEVEL_CAP, nextArenaMin } from './products';
import { C, F, LIP, OUTLINE, SIDE, mh, mk } from './tokens';

export type HomeTabProps = {
  state: GameState; actions: Actions;
  onOpenLevelRoad: () => void; onOpenQuests: () => void; onOpenModes: () => void; onOpenBot: () => void;
  onOpenStore: () => void; onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void;
};

export function HomeTab({ state, actions, onOpenLevelRoad, onOpenQuests, onOpenModes, onOpenBot, onOpenStore, onOpenSettings, onOpenProfile, onOpenArenas }: HomeTabProps) {
  const p = state.profile;
  const level = p?.level ?? 1;
  const trophies = p?.trophies ?? 0;
  const nextMin = nextArenaMin(trophies);
  const arenaName = (p?.arena?.name ?? 'Mahalle Sahası').toLocaleUpperCase('tr');
  const questsReady = state.dailyQuests?.quests.filter((q) => q.done && !q.claimed).length ?? 0;
  const W = 430 - SIDE * 2;
  return (
    <View style={{ flex: 1 }}>
      <Hud
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onGems: onOpenStore, onSettings: onOpenSettings, onTrophies: onOpenArenas }}
      />
      {/* SEZON ÖDÜLLERİ şeridi (altın) */}
      <Pressable onPress={onOpenLevelRoad} style={{ marginHorizontal: SIDE, marginTop: mh(14) }}>
        <Plate face={C.gold} top={C.goldLight} lip={C.goldDark} radius={mh(22)} inner={{ height: mh(112) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mh(16) }}>
          <Image source={UI2.home_crown} style={{ width: mh(78), height: mh(70) }} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: mh(14), justifyContent: 'center' }}>
            <OutlinedText size={mh(30)} width={mk(3)} align="left" family={F.title}>SEZON ÖDÜLLERİ</OutlinedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mh(6) }}>
              <Bar value={level} max={LEVEL_CAP} color={C.gold} track="#3B2C00" height={mh(26)} radius={mh(8)} style={{ flex: 1 }} />
              <OutlinedText size={mh(30)} width={mk(3)} style={{ marginLeft: mh(14) }} numberOfLines={1}>{`${level} / ${LEVEL_CAP}`}</OutlinedText>
            </View>
          </View>
          <Image source={UI2.home_arrow} style={{ width: mh(40), height: mh(52), marginLeft: mh(12) }} resizeMode="contain" />
        </Plate>
      </Pressable>
      {/* Arena başlığı */}
      <View style={{ alignItems: 'center', marginTop: mh(16) }}>
        <Image source={UI2.home_title_crown} style={{ width: mh(70), height: mh(46) }} resizeMode="contain" />
        <View style={{ flexDirection: 'row', alignItems: 'center', width: W, justifyContent: 'center' }}>
          <OutlinedText size={mh(64)} width={mk(6)} style={{ letterSpacing: 0.5 }} numberOfLines={1}>{arenaName}</OutlinedText>
        </View>
      </View>
      {/* Arena sahnesi + Görevler */}
      <View style={{ height: mh(560), marginTop: -mh(10) }}>
        <Image source={UI2.home_arena} style={{ position: 'absolute', left: mh(10), right: mh(10), top: mh(20), width: W + mh(36), height: mh(540), alignSelf: 'center' }} resizeMode="contain" />
        <Pressable onPress={onOpenQuests} style={{ position: 'absolute', right: SIDE - mh(6), top: mh(48), width: mh(140), height: mh(150) }}>
          <Image source={UI2.home_quests} style={{ width: mh(140), height: mh(150) }} resizeMode="contain" />
          {questsReady > 0 ? (
            <View style={{ position: 'absolute', top: -mh(10), right: -mh(6), width: mh(46), height: mh(46), borderRadius: mh(23), backgroundColor: C.red, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
              <OutlinedText size={mh(26)} width={1}>{String(questsReady)}</OutlinedText>
            </View>
          ) : null}
        </Pressable>
      </View>
      {/* Kupa ilerlemesi */}
      <View style={{ alignItems: 'center', marginTop: -mh(6) }}>
        <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mh(22)} inner={{ width: mh(470) - OUTLINE * 2, height: mh(100) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mh(18) }}>
          <Image source={UI2.hud_trophy} style={{ width: mh(70), height: mh(70) }} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: mh(14) }}>
            <OutlinedText size={mh(34)} width={mk(3)} align="left">{`${fmt(trophies)} / ${fmt(nextMin)}`}</OutlinedText>
            <Bar value={trophies} max={nextMin} color={C.gold} track="#04163F" height={mh(22)} radius={mh(6)} style={{ marginTop: mh(4) }} />
          </View>
        </Plate>
      </View>
      {/* HEMEN OYNA */}
      <View style={{ marginHorizontal: SIDE + mh(10), marginTop: mh(24) }}>
        <ChunkyButton kind="gold" label="HEMEN OYNA" sub="1v1 Çevrimiçi" height={mh(180)} size={mh(76)} subSize={mh(34)} radius={mh(30)} onPress={() => actions.findMatch()} />
      </View>
      {/* Oyun Modları / Arkadaşla Oyna */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mh(26), gap: mh(20) }}>
        {([{ label: 'Oyun Modları', art: UI2.home_modes_art, on: onOpenModes }, { label: 'Bot Maçı', art: UI2.md_bot, on: onOpenBot }] as const).map((c) => (
          <Pressable key={c.label} onPress={c.on} style={{ flex: 1 }}>
            <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mh(26)} inner={{ height: mh(220) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: mh(10) }}>
              <Image source={c.art} style={{ width: '88%', height: mh(140), marginBottom: mh(4) }} resizeMode="contain" />
              <OutlinedText size={mh(34)} width={mk(3)}>{c.label}</OutlinedText>
            </Plate>
          </Pressable>
        ))}
      </View>
      <View style={{ height: mh(30) }} />
      {state.error ? <Text style={{ color: '#FFD7DE', textAlign: 'center', fontFamily: F.semi, fontSize: 12, marginTop: 6 }}>{state.error}</Text> : null}
    </View>
  );
}
