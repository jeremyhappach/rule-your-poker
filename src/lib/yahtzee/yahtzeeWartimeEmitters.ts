/**
 * Yahtzee wartime emitters — direct-producer instrumentation helpers.
 *
 * Shared components (DiceRollAnimation, DiceTableLayout) call these to record
 * batch/scatter/writer lifecycle events. Every emitter is a no-op unless:
 *   1. the ledger is armed (isYahtzeeWartimeArmed()), AND
 *   2. a Yahtzee wartime scope is active (set by YahtzeeGameTable mount).
 *
 * This preserves the "no non-Yahtzee instrumentation" rule while allowing
 * shared-owner producers to emit correctly-scoped events.
 *
 * Read-only. No emitter mutates gameplay state.
 */

import { isYahtzeeWartimeArmed, recordYahtzeeContradiction, recordYahtzeeWartime } from './yahtzeeWartimeLedger';

interface YahtzeeWartimeScope {
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  activePid: string | null;
  localPid: string | null;
  handNumber: number | null;
}

let currentScope: YahtzeeWartimeScope | null = null;

export function setYahtzeeWartimeScope(scope: YahtzeeWartimeScope | null): void {
  currentScope = scope;
}

export function getYahtzeeWartimeScope(): YahtzeeWartimeScope | null {
  return currentScope;
}

function active(): boolean {
  return currentScope !== null && isYahtzeeWartimeArmed();
}

function scopeTurnIdentity() {
  const s = currentScope;
  return s ? {
    gameId: s.gameId, dealerGameId: s.dealerGameId, roundId: s.roundId,
    activePid: s.activePid, localPid: s.localPid, handNumber: s.handNumber,
  } : null;
}

// ── Dice animation batch lifecycle ──────────────────────────────────

export interface DiceAnimationBatchIdentity {
  rollKey: string | number | null;
  ownerPlayerId: string | null;
  rollNumber: number | null;
  batchInstanceId: string;
  cacheKey: string | null;
  reactKey: string | null;
}

export interface DiceAnimationDieDesc {
  index: number;
  value: number;
  held: boolean;
  renderPath: string;
  srcX: number | null; srcY: number | null;
  dstX: number; dstY: number; dstRotate: number;
}

export function emitDiceAnimationBatchMounted(
  batch: DiceAnimationBatchIdentity,
  dice: DiceAnimationDieDesc[],
  animatingIndices: number[],
  heldIndicesExcluded: number[],
): void {
  if (!active()) return;
  recordYahtzeeWartime('transport', 'dice_animation_batch_mounted', {
    scope: scopeTurnIdentity(), batch, dice, animatingIndices, heldIndicesExcluded,
  }, { producer: 'DiceRollAnimation', fn: 'mount', key: batch.batchInstanceId, bypassDedupe: true });
}

export function emitDiceAnimationBatchStarted(batch: DiceAnimationBatchIdentity, dice: DiceAnimationDieDesc[]): void {
  if (!active()) return;
  recordYahtzeeWartime('transport', 'dice_animation_batch_started', {
    scope: scopeTurnIdentity(), batch, dice,
  }, { producer: 'DiceRollAnimation', fn: 'start', key: batch.batchInstanceId, bypassDedupe: true });
  for (const d of dice) {
    recordYahtzeeWartime('transport', 'dice_animation_die_started', {
      scope: scopeTurnIdentity(), batch, die: d,
    }, { producer: 'DiceRollAnimation', fn: 'start', key: `${batch.batchInstanceId}:${d.index}`, bypassDedupe: true });
  }
}

export function emitDiceAnimationBatchSettled(batch: DiceAnimationBatchIdentity, dice: DiceAnimationDieDesc[]): void {
  if (!active()) return;
  for (const d of dice) {
    recordYahtzeeWartime('transport', 'dice_animation_die_settled', {
      scope: scopeTurnIdentity(), batch, die: d, terminalState: 'settled',
    }, { producer: 'DiceRollAnimation', fn: 'settle', key: `${batch.batchInstanceId}:${d.index}`, bypassDedupe: true });
  }
  recordYahtzeeWartime('transport', 'dice_animation_batch_settled', {
    scope: scopeTurnIdentity(), batch, dice,
  }, { producer: 'DiceRollAnimation', fn: 'settle', key: batch.batchInstanceId, bypassDedupe: true });
}

export function emitDiceAnimationBatchCancelled(batch: DiceAnimationBatchIdentity, reason: string): void {
  if (!active()) return;
  recordYahtzeeWartime('transport', 'dice_animation_batch_cancelled', {
    scope: scopeTurnIdentity(), batch, reason,
  }, { producer: 'DiceRollAnimation', fn: 'cancel', key: batch.batchInstanceId, bypassDedupe: true });
}

