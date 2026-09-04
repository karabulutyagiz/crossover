// ══════════════════════════════════════════════════════════════════════════
// COF COMPONENT GALLERY — Adım 03 (2026-09-03)
// YALNIZ GELİŞTİRME. Üretim navigasyonuna, menüye veya herhangi bir route'a
// BAĞLI DEĞİLDİR: App.tsx'teki COF_GALLERY_MODE bayrağı (varsayılan false) ile
// açılır — projenin mevcut DEV_SHOT_MODE kalıbının aynısı.
// Galeri, ekranların kullandığı GERÇEK bileşenleri çizer; statik HTML benzetimi
// ya da sahte ekran görüntüsü üretmez.
// ══════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { cof } from './theme';
import { formatNumber } from './format';
import {
  CofBadge, CofButton, CofIconButton, CofInput, CofNumber, CofSectionHeader, CofSegmentedTabs, CofSurface, CofText,
} from './primitives';
import { BUTTON_HEIGHT, MIN_TOUCH, type CofBadgeVariant, type CofButtonVariant, type CofSurfaceVariantName } from './policy';

const C = cof.color;
const S = cof.spacing;

const BUTTON_VARIANTS: CofButtonVariant[] = ['primary', 'secondary', 'reward', 'ghost', 'danger'];
const SURFACES: CofSurfaceVariantName[] = ['base', 'interactive', 'selected', 'reward', 'premium', 'disabled'];
const BADGES: CofBadgeVariant[] = ['quantity', 'notification', 'new', 'owned', 'active', 'rarity', 'premium', 'info', 'error', 'streak', 'reward', 'success', 'warning'];

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S[2] }}>{children}</View>;
}

export type CofGallerySection = 'all' | 'buttons' | 'cards' | 'badges' | 'inputs';

