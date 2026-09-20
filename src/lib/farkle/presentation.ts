import type { FarkleDie, FarkleReplayFrame, FarkleScope, FarkleState } from './types';

export function farkleScopeKey(scope: FarkleScope): string {
  return `${scope.gameId}/${scope.dealerGameId}/${scope.handNumber}/${scope.roundId}`;
}

/** Stable semantic equality, independent of JSON object key order. */
export function farkleSemanticKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(farkleSemanticKey).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${farkleSemanticKey(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Selection previews only server-enumerated holds. Never computes a score. */
export function selectedFarkleHold(state: FarkleState, selected: readonly number[]) {
  if (state.stage !== 'hold' || !selected.length || new Set(selected).size !== selected.length) return null;
  const indexes = [...selected].sort((a, b) => a - b);
  return state.legalHolds.find(hold => hold.indexes.length === indexes.length && hold.indexes.every((v, i) => v === indexes[i])) ?? null;
}

/** Stable visual ordering retains each die's authoritative index. */
export function farkleStraightRow(dice: readonly FarkleDie[]): FarkleDie[] {
  return [...dice].sort((a, b) => a.value - b.value || a.index - b.index);
}

export interface FarkleCommittedHold { sequence: number; dice: FarkleDie[]; points: number; rollNumber: number }

/** Rebuild committed scoring rows from semantic receipts, including reconnect. */
export function farkleCommittedHolds(frames: readonly FarkleReplayFrame[], state: FarkleState): FarkleCommittedHold[] {
  let holds: FarkleCommittedHold[] = [];
  for (const frame of frames) {
    if (frame.sequence > state.actionSequence || frame.stateAfter._authorityScope !== state._authorityScope) continue;
    for (const event of frame.events) {
      if (event.type === 'turn_started' || event.type === 'turn_completed') holds = [];
      if (event.type === 'dice_held' && event.playerId === state.currentTurnPlayerId) {
        holds.push({ sequence: frame.sequence, dice: frame.stateAfter.dice.filter(d => event.indexes?.includes(d.index)),
          points: event.points ?? 0, rollNumber: event.rollNumber ?? 0 });
      }
    }
  }
  return holds;
}

export function farkleTurnStatus(state: FarkleState): string | null {
  if (state.gamePhase === 'complete') return 'FINAL SCORE';
  if (state.tiebreakTurn > 0) return `TIEBREAK TURN ${state.tiebreakTurn}`;
  return state.finalQueue !== null ? 'FINAL TURN' : null;
}

export function admitFarkleSnapshot(previous: FarkleState | null, incoming: FarkleState, roundId: string, revisions?: { previous: number; incoming: number }): boolean {
  if (incoming.version !== 1 || incoming.scoringVersion !== 1 || incoming._authorityScope !== roundId || !Number.isSafeInteger(incoming.actionSequence)) return false;
  if (!previous || previous._authorityScope !== roundId) return true;
  if (farkleSemanticKey(previous.config) !== farkleSemanticKey(incoming.config)) return false;
  if (revisions && revisions.incoming < revisions.previous) return false;
  if (incoming.actionSequence > previous.actionSequence) return true;
  if (incoming.actionSequence === previous.actionSequence && revisions && revisions.incoming > revisions.previous) {
    const { turnDeadline: priorDeadline, ...priorFacts } = previous;
    const { turnDeadline: nextDeadline, ...nextFacts } = incoming;
    return farkleSemanticKey(priorFacts) === farkleSemanticKey(nextFacts);
  }
  return incoming.actionSequence === previous.actionSequence && farkleSemanticKey(previous) === farkleSemanticKey(incoming);
}
