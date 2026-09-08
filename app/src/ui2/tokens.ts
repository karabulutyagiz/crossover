// ═══════════════════════════════════════════════════════════════════════════
// UI2 — "sıfırdan" görsel dil (kullanıcı kararı 2026-09-07): referans mock'ların
// (docs/design/ui2/refs) BİREBİR karşılığı. Eski theme.ts/screens.tsx görünümünden
// hiçbir şey alınmaz; yalnız oyun mantığı (useCrossover, IAP, protokol) kullanılır.
//
// ÖLÇÜ SÖZLEŞMESİ: mock'lar 941 px genişliğinde; uygulama tuvali 430 pt (BASE_W).
// Her ölçü mock pikselinden `mk()` ile çevrilir — "göz kararı" değil, ölçüm.
// Ana ekran referansı 853 px → `mh()`.
// ═══════════════════════════════════════════════════════════════════════════
import { Dimensions } from 'react-native';

// GERÇEK EKRAN (2026-09-08, cihaz QA): tuval 430 pt sabit değil — telefonun genişliği (tablet 480 ile kapatılır).
// Böylece her ölçü telefona göre ölçeklenir; sağdan kesilme yok.
const win = Dimensions.get('window');
export const SW = Math.min(win.width, 480);
export const SH = win.height;
export const MOCK_W = 941;
export const HOME_MOCK_W = 853;
export const mk = (px: number): number => Math.round((px * SW) / MOCK_W * 2) / 2;
export const mh = (px: number): number => Math.round((px * SW) / HOME_MOCK_W * 2) / 2;
// YAZI: mock piksel oranı telefonda çok küçük kalıyor (24 px → 10 pt). Telefon tabanı: ×1.18, en az 10 pt.
export const FONT_SCALE = 1.26; // telefon: mock puntosu ×1.26 (kullanıcı 2026-09-08: 'isimler küçük/ince, biraz büyüt')
export const fz = (px: number): number => Math.max(Math.round(mk(px) * FONT_SCALE * 2) / 2, 12); // en küçük yazı 12 pt
// Dokunma hedefi tabanı (Apple HIG 44 pt; yoğun kartlarda 40)
export const MIN_TAP = 44;

// Renkler: mock'lardan örneklenip düz alanlarda doğrulandı; metin/kenar karışan
// örnekler görsel kalibrasyonla düzeltildi.
export const C = {
  bgA: '#0A46B4',        // zemin damalı — açık elmas
  bgB: '#0740A3',        // zemin damalı — koyu elmas
  navy: '#0B255F',       // dış kontur (her plaka/buton)
  navyDeep: '#061A45',   // gölge/kalın kontur
  panel: '#0F55CC',      // bölüm paneli yüzü
  panelDark: '#0A3D9F',  // panel alt dilim
  panelTop: '#3F8FFF',   // panel üst parlama
  panelInk: '#08307F',   // panel içi koyu satır (arkadaş satırı, buton koyu)
  card: '#1166F0',       // ürün kartı yüzü
  cardTop: '#4CA0FF',    // kart üst parlama
  cardDark: '#0B47B3',   // kart alt dilim
  cyan: '#12D8FF',       // XP çubuğu / vurgu
  cyanDark: '#0A9BC7',
  green: '#25D93C',      // fiyat / KATIL / DAVET ET
  greenDark: '#158F2A',
  greenLight: '#8CF59A',
  gold: '#FFD21A',       // HEMEN OYNA / sezon şeridi / nav aktif
  goldDark: '#E29B00',
  goldLight: '#FFF29A',
  purple: '#8E2BEA',     // güç kartı (2X XP) / banner
  purpleDark: '#4B0F9E',
  magenta: '#C22DFF',
  red: '#FF3352',        // rozet / bildirim
  redDark: '#B8122F',
  orange: '#FF7A1A',     // SERİ kartı
  orangeDark: '#C24E00',
  ice: '#4FD3FF',        // DONDURUCU kartı
  iceDark: '#1B8FC9',
  blue: '#1E7BFF',       // KALKAN kartı / İZLE butonu
  blueDark: '#0E4FB8',
  gray: '#8A97B8',       // çevrimdışı "Davet Et"
  grayDark: '#5A6784',
  white: '#FFFFFF',
  text: '#FFFFFF',
  textSub: '#BFE3FF',    // alt başlık / açıklama
  textMuted: '#8FB6E8',
  ink: '#0B255F',
  navBar: '#052A73',     // alt nav zemini
  navTile: '#0E4DBE',    // pasif sekme plakası
  navTileTop: '#3E8BFF',
  navActive: '#2C8DFF',  // aktif sekme yüzü
} as const;

export const F = {
  title: 'LilitaOne-Regular', // mock'taki tombul oyun yazısı (başlıklar, CTA, fiyat)
  black: 'Poppins-Black',
  bold: 'Poppins-ExtraBold',
  semi: 'Poppins-ExtraBold', // ince görünüyordu → küçük açıklama metinleri de kalın (Poppins-Bold yüklü değil)
} as const;

export const R = { plate: mk(28), card: mk(24), button: mk(22), pill: mk(40), tile: mk(20) } as const;
export const OUTLINE = mk(6);       // dış kontur kalınlığı (≈2.7 pt)
export const LIP = mk(12);          // alt dilim yüksekliği (≈5.5 pt)
export const GAP = mk(22);          // kartlar arası boşluk
export const SIDE = mk(28);         // ekran yan boşluğu
