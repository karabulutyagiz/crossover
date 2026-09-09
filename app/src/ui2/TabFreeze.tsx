// Sekme dondurucu — App.tsx'teki TabFreeze'in UI2 kopyası (App ↔ Ui2Tabs döngüsel import'u olmasın diye).
// İki iş yapar:
//  1) TEMBEL KURULUM: sekme ilk kez aktif olana (ya da etkileşimler bitip ısınma süresi dolana) dek çizilmez.
//  2) DONDURMA: pasif sekme YENİDEN ÇİZİLMEZ — karşılaştırıcı hedef pasifse render'ı atlar. Sayfa çeviricide
//     beş sekme birden mount kaldığı için, bu olmadan her sunucu mesajı beş ağacı birden çizdirirdi.
import { memo, startTransition, useEffect, useState, type ReactNode } from 'react';

export const TabFreeze = memo(
  function TabFreeze({ active, warmDelay = 0, canWarm, children }: {
    active: boolean;
    /** pasif sekmeyi etkileşimler bittikten kaç ms sonra arka planda kur */
    warmDelay?: number;
    /** Native navigation may be moving while the JS thread appears idle. */
    canWarm?: () => boolean;
    /** değişince dondurma DELİNİR: pasifken de bir kez çizilmesi gereken durumlar için */
    freezeKey?: unknown;
    children: ReactNode;
  }) {
    const [everActive, setEverActive] = useState(active);
    if (active && !everActive) setEverActive(true); // aktivasyonla AYNI commit'te kurul
    useEffect(() => {
      if (everActive) return;
      let idle: ReturnType<typeof requestIdleCallback> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const warm = () => {
        if (canWarm && !canWarm()) { timer = setTimeout(warm, 100); return; }
        idle = requestIdleCallback(() => {
          if (canWarm && !canWarm()) { timer = setTimeout(warm, 100); return; }
          startTransition(() => setEverActive(true));
        }, { timeout: 1500 });
      };
      timer = setTimeout(warm, warmDelay);
      return () => { clearTimeout(timer); if (idle !== undefined) cancelIdleCallback(idle); };
    }, [everActive, warmDelay, canWarm]);
    return <>{everActive ? children : null}</>;
  },
  (prev, next) => !next.active && prev.freezeKey === next.freezeKey,
);