export function emitDiceAnimationBatchUnmountedUnsettled(batch: DiceAnimationBatchIdentity, reason: string): void {
  if (!active()) return;
  recordYahtzeeWartime('transport', 'dice_animation_batch_unmounted_unsettled', {
    scope: scopeTurnIdentity(), batch, reason,
  }, { producer: 'DiceRollAnimation', fn: 'unmount', key: batch.batchInstanceId, bypassDedupe: true });
  recordYahtzeeContradiction('roll_animation_unmounted_before_terminal', {
    scope: scopeTurnIdentity(), batch, reason,
  }, { producer: 'DiceRollAnimation', fn: 'unmount', key: batch.batchInstanceId });
}

// ── Scatter assignment producer ─────────────────────────────────────

export interface ScatterAssignment {
  x: number; y: number; rotate: number;
}

export function emitScatterAssignmentSnapshot(
  rollKey: string | number | null | undefined,
  prev: Map<number, ScatterAssignment> | null,
  next: Map<number, ScatterAssignment>,
  reason: string,
): void {
  if (!active()) return;
  const seenSlots = new Map<string, number[]>();
  for (const [dieIdx, a] of next.entries()) {
    const p = prev?.get(dieIdx) ?? null;
    if (!p) {
      recordYahtzeeWartime('scatter', 'scatter_assignment_created', {
        scope: scopeTurnIdentity(), rollKey: rollKey ?? null, dieIndex: dieIdx,
        prev: null, next: a, reason,
      }, { producer: 'DiceTableLayout', fn: 'stableScatter#assign', key: `${rollKey}:${dieIdx}`, bypassDedupe: true });
    } else if (p.x !== a.x || p.y !== a.y || p.rotate !== a.rotate) {
      recordYahtzeeWartime('scatter', 'scatter_assignment_changed', {
        scope: scopeTurnIdentity(), rollKey: rollKey ?? null, dieIndex: dieIdx,
        prev: p, next: a, reason,
      }, { producer: 'DiceTableLayout', fn: 'stableScatter#change', key: `${rollKey}:${dieIdx}`, bypassDedupe: true });
      if (reason === 'no-roll-boundary') {
        recordYahtzeeContradiction('scatter_slot_changed_without_roll_boundary', {
          scope: scopeTurnIdentity(), rollKey: rollKey ?? null, dieIndex: dieIdx, prev: p, next: a,
        }, { producer: 'DiceTableLayout', fn: 'stableScatter#change', key: `${rollKey}:${dieIdx}` });
      }
    }
    const slotKey = `${a.x}:${a.y}`;
    const arr = seenSlots.get(slotKey) ?? [];
    arr.push(dieIdx);
    seenSlots.set(slotKey, arr);
  }
  if (prev) {
    for (const [dieIdx, p] of prev.entries()) {
      if (!next.has(dieIdx)) {
        recordYahtzeeWartime('scatter', 'scatter_assignment_released', {
          scope: scopeTurnIdentity(), rollKey: rollKey ?? null, dieIndex: dieIdx,
          prev: p, reason,
        }, { producer: 'DiceTableLayout', fn: 'stableScatter#release', key: `${rollKey}:${dieIdx}`, bypassDedupe: true });
      }
    }
  }
  for (const [slot, idxs] of seenSlots) {
    if (idxs.length > 1) {
      recordYahtzeeContradiction('same_die_assigned_multiple_scatter_slots', {
        scope: scopeTurnIdentity(), rollKey: rollKey ?? null, slot, dieIdxs: idxs,
      }, { producer: 'DiceTableLayout', fn: 'stableScatter#collision' });
    }
  }
}

// ── Roll writer lifecycle (called from YahtzeeGameTable) ────────────

export interface RollWriterIdentity {
  rollKey: string | number;
  rollSerial: number;
  playerId: string;
  roundId: string;
  rollNumber: number;
}

