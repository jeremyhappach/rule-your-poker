import type {project} from '../../../server/delayed/adapter';
import type {Board, Config} from '@/lib/run21/model';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';

type Snapshot = Awaited<ReturnType<typeof project>>;

/** Presentation evidence for a command issued in this visible mount only.
 * State reads and restored/retried requests never enter this function. The
 * accepted board, not the intent alone, must prove the visible card movement. */
export function localTurnPresentation(before: Snapshot, after: Snapshot,
  command: Record<string, unknown>, userId: string): {start: boolean; event: BoardFeedbackEvent | null} {
  const silent = {start: false, event: null};
  if (command.op !== 'action' || command.childId !== before.id || command.revision !== before.revision ||
      command.segment !== before.segment || before.actor !== userId || before.terminal || before.held || after.held ||
      after.id !== before.id || after.matchId !== before.matchId || after.game !== before.game ||
      after.revision !== before.revision + 1) return silent;
  const intent = command.intent as {type?: string; column?: number} | undefined;
  if (intent?.type === 'start') return {start: !before.board && !!after.board && !after.terminal &&
    after.actor === userId && after.segment === before.segment && after.round === before.round, event: null};
  if (before.game !== 'run21' || !before.board || !['place', 'pass'].includes(intent?.type ?? '')) return silent;
  const ongoing = after.segment === before.segment && after.actor === userId && after.round === before.round && !after.terminal;
  const finished = after.segment === before.segment + 1;
  const previous = before.board as Board;
  const next = (ongoing ? after.board : finished ? after.ownResults.find(r => r.round === before.round)?.board : null) as Board | null;
  if (!next || previous.playerId !== userId || next.playerId !== userId || !previous.current || previous.result ||
      next.revision !== previous.revision + 1 || next.cardIndex !== previous.cardIndex + 1) return silent;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const placed = intent?.type === 'place' && Number.isInteger(intent.column) && intent.column! >= 0 && intent.column! < previous.columns.length &&
    next.passesUsed === previous.passesUsed && next.columns.length === previous.columns.length &&
    next.columns.every((cards, column) => same(cards, column === intent.column
      ? [...previous.columns[column], previous.current] : previous.columns[column]));
  const passed = intent?.type === 'pass' && next.passesUsed === previous.passesUsed + 1 && same(next.columns, previous.columns);
  if (!placed && !passed) return silent;
  return {start: false, event: {sequence: after.revision, actorId: userId,
    type: placed ? 'card_placed' : 'pass_used', operands: placed ? {column: intent!.column} : {},
    frame: {config: after.config as Config, boards: {[userId]: next}}}};
}
