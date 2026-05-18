/**
 * Slot transition choreography constants (Phase 7).
 *
 * Centralized so Phase 8 can tune timing without touching the
 * PlayfieldSlotController state machine.
 *
 * Phase 7 contract:
 *   - interstitialDwellMs: visible NeutralInterstitial hold between
 *     two non-null slot identities. 450 ms is intentional: long enough
 *     to read as a structural beat, short enough to not feel like
 *     loading.
 *   - teardownGraceMs: 0 in Phase 7. Synchronous unmount of the prior
 *     gameplay slot is safe because by the time `desiredIdentity`
 *     flips, end-of-game closure (Celebration / Settlement / payouts)
 *     has completed and those surfaces are overlays outside the slot.
 *     If a future phase moves a closure animation INTO the slot, it
 *     must raise this above 0 and gate the controller's
 *     `active → tearing-down` transition on completion.
 *   - mountStaggerMs: 0 in Phase 7. The next game mounts immediately
 *     after dwell expires.
 */

export const SLOT_CHOREOGRAPHY = {
  interstitialDwellMs: 450,
  teardownGraceMs: 0,
  mountStaggerMs: 0,
} as const;

export type SlotChoreography = typeof SLOT_CHOREOGRAPHY;
