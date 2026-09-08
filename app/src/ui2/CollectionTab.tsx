// UI2 — KOLEKSİYON sekmesi. Mock: refs/collection.png. Gerçek içerik: özel güç yuvaları/envanter,
// hesap güçleri, sahip olunan kozmetikler (sunucu kataloğu + seviye çerçeveleri), ifade yuvaları.
import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { t, type MessageKey } from '../i18n';
import { CosmeticArt, FrameArt, LEVEL_TIERS, SPECIAL_POWERS, ownsFrame, spInventoryCount } from '../screens';
import { EmoteSticker, FREE_EMOTES, PREMIUM_EMOTES } from '../emotes';
import type { StoreCatalogItem } from '../protocol';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { ChunkyButton, IconSlot, OutlinedText, Plate, SectionHeader } from './primitives';
import { IcBolt, IcFace, IcNavCollection, IcStar } from './icons-ui';
import { Hud } from './Shell';
import { ACCOUNT_POWERS, SP_ART, SP_FACE, SP_LIST, type PowerId, type SpId } from './products';
import { S, up } from './strings';
import { C, F, fz, GAP, LIP, mk, OUTLINE, R, SIDE, SW } from './tokens';

const RARITY_N: Record<string, number> = { common: 2, rare: 3, epic: 4, legendary: 5, mythic: 5 };
const EMOTE_SLOTS = 8;
const INNER_W = SW - SIDE * 2 - OUTLINE * 2 - mk(14) * 2;
const COL_W = Math.floor((INNER_W - GAP * 3) / 4);   // ifade yuvaları (4 sütun)
const PW_IN_W = Math.floor((INNER_W - GAP * 2) / 3);  // güç seti yuvaları (3 sütun, panel içi)
const PW_W = Math.floor((SW - SIDE * 2 - GAP * 2) / 3); // tüm güçler (3 sütun, telefonda okunur)

export type CollectionTabProps = { state: GameState; actions: Actions; onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void; onOpenStore: () => void; onNotice: (title: string, body: string) => void; initialSub?: Sub };
type Sub = 'powers' | 'cosmetics' | 'emotes';

export function CollectionTab({ state, actions, onOpenSettings, onOpenProfile, onOpenArenas, onOpenStore, onNotice, initialSub }: CollectionTabProps) {
  const p = state.profile;
  const [sub, setSub] = useState<Sub>(initialSub ?? 'powers');
  const catalog = state.storeCatalog;
  useEffect(() => { if (!catalog) actions.loadStoreCatalog(); }, [catalog, actions]);
  const spEquipped = ((p?.equippedSpecialPowers ?? (p?.equippedSpecialPower ? [p.equippedSpecialPower] : [])) as SpId[]);
  return (
    <View style={{ flex: 1 }}>
      <Hud title={S.collection} titleIcon={<IcNavCollection />}
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level: p?.level ?? 1, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies: p?.trophies ?? 0, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onSettings: onOpenSettings, onTrophies: onOpenArenas }} />
      {/* ── Alt sekmeler (mock: sol altın aktif, diğerleri mavi) ── */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mk(4), gap: mk(10) }}>
        {([['powers', up(t('collection.tabPowers'))], ['cosmetics', t('collection.tabCosmetics')], ['emotes', up(t('collection.tabEmotes'))]] as [Sub, string][]).map(([k, label]) => {
          const on = sub === k;
          return (
            <Pressable key={k} onPress={() => setSub(k)} style={{ flex: 1 }}>
              <Plate face={on ? C.gold : C.card} top={on ? C.goldLight : C.cardTop} lip={on ? C.goldDark : C.cardDark} radius={mk(20)} inner={{ minHeight: mk(84) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
                <OutlinedText size={mk(30)} width={mk(3)} color={on ? C.ink : C.white} outline={on ? '#FFF6C7' : C.ink}>{label}</OutlinedText>
              </Plate>
            </Pressable>
          );
        })}
      </View>
      {sub === 'powers' ? <Powers p={p} actions={actions} spEquipped={spEquipped} onOpenStore={onOpenStore} onNotice={onNotice} /> : null}
      {sub === 'cosmetics' ? <Cosmetics p={p} actions={actions} catalog={catalog?.items ?? []} /> : null}
      {sub === 'emotes' ? <Emotes p={p} actions={actions} onNotice={onNotice} /> : null}
      <View style={{ height: mk(30) }} />
    </View>
  );
}

