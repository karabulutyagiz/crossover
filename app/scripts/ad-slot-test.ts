// Reklam/pencere sunum slotu davranış testi (2026-09-03 donma düzeltmesi).
// modalTraffic.ts saf TypeScript'tir (React Native importu yok) → doğrudan koşar.
//   çalıştır:  cd app && npx --prefix ../server tsx scripts/ad-slot-test.ts
import { whenModalSlotFree, isModalSlotFree, tryHoldModalSlotForNativeAd, releaseModalSlotForNativeAd } from '../src/modalTraffic';

let ok = 0; let fail = 0;
const chk = (n: string, got: unknown, want: unknown) => {
  const p = got === want; p ? ok++ : fail++;
  console.log(`${p ? 'OK  ' : 'FAIL'} ${n}: ${JSON.stringify(got)}${p ? '' : ` beklenen ${JSON.stringify(want)}`}`);
};

chk('başta slot boş', isModalSlotFree(), true);

// 1) Pencere sunulmuşken reklam gösterilmez (donmanın kök sebebi).
let modalShown = false;
const closeModal = whenModalSlotFree(() => { modalShown = true; });
chk('pencere sunuldu', modalShown, true);
chk('slot dolu', isModalSlotFree(), false);
chk('pencere açıkken reklam REDDEDİLİR', tryHoldModalSlotForNativeAd(), false);

// 2) Pencere kapandı ama native kapanış animasyonu sürüyor → hâlâ reddedilir.
closeModal();
chk('kapanış payında reddedilir', tryHoldModalSlotForNativeAd(), false);

setTimeout(() => {
  chk('pay bitince slot boş', isModalSlotFree(), true);
  chk('reklam artık tutabilir', tryHoldModalSlotForNativeAd(), true);
  chk('reklam tutarken slot dolu', isModalSlotFree(), false);
  // 3) İkinci reklam birincinin üstüne BİNMEZ (aksi halde birincinin CLOSED'ı
  //    ikincinin slotunu bırakır ve pencere reklamın üstüne sunulur).
  chk('ikinci reklam REDDEDİLİR', tryHoldModalSlotForNativeAd(), false);

  // 4) Reklam ekrandayken açılmak isteyen pencere sıraya girer.
  let lateModal = false;
  whenModalSlotFree(() => { lateModal = true; });
  chk('reklam açıkken pencere sunulmaz', lateModal, false);

  releaseModalSlotForNativeAd();
  setTimeout(() => {
    chk('reklam kapanınca bekleyen pencere sunulur', lateModal, true);
    // Sıradaki pencere sunulduğu için slot ARTIK ONUN — boş değil, doğru olan bu.
    chk('devralan pencere slotu tutuyor', isModalSlotFree(), false);
    console.log(`\n${fail === 0 ? 'TÜM SLOT TESTLERİ GEÇTİ' : fail + ' TEST BAŞARISIZ'} (${ok} ok, ${fail} fail)`);
    process.exit(fail === 0 ? 0 : 1);
  }, 500);
}, 450);
