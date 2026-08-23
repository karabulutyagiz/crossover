import type { MonetizationOffer } from './monetization';

export type ModalQueueItem = MonetizationOffer & { modalKind: 'socialPackIntro' | 'postMatchOffer' | 'devTest' };

function label(item: Pick<ModalQueueItem, 'modalKind'>): string {
  if (item.modalKind === 'socialPackIntro') return 'SOCIAL_PACK_INTRO';
  if (item.modalKind === 'postMatchOffer') return 'POST_MATCH_OFFER';
  return 'DEV_TEST_OFFER';
}

export function modalLog(message: string, data?: Record<string, unknown>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[MODAL] ${message}`, data ?? '');
  }
}

export function enqueueModal(queue: ModalQueueItem[], item: ModalQueueItem, activeOfferId?: string | null): ModalQueueItem[] {
  if (activeOfferId === item.offerId || queue.some((q) => q.offerId === item.offerId)) return queue;
  modalLog(`Queued ${label(item)}`, { offerId: item.offerId, priority: item.priority });
  return [...queue, item].sort((a, b) => b.priority - a.priority);
}

export function takeNextModal(queue: ModalQueueItem[]): { next: ModalQueueItem | null; rest: ModalQueueItem[] } {
  const [next, ...rest] = queue;
  if (next) modalLog(`Showing ${label(next)}`, { offerId: next.offerId, priority: next.priority });
  return { next: next ?? null, rest };
}