export function CofGallery({ section = 'all' }: { section?: CofGallerySection } = {}) {
  const show = (k: Exclude<CofGallerySection, 'all'>) => section === 'all' || section === k;
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [text, setText] = useState('');
  const [filled] = useState('7K2M9Q');
  const [counter, setCounter] = useState(135480);
  return (
    <SafeAreaProvider>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background.canvas }}
        contentContainerStyle={{ padding: S.screenHorizontal, gap: S.sectionGap, paddingBottom: S[12] }}
      >
        <CofText variant="screenTitle">COF BİLEŞEN GALERİSİ</CofText>

        {/* 1) Beş buton varyantı × dört durum */}
        {show('buttons') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Butonlar — varyant × durum" icon="flash" />
          {BUTTON_VARIANTS.map((v) => (
            <View key={v} style={{ gap: S[2] }}>
              <CofText variant="caption" tone="tertiary">{v}</CofText>
              <CofButton variant={v} label="Normal" onPress={() => {}} />
              <CofButton variant={v} label="Yükleniyor" onPress={() => {}} loading />
              <CofButton variant={v} label="Devre dışı" onPress={() => {}} disabled />
              <CofButton variant={v} label="Kilitli" onPress={() => {}} locked />
            </View>
          ))}
          <CofText variant="caption" tone="tertiary">basılı durum: dokununca 0,97 ölçek + koyu yüz</CofText>
        </View> : null}

        {/* 2) Uzun Türkçe etiketler */}
        {show('buttons') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Uzun Türkçe etiketler" icon="text" />
          <CofButton label="Reklam İzle, Kupan Geri Gelsin" onPress={() => {}} />
          <CofText variant="caption" tone="tertiary">↑ ana CTA: küçültme YOK, tek satır (sığmazsa geliştirme uyarısı)</CofText>
          <CofButton variant="secondary" label="Reklam İzle, Kupan Geri Gelsin" onPress={() => {}} />
          <CofText variant="caption" tone="tertiary">↑ ikincil: en fazla 0,90 ölçek</CofText>
          <CofButton variant="secondary" allowTwoLines label="Reklam İzle, Kupan Geri Gelsin" onPress={() => {}} />
          <CofText variant="caption" tone="tertiary">↑ allowTwoLines: iki satır, ölçekleme yok</CofText>
          <Row>
            <CofButton size="compact" fullWidth={false} label="Kompakt" onPress={() => {}} />
            <CofButton size="compact" fullWidth={false} variant="secondary" label="Kompakt yükleniyor" onPress={() => {}} loading />
          </Row>
        </View> : null}

        {/* 3) Altı kart varyantı */}
        {show('cards') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Kartlar" icon="albums" />
          {SURFACES.map((v) => (
            <CofSurface key={v} variant={v} onPress={v === 'interactive' || v === 'selected' ? () => {} : undefined} accessibilityLabel={v}>
              <CofText variant="cardTitle" tone={v === 'disabled' ? 'disabled' : 'primary'}>{v}</CofText>
              <CofText variant="body" tone={v === 'disabled' ? 'disabled' : 'secondary'}>
                {v === 'selected' ? 'seçim renkle DEĞİL, onay ikonu + SEÇİLİ etiketiyle' : v === 'disabled' ? 'okunur kalır, kilit ikonlu' : 'token yüzey katmanı'}
              </CofText>
            </CofSurface>
          ))}
        </View> : null}

        {/* 4) Segmented tabs */}
        {show('cards') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Segmented tabs" icon="apps" />
          <CofSegmentedTabs
            tabs={[
              { key: 'a', label: 'Dereceli', icon: 'trophy', badge: 3 },
              { key: 'b', label: 'Arkadaşlar', icon: 'people' },
              { key: 'c', label: 'Kilitli', disabled: true },
            ]}
            active={tab}
            onChange={setTab}
          />
          <CofSegmentedTabs
            tabs={[{ key: 'a', label: 'Tümü' }, { key: 'b', label: 'Sahip Olunanlar' }, { key: 'c', label: 'Yeni' }]}
            active={tab}
            onChange={setTab}
          />
          <CofText variant="caption" tone="tertiary">seçili: tint zemin + primary kenarlık + ikon; pasif: tıklanabilir; disabled: farklı yüzey + kilit</CofText>
        </View> : null}

        {/* 5) Bütün rozet türleri */}
        {show('badges') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Rozetler" icon="pricetag" />
          <Row>
            <CofBadge variant="quantity" count={12} />
            <CofBadge variant="quantity" count={135480} />
            <CofBadge variant="notification" count={7} />
            <CofBadge variant="notification" count={128} />
          </Row>
          <Row>
            {BADGES.filter((b) => b !== 'quantity' && b !== 'notification').map((b) => (
              <CofBadge key={b} variant={b} label={b.toUpperCase()} />
            ))}
          </Row>
        </View> : null}

        {/* 6) Beş input durumu */}
        {show('inputs') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Metin girişleri" icon="create" />
          <CofInput label="Default" value="" onChangeText={() => {}} placeholder="Arkadaş kodu" helperText="6 karakter" />
          <CofInput label="Filled" value={filled} onChangeText={() => {}} helperText="Geçerli kod" />
          <CofInput label="Error" value="7K2" onChangeText={() => {}} errorText="Kod 6 karakter olmalı" />
          <CofInput label="Disabled" value="7K2M9Q" onChangeText={() => {}} disabled helperText="Değiştirilemez" />
          <CofInput label="Yazarken (focus için dokun)" value={text} onChangeText={setText} placeholder="Kullanıcı adı" trailingIcon="close-circle" onTrailingIconPress={() => setText('')} trailingIconLabel="Temizle" helperText="Sağdaki ikon 44 dp hedefe sahiptir" />
        </View> : null}

        {/* 7) 44 dp ikon hedefleri */}
        {show('inputs') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="İkon hedefleri (≥ 44 dp)" icon="resize" />
          <Row>
            {(['chevron-back', 'close', 'copy', 'add', 'create'] as const).map((ic) => (
              <View key={ic} style={{ alignItems: 'center' }}>
                <View style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: cof.radius.control, borderWidth: cof.border.hairline, borderColor: C.stroke.subtle }}>
                  <CofIconButton icon={ic} onPress={() => {}} accessibilityLabel={ic} />
                </View>
                <CofText variant="caption" tone="tertiary">{ic}</CofText>
              </View>
            ))}
          </Row>
          <CofText variant="caption" tone="tertiary">çerçeve = 44 × 44 dp hedef; ikon çizimi 22 dp</CofText>
        </View> : null}

        {/* 8) CofNumber — değişen sayaç genişliği */}
        {show('badges') ? <View style={{ gap: S.cardGap }}>
          <CofSectionHeader label="Sayaç genişliği" icon="calculator" />
          <Row>
            <View style={{ gap: S[1] }}>
              <CofText variant="caption" tone="tertiary">orantılı (varsayılan)</CofText>
              <CofNumber value={counter} color={C.reward.gold} />
            </View>
            <View style={{ gap: S[1] }}>
              <CofText variant="caption" tone="tertiary">stableWidth (sabit hücre)</CofText>
              <CofNumber value={counter} stableWidth color={C.reward.gold} />
            </View>
          </Row>
          <Row>
            <CofButton size="compact" fullWidth={false} variant="secondary" label="111.111" onPress={() => setCounter(111111)} />
            <CofButton size="compact" fullWidth={false} variant="secondary" label="444.444" onPress={() => setCounter(444444)} />
            <CofButton size="compact" fullWidth={false} variant="secondary" label={formatNumber(135480)} onPress={() => setCounter(135480)} />
          </Row>
          <CofText variant="caption" tone="tertiary">paketteki Poppins'te tabular rakam YOK; sabit hücre bu yüzden var</CofText>
        </View> : null}

        <CofText variant="caption" tone="tertiary">
          buton yükseklikleri {BUTTON_HEIGHT.primary}/{BUTTON_HEIGHT.secondary}/{BUTTON_HEIGHT.compact} dp · minimum hedef {MIN_TOUCH} dp
        </CofText>
      </ScrollView>
    </SafeAreaProvider>
  );
}
