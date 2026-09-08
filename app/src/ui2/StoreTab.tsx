// UI2 — MAĞAZA sekmesi. Mock: refs/store-top.png + refs/store-bottom.png (941 px, mk()).
// Görünüm birebir mock; ürünler/fiyatlar GERÇEK (products.ts + StoreKit displayPrice + sunucu kataloğu).
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type DimensionValue, type ImageSourcePropType } from 'react-native';
import { t } from '../i18n';
import type { Actions, GameState } from './types';
import { IcCrown, IcLock, IcNoAds } from './icons';
import { IcBolt, IcClock, IcCrownBig, IcFace, IcGems3, IcNavStore, IcStar } from './icons-ui';
import { S, up } from './strings';
import type { StoreCatalogItem } from '../protocol';
import { EmoteSticker, PREMIUM_EMOTES } from '../emotes';
import { CosmeticArt, CosmeticPreview, SPECIAL_POWERS, SPECIAL_POWER_PRICE_FALLBACK } from '../screens';
import { UI2 } from './assets';
import { Bar, BannerImage, ChunkyButton, GemAmount, OutlinedText, Plate, Ribbon, SectionHeader, Sticker, fitSize, fmt } from './primitives';
import { Hud } from './Shell';
import { ACCOUNT_POWERS, DIAMOND_PACKS, PREMIUM_ROAD_PRICE, SOCIAL_PACK, SP_ART, SP_FACE, SP_LIST, SP_PACK } from './products';
import type { useStorePurchases } from './useStorePurchases';
import { C, F, fz, GAP, LIP, mk, OUTLINE, R, SIDE, SW } from './tokens';

type Store = ReturnType<typeof useStorePurchases>;
export type StoreTabProps = {
  state: GameState; actions: Actions; store: Store;
  onOpenSettings: () => void; onOpenProfile: () => void; onOpenArenas: () => void;
  onConfirm: (d: { title: string; body: string; price?: number; onYes: () => void }) => void;
};

const INNER_W = SW - SIDE * 2 - OUTLINE * 2 - mk(14) * 2; // Section plakasının iç genişliği
const COL_W = Math.floor((INNER_W - GAP * 3) / 4);   // 4 sütun (elmas/güç/ifade)
const COL3_W = Math.floor((INNER_W - GAP * 2) / 3);  // 3 sütun (elmas/kozmetik)

