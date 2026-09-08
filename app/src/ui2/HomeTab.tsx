// UI2 — OYNA sekmesi. Mock: docs/design/ui2/refs/home.png (853 px, mh()).
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { t } from '../i18n';
import { arenaLabel } from '../screens';
import type { Actions, GameState } from './types';
import { up } from './strings';
import { UI2 } from './assets';
import { Bar, ChunkyButton, OutlinedText, Plate, fmt } from './primitives';
import { IcChevronGold, IcClipboard, IcCrownBig, IcTrophy } from './icons-ui';
import { Hud } from './Shell';
import { LEVEL_CAP, nextArenaMin } from './products';
import { C, F, LIP, mh, mk, OUTLINE, SIDE, SW } from './tokens';

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
  const arenaName = up(arenaLabel(p?.arena?.name ?? 'Mahalle Sahası'));
  const questsReady = state.dailyQuests?.quests.filter((q) => q.done && !q.claimed).length ?? 0;
  const W = SW - SIDE * 2;
  const [sceneH, setSceneH] = useState(0);
  // Arena sahnesi: RN iOS'ta stil boyutu verilmeyen Image kaynağın doğal boyutunu (1200×900 pt) alır → açık genişlik/yükseklik şart.
  const sceneW = SW + mh(16);
  const sceneImgH = sceneH + mh(40);
  return (
    <View style={{ flex: 1 }}>
      <Hud
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onGems: onOpenStore, onSettings: onOpenSettings, onTrophies: onOpenArenas }}
      />
      {/* SEZON ÖDÜLLERİ şeridi (altın) */}
      <Pressable onPress={onOpenLevelRoad} style={{ marginHorizontal: SIDE, marginTop: mh(8) }}>
        <Plate face={C.gold} top={C.goldLight} lip={C.goldDark} radius={mh(22)} inner={{ height: mh(112) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mh(16) }}>
          <IcCrownBig size={mh(72)} />
          <View style={{ flex: 1, marginLeft: mh(14), justifyContent: 'center' }}>
            <OutlinedText size={mh(30)} width={mk(3)} align="left" family={F.title}>{t('ui2.seasonRewards')}</OutlinedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: mh(6) }}>
              <Bar value={level} max={LEVEL_CAP} color={C.gold} track="#3B2C00" height={mh(26)} radius={mh(8)} style={{ flex: 1 }} />
              <OutlinedText size={mh(30)} width={mk(3)} style={{ marginLeft: mh(14) }} numberOfLines={1}>{`${level} / ${LEVEL_CAP}`}</OutlinedText>
            </View>
          </View>
          <View style={{ marginLeft: mh(8) }}><IcChevronGold size={mh(52)} /></View>
        </Plate>
      </Pressable>
      {/* Arena başlığı */}
      <View style={{ alignItems: 'center', marginTop: mh(10) }}>
        <IcCrownBig size={mh(44)} color="#FFFFFF" base="#DCE6FF" />
        <View style={{ flexDirection: 'row', alignItems: 'center', width: W, justifyContent: 'center' }}>
          <OutlinedText size={mh(64)} width={mk(6)} style={{ letterSpacing: 0.5 }} numberOfLines={1}>{arenaName}</OutlinedText>
        </View>
      </View>
      {/* Arena sahnesi + Görevler */}
      <View style={{ flex: 1, minHeight: mh(240), marginTop: -mh(12) }} onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}>
        {sceneH > 0 ? <Image source={UI2.home_arena} style={{ position: 'absolute', left: -mh(8), top: 0, width: sceneW, height: sceneImgH }} resizeMode="contain" /> : null}
        <Pressable onPress={onOpenQuests} style={{ position: 'absolute', right: SIDE - mh(6), top: mh(48), width: mh(140), height: mh(150) }}>
          <View style={{ alignItems: 'center' }}><IcClipboard size={mh(104)} /><OutlinedText size={mh(30)} width={mk(3)}>{t('ui2.questsLabel')}</OutlinedText></View>
          {questsReady > 0 ? (
            <View style={{ position: 'absolute', top: -mh(10), right: -mh(6), width: mh(46), height: mh(46), borderRadius: mh(23), backgroundColor: C.red, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
              <OutlinedText size={mh(26)} width={1}>{String(questsReady)}</OutlinedText>
            </View>
          ) : null}
        </Pressable>
      </View>
      {/* Kupa ilerlemesi */}
      <View style={{ alignItems: 'center', marginTop: 0 }}>
        <Plate face={C.panelInk} top="#2F63C8" lip="#041A4E" radius={mh(22)} inner={{ width: mh(470) - OUTLINE * 2, height: mh(96) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mh(18) }}>
          <IcTrophy size={mh(66)} />
          <View style={{ flex: 1, marginLeft: mh(14) }}>
            <OutlinedText size={mh(34)} width={mk(3)} align="left">{`${fmt(trophies)} / ${fmt(nextMin)}`}</OutlinedText>
            <Bar value={trophies} max={nextMin} color={C.gold} track="#04163F" height={mh(22)} radius={mh(6)} style={{ marginTop: mh(4) }} />
          </View>
        </Plate>
      </View>
      {/* HEMEN OYNA */}
      <View style={{ marginHorizontal: SIDE + mh(10), marginTop: mh(16) }}>
        <ChunkyButton kind="gold" label={up(t('home.quickMatch'))} sub={t('ui2.online1v1')} height={mh(180)} size={mh(76)} subSize={mh(34)} radius={mh(30)} onPress={() => actions.findMatch()} />
      </View>
      {/* Oyun Modları / Arkadaşla Oyna */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mh(16), gap: mh(20) }}>
        {([{ key: 'modes', label: t('ui2.gameModes'), art: UI2.home_modes_art, on: onOpenModes }, { key: 'bot', label: t('home.solo'), art: UI2.md_bot, on: onOpenBot }] as const).map((c) => (
          <Pressable key={c.key} onPress={c.on} style={{ flex: 1 }}>
            <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={mh(26)} inner={{ height: mh(200) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: mh(8) }}>
              <Image source={c.art} style={{ width: '88%', height: mh(124), marginBottom: mh(4) }} resizeMode="contain" />
              <OutlinedText size={mh(34)} width={mk(3)}>{c.label}</OutlinedText>
            </Plate>
          </Pressable>
        ))}
      </View>
      <View style={{ height: mh(8) }} />
      {state.error ? <Text style={{ color: '#FFD7DE', textAlign: 'center', fontFamily: F.semi, fontSize: 12, marginTop: 6 }}>{state.error}</Text> : null}
    </View>
  );
}
