// UI2 — KOLEKSİYON sekmesi. Mock: refs/collection.png. Gerçek içerik: özel güç yuvaları/envanter,
// hesap güçleri, sahip olunan kozmetikler (sunucu kataloğu + seviye çerçeveleri), ifade yuvaları.
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native';
import { t, type MessageKey } from '../i18n';
import { CosmeticPreview, FrameArt, LEVEL_TIERS, SPECIAL_POWERS, ownsFrame, spInventoryCount } from '../screens';
import { EmoteSticker, FREE_EMOTES, PREMIUM_EMOTES } from '../emotes';
import type { StoreCatalogItem } from '../protocol';
import type { Actions, GameState } from './types';
import { UI2 } from './assets';
import { ChunkyButton, OutlinedText, Plate, SectionHeader } from './primitives';
import { Hud } from './Shell';
import { ACCOUNT_POWERS, type PowerId } from './products';
import { S, up } from './strings';
import { C, F, GAP, LIP, OUTLINE, R, SIDE, mk } from './tokens';

type SpId = 'freeze' | 'reveal' | 'skip' | 'extratime' | 'secondchance';
const SP_ART: Record<SpId, ImageSourcePropType> = { freeze: UI2.sp_freeze2, reveal: UI2.sp_goal, skip: UI2.sp_speed, extratime: UI2.ic_clock_live, secondchance: UI2.sp_social };
const SP_FACE: Record<SpId, [string, string, string]> = { freeze: ['#1BA7F0', '#8CE0FF', '#0E6CA8'], reveal: ['#E8B400', '#FFE98A', '#A67900'], skip: ['#8E2BEA', '#C58BFF', '#4B0F9E'], extratime: ['#22C55E', '#86EFAC', '#15803D'], secondchance: ['#FF4B7A', '#FFA6C0', '#B01E48'] };
const RARITY_N: Record<string, number> = { common: 2, rare: 3, epic: 4, legendary: 5, mythic: 5 };
const EMOTE_SLOTS = 8;
const INNER_W = 430 - SIDE * 2 - OUTLINE * 2 - mk(14) * 2;
const COL_W = Math.floor((INNER_W - GAP * 3) / 4);

export type CollectionTabProps = { state: GameState; actions: Actions; onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void; onOpenStore: () => void; onNotice: (title: string, body: string) => void };
type Sub = 'powers' | 'cosmetics' | 'emotes';

