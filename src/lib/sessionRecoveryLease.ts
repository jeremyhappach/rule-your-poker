/**
 * sessionRecoveryLease — P0 shell recovery invariant.
 *
 * Invariant A: A temporary disconnect, realtime resubscribe failure,
 *   delayed snapshot, remount, or Chaos recovery event must NEVER route
 *   an active-table player back to lobby. While a lease is active, the
 *   client's authoritative joined-table identity is retained.
 *
 * Invariant B: Recovery only rehydrates the exact same joined session /
 *   table identity. It must never resolve, select, or autojoin another
 *   session. Lobby routing is permitted only after an authoritative
 *   terminal reason: explicit leave, kick/removal, completed teardown,
 *   or confirmed unavailable/deleted table — not because a transient
 *   recovery path lacks an immediate match.
 *
 * This module owns the durable per-mount lease and emits SESSION_RECOVERY
 * events into the Chaos timeline for every transition. It intentionally
 * does not touch Gin flow, layoff logic, actions, deadlines, schema, or
 * RPC behavior — it is purely a contract layer over shell navigation.
 */

import { appendSessionRecoveryEvent } from './networkSimChaos';
import { recordSessionRecoveryLease } from './authEjectionLedger';


export type TerminalRecoveryReason =
  | 'explicit-leave'
  | 'kick-or-removal'
  | 'completed-teardown'
  | 'confirmed-unavailable'
  | 'session-ended-confirmed'
  | 'game-missing-confirmed'
  | 'unmount';

export type RecoveryTransitionKind =
  | 'lease-acquired'
  | 'lease-released'
  | 'reconnecting'
  | 'snapshot-refetch'
  | 'snapshot-hydrated'
  | 'membership-validating'
  | 'membership-confirmed'
  | 'membership-failed'
  | 'lobby-resolver-blocked'
  | 'autojoin-blocked'
  | 'terminal';

interface LeaseIdentity {
  gameId: string;
  userId: string;
  mountId: string;
  acquiredAt: number;
}

let currentLease: LeaseIdentity | null = null;

function newMountId(): string {
  return `mount-${Date.now()}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
}

export function acquireRecoveryLease(gameId: string, userId: string): LeaseIdentity {
  // If the same identity is already leased, keep the same mountId — no churn.
  if (currentLease && currentLease.gameId === gameId && currentLease.userId === userId) {
    return currentLease;
  }
  // Different identity supersedes the previous lease (e.g. user switched
  // rooms via an explicit path). Emit a lease-released for the prior.
  if (currentLease) {
    appendSessionRecoveryEvent({
      kind: 'lease-released',
      reason: 'superseded-by-new-identity',
      prior: currentLease,
      next: { gameId, userId },
    });
    recordSessionRecoveryLease({
      action: 'release',
      reason: 'superseded-by-new-identity',
      oldDealerGameId: currentLease.gameId,
      newDealerGameId: gameId,
    });
  }
  currentLease = {
    gameId,
    userId,
    mountId: newMountId(),
    acquiredAt: Date.now(),
  };
  appendSessionRecoveryEvent({
    kind: 'lease-acquired',
    lease: currentLease,
  });
  recordSessionRecoveryLease({
    action: 'acquire',
    reason: 'lease-acquired',
    newDealerGameId: gameId,
    detail: { userId, mountId: currentLease.mountId },
  });
  return currentLease;
}


export function releaseRecoveryLease(
  reason: TerminalRecoveryReason | 'unmount',
  extra?: Record<string, unknown>,
): void {
  if (!currentLease) return;
  const prior = currentLease;
  appendSessionRecoveryEvent({
    kind: 'lease-released',
    reason,
    lease: currentLease,
    ...(extra ?? {}),
  });
  recordSessionRecoveryLease({
    action: 'release',
    reason,
    oldDealerGameId: prior.gameId,
    detail: { ...(extra ?? {}), userId: prior.userId, mountId: prior.mountId },
  });
  currentLease = null;
}


export function getActiveRecoveryLease(): LeaseIdentity | null {
  return currentLease;
}

export function isLeaseActiveFor(gameId: string | null | undefined): boolean {
  if (!currentLease || !gameId) return false;
  return currentLease.gameId === gameId;
}

/**
 * Record a non-terminal recovery transition (reconnect, snapshot fetch,
 * membership validation attempts, blocked lobby/autojoin resolver, etc.).
 */
export function recordRecoveryTransition(
  kind: RecoveryTransitionKind,
  detail: Record<string, unknown> = {},
): void {
  appendSessionRecoveryEvent({
    kind,
    lease: currentLease,
    priorRoute: typeof window !== 'undefined' ? window.location.pathname : null,
    ...detail,
  });
}

/**
 * Record and authorize a terminal transition (allows lobby routing).
 * Callers MUST invoke this immediately before navigating away from an
 * active table so the terminal reason is preserved in the audit log.
 */
export function recordTerminalRecovery(
  reason: TerminalRecoveryReason,
  detail: Record<string, unknown> = {},
): void {
  appendSessionRecoveryEvent({
    kind: 'terminal',
    reason,
    lease: currentLease,
    priorRoute: typeof window !== 'undefined' ? window.location.pathname : null,
    ...detail,
  });
}
