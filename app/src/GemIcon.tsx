import Svg, { Ellipse, Path, Polygon, G } from 'react-native-svg';
import { theme } from './theme';

interface Props {
  size?: number;
  /** Override colour (ignored — always uses the premium purple palette) */
  color?: string;
  /** Yere oturan temas gölgesi — mağaza/paket gibi büyük yerlerde açılır. */
  grounded?: boolean;
}

// ---- Değer merdiveni (6 ton + spekül) -------------------------------------
// Oyun ikonlarında hacim DEGRADEYLE değil, faset başına TEK DÜZ TONLA kurulur.
// Eski ikon 1.814 ayrı renk içeriyordu ve en yoğun 8 renk alanın yalnız %19'unu
// kaplıyordu (yani %81'i degrade gürültüsü) — "yapay zekâ çizmiş" hissinin
// ölçülebilir kaynağı buydu. Bu merdiven ölçülerek seçildi: gölgelerde sık,
// üstte geniş adımlar; V4 uygulamanın kimlik moru (theme.gem) ve en geniş alan.
const V1 = '#35124F'; // en koyu — flaşın hemen yanında durur, taşı "kesme taş" yapan zıtlık
const V2 = '#5A1F92';
const V3 = '#7B34BE';
const V4 = '#A855F7'; // = theme.gem (kimlik tonu)
const V5 = '#C98BFF';
const V6 = '#EFDDFF'; // tabla
const INK = '#2A0B45'; // kontur: siyah DEĞİL, taşın kendi renginin en koyusu
const BELT = '#3E1568'; // kuşak (girdle) çizgisi

// Silüet: tabla → taç → kuşak → pavyon → küle. Altıgen prizma DEĞİL — 12 pikselde
// bile "taş" okunmasını sağlayan şey bu üç parçalı siluet.
const SILHOUETTE = 'M26,4 L38,4 L44,8 L52,14 L56,24 L32,50 L8,24 L12,14 L20,8 Z';

// Faset başına tek düz ton. Kendi rengiyle 0.4 kontur: komşu poligonlar arasında
// kesirli ölçeklerde beliren 1px açık dikişleri kapatır.
const FACETS: { p: string; f: string }[] = [
  // TABLA
  { p: '26,4 38,4 44,8 40,13 24,13 20,8', f: V6 },
  // TAÇ (ışık sol üstten)
  { p: '20,8 24,13 17,26.5 8,24 12,14', f: V5 },
  { p: '24,13 26,28 17,26.5', f: V3 },
  { p: '24,13 32,13 32,28.5 26,28', f: V5 },
  { p: '32,13 40,13 38,28 32,28.5', f: V4 },
  { p: '40,13 47,26.5 38,28', f: V2 },
  { p: '40,13 44,8 52,14 56,24 47,26.5', f: V3 },
  // PAVYON
  { p: '8,24 17,26.5 32,50', f: V4 },
  { p: '17,26.5 26,28 32,50', f: V2 },
  { p: '26,28 32,28.5 30.8,40 26.9,32', f: V5 }, // flaş gövdesi
  { p: '26,28 29.2,30.6 26.9,32', f: V6 },       // flaş tepesi — pavyondaki tek beyaza yakın ton
  { p: '26.9,32 30.8,40 32,50', f: V3 },
  { p: '32,28.5 38,28 32,50', f: V1 },           // en koyu, flaşın YANINDA — taşı satan zıtlık
  { p: '38,28 47,26.5 32,50', f: V2 },
  { p: '47,26.5 56,24 32,50', f: V3 },
];

/**
 * Oyun-içi para birimi ikonu — düz fasetli pırlanta kesimi.
 * Kaynak: parlak taş ikonu anatomisi (tabla/taç/kuşak/pavyon/küle), altı tonlu
 * değer merdiveni, hue ailesinden koyu kontur, TEK sol-üst ışık. Degrade yok.
 *
 * Usage:  <GemIcon size={18} />  ·  <GemIcon size={44} grounded />
 */
export function GemIcon({ size = 24, grounded = false }: Props) {
  // Küçük boyutlarda (hap/sayaç) ikincil sivilce ve temas gölgesi düşer, kontur
  // biraz kalınlaşır — yoksa 18px'te kenar kaybolur.
  const small = size < 32;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <G>
        {grounded && !small ? (
          <Ellipse cx={32} cy={52.5} rx={10} ry={2.6} fill={theme.shadowInk} opacity={0.42} />
        ) : null}
        {/* Kontur ALTTA: fasetler arası kenar yumuşaması arka plana değil, koyuya düşer */}
        <Path d={SILHOUETTE} fill={INK} stroke={INK} strokeWidth={small ? 3.5 : 3} strokeLinejoin="round" />
        {FACETS.map((f) => (
          <Polygon key={f.p} points={f.p} fill={f.f} stroke={f.f} strokeWidth={0.4} />
        ))}
        {/* Ana spekül: tabla üstünde eğik ince paralelkenar — ışık tarafına kaydırılmış,
            ortada duran bulanık leke DEĞİL (o "plastik" hissinin kaynağı). */}
        <Polygon points="23.8,7.2 29.4,7.2 26.6,10.8 21.4,10.8" fill="#FFFFFF" opacity={0.92} />
        {!small ? (
          <Polygon points="15.8,14.6 18.6,12.6 17.2,21.4 14.9,20.2" fill="#FFFFFF" opacity={0.3} />
        ) : null}
        {/* Kuşak çizgisi — tek çizgi, "kesme taş" hissini anında verir */}
        <Path d="M8,24 L17,26.5 L26,28 L32,28.5 L38,28 L47,26.5 L56,24" stroke={BELT} strokeWidth={0.9} opacity={0.55} fill="none" />
        {/* Arka kenar ışığı: YALNIZ ışığın karşı tarafında (sağ üst). Tam tur
            parlama amatör izidir. */}
        <Path d="M38,4 L44,8 L52,14 L56,24" stroke="#E6CCFF" strokeWidth={1.1} strokeLinecap="round" opacity={0.55} fill="none" />
      </G>
    </Svg>
  );
}

/** The accent colour for gem-related text, borders, etc. (canonical token: theme.gem) */
export const GEM_COLOR = theme.gem;
/** Değer merdiveni — başka para birimi ikonları (jeton vb.) aynı sistemi kullanmalı. */
export const GEM_TONES = { V1, V2, V3, V4, V5, V6, INK, BELT } as const;
