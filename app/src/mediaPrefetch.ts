// İlk açılışta tüm kulüp armalarını CİHAZA indirir — arma ilk görüşte bile
// ağ beklemeden, diskten gelir. expo-image'ın kalıcı disk önbelleğini doldurur;
// CachedImage/ClubLogo zaten cachePolicy="memory-disk" ile aynı önbellekten okur.
//
// Tasarım notları:
// - Sürüm anahtarlı: offline data sürümü değişince (yeni export) yeniden koşar.
// - Kaldığı yerden devam eder: ilerleme AsyncStorage'a yazılır; uygulama kapanırsa
//   bir sonraki açılışta kalan URL'lerden sürer. Yazma HER partide değil 5 partide
//   bir yapılır — iOS'ta AsyncStorage tüm anahtarları tek manifest üzerinden
//   serileştirir; ~53 art arda yazma profil/scope yazmalarıyla sıraya giriyordu.
//   En kötü ihtimalle son 5 parti yeniden denenir (indirme idempotent).
// - Sessizce başarısız olur: tek tek indirme hataları toplamı bozmaz; ağ yoksa
//   bir sonraki açılışta yeniden dener. Oyunun açılışını ASLA bekletmez.
// - YAVAŞ ve kibar: başlamadan kısa bir rötar, dalgalar arasında nefes, maç
//   sırasında tam duraklatma — 420 armalık indirme login el sıkışması /
//   liderlik tablosu / maç round-trip'leriyle aynı radyoyu boğmasın (ilk
//   oturum yavaşlığının ölçülen kaynağıydı). Toplam süre ~15sn uzar; arka plan
//   ısıtması için önemsiz.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allClubLogoUrls } from './offline/db';

// offline/db.ts CURRENT_VERSION ile birlikte artmalı — data yenilenince
// armalar da tazelensin (URL değişmese bile içerik değişmiş olabilir).
const PREFETCH_KEY = 'media_prefetch_v3';
const BATCH = 8;
const START_DELAY_MS = 4000; // login el sıkışması + ilk fetch'ler radyoyu bırakmadan başlama
const BATCH_GAP_MS = 250; // dalgalar arası nefes — etkileşimli istekler araya girebilsin
const PERSIST_EVERY = 5; // ilerleme yazma sıklığı (parti sayısı)

let ExpoImage: any = null;
try {
  ExpoImage = require('expo-image').Image;
} catch {
  ExpoImage = null; // web stub / beklenmedik ortam — özellik sessizce kapanır
}

let started = false;

// Maç sırasında indirme dalgası koşmasın — ağ round-trip'leri maçındır.
// useCrossover, state.room değişince çağırır (room != null → true). Dalgalar
// DÜŞÜRÜLMEZ, bekletilir; düşürmek ilerleme kaydını da yarıda bırakırdı.
let matchActive = false;
export function setMediaPrefetchMatchActive(v: boolean): void {
  matchActive = v;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function startMediaPrefetch(): Promise<void> {
  if (started || !ExpoImage?.prefetch) return;
  started = true;
  try {
    const state = await AsyncStorage.getItem(PREFETCH_KEY);
    if (state === 'done') return;
    const doneCount = state ? parseInt(state, 10) || 0 : 0;

    // İş varsa önce rötar: SQLite sorgusu dahil hiçbir maliyet açılış/login
    // penceresine denk gelmesin.
    await sleep(START_DELAY_MS);

    const urls = await allClubLogoUrls();
    if (!urls.length) return;

    let batchNum = 0;
    let completed = doneCount;
    for (let i = doneCount; i < urls.length; i += BATCH) {
      while (matchActive) await sleep(1000); // maç bitene dek beklet
      const batch = urls.slice(i, i + BATCH);
      // prefetch hatası (404, ağ) tüm işlemi düşürmesin — o arma görüldüğünde
      // normal yoldan tekrar denenir zaten.
      await ExpoImage.prefetch(batch, { cachePolicy: 'disk' }).catch(() => {});
      completed = Math.min(i + BATCH, urls.length);
      if (++batchNum % PERSIST_EVERY === 0) {
        await AsyncStorage.setItem(PREFETCH_KEY, String(completed));
      }
      await sleep(BATCH_GAP_MS);
    }
    // Kuyruk güvencesi: 'done'dan hemen önce son ilerlemeyi de yaz — tam burada
    // ölürsek bir sonraki açılış en fazla son birkaç partiyi tekrarlar.
    await AsyncStorage.setItem(PREFETCH_KEY, String(completed));
    await AsyncStorage.setItem(PREFETCH_KEY, 'done');
  } catch {
    // bir sonraki açılışta kaldığı yerden dener
  }
}
