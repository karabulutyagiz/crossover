// Cross-screen handoff for the insufficient-diamonds flow.
//
// Diamonds are spent in five different places (emotes, avatars, powers, the CO
// Pass, name changes, the level road) but the purchase plumbing — StoreKit, the
// covering-pack picker, the AL/VAZGEÇ popup that stays behind Apple Pay — lives
// in StoreScreen. Rather than duplicating IAP wiring per screen, a caller
// records how short the player is, jumps to the Store tab, and StoreScreen
// consumes the pending value on arrival: popup up, sheet open.
//
// One slot, take-once (the gemTarget.ts pattern): a stale value must never
// re-fire on a later visit to the store.
let pending: number | null = null;
let pendingReason: { required?: number; current?: number; source?: string } | null = null;

export function setPendingShortfall(missing: number, reason?: { required?: number; current?: number; source?: string }): void {
  pending = missing > 0 ? Math.ceil(missing) : null;
  pendingReason = pending == null ? null : (reason ?? null);
}

export function takePendingShortfall(): number | null {
  const p = pending;
  pending = null;
  return p;
}

export function takePendingShortfallReason(): { required?: number; current?: number; source?: string } | null {
  const r = pendingReason;
  pendingReason = null;
  return r;
}
