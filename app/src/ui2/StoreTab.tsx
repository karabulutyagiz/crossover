// UI2 — MAĞAZA sekmesi. Mock: refs/store-top.png + refs/store-bottom.png (941 px, mk()).
// Görünüm birebir mock; ürünler/fiyatlar GERÇEK (products.ts + StoreKit displayPrice + sunucu kataloğu).
import { useEffect, useMemo } from 'react';
import { Image, Pressable, Text, View, type DimensionValue, type ImageSourcePropType } from 'react-native';
import { t } from '../i18n';
import type { Actions, GameState } from './types';
import { IcCrown, IcLock, IcNoAds } from './icons';
import { IcBolt, IcFace, IcGems3, IcNavStore, IcStar } from './icons-ui';
import { S, up } from './strings';
import type { StoreCatalogItem } from '../protocol';
import { EmoteSticker, PREMIUM_EMOTES } from '../emotes';
import { CosmeticPreview } from '../screens';
import { UI2 } from './assets';
import { Bar, BannerImage, ChunkyButton, GemAmount, OutlinedText, Plate, Ribbon, SectionHeader, Sticker, fitSize, fmt } from './primitives';
import { Hud } from './Shell';
import { ACCOUNT_POWERS, DIAMOND_PACKS, PREMIUM_ROAD_PRICE, SOCIAL_PACK } from './products';
import type { useStorePurchases } from './useStorePurchases';
import { C, F, GAP, LIP, OUTLINE, R, SIDE, mk } from './tokens';

type Store = ReturnType<typeof useStorePurchases>;
export type StoreTabProps = {
  state: GameState; actions: Actions; store: Store;
  onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void;
  onConfirm: (d: { title: string; body: string; price?: number; onYes: () => void }) => void;
};

const INNER_W = 430 - SIDE * 2 - OUTLINE * 2 - mk(14) * 2; // Section plakasının iç genişliği
const COL_W = Math.floor((INNER_W - GAP * 3) / 4);   // 4 sütun (elmas/güç/ifade)
const COL3_W = Math.floor((INNER_W - GAP * 2) / 3);  // 3 sütun (kozmetik)