export function emitRollWriteStarted(id: RollWriterIdentity): void {
  if (!active()) return;
  recordYahtzeeWartime('writer', 'roll_write_started', {
    scope: scopeTurnIdentity(), ...id,
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#writeStart', key: String(id.rollKey), bypassDedupe: true });
}

export function emitRollWriteAccepted(id: RollWriterIdentity): void {
  if (!active()) return;
  recordYahtzeeWartime('writer', 'roll_write_accepted', {
    scope: scopeTurnIdentity(), ...id,
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#writeAccept', key: String(id.rollKey), bypassDedupe: true });
}

export function emitRollWriteFailed(id: RollWriterIdentity, err: unknown): void {
  if (!active()) return;
  recordYahtzeeWartime('writer', 'roll_write_failed', {
    scope: scopeTurnIdentity(), ...id, error: (err instanceof Error ? err.message : String(err)),
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#writeFail', key: String(id.rollKey), bypassDedupe: true });
  recordYahtzeeContradiction('roll_intent_aborted_without_terminal_reason', {
    scope: scopeTurnIdentity(), ...id, error: (err instanceof Error ? err.message : String(err)),
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#writeFail', key: String(id.rollKey) });
}

export function emitRollResultApplied(id: RollWriterIdentity, diceValues: number[]): void {
  if (!active()) return;
  recordYahtzeeWartime('writer', 'roll_result_applied', {
    scope: scopeTurnIdentity(), ...id, diceValues,
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#resultApplied', key: String(id.rollKey), bypassDedupe: true });
}

export function emitRollPresentationReleased(id: RollWriterIdentity): void {
  if (!active()) return;
  recordYahtzeeWartime('writer', 'roll_presentation_released', {
    scope: scopeTurnIdentity(), ...id,
  }, { producer: 'YahtzeeGameTable', fn: 'handleRoll#presReleased', key: String(id.rollKey), bypassDedupe: true });
}

export function emitRollButtonReenableCheck(opts: {
  rollButtonEnabled: boolean;
  priorRollTerminal: boolean;
  priorRollKey: string | number | null;
  activePid: string | null;
}): void {
  if (!active()) return;
  if (opts.rollButtonEnabled && !opts.priorRollTerminal) {
    recordYahtzeeContradiction('roll_button_reenabled_before_prior_roll_terminal', {
      scope: scopeTurnIdentity(), ...opts,
    }, { producer: 'YahtzeeGameTable', fn: 'rollButtonGate' });
  }
}

// ── Scorecard ownership events ──────────────────────────────────────

export interface ScorecardBranchDesc {
  branch: 'self-turn:interactive' | 'opponent-turn:readonly' | 'none';
  playerId: string | null;
  reactKey: string | null;
  selectedCategory: string | null;
  submissionState: 'idle' | 'in-progress' | 'accepted';
}

export function emitScorecardBranchChanged(prev: ScorecardBranchDesc | null, next: ScorecardBranchDesc): void {
  if (!active()) return;
  recordYahtzeeWartime('scorecard', 'scorecard_render_branch_changed', {
    scope: scopeTurnIdentity(), prev, next,
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardBranch', bypassDedupe: true });
}

export function emitScorecardDomMounted(desc: ScorecardBranchDesc): void {
  if (!active()) return;
  recordYahtzeeWartime('scorecard', 'scorecard_dom_mounted', {
    scope: scopeTurnIdentity(), desc,
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardMount', bypassDedupe: true });
}

export function emitScorecardDomUnmounted(desc: ScorecardBranchDesc, retirementInProgress: boolean): void {
  if (!active()) return;
  recordYahtzeeWartime('scorecard', 'scorecard_dom_unmounted', {
    scope: scopeTurnIdentity(), desc, retirementInProgress,
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardUnmount', bypassDedupe: true });
  if (retirementInProgress) {
    recordYahtzeeWartime('scorecard', 'scorecard_retirement_completed', {
      scope: scopeTurnIdentity(), desc,
    }, { producer: 'YahtzeeGameTable', fn: 'scorecardRetireDone', bypassDedupe: true });
  }
}

export function emitScorecardRetirementStarted(desc: ScorecardBranchDesc, reason: string): void {
  if (!active()) return;
  recordYahtzeeWartime('scorecard', 'scorecard_retirement_started', {
    scope: scopeTurnIdentity(), desc, reason,
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardRetireStart', bypassDedupe: true });
}

export function emitScoreCategorySelected(category: string, playerId: string): void {
  if (!active()) return;
  recordYahtzeeWartime('scorecard', 'score_category_selected', {
    scope: scopeTurnIdentity(), category, playerId,
  }, { producer: 'YahtzeeGameTable', fn: 'handleScoreCategory#select', bypassDedupe: true });
}

export function emitScorecardVisibleAfterScoreAccepted(): void {
  if (!active()) return;
  recordYahtzeeContradiction('scorecard_visible_after_score_accepted', {
    scope: scopeTurnIdentity(),
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardPostAccept' });
}

export function emitScorecardRemountedDuringRetirement(): void {
  if (!active()) return;
  recordYahtzeeContradiction('scorecard_remounted_during_same_turn_retirement', {
    scope: scopeTurnIdentity(),
  }, { producer: 'YahtzeeGameTable', fn: 'scorecardMount' });
}