function Powers({ p, actions, spEquipped, onOpenStore, onNotice }: { p: GameState['profile']; actions: Actions; spEquipped: SpId[]; onOpenStore: () => void; onNotice: (a: string, b: string) => void }) {
  const specials = SP_LIST;
  const count = (id: SpId) => spInventoryCount(p, id);
  const accCount: Record<PowerId, number> = { xp2x: p?.powerXp2x ?? 0, shield: p?.powerShield ?? 0, streak: p?.powerStreak ?? 0, training: p?.powerTraining ?? 0 };
  return (
    <>
      <View style={{ marginHorizontal: SIDE, marginTop: mk(14) }}>
        <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={R.plate} inner={{ paddingHorizontal: mk(14), paddingBottom: mk(16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: mk(84) }}>
            <OutlinedText size={mk(40)} width={mk(4)} align="left">{t('ui2.myPowerSet')}</OutlinedText>
            <View style={{ flex: 1 }} />
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(17), textAlign: 'right', flexShrink: 1 }}>{t('ui2.myPowerSetHint')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: GAP }}>
            {[0, 1, 2].map((i) => {
              const id = spEquipped[i];
              return id ? <PowerCard key={id} width={PW_IN_W} name={t(SPECIAL_POWERS[id].nameKey)} art={SP_ART[id]} face={SP_FACE[id]} badge={RARITY_N[SPECIAL_POWERS[id].rarity]} line={t('ui2.count', { n: count(id) })} button={{ label: up(t('collection.remove')), kind: 'blue', on: () => actions.equipSpecialPower(id) }} />
                : <Plate key={i} face="#0B3A96" top="#2F63C8" lip="#041A4E" radius={R.card} style={{ width: PW_IN_W }} inner={{ minHeight: mk(340) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(60)} width={mk(3)} color={C.textMuted}>+</OutlinedText><Text style={{ color: C.textMuted, fontFamily: F.bold, fontSize: fz(16) }}>{t('ui2.emptySlot')}</Text></Plate>;
            })}
          </View>
        </Plate>
      </View>
      <SectionHeader icon={<IcBolt />} title={t('ui2.allPowers')} subtitle={t('ui2.allPowersSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {specials.map((id) => {
          const n = count(id); const on = spEquipped.includes(id);
          return <PowerCard key={id} width={PW_W} name={t(SPECIAL_POWERS[id].nameKey)} art={SP_ART[id]} face={SP_FACE[id]} badge={RARITY_N[SPECIAL_POWERS[id].rarity]} line={t('ui2.count', { n })} dim={n === 0 && !on}
            button={n === 0 && !on ? { label: S.store, kind: 'gold', on: onOpenStore } : { label: on ? up(t('collection.remove')) : t('store.spEquip'), kind: on ? 'blue' : 'green', on: () => { if (!on && spEquipped.length >= 3) { onNotice(t('ui2.powerSetFull'), t('ui2.powerSetFullBody')); return; } actions.equipSpecialPower(id); } }} />;
        })}
        {ACCOUNT_POWERS.map((pw) => {
          const n = accCount[pw.id];
          return <PowerCard key={pw.id} width={PW_W} name={t(pw.titleKey)} art={UI2[pw.art]} face={[pw.face, pw.top, pw.lip]} badge={n} line={t('ui2.count', { n })} dim={n === 0}
            button={n === 0 ? { label: S.store, kind: 'gold', on: onOpenStore } : { label: up(t('collection.use')), kind: 'green', on: () => { actions.usePower(pw.id); onNotice(t(pw.titleKey), t('ui2.powerActivated')); } }} />;
        })}
      </View>
    </>
  );
}
function PowerCard({ width, name, art, face, badge, line, button, dim }: { width: number; name: string; art: ImageSourcePropType | ReactNode; face: [string, string, string]; badge: number; line: string; button: { label: string; kind: 'green' | 'blue' | 'gold'; on: () => void }; dim?: boolean }) {
  return (
    <View style={{ width, opacity: dim ? 0.72 : 1 }}>
      <Plate face={face[0]} top={face[1]} lip={face[2]} radius={R.card} inner={{ minHeight: mk(340) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(12), paddingHorizontal: mk(6) }}>
        <View style={{ height: mk(140), width: '100%', alignItems: 'center', justifyContent: 'center' }}>{isValidElement(art) ? <IconSlot icon={art} width={mk(140)} height={mk(140)} size={mk(120)} /> : <Image source={art as ImageSourcePropType} style={{ width: mk(140), height: mk(140) }} resizeMode="contain" />}</View>
        <View style={{ flex: 1 }} />
        <OutlinedText size={mk(26)} width={mk(2.5)} numberOfLines={1} fit>{up(name)}</OutlinedText>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: mk(10), paddingHorizontal: mk(12), paddingVertical: mk(2), marginTop: mk(4) }}><Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(16) }}>{line}</Text></View>
        <View style={{ width: '100%', marginTop: mk(8), marginBottom: mk(10) }}><ChunkyButton kind={button.kind} label={button.label} height={mk(60)} size={mk(24)} onPress={button.on} /></View>
      </Plate>
      <View style={{ position: 'absolute', top: -mk(8), left: -mk(4), width: mk(50), height: mk(50), borderRadius: mk(25), backgroundColor: '#8E2BEA', borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(24)} width={1.2}>{String(badge)}</OutlinedText></View>
    </View>
  );
}