export function StoreTab({ state, actions, store, onOpenSettings, onOpenProfile, onOpenArenas, onConfirm }: StoreTabProps) {
  const p = state.profile;
  const catalog = state.storeCatalog;
  useEffect(() => { if (!catalog) actions.loadStoreCatalog(); }, [catalog, actions]);
  // HAFTALIK DÜKKÂN: yalnız sunucunun bu hafta öne çıkardığı ürünler (catalog.featured) — eski mağazayla aynı kural
  // (featured boşsa fiyatlı ilk 8). Katalogun tamamı burada SATILMAZ (kullanıcı kararı 2026-09-08).
  const featured = useMemo(() => {
    const items = catalog?.items ?? []; const byId = new Map(items.map((i) => [i.id, i]));
    const picked = (catalog?.featured ?? []).map((id) => byId.get(id)).filter((i): i is StoreCatalogItem => Boolean(i));
    return picked.length ? picked : items.filter((i) => i.diamondPrice > 0).slice(0, 8);
  }, [catalog]);
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
          <View style={{ position: 'absolute', left: '4%', top: '8%', width: '45%', height: '25%', justifyContent: 'center' }}>
            <OutlinedText size={fitSize(mk(54), up(t('store.socialPackSection')), 12)} width={mk(4)} color={C.gold} align="left" numberOfLines={1} fit>{up(t('store.socialPackSection'))}</OutlinedText>
          </View>
          <BannerFeature top="35%" icon={<IcLock size={mk(38)} />} text={t('ui2.spFeat1')} />
          <BannerFeature top="50%" icon={<IcNoAds size={mk(38)} />} text={t('ui2.spFeat2')} />
          {SOCIAL_PACK.map((sp, i) => (
            <View key={sp.id} style={{ position: 'absolute', left: `${i === 0 ? 3 : 33}%`, top: '68%', width: '29%', height: '30%' }}>
              <ChunkyButton kind="green" label={store.priceFor(sp.productId, sp.fallback)} over={store.activeSubId === sp.productId ? t('store.badgeActive') : t(sp.labelKey)} height={mk(92)} size={mk(30)} onPress={() => store.buy(sp.productId)} disabled={!!store.buying} style={{ flex: 1 }} />
            </View>
          ))}
          <Sticker left="78%" top="63%" width="25%" height="33%" rotate="-7deg" face={C.gold} border={C.navy}>
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.ink, fontFamily: F.black, fontSize: fz(18), lineHeight: fz(21), textAlign: 'center' }}>{t('ui2.spSticker')}</Text>
          </Sticker>
        </BannerImage>
      </View>

      {/* ── CO PASS banner'ı: kullanıcının sanatı (bilet solda, kartlar/karakter sağda, 3:1) — taç+başlık, satır, elmas butonu, çıkartma CANLI ── */}
      <View style={{ marginHorizontal: SIDE, marginTop: mk(22) }}>
        <BannerImage source={UI2.banner_copass} ratio={3}>
          <View style={{ position: 'absolute', left: '23.5%', top: '7%', width: '30%', height: '31%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(6) }}>
            <IcCrownBig size={mk(46)} />
            <View style={{ flex: 1 }}><OutlinedText size={mk(50)} width={mk(4)} color={C.gold} numberOfLines={1} fit>CO PASS</OutlinedText></View>
          </View>
          <View style={{ position: 'absolute', left: '23.5%', top: '40%', width: '30%', height: '16%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: mk(6) }}>
            <IcStar size={mk(22)} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: fitSize(mk(23), t('ui2.cpLine'), 22), flexShrink: 1 }}>{t('ui2.cpLine')}</Text>
          </View>
          <View style={{ position: 'absolute', left: '21%', top: '58%', width: '37%', height: '32%' }}>
            <ChunkyButton kind="green" gem label={p?.premiumRoad ? t('store.badgeActive') : up(t('store.diamonds', { n: fmt(PREMIUM_ROAD_PRICE) }))} height={mk(96)} size={mk(30)} disabled={!!p?.premiumRoad}
              onPress={() => gemBuy('CO PASS', PREMIUM_ROAD_PRICE, () => actions.buyPremiumRoad())} style={{ flex: 1 }} />
          </View>
          <Sticker left="75%" top="66%" width="27%" height="30%" rotate="-5deg" face="#1E4FD6" border="#5FE0FF">
            <OutlinedText size={mk(19)} width={1.5} numberOfLines={2} fit style={{ lineHeight: fz(22) }}>{t('ui2.cpSticker')}</OutlinedText>
          </Sticker>
        </BannerImage>
      </View>

      {/* ── ELMASLAR ── */}
      <Section icon={<IcGems3 />} title={t('ui2.gemsTitle')} subtitle={t('ui2.gemsSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {DIAMOND_PACKS.map((pk) => (
            <ProductCard key={pk.id} width={COL3_W} height={mk(330)} artH={mk(140)} title={fmt(pk.amount)} subtitle={t('ui2.gem')} art={pk.art} artScale={pk.artW} ribbon={pk.ribbon ? { label: t(pk.ribbon.labelKey), color: pk.ribbon.color } : null}
              button={{ label: store.priceFor(pk.productId, pk.fallback), onPress: () => store.buy(pk.productId), disabled: !!store.buying }} />
          ))}
        </View>
      </Section>

      {/* ── MAÇ GÜÇLERİ (maç içi Özel Güçler; fiyat store_catalog.specialPowers, yoksa yedek; 1 alım = 3'lü paket) ── */}
      <Section icon={<IcBolt />} title={t('store.specialPowers')} subtitle={t('ui2.matchPowersSub')}>
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(17), lineHeight: fz(21), marginTop: -mk(6), marginBottom: mk(10), paddingHorizontal: mk(4) }}>{t('store.spDisclosure')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {SP_LIST.map((id) => {
            const meta = SPECIAL_POWERS[id]; const price = catalog?.specialPowers?.find((x) => x.id === id)?.price ?? SPECIAL_POWER_PRICE_FALLBACK[id];
            return (
              <ProductCard key={id} width={COL3_W} height={mk(370)} artH={mk(140)} title={t(meta.nameKey)} art={SP_ART[id]} face={SP_FACE[id][0]} top={SP_FACE[id][1]} lip={SP_FACE[id][2]} desc={t(meta.descKey)} small
                ribbon={{ label: `×${SP_PACK}`, color: 'gold' }}
                button={{ gem: true, label: String(price), onPress: () => gemBuy(`${t(meta.nameKey)} ×${SP_PACK}`, price, () => actions.buySpecialPower(id)), disabled: diamonds < price }} />
            );
          })}
        </View>
      </Section>

      {/* ── GÜÇLER (hesap güçleri: 2X XP, Kupa Kalkanı, Seri Koruma) ── */}
      <Section icon={<IcBolt />} title={up(t('collection.tabPowers'))} subtitle={t('ui2.powersSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {ACCOUNT_POWERS.map((pw) => (
            <ProductCard key={pw.id} width={COL3_W} height={mk(370)} artH={mk(140)} title={t(pw.titleKey)} art={UI2[pw.art]} face={pw.face} lip={pw.lip} top={pw.top} desc={t(pw.descKey)} small
              button={{ gem: true, label: String(pw.price), onPress: () => gemBuy(t(pw.titleKey), pw.price, () => actions.buyPower(pw.id)), disabled: diamonds < pw.price }} />
          ))}
        </View>
      </Section>

      {/* ── HAFTALIK DÜKKÂN: yalnız bu haftanın süreli ürünleri (featured) + geri sayım; KASA ürünü altın çerçeveli ── */}
      <Section icon={<IcStar />} title={t('ui2.weeklyShop')} subtitle={t('ui2.weeklyShopSub')}>
        <WeeklyCountdown until={catalog?.weeklyResetAt} />
        {!catalog ? <LoadingRow /> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
            {featured.map((item) => (
              <CosmeticCard key={item.id} item={item} width={COL3_W} owned={owned.has(item.id)} vault={item.id === catalog?.vaultItemId} onBuy={() => gemBuy(item.name, item.diamondPrice, () => actions.buyCosmetic(item.id))} disabled={diamonds < item.diamondPrice} />
            ))}
          </View>
        )}
      </Section>

      {/* ── İFADELER (premium emote'lar) ── */}
      <Section icon={<IcFace />} title={t('store.emotes')} subtitle={t('ui2.emotesSub')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {PREMIUM_EMOTES.filter((e) => e.premium).map((e) => {
            const own = (p?.ownedEmotes ?? []).includes(e.id);
            return (
              <ProductCard key={e.id} width={COL_W} height={mk(270)} artH={mk(120)} title={e.premium!.name} art={(e as { still?: ImageSourcePropType }).still} artNode={(e as { still?: ImageSourcePropType }).still ? undefined : <EmoteSticker id={e.id} size={mk(116)} play={false} />} artScale={1.05} small
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
            <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: fz(19), lineHeight: fz(23) }}>{t('ui2.cosmDesc')}</Text>
          </View>
        </BannerImage>
      </View>

      <Pressable onPress={() => { void store.restorePurchases(); }} disabled={store.restoring} style={{ alignSelf: 'center', marginTop: mk(30), padding: mk(10) }}>
        <Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(24), textDecorationLine: 'underline' }}>{store.restoring ? t('ui2.restoring') : t('store.restore')}</Text>
      </Pressable>
    </View>
  );
}

