import type { FarkleDie, FarkleReplayFrame, FarkleScope, FarkleState } from './types';
import { FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS } from './blockingOverlayTiming';

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

export interface FarkleResolvedRoll {
  id: string;
  scopeKey: string;
  sequence: number;
  actorId: string;
  rollNumber: number;
  dice: FarkleDie[];
  local: boolean;
}

export interface FarkleBlockingOverlayReceipt {
  id: string;
  scopeKey: string;
  sequence: number;
  eventType: 'banked' | 'farkle' | 'hot_dice';
  /** Captured when the live receipt is admitted; later Geometry Lab edits affect future events only. */
  displayLifetimeMs: number;
  points: number;
  lost: number;
}

/**
 * Extract one client-presentation-only blocking event from an already committed
 * state transition. This function never calculates scores or mutates game state.
 */
export function farkleBlockingOverlayReceipt(
  state: FarkleState,
  scopeKey: string,
  displayLifetimeMs: number,
): FarkleBlockingOverlayReceipt | null {
  const lifetime = Number.isSafeInteger(displayLifetimeMs) && displayLifetimeMs > 0
    ? displayLifetimeMs
    : FARKLE_BLOCKING_OVERLAY_TIMING_DEFAULTS.displayLifetimeMs;
  const banked = state.events?.find(event => event.type === 'banked');
  if (banked?.playerId && state.turnOrder.includes(banked.playerId) && Number.isSafeInteger(banked.points) && banked.points > 0) {
    return { id: `${scopeKey}/${state.actionSequence}/banked`, scopeKey, sequence: state.actionSequence,
      eventType: 'banked', displayLifetimeMs: lifetime, points: banked.points, lost: 0 };
  }
  const farkle = state.events?.find(event => event.type === 'farkle');
  if (farkle?.playerId && state.turnOrder.includes(farkle.playerId) && Number.isSafeInteger(farkle.lost) && farkle.lost >= 0) {
    return { id: `${scopeKey}/${state.actionSequence}/farkle`, scopeKey, sequence: state.actionSequence,
      eventType: 'farkle', displayLifetimeMs: lifetime, points: 0, lost: farkle.lost };
  }
  const held = state.events?.find(event => event.type === 'dice_held');
  const hotDice = state.events?.find(event => event.type === 'hot_dice');
  if (hotDice && held?.playerId === state.currentTurnPlayerId && state.available.length === 6
    && state.available.every((index, expected) => index === expected)) {
    return { id: `${scopeKey}/${state.actionSequence}/hot_dice`, scopeKey, sequence: state.actionSequence,
      eventType: 'hot_dice', displayLifetimeMs: lifetime, points: 0, lost: 0 };
  }
  return null;
}

/** A live terminal-roll receipt keeps visual ownership after authority advances. */
export function farkleResolvedRoll(state: FarkleState, scopeKey: string, selfId?: string): FarkleResolvedRoll | null {
  const roll = state.events?.find(event => event.type === 'dice_rolled');
  const farkle = state.events?.find(event => event.type === 'farkle');
  if (!roll?.playerId || !farkle || farkle.playerId !== roll.playerId || !state.turnOrder.includes(roll.playerId)
    || !Number.isSafeInteger(roll.rollNumber) || (roll.rollNumber ?? 0) < 1 || !roll.dice?.length || roll.dice.length > 6) return null;
  const indexes = new Set<number>();
  for (const die of roll.dice) {
    if (!Number.isInteger(die.index) || die.index < 0 || die.index > 5 || !Number.isInteger(die.value)
      || die.value < 1 || die.value > 6 || indexes.has(die.index)) return null;
    indexes.add(die.index);
  }
  return {
    id: `${scopeKey}/${state.actionSequence}/${roll.playerId}/${roll.rollNumber}`,
    scopeKey, sequence: state.actionSequence, actorId: roll.playerId, rollNumber: roll.rollNumber,
    dice: roll.dice.map(die => ({ index: die.index, value: die.value })), local: roll.playerId === selfId,
  };
}

export interface FarkleCommittedHold { sequence: number; dice: FarkleDie[]; points: number; rollNumber: number }

/** Rebuild compact self history for the current scoring cycle, including reconnect. */
export function farkleCommittedHolds(frames: readonly FarkleReplayFrame[], state: FarkleState): FarkleCommittedHold[] {
  let holds: FarkleCommittedHold[] = [];
  for (const frame of frames) {
    if (frame.sequence > state.actionSequence || frame.stateAfter._authorityScope !== state._authorityScope) continue;
    for (const event of frame.events) {
      if (event.type === 'turn_started' || event.type === 'turn_completed' || event.type === 'hot_dice') holds = [];
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
