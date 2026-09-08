// Sekme dondurucu — App.tsx'teki TabFreeze'in UI2 kopyası (App ↔ Ui2Tabs döngüsel import'u olmasın diye).
// İki iş yapar:
//  1) TEMBEL KURULUM: sekme ilk kez aktif olana (ya da etkileşimler bitip ısınma süresi dolana) dek çizilmez.
//  2) DONDURMA: pasif sekme YENİDEN ÇİZİLMEZ — karşılaştırıcı hedef pasifse render'ı atlar. Sayfa çeviricide
//     beş sekme birden mount kaldığı için, bu olmadan her sunucu mesajı beş ağacı birden çizdirirdi.
import { InteractionManager } from 'react-native';
import { memo, startTransition, useEffect, useState, type ReactNode } from 'react';

export const TabFreeze = memo(
  function TabFreeze({ active, warmDelay = 0, children }: {
    active: boolean;
    /** pasif sekmeyi etkileşimler bittikten kaç ms sonra arka planda kur */
    warmDelay?: number;
    /** değişince dondurma DELİNİR: pasifken de bir kez çizilmesi gereken durumlar için */
    freezeKey?: unknown;
    children: ReactNode;
  }) {
    const [everActive, setEverActive] = useState(active);
    if (active && !everActive) setEverActive(true); // aktivasyonla AYNI commit'te kurul
    useEffect(() => {
      if (everActive) return;
      let clearWarm: (() => void) | undefined;
      const h = InteractionManager.runAfterInteractions(() => {
        const id = setTimeout(() => startTransition(() => setEverActive(true)), warmDelay);
        clearWarm = () => clearTimeout(id);
      });
      return () => { h.cancel(); clearWarm?.(); };
      // everActive tek yönlü (false→true), warmDelay sabit
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <>{everActive ? children : null}</>;
  },
  (prev, next) => !next.active && prev.freezeKey === next.freezeKey,
);
