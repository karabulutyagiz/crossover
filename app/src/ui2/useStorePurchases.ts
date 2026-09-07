// Mağaza satın alma mantığı — screens.tsx StoreScreen'den (10515-10760) BİREBİR taşındı
// (2026-09-07, UI2). Görünüm sıfırdan; gelir yolu (StoreKit replay, restore, kıtlık
// sırası, niyet) aynen korunur. Yalnız ekrana özgü state dışarı alındı (dialog/kıtlık
// penceresi hook'un döndürdüğü alanlarla çizilir).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { Actions, GameState } from './types';
import { t } from '../i18n';
import { captureError, track } from '../telemetry';
import { triggerFeedback } from '../feedback/GameFeedback';
import { GameFeedbackEvent } from '../feedback/events';
import { getMonetizationConfig, takePendingDiamondIntent, type DiamondIntent } from '../monetization';
import { takePendingShortfall, takePendingShortfallReason } from '../shortfall';
import { COPASS_PRODUCT_ID, DIAMOND_PACKS, DIAMOND_PRODUCT_IDS, SOCIAL_PACK_IDS, type PowerId } from './products';

let useIAP: any = () => ({ connected: false, products: [], subscriptions: [], requestPurchase: () => {}, fetchProducts: () => Promise.resolve([]) });
let getTransactionJwsIOS: any = (_pid?: string) => Promise.resolve(null);
let getAvailablePurchases: any = () => Promise.resolve([]);
let iapFinishTransaction: any = () => Promise.resolve();
type Purchase = any;
try {
  const iap = require('react-native-iap');
  useIAP = iap.useIAP; getTransactionJwsIOS = iap.getTransactionJwsIOS; getAvailablePurchases = iap.getAvailablePurchases; iapFinishTransaction = iap.finishTransaction;
} catch { /* Expo Go / web: IAP kapalı */ }

export type StoreDialog = { title: string; body: string; icon: 'info' | 'ok' | 'error' | 'wait'; danger?: boolean };
export type Shortfall = { missing: number; productId: string; required?: number; current?: number; source?: string; intent: DiamondIntent | null };

export function packForShortfall(missing: number) {
  return DIAMOND_PACKS.find((p) => p.amount >= missing) ?? DIAMOND_PACKS[DIAMOND_PACKS.length - 1]!;
}