function Cosmetics({ p, actions, catalog }: { p: GameState['profile']; actions: Actions; catalog: StoreCatalogItem[] }) {
  const owned = new Set(p?.ownedCosmetics ?? []);
  const items = catalog.filter((i) => owned.has(i.id) && i.type !== 'frame');
  const equippedOf = (type: string): string | null => type === 'match_background' ? p?.equippedMatchBackgroundId ?? null : type === 'ball' ? p?.equippedBallId ?? null : type === 'name_effect' ? p?.equippedNameEffectId ?? null : type === 'intro' ? p?.equippedIntroId ?? null : type === 'victory_effect' ? p?.equippedVictoryEffectId ?? null : type === 'answer_effect' ? p?.equippedAnswerEffectId ?? null : null;
  const tierFrames = LEVEL_TIERS.filter((tier) => ownsFrame(p ?? null, tier.key));
  const storeFrames = catalog.filter((i) => i.type === 'frame' && owned.has(i.id));
  const COL3 = Math.floor((SW - SIDE * 2 - GAP * 2) / 3);
  return (
    <>
      <SectionHeader icon={UI2.frame_laurel} title={up(t('profile.frames'))} subtitle={t('ui2.framesSub')} style={{ marginHorizontal: SIDE, marginTop: mk(10) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {tierFrames.map((tier) => <FrameCard key={tier.key} width={COL3} name={t(tier.nameKey)} equipped={p?.selectedFrame === tier.key} onPress={() => actions.setFrame(p?.selectedFrame === tier.key ? null : tier.key)}><FrameArt tierKey={tier.key} size={mk(140)} /></FrameCard>)}
        {storeFrames.map((it) => <FrameCard key={it.id} width={COL3} name={it.name} equipped={p?.selectedFrame === it.id} onPress={() => actions.setFrame(p?.selectedFrame === it.id ? null : it.id)}><CosmeticArt id={it.id} type={it.type} size={mk(250)} accent={C.gold} /></FrameCard>)}
        {tierFrames.length + storeFrames.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), padding: mk(10) }}>{t('ui2.noFrames')}</Text> : null}
      </View>
      <SectionHeader icon={<IcStar />} title={t('ui2.cosmetics')} subtitle={t('ui2.cosmeticsSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {items.map((it) => {
          const on = equippedOf(it.type) === it.id;
          return <FrameCard key={it.id} width={COL3} name={it.name} equipped={on} onPress={() => actions.equipCosmetic(it.type as any, on ? null : it.id)}><CosmeticArt id={it.id} type={it.type} size={mk(240)} accent={C.cyan} /></FrameCard>;
        })}
        {items.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(20), padding: mk(10) }}>{t('ui2.noCosmetics')}</Text> : null}
      </View>
    </>
  );
}
function FrameCard({ width, name, equipped, onPress, children }: { width: number; name: string; equipped: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <View style={{ width }}>
      <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={equipped ? C.gold : C.navy} radius={R.card} inner={{ minHeight: mk(340) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(10), paddingHorizontal: mk(6) }}>
        <View style={{ height: mk(150), width: '100%', alignItems: 'center', justifyContent: 'center' }}>{children}</View>
        <View style={{ flex: 1 }} />
        <OutlinedText size={mk(26)} width={mk(2.5)} numberOfLines={1} fit>{up(name)}</OutlinedText>
        <View style={{ width: '100%', marginTop: mk(8), marginBottom: mk(10) }}><ChunkyButton kind={equipped ? 'blue' : 'green'} label={equipped ? t('store.spEquipped') : t('store.spEquip')} height={mk(60)} size={mk(24)} onPress={onPress} /></View>
      </Plate>
    </View>
  );
}

