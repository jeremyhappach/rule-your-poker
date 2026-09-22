import { REPLAY_CONTRACT_V1, reconstructReplayPrefixV1, type ReplayObject, type ReplayPackageV1, type ReplayStepV1 } from '../replay/contractV1';
import { redactFrame } from './engine';
import type { Event, Match, Projection } from './model';

export interface VisibleEvent extends Omit<Event, 'frame'> { frame: Projection }
/** Server-side read projection. No client receives a raw private Event or Match. */
export function visibleHistory(match: Match, viewerId: string | null): VisibleEvent[] {
  const revealed = new Set(match.rounds.filter(r => r.revealed).map(r => r.id));
  return match.events.filter(e => !e.actorId || e.actorId === viewerId || e.type === 'pass_used' || revealed.has(e.roundId ?? '')).map(e => ({
    ...structuredClone(e), frame: redactFrame(e.frame, viewerId, revealed.has(e.roundId ?? '')),
  }));
}
const json = (value: unknown): ReplayObject => JSON.parse(JSON.stringify(value)) as ReplayObject;
/** Uses the existing canonical reader contract without modifying its Gin-specific capture. */
export function exportReplay(match: Match, viewerId: string | null): ReplayPackageV1 {
  const events = visibleHistory(match, viewerId);
  let before: ReplayObject = {run21: null, scores: {}, balances: {}};
  const steps: ReplayStepV1[] = events.map((e, index) => {
    const after: ReplayObject = {run21: json(e.frame), scores: json(e.frame.cumulative), balances: {}};
    const oldScores = before.scores as Record<string, number>;
    const scores = Object.entries(e.frame.cumulative).filter(([id, value]) => (oldScores[id] ?? 0) !== value).map(([id, value]) => ({
      counter: id, before: oldScores[id] ?? 0, delta: value - (oldScores[id] ?? 0), after: value, reason: e.type,
    }));
    const step: ReplayStepV1 = {sequence: String(e.sequence), sourceKey: `run21:${match.identity.dealerGameId}:${match.identity.handNumber}:${e.sequence}`,
      identity: {...match.identity, roundId: e.roundId},
      ...(index === 0 ? {opening: {state: structuredClone(before), coverage: 'hand_boundary' as const, rules: json(match.config)}} : {}),
      substeps: [{type: e.type, source: 'run21/1', actorId: e.actorId, targets: [], origin: e.type === 'timeout' ? 'deadline' : e.actorId ? match.players.find(p=>p.id===e.actorId)?.kind==='bot'?'bot':'player' : 'system',
        operands: json({at: e.at, requestId: e.requestId, ...e.operands}), scores, transfers: [],
        delta: [{op: 'set', path: ['run21'], existed: true, before: before.run21, value: after.run21},
          {op: 'set', path: ['scores'], existed: true, before: before.scores, value: after.scores}]}],
    };
    before = after;
    if (index === events.length - 1 && match.settlement) step.closing = {
      scope: 'hand', identity: step.identity, finalSequence: step.sequence, disposition: 'settlement_receipt_only', completeness: 'partial',
      endingState: structuredClone(after), balances: {}, scores: {...e.frame.cumulative},
    };
    return step;
  });
  return {contract: REPLAY_CONTRACT_V1, sessionId: match.identity.sessionId,
    perspective: viewerId ? {kind: 'participant', userId: viewerId} : {kind: 'public'}, coverage: 'hand_boundary', steps,
    // Financial ledger capture is baseline-gated. Never call a receipt-only package complete.
    seal: {finalSequence: steps.at(-1)!.sequence, stepCount: steps.length, completeness: 'partial'}};
}
/** Seeking applies recorded deltas; it never runs rules or reads a playback clock. */
export function seekReplay(replay: ReplayPackageV1, index: number): Projection {
  if (!Number.isInteger(index) || index < 0 || index >= replay.steps.length) throw new Error('invalid_seek');
  return reconstructReplayPrefixV1({...replay, steps: replay.steps.slice(0, index + 1)}).run21 as unknown as Projection;
}