// ── Yardımcı yüzeyler ────────────────────────────────────────────────────────────
// Banner üstü canlı özellik satırı (ikon + metin), mock'taki kilit/ADS satırları.
function BannerFeature({ top, icon, text }: { top: DimensionValue; icon: React.ReactNode; text: string }) {
  return (
    <View style={{ position: 'absolute', left: '6%', top, width: '46%', height: '15%', flexDirection: 'row', alignItems: 'center', gap: mk(10) }}>
      {icon}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: C.white, fontFamily: F.black, fontSize: fz(24), flex: 1 }}>{text}</Text>
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
  return <View style={{ height: mk(120), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.textSub, fontFamily: F.semi, fontSize: fz(24) }}>Yükleniyor…</Text></View>;
}
// Ürün kartı — NATİVE KURAL: Image'a yüzde yükseklik verme (içerik boyutlu kutuda sıfırlanır/doğal boyut alır); sanat kutusu ve resim piksel boyutlu.
// Bir ızgaradaki kartlar aynı yükseklikte olsun diye başlık 1 satır (fit), açıklama sabit 2 satırlık kutu, buton sabit.
function ProductCard({ width, height, artH, title, subtitle, art, artNode, artScale = 1, ribbon, desc, face = C.card, top = C.cardTop, lip = C.cardDark, button, small }: {
  width: number; height: number; artH: number; title: string; subtitle?: string; art?: ImageSourcePropType; artNode?: React.ReactNode; artScale?: number; ribbon?: { label: string; color: 'red' | 'gold' } | null; desc?: string;
  face?: string; top?: string; lip?: string; button: { label: string; gem?: boolean; onPress?: () => void; disabled?: boolean }; small?: boolean;
}) {
  const artW = Math.round((width - mk(16)) * 0.9 * artScale);
  return (
    <View style={{ width }}>
      <Plate face={face} top={top} lip={lip} radius={R.card} inner={{ minHeight: height - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(10), paddingHorizontal: mk(8) }}>
        <OutlinedText size={small ? mk(24) : mk(34)} width={mk(3)} numberOfLines={1} fit style={{ lineHeight: fz(small ? 28 : 38) }}>{title}</OutlinedText>
        {subtitle ? <OutlinedText size={mk(19)} width={1.5} style={{ marginTop: -mk(4), lineHeight: fz(22) }}>{subtitle}</OutlinedText> : null}
        <View style={{ flex: 1 }} />
        <View style={{ height: artH, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
          {artNode ?? (art ? <Image source={art} style={{ width: artW, height: artH }} resizeMode="contain" /> : null)}
          {ribbon ? <Ribbon label={ribbon.label} color={ribbon.color === 'red' ? C.red : C.gold} style={{ position: 'absolute', bottom: -mk(6), transform: [{ rotate: '-3deg' }] }} size={mk(15)} /> : null}
        </View>
        <View style={{ flex: 1 }} />
        {desc ? <View style={{ height: fz(19) * 2 + mk(4), justifyContent: 'center' }}><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: C.white, fontFamily: F.black, fontSize: fz(16), textAlign: 'center', lineHeight: fz(19) }}>{desc}</Text></View> : null}
        <View style={{ width: '100%', marginTop: mk(6), marginBottom: mk(10) }}>
          <ChunkyButton kind="green" gem={button.gem} label={button.label} height={mk(80)} size={mk(34)} onPress={button.onPress} disabled={button.disabled} />
        </View>
      </Plate>
    </View>
  );
}
function CosmeticCard({ item, width, owned, vault, onBuy, disabled }: { item: StoreCatalogItem; width: number; owned: boolean; vault?: boolean; onBuy: () => void; disabled: boolean }) {
  return (
    <View style={{ width }}>
      <Plate face={C.card} top={C.cardTop} lip={C.cardDark} outline={vault ? C.gold : C.navy} radius={R.card} inner={{ minHeight: mk(340) - OUTLINE * 2 - LIP, alignItems: 'center', paddingTop: mk(6), paddingHorizontal: mk(8) }}>
        <View style={{ height: fz(30) * 2, justifyContent: 'center' }}><OutlinedText size={mk(26)} width={mk(3)} numberOfLines={2} fit style={{ lineHeight: fz(30) }}>{item.name.toLocaleUpperCase('tr')}</OutlinedText></View>
        <View style={{ width: '100%', height: mk(124), borderRadius: mk(12), overflow: 'hidden', marginTop: mk(2), borderWidth: mk(3), borderColor: C.navy, backgroundColor: '#061A45', alignItems: 'center', justifyContent: 'center' }}>
          {/* çerçeve/top/arena kendi sanatını çizer; giriş-zafer-kutlama efektleri çıplak ikon → halkalı önizleme */}
          {item.type === 'frame' || item.type === 'ball' || item.type === 'match_background'
            ? <CosmeticArt id={item.id} type={item.type} size={cosmeticArtSize(item.type)} accent={vault ? C.gold : C.cyan} />
            : <CosmeticPreview item={item} size={mk(210)} />}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ width: '100%', marginBottom: mk(10) }}>
          <ChunkyButton kind="green" gem={!owned} label={owned ? S.owned : String(item.diamondPrice)} height={mk(80)} size={mk(34)} onPress={onBuy} disabled={owned || disabled} />
        </View>
      </Plate>
    </View>
  );
}
// CosmeticArt tür başına farklı oranda çiziyor (çerçeve %52, arena %78, top %66, isim %18) →
// kartlarda hepsi AYNI büyüklükte görünsün diye tür başına ölçek.
function cosmeticArtSize(type: string): number {
  if (type === 'frame') return mk(230);
  if (type === 'match_background') return mk(300);
  if (type === 'ball') return mk(340);
  if (type === 'name_effect') return mk(560);
  return mk(300);
}
// Haftalık dükkân geri sayımı: sunucu weeklyResetAt (yoksa gelecek Pazartesi 00:00 yerel), dakikada bir tazelenir.
function WeeklyCountdown({ until }: { until?: string | null }) {
  const target = useMemo(() => { const t0 = until ? new Date(until).getTime() : NaN; if (Number.isFinite(t0)) return t0; const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.getTime(); }, [until]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const ms = Math.max(0, target - now); const d = Math.floor(ms / 86_400_000); const h = Math.floor((ms % 86_400_000) / 3_600_000); const m = Math.max(1, Math.ceil((ms % 3_600_000) / 60_000));
  const txt = d > 0 ? t('ui2.dh', { d: String(d), h: String(h) }) : t('ui2.hm', { h: String(h), m: String(m) });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: mk(8), alignSelf: 'flex-start', backgroundColor: C.panelInk, borderRadius: mk(14), borderWidth: mk(3), borderColor: C.navy, paddingHorizontal: mk(12), paddingVertical: mk(5), marginTop: -mk(4), marginBottom: mk(12) }}>
      <IcClock size={mk(28)} />
      <Text style={{ color: C.white, fontFamily: F.black, fontSize: fz(17) }}>{t('ui2.resetsIn', { t: txt })}</Text>
      <View style={{ width: mk(3), height: mk(26), backgroundColor: C.navy, marginHorizontal: mk(4) }} />
      <Text style={{ color: C.textSub, fontFamily: F.bold, fontSize: fz(15) }}>{t('ui2.everySevenDays')}</Text>
    </View>
  );
}
export { GemAmount, Bar };