function Emotes({ p, actions, onNotice }: { p: GameState['profile']; actions: Actions; onNotice: (a: string, b: string) => void }) {
  const equipped = p?.equippedEmotes ?? [];
  const ownedPremium = PREMIUM_EMOTES.filter((e) => (p?.ownedEmotes ?? []).includes(e.id));
  const all = [...FREE_EMOTES, ...ownedPremium];
  const toggle = (id: string) => {
    if (equipped.includes(id)) actions.equipEmotes(equipped.filter((x) => x !== id));
    else if (equipped.length >= EMOTE_SLOTS) onNotice(up(t('collection.slotsFull')), t('ui2.slotsFullBody', { n: EMOTE_SLOTS }));
    else actions.equipEmotes([...equipped, id]);
  };
  return (
    <>
      <View style={{ marginHorizontal: SIDE, marginTop: mk(14) }}>
        <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={R.plate} inner={{ paddingHorizontal: mk(14), paddingBottom: mk(16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: mk(84) }}>
            <OutlinedText size={mk(40)} width={mk(4)} align="left">{t('ui2.myEmotes')}</OutlinedText>
            <View style={{ flex: 1 }} />
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(17) }}>{`${equipped.length} / ${EMOTE_SLOTS}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {Array.from({ length: EMOTE_SLOTS }, (_, i) => equipped[i]).map((id, i) => (
              <Pressable key={i} onPress={() => id && toggle(id)} style={{ width: COL_W }}>
                <Plate face={id ? C.card : '#0B3A96'} top={id ? C.cardTop : '#2F63C8'} lip={id ? C.cardDark : '#041A4E'} radius={R.card} inner={{ minHeight: mk(180) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
                  {id ? <EmoteSticker id={id} size={mk(130)} play={false} /> : <OutlinedText size={mk(50)} width={mk(3)} color={C.textMuted}>+</OutlinedText>}
                </Plate>
              </Pressable>
            ))}
          </View>
        </Plate>
      </View>
      <SectionHeader icon={<IcFace />} title={t('ui2.allEmotes')} subtitle={t('ui2.allEmotesSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {all.map((e) => {
          const on = equipped.includes(e.id);
          return (
            <Pressable key={e.id} onPress={() => toggle(e.id)} style={{ width: PW_W }}>
              <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={on ? C.gold : C.navy} radius={R.card} inner={{ minHeight: mk(340) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(10), paddingHorizontal: mk(6) }}>
                <View style={{ height: mk(150), alignItems: 'center', justifyContent: 'center' }}><EmoteSticker id={e.id} size={mk(140)} play={false} /></View>
                <View style={{ flex: 1 }} />
                <OutlinedText size={mk(24)} width={mk(2)} numberOfLines={1} fit>{up((e.premium?.name ?? (e.phraseKey ? t(e.phraseKey as MessageKey) : e.id)))}</OutlinedText>
                <View style={{ width: '100%', marginTop: mk(8), marginBottom: mk(10) }}><ChunkyButton kind={on ? 'blue' : 'green'} label={on ? up(t('collection.remove')) : t('store.spEquip')} height={mk(60)} size={mk(24)} onPress={() => toggle(e.id)} /></View>
              </Plate>
              {on ? <View style={{ position: 'absolute', top: -mk(6), right: -mk(4), width: mk(40), height: mk(40), borderRadius: mk(20), backgroundColor: C.green, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(20)} width={1}>✓</OutlinedText></View> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
