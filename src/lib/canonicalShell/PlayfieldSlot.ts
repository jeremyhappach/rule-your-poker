/**
 * PlayfieldSlot — canonical slot identity contract (Phase 6).
 *
 * A "slot" is the conceptual mount point inside PersistentTableShell
 * that holds the currently-rendered game surface. Its identity is the
 * pair (gameType, dealerGameId), or `null` when nothing is mounted
 * (the NeutralInterstitial state between two non-null identities).
 *
 * This module is intentionally pure: no React, no DOM, no telemetry.
 * Phase 6 ships the contract and a passive tracker (separate file);
 * later phases will use it to actually drive slot mounting.
 */

export type PlayfieldSlotIdentity =
  | { gameType: string; dealerGameId: string }
  | null;

export function slotIdentityEquals(
  a: PlayfieldSlotIdentity,
  b: PlayfieldSlotIdentity,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.gameType === b.gameType && a.dealerGameId === b.dealerGameId;
}

export function describeSlotIdentity(id: PlayfieldSlotIdentity): string {
  if (id === null) return 'neutral';
  return `${id.gameType}/${id.dealerGameId}`;
}
