// İlk açılışta tüm kulüp armalarını CİHAZA indirir — arma ilk görüşte bile
// ağ beklemeden, diskten gelir. expo-image'ın kalıcı disk önbelleğini doldurur;
// CachedImage/ClubLogo zaten cachePolicy="memory-disk" ile aynı önbellekten okur.
//
// Tasarım notları:
// - Sürüm anahtarlı: offline data sürümü değişince (yeni export) yeniden koşar.
// - Kaldığı yerden devam eder: her partiden sonra ilerleme AsyncStorage'a yazılır;
//   uygulama kapanırsa bir sonraki açılışta kalan URL'lerden sürer.
// - Sessizce başarısız olur: tek tek indirme hataları toplamı bozmaz; ağ yoksa
//   bir sonraki açılışta yeniden dener. Oyunun açılışını ASLA bekletmez.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { allClubLogoUrls } from './offline/db';

// offline/db.ts CURRENT_VERSION ile birlikte artmalı — data.json yenilenince
// armalar da tazelensin (URL değişmese bile içerik değişmiş olabilir).
const PREFETCH_KEY = 'media_prefetch_v3';
const BATCH = 8;

let ExpoImage: any = null;
try {
  ExpoImage = require('expo-image').Image;
} catch {
  ExpoImage = null; // web stub / beklenmedik ortam — özellik sessizce kapanır
}

let started = false;

export async function startMediaPrefetch(): Promise<void> {
  if (started || !ExpoImage?.prefetch) return;
  started = true;
  try {
    const state = await AsyncStorage.getItem(PREFETCH_KEY);
    if (state === 'done') return;
    const doneCount = state ? parseInt(state, 10) || 0 : 0;

    const urls = await allClubLogoUrls();
    if (!urls.length) return;

    for (let i = doneCount; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      // prefetch hatası (404, ağ) tüm işlemi düşürmesin — o arma görüldüğünde
      // normal yoldan tekrar denenir zaten.
      await ExpoImage.prefetch(batch, { cachePolicy: 'disk' }).catch(() => {});
      await AsyncStorage.setItem(PREFETCH_KEY, String(Math.min(i + BATCH, urls.length)));
    }
    await AsyncStorage.setItem(PREFETCH_KEY, 'done');
  } catch {
    // bir sonraki açılışta kaldığı yerden dener
  }
}