export function CollectionTab({ state, actions, onOpenSettings, onOpenProfile, onOpenArenas, onOpenStore, onNotice }: CollectionTabProps) {
  const p = state.profile;
  const [sub, setSub] = useState<Sub>('powers');
  const catalog = state.storeCatalog;
  useEffect(() => { if (!catalog) actions.loadStoreCatalog(); }, [catalog, actions]);
  const spEquipped = ((p?.equippedSpecialPowers ?? (p?.equippedSpecialPower ? [p.equippedSpecialPower] : [])) as SpId[]);
  return (
    <View style={{ flex: 1 }}>
      <Hud title={S.collection} titleIcon={UI2.title_collection}
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level: p?.level ?? 1, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies: p?.trophies ?? 0, diamonds: p?.diamonds ?? 0 }}
        actions={{ onAvatar: onOpenProfile, onSettings: onOpenSettings, onTrophies: onOpenArenas }} />
      {/* ── Alt sekmeler (mock: sol altın aktif, diğerleri mavi) ── */}
      <View style={{ flexDirection: 'row', marginHorizontal: SIDE, marginTop: mk(4), gap: mk(10) }}>
        {([['powers', up(t('collection.tabPowers'))], ['cosmetics', t('collection.tabCosmetics')], ['emotes', up(t('collection.tabEmotes'))]] as [Sub, string][]).map(([k, label]) => {
          const on = sub === k;
          return (
            <Pressable key={k} onPress={() => setSub(k)} style={{ flex: 1 }}>
              <Plate face={on ? C.gold : C.card} top={on ? C.goldLight : C.cardTop} lip={on ? C.goldDark : C.cardDark} radius={mk(20)} inner={{ height: mk(84) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
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
  const specials = Object.keys(SPECIAL_POWERS) as SpId[];
  const count = (id: SpId) => spInventoryCount(p, id);
  const accCount: Record<PowerId, number> = { xp2x: p?.powerXp2x ?? 0, shield: p?.powerShield ?? 0, streak: p?.powerStreak ?? 0, training: p?.powerTraining ?? 0 };
  return (
    <>
      <View style={{ marginHorizontal: SIDE, marginTop: mk(14) }}>
        <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={R.plate} inner={{ paddingHorizontal: mk(14), paddingBottom: mk(16) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', height: mk(84) }}>
            <OutlinedText size={mk(40)} width={mk(4)} align="left">{t('ui2.myPowerSet')}</OutlinedText>
            <View style={{ flex: 1 }} />
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(17), textAlign: 'right', flexShrink: 1 }}>{t('ui2.myPowerSetHint')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: GAP }}>
            {[0, 1, 2].map((i) => {
              const id = spEquipped[i];
              return id ? <PowerCard key={id} width={COL_W} name={t(SPECIAL_POWERS[id].nameKey)} art={SP_ART[id]} face={SP_FACE[id]} badge={RARITY_N[SPECIAL_POWERS[id].rarity]} line={t('ui2.count', { n: count(id) })} button={{ label: up(t('collection.remove')), kind: 'blue', on: () => actions.equipSpecialPower(id) }} />
                : <Plate key={i} face="#0B3A96" top="#2F63C8" lip="#041A4E" radius={R.card} style={{ width: COL_W }} inner={{ height: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(60)} width={mk(3)} color={C.textMuted}>+</OutlinedText><Text style={{ color: C.textMuted, fontFamily: F.bold, fontSize: mk(15) }}>Boş yuva</Text></Plate>;
            })}
            <View style={{ width: COL_W }} />
          </View>
        </Plate>
      </View>
      <SectionHeader icon={UI2.sec_power} title={t('ui2.allPowers')} subtitle={t('ui2.allPowersSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {specials.map((id) => {
          const n = count(id); const on = spEquipped.includes(id);
          return <PowerCard key={id} width={COL_W} name={t(SPECIAL_POWERS[id].nameKey)} art={SP_ART[id]} face={SP_FACE[id]} badge={RARITY_N[SPECIAL_POWERS[id].rarity]} line={t('ui2.count', { n })} dim={n === 0 && !on}
            button={n === 0 && !on ? { label: S.store, kind: 'gold', on: onOpenStore } : { label: on ? up(t('collection.remove')) : t('store.spEquip'), kind: on ? 'blue' : 'green', on: () => { if (!on && spEquipped.length >= 3) { onNotice(t('ui2.powerSetFull'), t('ui2.powerSetFullBody')); return; } actions.equipSpecialPower(id); } }} />;
        })}
        {ACCOUNT_POWERS.map((pw) => {
          const n = accCount[pw.id];
          return <PowerCard key={pw.id} width={COL_W} name={t(pw.titleKey)} art={UI2[pw.art]} face={[pw.face, pw.top, pw.lip]} badge={n} line={t('ui2.count', { n })} dim={n === 0}
            button={n === 0 ? { label: S.store, kind: 'gold', on: onOpenStore } : { label: up(t('collection.use')), kind: 'green', on: () => { actions.usePower(pw.id); onNotice(t(pw.titleKey), t('ui2.powerActivated')); } }} />;
        })}
      </View>
    </>
  );
}
function PowerCard({ width, name, art, face, badge, line, button, dim }: { width: number; name: string; art: ImageSourcePropType; face: [string, string, string]; badge: number; line: string; button: { label: string; kind: 'green' | 'blue' | 'gold'; on: () => void }; dim?: boolean }) {
  return (
    <View style={{ width, opacity: dim ? 0.72 : 1 }}>
      <Plate face={face[0]} top={face[1]} lip={face[2]} radius={R.card} inner={{ height: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(8), paddingHorizontal: mk(6) }}>
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}><Image source={art} style={{ width: '84%', height: '90%' }} resizeMode="contain" /></View>
        <OutlinedText size={mk(22)} width={mk(2)} numberOfLines={1}>{up(name)}</OutlinedText>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: mk(10), paddingHorizontal: mk(12), paddingVertical: mk(2), marginTop: mk(3) }}><Text style={{ color: C.white, fontFamily: F.black, fontSize: mk(15) }}>{line}</Text></View>
        <View style={{ width: '100%', marginTop: mk(6), marginBottom: mk(8) }}><ChunkyButton kind={button.kind} label={button.label} height={mk(46)} size={mk(20)} onPress={button.on} /></View>
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
  const COL3 = Math.floor((430 - SIDE * 2 - GAP * 2) / 3);
  return (
    <>
      <SectionHeader icon={UI2.frame_laurel} title={up(t('profile.frames'))} subtitle={t('ui2.framesSub')} style={{ marginHorizontal: SIDE, marginTop: mk(10) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {tierFrames.map((tier) => <FrameCard key={tier.key} width={COL3} name={t(tier.nameKey)} equipped={p?.selectedFrame === tier.key} onPress={() => actions.setFrame(p?.selectedFrame === tier.key ? null : tier.key)}><FrameArt tierKey={tier.key} size={mk(120)} /></FrameCard>)}
        {storeFrames.map((it) => <FrameCard key={it.id} width={COL3} name={it.name} equipped={p?.selectedFrame === it.id} onPress={() => actions.setFrame(p?.selectedFrame === it.id ? null : it.id)}><CosmeticPreview item={it} size={mk(120)} /></FrameCard>)}
        {tierFrames.length + storeFrames.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), padding: mk(10) }}>{t('ui2.noFrames')}</Text> : null}
      </View>
      <SectionHeader icon={UI2.sec_star} title={t('ui2.cosmetics')} subtitle={t('ui2.cosmeticsSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {items.map((it) => {
          const on = equippedOf(it.type) === it.id;
          return <FrameCard key={it.id} width={COL3} name={it.name} equipped={on} onPress={() => actions.equipCosmetic(it.type as any, on ? null : it.id)}><CosmeticPreview item={it} size={mk(120)} /></FrameCard>;
        })}
        {items.length === 0 ? <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(20), padding: mk(10) }}>{t('ui2.noCosmetics')}</Text> : null}
      </View>
    </>
  );
}
function FrameCard({ width, name, equipped, onPress, children }: { width: number; name: string; equipped: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <View style={{ width }}>
      <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={equipped ? C.gold : C.navy} radius={R.card} inner={{ height: mk(250) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(8), paddingHorizontal: mk(6) }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
        <OutlinedText size={mk(20)} width={mk(2)} numberOfLines={1}>{up(name)}</OutlinedText>
        <View style={{ width: '100%', marginTop: mk(6), marginBottom: mk(8) }}><ChunkyButton kind={equipped ? 'blue' : 'green'} label={equipped ? t('store.spEquipped') : t('store.spEquip')} height={mk(46)} size={mk(20)} onPress={onPress} /></View>
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
            <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: mk(17) }}>{`${equipped.length} / ${EMOTE_SLOTS}`}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {Array.from({ length: EMOTE_SLOTS }, (_, i) => equipped[i]).map((id, i) => (
              <Pressable key={i} onPress={() => id && toggle(id)} style={{ width: COL_W }}>
                <Plate face={id ? C.card : '#0B3A96'} top={id ? C.cardTop : '#2F63C8'} lip={id ? C.cardDark : '#041A4E'} radius={R.card} inner={{ height: mk(150) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center' }}>
                  {id ? <EmoteSticker id={id} size={mk(110)} play={false} /> : <OutlinedText size={mk(50)} width={mk(3)} color={C.textMuted}>+</OutlinedText>}
                </Plate>
              </Pressable>
            ))}
          </View>
        </Plate>
      </View>
      <SectionHeader icon={UI2.sec_emote} title={t('ui2.allEmotes')} subtitle={t('ui2.allEmotesSub')} style={{ marginHorizontal: SIDE, marginTop: mk(14) }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginHorizontal: SIDE }}>
        {all.map((e) => {
          const on = equipped.includes(e.id);
          return (
            <Pressable key={e.id} onPress={() => toggle(e.id)} style={{ width: COL_W }}>
              <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={on ? C.gold : C.navy} radius={R.card} inner={{ height: mk(200) - OUTLINE * 2 - LIP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: mk(6) }}>
                <EmoteSticker id={e.id} size={mk(110)} play={false} />
                <OutlinedText size={mk(18)} width={1.5} numberOfLines={1} style={{ marginTop: mk(4) }}>{up((e.premium?.name ?? (e.phraseKey ? t(e.phraseKey as MessageKey) : e.id)))}</OutlinedText>
              </Plate>
              {on ? <View style={{ position: 'absolute', top: -mk(6), right: -mk(4), width: mk(40), height: mk(40), borderRadius: mk(20), backgroundColor: C.green, borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}><OutlinedText size={mk(20)} width={1}>✓</OutlinedText></View> : null}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