export function StoreTab({ state, actions, store, onOpenSettings, onOpenProfile, onOpenArenas, onConfirm }: StoreTabProps) {
  const p = state.profile;
  const catalog = state.storeCatalog;
  useEffect(() => { if (!catalog) actions.loadStoreCatalog(); }, [catalog, actions]);
  const cosmetics = useMemo(() => (catalog?.items ?? []).filter((i) => i.type === 'match_background'), [catalog]);
  const frames = useMemo(() => (catalog?.items ?? []).filter((i) => i.type === 'frame'), [catalog]);
  const owned = new Set(p?.ownedCosmetics ?? []);
  const diamonds = p?.diamonds ?? 0;
  const gemBuy = (title: string, price: number, onYes: () => void) => onConfirm({ title, body: `${fmt(price)} elmas karşılığında satın alınsın mı?`, price, onYes });

  return (
    <View style={{ flex: 1 }}>
      <Hud title={S.store} titleIcon={<IcNavStore />}
        data={{ name: p?.displayName ?? '', avatarId: p?.avatar ?? null, frameId: p?.selectedFrame ?? null, level: p?.level ?? 1, xp: p?.xp ?? 0, xpNext: (p as any)?.xpForNext ?? 1000, trophies: p?.trophies ?? 0, diamonds }}
        actions={{ onAvatar: onOpenProfile, onSettings: onOpenSettings, onTrophies: onOpenArenas }} />

      {/* ── SOSYAL PAKET banner'ı: sanat mock'tan (metinsiz arka plan), TÜM metin canlı (21 dil) ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(6) }}>
        <BannerImage source={UI2.banner_socialpack} ratio={886 / 348}>
          <Ribbon label={t('ui2.specialOffer')} color={C.red} size={mk(24)} style={{ position: 'absolute', left: -mk(4), top: -mk(4), borderTopLeftRadius: mk(22), borderTopRightRadius: 0, borderBottomLeftRadius: 0, paddingHorizontal: mk(22), paddingVertical: mk(6) }} />
          <View style={{ position: 'absolute', left: '5.5%', top: '12%', width: '57%', height: '19%', justifyContent: 'center' }}>
            <OutlinedText size={fitSize(mk(64), up(t('store.socialPackSection')), 13)} width={mk(4)} color={C.gold} align="left" numberOfLines={1} fit>{up(t('store.socialPackSection'))}</OutlinedText>
          </View>
          <BannerFeature top="35.5%" icon={<IcLock size={mk(44)} />} text={t('ui2.spFeat1')} />
          <BannerFeature top="53%" icon={<IcNoAds size={mk(44)} />} text={t('ui2.spFeat2')} />
          <Sticker left="79%" top="63%" width="24%" height="34%" rotate="-7deg" face={C.gold} border={C.navy}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.ink, fontFamily: F.black, fontSize: mk(20), lineHeight: mk(23), textAlign: 'center' }}>{t('ui2.spSticker')}</Text>
          </Sticker>
          {SOCIAL_PACK.map((sp, i) => (
            <View key={sp.id} style={{ position: 'absolute', left: `${i === 0 ? 2.8 : 32.6}%`, top: '67.5%', width: '27.4%', height: '25%' }}>
              <ChunkyButton kind="green" label={store.priceFor(sp.productId, sp.fallback)} sub={undefined} height={mk(86)} size={mk(30)} onPress={() => store.buy(sp.productId)} disabled={!!store.buying}
                style={{ flex: 1 }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: mk(4), left: 0, right: 0, alignItems: 'center' }}>
                <OutlinedText size={mk(20)} width={1.5} outline="#0E5A1C" numberOfLines={1} fit>{store.activeSubId === sp.productId ? t('store.badgeActive') : t(sp.labelKey)}</OutlinedText>
              </View>
            </View>
          ))}
        </BannerImage>
      </View>

      {/* ── CO PASS banner'ı: sanat mock'tan (bilet, taç, "CO PASS" markası), satır + çıkartma + fiyat canlı ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(22) }}>
        <BannerImage source={UI2.banner_copass} ratio={886 / 212}>
          <View style={{ position: 'absolute', left: '33%', top: '36%', width: '38%', height: '21%', justifyContent: 'center' }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: fitSize(mk(25), t('ui2.cpLine'), 22) }}>{t('ui2.cpLine')}</Text>
          </View>
          <View style={{ position: 'absolute', left: '31.2%', top: '57%', width: '33.5%', height: '34%' }}>
            <ChunkyButton kind="green" gem label={p?.premiumRoad ? t('store.badgeActive') : up(t('store.diamonds', { n: fmt(PREMIUM_ROAD_PRICE) }))} height={mk(74)} size={mk(28)} disabled={!!p?.premiumRoad}
              onPress={() => gemBuy('CO PASS', PREMIUM_ROAD_PRICE, () => actions.buyPremiumRoad())} style={{ flex: 1 }} />
          </View>
          <Sticker left="76%" top="52%" width="26%" height="44%" rotate="-5deg" face="#1E4FD6" border="#5FE0FF">
            <OutlinedText size={mk(22)} width={1.5} numberOfLines={2} fit style={{ lineHeight: mk(26) }}>{t('ui2.cpSticker')}</OutlinedText>
          </Sticker>
        </BannerImage>
      </View>

      {/* ── ELMASLAR ── */}
      <Section icon={<IcGems3 />} title={t('ui2.gemsTitle')} subtitle={t('ui2.gemsSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {DIAMOND_PACKS.map((pk) => (
            <ProductCard key={pk.id} width={COL_W} height={mk(250)} title={fmt(pk.amount)} subtitle={t('ui2.gem')} art={pk.art} artScale={pk.artW} ribbon={pk.ribbon ? { label: t(pk.ribbon.labelKey), color: pk.ribbon.color } : null}
              button={{ label: store.priceFor(pk.productId, pk.fallback), onPress: () => store.buy(pk.productId), disabled: !!store.buying }} />
          ))}
        </View>
      </Section>

      {/* ── GÜÇLER (hesap güçleri) ── */}
      <Section icon={<IcBolt />} title={up(t('collection.tabPowers'))} subtitle={t('ui2.powersSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {ACCOUNT_POWERS.map((pw) => (
            <ProductCard key={pw.id} width={COL_W} height={mk(250)} title={t(pw.titleKey)} art={UI2[pw.art]} face={pw.face} lip={pw.lip} top={pw.top} desc={t(pw.descKey)} small
              button={{ gem: true, label: String(pw.price), onPress: () => gemBuy(t(pw.titleKey), pw.price, () => actions.buyPower(pw.id)), disabled: diamonds < pw.price }} />
          ))}
        </View>
      </Section>

      {/* ── KOZMETİK (maç arka planları — sunucu kataloğu, satılabilir olanlar) ── */}
      <Section icon={<IcStar />} title={t('collection.tabCosmetics')} subtitle={t('ui2.cosmSub')}>
        {cosmetics.length === 0 ? <LoadingRow /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {cosmetics.map((item) => (
              <CosmeticCard key={item.id} item={item} width={COL3_W} owned={owned.has(item.id)} onBuy={() => gemBuy(item.name, item.diamondPrice, () => actions.buyCosmetic(item.id))} disabled={diamonds < item.diamondPrice} />
            ))}
          </View>
        )}
        {frames.length ? (
          <View style={{ flexDirection: 'row', gap: GAP, marginTop: GAP }}>
            {frames.map((item) => (
              <FrameCard key={item.id} item={item} owned={owned.has(item.id)} onBuy={() => gemBuy(item.name, item.diamondPrice, () => actions.buyCosmetic(item.id))} disabled={diamonds < item.diamondPrice} />
            ))}
          </View>
        ) : null}
      </Section>

      {/* ── İFADELER (premium emote'lar) ── */}
      <Section icon={<IcFace />} title={t('store.emotes')} subtitle={t('ui2.emotesSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {PREMIUM_EMOTES.filter((e) => e.premium).map((e) => {
            const own = (p?.ownedEmotes ?? []).includes(e.id);
            return (
              <ProductCard key={e.id} width={COL_W} height={mk(250)} title={e.premium!.name} art={(e as { still?: ImageSourcePropType }).still} artNode={(e as { still?: ImageSourcePropType }).still ? undefined : <EmoteSticker id={e.id} size={mk(120)} play={false} />} artScale={1.05} small
                button={own ? { label: S.owned, disabled: true } : { gem: true, label: String(e.premium!.price), onPress: () => gemBuy(e.premium!.name, e.premium!.price, () => actions.buyEmote(e.id)), disabled: diamonds < e.premium!.price }} />
            );
          })}
        </View>
      </Section>

      {/* ── SAHADA FARK YARAT banner'ı: sanat mock'tan (metinsiz), etiket + başlık + açıklama canlı; taç kartı vektör ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(26) }}>
        <BannerImage source={UI2.banner_cosm} ratio={884 / 234}>
          <Ribbon label={t('ui2.cosmTag')} color="#7C3AED" size={mk(22)} style={{ position: 'absolute', left: '2.5%', top: '4%', paddingHorizontal: mk(16) }} />
          <View style={{ position: 'absolute', left: '3%', top: '58%', width: '56%', height: '36%', justifyContent: 'center' }}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: mk(22), lineHeight: mk(26), textAlign: 'center' }}>{t('ui2.cosmDesc')}</Text>
          </View>
          <View style={{ position: 'absolute', left: '59.5%', top: '14%', width: mk(78), height: mk(78), transform: [{ rotate: '-12deg' }], backgroundColor: '#2F7BFF', borderRadius: mk(16), borderWidth: mk(4), borderColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: mk(6), right: mk(6), top: mk(4), height: mk(12), borderRadius: mk(6), backgroundColor: 'rgba(255,255,255,0.28)' }} />
            <IcCrown size={mk(50)} />
          </View>
          <CosmTitle />
        </BannerImage>
      </View>

      <Pressable onPress={() => { void store.restorePurchases(); }} disabled={store.restoring} style={{ alignSelf: 'center', marginTop: mk(30), padding: mk(10) }}>
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(24), textDecorationLine: 'underline' }}>{store.restoring ? t('ui2.restoring') : t('store.restore')}</Text>
      </Pressable>
    </View>
  );
}

// ── Yardımcı yüzeyler ────────────────────────────────────────────────────────────
// Banner üstü canlı özellik satırı (ikon + metin), mock'taki kilit/ADS satırları.
function BannerFeature({ top, icon, text }: { top: DimensionValue; icon: React.ReactNode; text: string }) {
  return (
    <View style={{ position: 'absolute', left: '6%', top, width: '57%', height: '15%', flexDirection: 'row', alignItems: 'center', gap: mk(12) }}>
      {icon}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: mk(24), flex: 1 }}>{text}</Text>
    </View>
  );
}
// "SAHADA FARK YARAT!" — iki renkli başlık; uzun dillerde punto düşer (taç kartına taşmaz).
function CosmTitle() {
  const a = t('ui2.cosmTitle1'); const b = t('ui2.cosmTitle2');
  const total = a.length + b.length + 1; const size = mk(56) * Math.min(1, 18 / total);
  return (
    <View style={{ position: 'absolute', left: '5.5%', top: '21%', width: '64%', height: '26%', flexDirection: 'row', alignItems: 'center', gap: mk(12) }}>
      <OutlinedText size={size} width={mk(4)} align="left" numberOfLines={1}>{a}</OutlinedText>
      <OutlinedText size={size} width={mk(4)} color={C.gold} align="left" numberOfLines={1}>{b}</OutlinedText>
    </View>
  );
}
function Section({ icon, title, subtitle, children }: { icon: ImageSourcePropType | React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={{ marginHorizontal: SIDE, marginTop: mk(26) }}>
      <Plate face={C.panel} top={C.panelTop} lip={C.panelDark} radius={R.plate} inner={{ paddingHorizontal: mk(14), paddingBottom: mk(16) }}>
        <SectionHeader icon={icon} title={title} subtitle={subtitle} />
        {children}
      </Plate>
    </View>
  );
}
function LoadingRow() {
  return <View style={{ height: mk(120), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: mk(24) }}>Yükleniyor…</Text></View>;
}
function ProductCard({ width, height, title, subtitle, art, artNode, artScale = 1, ribbon, desc, face = C.card, top = C.cardTop, lip = C.cardDark, button, small }: {
  width: number; height: number; title: string; subtitle?: string; art?: ImageSourcePropType; artNode?: React.ReactNode; artScale?: number; ribbon?: { label: string; color: 'red' | 'gold' } | null; desc?: string;
  face?: string; top?: string; lip?: string; button: { label: string; gem?: boolean; onPress?: () => void; disabled?: boolean }; small?: boolean;
}) {
  return (
    <View style={{ width }}>
      <Plate face={face} top={top} lip={lip} radius={R.card} inner={{ height: height - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(10), paddingHorizontal: mk(8) }}>
        <OutlinedText size={small ? mk(24) : mk(34)} width={mk(3)} numberOfLines={1} style={{ lineHeight: small ? mk(28) : mk(38) }}>{title}</OutlinedText>
        {subtitle ? <OutlinedText size={mk(19)} width={1.5} style={{ marginTop: -mk(6), lineHeight: mk(21) }}>{subtitle}</OutlinedText> : null}
        <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          {artNode ?? (art ? <Image source={art} style={{ width: `${86 * artScale}%`, height: '92%' }} resizeMode="contain" /> : null)}
          {ribbon ? <Ribbon label={ribbon.label} color={ribbon.color === 'red' ? C.red : C.gold} style={{ position: 'absolute', bottom: -mk(2), transform: [{ rotate: '-3deg' }] }} size={mk(13)} /> : null}
        </View>
        {desc ? <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: C.white, fontFamily: F.black, fontSize: mk(14), textAlign: 'center', lineHeight: mk(17), marginTop: mk(2) }}>{desc}</Text> : null}
        <View style={{ width: '100%', marginTop: mk(6), marginBottom: mk(8) }}>
          <ChunkyButton kind="green" gem={button.gem} label={button.label} height={mk(52)} size={mk(24)} onPress={button.onPress} disabled={button.disabled} />
        </View>
      </Plate>
    </View>
  );
}
function CosmeticCard({ item, width, owned, onBuy, disabled }: { item: StoreCatalogItem; width: number; owned: boolean; onBuy: () => void; disabled: boolean }) {
  return (
    <View style={{ width }}>
      <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={R.card} inner={{ height: mk(230) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(8), paddingHorizontal: mk(8) }}>
        <OutlinedText size={mk(28)} width={mk(3)} numberOfLines={2} style={{ lineHeight: mk(32) }}>{item.name.toLocaleUpperCase('tr')}</OutlinedText>
        <View style={{ width: '100%', height: mk(118), borderRadius: mk(12), overflow: 'hidden', marginTop: mk(4), borderWidth: mk(3), borderColor: C.navy, backgroundColor: '#061A45', alignItems: 'center', justifyContent: 'center' }}>
          <CosmeticPreview item={item} size={COL3_W - mk(30)} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ width: '100%', marginBottom: mk(12) }}>
          <ChunkyButton kind="green" gem={!owned} label={owned ? S.owned : String(item.diamondPrice)} height={mk(74)} size={mk(30)} onPress={onBuy} disabled={owned || disabled} />
        </View>
      </Plate>
    </View>
  );
}
function FrameCard({ item, owned, onBuy, disabled }: { item: StoreCatalogItem; owned: boolean; onBuy: () => void; disabled: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Plate face={C.card} top={C.cardTop} lip={C.cardDark} radius={R.card} inner={{ height: mk(150) - OUTLINE * 2 - LIP, flexDirection: 'row', alignItems: 'center', paddingHorizontal: mk(10), gap: mk(10) }}>
        <View style={{ width: mk(130), height: mk(130), alignItems: 'center', justifyContent: 'center' }}><CosmeticPreview item={item} size={mk(120)} /></View>
        <View style={{ flex: 1 }}>
          <OutlinedText size={mk(24)} width={mk(2)} align="left" numberOfLines={1}>{item.name.toLocaleUpperCase('tr')}</OutlinedText>
          <ChunkyButton kind="green" gem={!owned} label={owned ? S.owned : String(item.diamondPrice)} height={mk(66)} size={mk(28)} onPress={onBuy} disabled={owned || disabled} style={{ marginTop: mk(8) }} />
        </View>
      </Plate>
    </View>
  );
}
export { GemAmount, Bar };
