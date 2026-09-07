// UI2 — MAĞAZA sekmesi. Mock: refs/store-top.png + refs/store-bottom.png (941 px, mk()).
// Görünüm birebir mock; ürünler/fiyatlar GERÇEK (products.ts + StoreKit displayPrice + sunucu kataloğu).
import { useEffect, useMemo } from 'react';
import { Image, Pressable, Text, View, type DimensionValue, type ImageSourcePropType } from 'react-native';
import { t } from '../i18n';
import type { Actions, GameState } from './types';
import { IcCrown, IcLock, IcNoAds } from './icons';
import { IcBolt, IcCrownBig, IcFace, IcGems3, IcNavStore, IcStar } from './icons-ui';
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

      {/* ── SOSYAL PAKET banner'ı: kullanıcının yazısız/butonsuz sanatı (3:1) — etiket, başlık, satırlar, fiyat butonları, çıkartma CANLI ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(6) }}>
        <BannerImage source={UI2.banner_socialpack} ratio={3}>
          <Ribbon label={t('ui2.specialOffer')} color={C.red} size={mk(22)} style={{ position: 'absolute', left: -mk(4), top: -mk(4), borderTopLeftRadius: mk(22), borderTopRightRadius: 0, borderBottomLeftRadius: 0, paddingHorizontal: mk(20), paddingVertical: mk(5) }} />
          <View style={{ position: 'absolute', left: '4%', top: '15%', width: '45%', height: '26%', justifyContent: 'center' }}>
            <OutlinedText size={fitSize(mk(54), up(t('store.socialPackSection')), 12)} width={mk(4)} color={C.gold} align="left" numberOfLines={1} fit>{up(t('store.socialPackSection'))}</OutlinedText>
          </View>
          <BannerFeature top="43%" icon={<IcLock size={mk(38)} />} text={t('ui2.spFeat1')} />
          <BannerFeature top="59%" icon={<IcNoAds size={mk(38)} />} text={t('ui2.spFeat2')} />
          {SOCIAL_PACK.map((sp, i) => (
            <View key={sp.id} style={{ position: 'absolute', left: `${i === 0 ? 3 : 27}%`, top: '73%', width: '23%', height: '24%' }}>
              <ChunkyButton kind="green" label={store.priceFor(sp.productId, sp.fallback)} over={store.activeSubId === sp.productId ? t('store.badgeActive') : t(sp.labelKey)} height={mk(70)} size={mk(25)} onPress={() => store.buy(sp.productId)} disabled={!!store.buying} style={{ flex: 1 }} />
            </View>
          ))}
          <Sticker left="78%" top="63%" width="25%" height="33%" rotate="-7deg" face={C.gold} border={C.navy}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.ink, fontFamily: F.black, fontSize: mk(18), lineHeight: mk(21), textAlign: 'center' }}>{t('ui2.spSticker')}</Text>
          </Sticker>
        </BannerImage>
      </View>

      {/* ── CO PASS banner'ı: kullanıcının sanatı (bilet solda, kartlar/karakter sağda, 3:1) — taç+başlık, satır, elmas butonu, çıkartma CANLI ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(22) }}>
        <BannerImage source={UI2.banner_copass} ratio={3}>
          <View style={{ position: 'absolute', left: '23.5%', top: '7%', width: '30%', height: '31%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(6) }}>
            <IcCrownBig size={mk(46)} />
            <OutlinedText size={mk(50)} width={mk(4)} color={C.gold} numberOfLines={1} fit>CO PASS</OutlinedText>
          </View>
          <View style={{ position: 'absolute', left: '23.5%', top: '40%', width: '30%', height: '16%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(6) }}>
            <IcStar size={mk(22)} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: fitSize(mk(19), t('ui2.cpLine'), 22), flexShrink: 1 }}>{t('ui2.cpLine')}</Text>
          </View>
          <View style={{ position: 'absolute', left: '23.5%', top: '60%', width: '30%', height: '27%' }}>
            <ChunkyButton kind="green" gem label={p?.premiumRoad ? t('store.badgeActive') : up(t('store.diamonds', { n: fmt(PREMIUM_ROAD_PRICE) }))} height={mk(78)} size={mk(24)} disabled={!!p?.premiumRoad}
              onPress={() => gemBuy('CO PASS', PREMIUM_ROAD_PRICE, () => actions.buyPremiumRoad())} style={{ flex: 1 }} />
          </View>
          <Sticker left="75%" top="66%" width="27%" height="30%" rotate="-5deg" face="#1E4FD6" border="#5FE0FF">
            <OutlinedText size={mk(19)} width={1.5} numberOfLines={2} fit style={{ lineHeight: mk(22) }}>{t('ui2.cpSticker')}</OutlinedText>
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

      {/* ── SAHADA FARK YARAT banner'ı: kullanıcının sanatı (kartlar + top sağda), etiket/başlık/açıklama CANLI ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(26) }}>
        <BannerImage source={UI2.banner_cosm} ratio={2.5}>
          <Ribbon label={t('ui2.cosmTag')} color="#7C3AED" size={mk(22)} style={{ position: 'absolute', left: '3%', top: '5%', paddingHorizontal: mk(16) }} />
          <CosmTitle />
          <View style={{ position: 'absolute', left: '3.5%', top: '63%', width: '42%', height: '31%', justifyContent: 'center' }}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: mk(19), lineHeight: mk(23) }}>{t('ui2.cosmDesc')}</Text>
          </View>
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
// "SAHADA FARK YARAT!" — iki satır üst üste (beyaz / altın); uzun dillerde punto düşer, sol sütunu aşmaz.
function CosmTitle() {
  const a = t('ui2.cosmTitle1'); const b = t('ui2.cosmTitle2');
  const size = fitSize(mk(50), a.length >= b.length ? a : b, 11);
  return (
    <View style={{ position: 'absolute', left: '3.5%', top: '22%', width: '43%', height: '40%', justifyContent: 'center' }}>
      <OutlinedText size={size} width={mk(4)} align="left" numberOfLines={1}>{a}</OutlinedText>
      <OutlinedText size={size} width={mk(4)} color={C.gold} align="left" numberOfLines={1} style={{ marginTop: -mk(6) }}>{b}</OutlinedText>
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
          <ChunkyButton kind="green" gem={button.gem} label={button.label} height={mk(58)} size={mk(29)} onPress={button.onPress} disabled={button.disabled} />
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
          <ChunkyButton kind="green" gem={!owned} label={owned ? S.owned : String(item.diamondPrice)} height={mk(74)} size={mk(32)} onPress={onBuy} disabled={owned || disabled} />
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
          <ChunkyButton kind="green" gem={!owned} label={owned ? S.owned : String(item.diamondPrice)} height={mk(66)} size={mk(30)} onPress={onBuy} disabled={owned || disabled} style={{ marginTop: mk(8) }} />
        </View>
      </Plate>
    </View>
  );
}
export { GemAmount, Bar };