export function useStorePurchases(state: GameState, actions: Actions, onDiamondCelebration?: (c: { amount: number }) => void) {
  const profile = state.profile;
  const [dialog, setDialog] = useState<StoreDialog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const openDialog = useCallback((d: StoreDialog) => { setDialog(d); setDialogOpen(true); }, []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const [buying, setBuying] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [showNotEnough, setShowNotEnough] = useState(false);
  const [shortfall, setShortfall] = useState<Shortfall | null>(null);
  const [pendingAutoUsePower, setPendingAutoUsePower] = useState<PowerId | null>(null);
  const pendingDiamondIntentRef = useRef<DiamondIntent | null>(null);

  const onPurchaseSuccess = useCallback(async (purchase: Purchase) => {
    const isSub = SOCIAL_PACK_IDS.includes(purchase.productId);
    try {
      const receipt = Platform.OS === 'android' ? purchase.purchaseToken : (purchase.purchaseToken ?? (await getTransactionJwsIOS(purchase.productId)));
      if (!receipt) throw new Error('no-receipt');
      await actions.verifyPurchase(receipt, { productId: purchase.productId, isSubscription: isSub });
      await iapFinishTransaction({ purchase, isConsumable: !isSub });
      triggerFeedback(GameFeedbackEvent.PURCHASE_CONFIRMED);
      track(isSub ? 'social_pack_purchase_success' : 'diamond_purchase_success', { product_id: purchase.productId, kind: isSub ? 'subscription' : 'diamonds', purchase_intent: pendingDiamondIntentRef.current?.source, currentDiamonds: profile?.diamonds ?? 0 });
      setShowNotEnough(false); setShortfall(null);
      if (isSub) {
        openDialog({ title: t('purchase.doneTitle'), body: t('purchase.socialPackBody'), icon: 'ok' });
      } else if (purchase.productId !== COPASS_PRODUCT_ID) {
        const pack = DIAMOND_PACKS.find((p) => p.productId === purchase.productId);
        if (pack) onDiamondCelebration?.({ amount: pack.amount });
        const intent = pendingDiamondIntentRef.current;
        if (intent?.product === 'power') {
          pendingDiamondIntentRef.current = null;
          if (intent.autoUseAfterPurchase) setPendingAutoUsePower(intent.powerId);
          track('monetization_offer_completed', { offer_id: intent.source, product: intent.powerId, missing_diamonds: intent.missingDiamonds, required_diamonds: intent.requiredDiamonds });
          track('item_purchase_started', { product: intent.powerId, source_screen: intent.source, diamond_balance: intent.currentBalance + (pack?.amount ?? 0) });
          actions.buyPower(intent.powerId);
        }
      }
    } catch (err) {
      captureError(err, { where: 'purchase_success', productId: purchase.productId });
      openDialog({ title: t('store.purchasePendingTitle'), body: t('store.purchasePendingBody'), icon: 'wait' });
    } finally { setBuying(null); }
  }, [actions, onDiamondCelebration, openDialog, profile?.diamonds]);
  const onPurchaseError = useCallback((err: { code?: string }) => {
    setBuying(null);
    const code = err?.code ?? '';
    track(/cancel/i.test(code) ? 'diamond_purchase_cancelled' : 'diamond_purchase_failed', { code });
    if (!/cancel/i.test(code)) openDialog({ title: t('store.purchaseFailedTitle'), body: t('store.purchaseFailedBody'), icon: 'error', danger: true });
  }, [openDialog]);
  const { connected, products, subscriptions, requestPurchase, fetchProducts } = useIAP({ onPurchaseSuccess, onPurchaseError });
  const actionsRef = useRef(actions); actionsRef.current = actions;
  const replayedRef = useRef(false);
  useEffect(() => {
    if (!connected) { replayedRef.current = false; return; }
    fetchProducts({ skus: [...DIAMOND_PRODUCT_IDS, COPASS_PRODUCT_ID], type: 'in-app' }).catch(() => {});
    fetchProducts({ skus: SOCIAL_PACK_IDS, type: 'subs' }).catch(() => {});
    if (replayedRef.current) return;
    replayedRef.current = true;
    getAvailablePurchases().then(async (ps: Purchase[]) => {
      const sub = (ps ?? []).find((p) => SOCIAL_PACK_IDS.includes(p.productId));
      setActiveSubId(sub ? sub.productId : null);
      for (const p of ps ?? []) {
        const isSubItem = SOCIAL_PACK_IDS.includes(p.productId);
        const receipt = Platform.OS === 'android' ? p.purchaseToken : (p.purchaseToken ?? (await getTransactionJwsIOS(p.productId)));
        if (!receipt) continue;
        try { await actionsRef.current.verifyPurchase(receipt, { productId: p.productId, isSubscription: isSubItem }); await iapFinishTransaction({ purchase: p, isConsumable: !isSubItem }); } catch { /* sonraki açılışta tekrar */ }
      }
    }).catch(() => {});
  }, [connected, fetchProducts]);
  const priceMap = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const p of [...(products as { id?: string; displayPrice?: string }[]), ...(subscriptions as { id?: string; displayPrice?: string }[])]) if (p.id != null && !m.has(p.id)) m.set(p.id, p.displayPrice);
    return m;
  }, [products, subscriptions]);
  const priceFor = useCallback((productId: string, fallback: string) => priceMap.get(productId) ?? fallback, [priceMap]);
  const buy = useCallback((productId: string) => {
    if (buying) return;
    const loaded = [...products, ...subscriptions].some((p) => (p as { id?: string }).id === productId);
    if (!loaded) { openDialog({ title: t('store.comingSoonTitle'), body: t('store.comingSoonBody'), icon: 'wait' }); return; }
    if (Platform.OS === 'android' && !getMonetizationConfig().androidIapReady) { openDialog({ title: t('store.comingSoonTitle'), body: t('store.comingSoonBody'), icon: 'wait' }); return; }
    const isSub = SOCIAL_PACK_IDS.includes(productId);
    setBuying(productId);
    track(isSub ? 'social_pack_purchase_started' : 'diamond_package_selected', { product_id: productId, kind: isSub ? 'subscription' : 'diamonds', source_screen: pendingDiamondIntentRef.current?.source ?? 'store', currentDiamonds: profile?.diamonds ?? 0 });
    const apple = { sku: productId, appAccountToken: profile?.userId ?? undefined }; const google = { skus: [productId] };
    Promise.resolve(requestPurchase({ request: { apple, google }, type: isSub ? 'subs' : 'in-app' })).catch(() => setBuying(null));
  }, [buying, requestPurchase, products, subscriptions, profile?.userId, profile?.diamonds, openDialog]);
  const buyRef = useRef(buy); buyRef.current = buy;

  // Kıtlık → StoreKit el sıkışması (olay güdümlü; bkz. eski StoreScreen yorumu)
  const pendingBuyRef = useRef<string | null>(null);
  const notEnoughShownRef = useRef(false);
  const pendingBuyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firePendingBuy = useCallback(() => {
    if (pendingBuyTimerRef.current) { clearTimeout(pendingBuyTimerRef.current); pendingBuyTimerRef.current = null; }
    const pid = pendingBuyRef.current; if (pid == null) return;
    pendingBuyRef.current = null; buyRef.current(pid);
  }, []);
  const openShortfallSheet = useCallback((missing: number, reason?: { required?: number; current?: number; source?: string }, intent?: DiamondIntent | null) => {
    const pack = packForShortfall(missing);
    pendingDiamondIntentRef.current = intent ?? null;
    setShortfall({ missing, productId: pack.productId, required: reason?.required, current: reason?.current, source: reason?.source, intent: intent ?? null });
    track('diamond_store_opened', { source: reason?.source ?? intent?.source, missingDiamonds: missing, requiredDiamonds: reason?.required, currentDiamonds: reason?.current ?? profile?.diamonds ?? 0 });
    setShowNotEnough(true);
    pendingBuyRef.current = pack.productId;
    if (pendingBuyTimerRef.current) { clearTimeout(pendingBuyTimerRef.current); pendingBuyTimerRef.current = null; }
    if (notEnoughShownRef.current) requestAnimationFrame(firePendingBuy); else pendingBuyTimerRef.current = setTimeout(firePendingBuy, 600);
  }, [firePendingBuy, profile?.diamonds]);
  useEffect(() => {
    const missing = takePendingShortfall(); const reason = takePendingShortfallReason(); const intent = takePendingDiamondIntent();
    if (missing == null) return;
    openShortfallSheet(missing, reason ?? undefined, intent);
  });
  const onNotEnoughShown = useCallback(() => { notEnoughShownRef.current = true; firePendingBuy(); }, [firePendingBuy]);
  const onNotEnoughExited = useCallback(() => { notEnoughShownRef.current = false; }, []);

  const restorePurchases = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const ps: Purchase[] = (await getAvailablePurchases()) ?? [];
      const sub = ps.find((p) => SOCIAL_PACK_IDS.includes(p.productId));
      setActiveSubId(sub ? sub.productId : null);
      let restored = 0;
      for (const p of ps) {
        const isSubItem = SOCIAL_PACK_IDS.includes(p.productId);
        const receipt = Platform.OS === 'android' ? p.purchaseToken : (p.purchaseToken ?? (await getTransactionJwsIOS(p.productId)));
        if (!receipt) continue;
        try { await actionsRef.current.verifyPurchase(receipt, { productId: p.productId, isSubscription: isSubItem }); await iapFinishTransaction({ purchase: p, isConsumable: !isSubItem }); restored += 1; } catch { /* biri diğerini durdurmasın */ }
      }
      track('restore_purchases', { restored });
      openDialog({ title: t('store.restoreTitle'), body: restored > 0 ? t('store.restoreDone') : t('store.restoreNone'), icon: restored > 0 ? 'ok' : 'info' });
    } catch (err) {
      captureError(err, { where: 'restore_purchases' });
      openDialog({ title: t('store.restoreTitle'), body: t('store.restoreFailed'), icon: 'error', danger: true });
    } finally { setRestoring(false); }
  }, [restoring, openDialog]);

  return { dialog, dialogOpen, openDialog, closeDialog, buying, restoring, activeSubId, priceFor, buy, restorePurchases, showNotEnough, setShowNotEnough, shortfall, setShortfall, openShortfallSheet, onNotEnoughShown, onNotEnoughExited, pendingAutoUsePower, setPendingAutoUsePower, iapConnected: !!connected };
}
