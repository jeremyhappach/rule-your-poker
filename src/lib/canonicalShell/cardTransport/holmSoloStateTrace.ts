/**
 * holmSoloStateTrace — WAR-TIME INSTRUMENTATION ONLY.
 *
 * Bug 1: SOLO STATE LEAKAGE
 *   We need attribution for every write to:
 *     - soloDeclared (isSoloVsChuckyRaw / isSoloVsChucky / soloVsChuckyTableLocked)
 *     - cachedChuckyCards
 *     - cachedChuckyActive
 *     - tabledSelfSnapshot (lonePlayerStageSnapshotRef)
 *   so we can identify the writer causing SOLO_DECLARED during PRE_DEAL of h2.
 *
 * Bug 2: CHUCKY VISUAL TRIGGER
 *   The scheduler fires CHUCKY_REVEAL_STARTED before all cards settle,
 *   but the visible flips happen 5s+ later. Capture the exact setState
 *   call that drives the visible flip (setCachedChuckyCardsRevealed).
 *
 * Pure forensics. NO LOGIC CHANGES.
 */

import { recordHolmTimelineEvent } from './holmWartimeForensics';

export interface SoloStateSnapshot {
  handContextId: string | null;
  prevHandContextId?: string | null;
  soloDeclared?: boolean;            // isSoloVsChucky (raw||locked)
  isSoloVsChuckyRaw?: boolean;
  soloVsChuckyTableLocked?: boolean;
  soloVsChuckyPlayerIdLocked?: string | null;
  chuckyActive?: boolean;
  cachedChuckyActive?: boolean;
  cachedChuckyCardsExists?: boolean;
  cachedChuckyCardsCount?: number;
  cachedChuckyHandContextId?: string | null;
  tabledSnapshotExists?: boolean;
  tabledSnapshotHandId?: string | null;
  phase?: string | null;
  source?: string;
  callsite?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}

export function recordSoloStateChange(snapshot: SoloStateSnapshot): void {
  recordHolmTimelineEvent('SOLO_STATE_CHANGED', snapshot, snapshot.handContextId ?? null);
}

export interface ChuckyVisualTriggerSnapshot {
  handContextId: string | null;
  source: string;                       // human-readable owner ('stepper.setTimeout')
  callsite: string;                     // file:line
  stack?: string | null;
  prevRevealed?: number;
  nextRevealed?: number;
  total?: number;
  announcementVisible?: boolean;
  winnerComputed?: boolean | null;
  cachedChuckyCardsRevealed?: number;
  revealSchedulerState?: string | null;
  allChuckySettled?: boolean;
  chuckyBarrierOpen?: boolean;
  extra?: Record<string, unknown>;
}

export function recordChuckyVisualTrigger(s: ChuckyVisualTriggerSnapshot): void {
  recordHolmTimelineEvent('CHUCKY_VISUAL_TRIGGER', s, s.handContextId ?? null);
}

export function captureStack(skip = 1): string | null {
  try {
    const e = new Error();
    const lines = (e.stack || '').split('\n');
    return lines.slice(skip + 1, skip + 9).map((l) => l.trim()).join(' | ');
  } catch {
    return null;
  }
}
