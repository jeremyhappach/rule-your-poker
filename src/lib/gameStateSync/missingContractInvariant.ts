/**
 * Missing-Visual-Contract Invariant
 *
 * Temporary detector — fires when an interruptible animation is active and the
 * authoritative phase transitions to a terminal/complete/winner state without
 * an active visual contract guarding it.
 *
 * Game tables should call `reportMissingVisualContract` from the same effect
 * that observes phase→complete/winner while an animation is in flight.
 *
 * The framework is "not done" until callers either:
 *   (a) wrap the animation in beginVisualContract / completeVisualContract, OR
 *   (b) prove the path cannot be interrupted (then remove the report call).
 *
 * Logged event: `visual-contract-missing-for-animation`
 */

import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { buildAnimationEnvelope } from '@/lib/clientContext';

export interface MissingContractReport {
  gameId: string;
  gameType: string;
  /** Short label of the animation path (e.g. 'holm-solo-reveal'). */
  animationPath: string;
  /** Phase the authoritative state transitioned into. */
  phase: string;
  handNumber?: number | null;
  roundId?: string | null;
  turnId?: string | null;
  /** True if an active visual contract exists for this game. */
  hasActiveContract: boolean;
  /** Free-form context for triage. */
  details?: Record<string, unknown>;
}

const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5_000;

function dedupeKey(r: MissingContractReport): string {
  return [
    r.gameId,
    r.gameType,
    r.animationPath,
    r.phase,
    r.handNumber ?? 'h?',
    r.roundId ?? 'r?',
    r.turnId ?? 't?',
  ].join('|');
}

/**
 * Report a missing visual contract. Safe to call from render-adjacent effects;
 * dedupes within a 5s window per (game, animationPath, phase, identity).
 *
 * No-op when `hasActiveContract` is true.
 */
export function reportMissingVisualContract(report: MissingContractReport): void {
  if (report.hasActiveContract) return;

  const key = dedupeKey(report);
  const now = Date.now();
  const last = recentlyReported.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(key, now);

  // Best-effort cleanup so the map doesn't grow unbounded.
  if (recentlyReported.size > 256) {
    for (const [k, t] of recentlyReported) {
      if (now - t > DEDUPE_WINDOW_MS) recentlyReported.delete(k);
    }
  }

  persistSyncDebugEvent({
    gameId: report.gameId,
    gameType: report.gameType,
    handNumber: report.handNumber ?? 0,
    roundId: report.roundId ?? null,
    eventType: 'invariant',
    severity: 'warn',
    eventName: 'visual-contract-missing-for-animation',
    payload: {
      animationPath: report.animationPath,
      phase: report.phase,
      turnId: report.turnId ?? null,
      ...(report.details ?? {}),
    },
  });
}
