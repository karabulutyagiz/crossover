export async function requestNativeReview(): Promise<boolean> {
  try {
    let StoreReview: null | { isAvailableAsync: () => Promise<boolean>; requestReview: () => Promise<void> } = null;
    try {
      StoreReview = require('expo-store-review');
    } catch {
      StoreReview = null;
    }
    if (!StoreReview) return false;
    const available = await StoreReview.isAvailableAsync();
    if (!available) return false;
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
