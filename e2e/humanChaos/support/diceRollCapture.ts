import type { ChaosClient, ChaosDomSnapshot, HumanChaosContinuousObserver } from './continuousObserver';
import { sccTerminalExpectation, validateSccTerminalEvidence, type SccTerminalEvidence, type SccTerminalExpectation } from './sccTerminalCapture';
import { diceTieExpectation, validateDiceTieEvidence, type DiceTieEvidence } from './diceTieCapture';

type Scope = { gameId: string; dealerGameId: string; roundId: string; gameType?: string };
type Die = { value: number; isHeld: boolean };
export type DiceRollTarget = Scope & {
  playerId: string; actionSequence: number; rollKey: number; dice: Die[];
  sccTerminal: SccTerminalExpectation | null;
  tie: ReturnType<typeof diceTieExpectation>;
};
const object = (value: unknown): Record<string, any> | null => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;

/** Bind the proof to this accepted request, not a nearby state read or later roll. */
export function diceRollTarget(scope: Scope, request: unknown, response: unknown): DiceRollTarget {
  const input = object(request), result = object(response), state = object(result?.state);
  const player = object(state?.playerStates?.[input?._player_id]);
  if (!input || input._action !== 'roll' || input._round_id !== scope.roundId
    || typeof input._player_id !== 'string' || !Number.isSafeInteger(input._expected_action_sequence)
    || input._expected_action_sequence < 0 || result?.outcome !== 'applied'
    || result.action_sequence !== input._expected_action_sequence + 1
    || state?._authorityScope !== scope.roundId || state.actionSequence !== result.action_sequence
    || !player || !Number.isSafeInteger(player.rollKey) || player.rollKey <= 0
    || !Array.isArray(player.dice) || player.dice.length !== 5
    || !player.dice.every((die: unknown) => {
      const d = object(die);
      return d && Number.isInteger(d.value) && d.value >= 1 && d.value <= 6 && typeof d.isHeld === 'boolean';
    })) throw new Error('Dice roll capture requires the exact accepted roll response');
  return { ...scope, playerId: input._player_id, actionSequence: result.action_sequence,
    sccTerminal: sccTerminalExpectation(scope.gameType, state, input._player_id),
    tie: diceTieExpectation(scope.gameType, state),
    rollKey: player.rollKey, dice: player.dice.map((die: Die) => ({ value: die.value, isHeld: die.isHeld })) };
}

function matchingRound(snapshot: ChaosDomSnapshot, target: DiceRollTarget): boolean {
  return snapshot.gameId === target.gameId && snapshot.dealerGameId === target.dealerGameId
    && snapshot.roundId === target.roundId && ['horses', 'ship-captain-crew'].includes(snapshot.gameType ?? '');
}

function settledRoll(snapshot: ChaosDomSnapshot, target: DiceRollTarget): boolean {
  if (snapshot.visibleDice.length !== 5) return false;
  return target.dice.every((die, index) => snapshot.visibleDice.filter(encoded => {
    const [id, value, held, row, phase] = encoded.split(':');
    return id === String(index) && value === String(die.value) && held === String(die.isHeld)
      && ['scatter', 'held', 'frozen'].includes(row) && ['normal', 'freeze'].includes(phase);
  }).length === 1);
}

/**
 * Qualification driver barrier only. Observe the existing peer renderer before
 * issuing another roll; no game requests, product delays or detector exemptions.
 * An animation followed by the exact settled outcome distinguishes even an
 * unchanged dice vector from a cached pre-click frame. The caller admits no
 * subsequent player action until this returns.
 */
export async function waitForDiceRollCapture(
  observer: Pick<HumanChaosContinuousObserver, 'snapshotsSince'>,
  peer: ChaosClient, target: DiceRollTarget, clickedAt: number, budgetMs = 15_000,
  readTerminalEvidence?: (deadline: number) => Promise<SccTerminalEvidence>,
  readTieEvidence?: (deadline: number) => Promise<DiceTieEvidence>,
) {
  if (!Number.isFinite(clickedAt) || !Number.isFinite(budgetMs) || budgetMs <= 0) {
    throw new Error('Invalid dice capture clock or budget');
  }
  const deadline = clickedAt + budgetMs;
  let terminalProof: ReturnType<typeof validateSccTerminalEvidence> | null = null;
  let tieProof: ReturnType<typeof validateDiceTieEvidence> | null = null;
  for (;;) {
    const peerFrames = observer.snapshotsSince(peer, clickedAt)
      .filter(frame => frame.client === peer && frame.gameId === target.gameId && frame.dealerGameId === target.dealerGameId
        && frame.wallTime >= clickedAt && frame.wallTime <= Math.min(deadline, Date.now()))
      .sort((a, b) => a.wallTime - b.wallTime);
    const frames = peerFrames.filter(frame => matchingRound(frame, target));
    const animation = frames.find(frame => frame.visibleDice.some(die => die.split(':')[3] === 'animating'));
    const settled = animation && frames.find(frame => frame.wallTime > animation.wallTime && settledRoll(frame, target));
    if (animation && settled && !target.tie) return { ...target, mode: 'settled-dice', peer, clickedAt, deadline, animationAt: animation.wallTime,
      observedAt: settled.wallTime, progressMs: settled.wallTime - clickedAt };
    const successors = animation && peerFrames.filter(frame => frame.wallTime > animation.wallTime
      && frame.gameType === target.gameType && frame.roundId !== target.roundId
      && frame.gameStatus === 'in_progress' && frame.roundStatus === 'betting');
    if (successors?.length && target.tie && readTieEvidence && Date.now() < deadline) {
      tieProof ??= validateDiceTieEvidence(target, await readTieEvidence(deadline));
      const result = frames.find(frame => frame.wallTime >= animation!.wallTime && frame.announcement === tieProof!.rollAnnouncement);
      const successor = successors.find(frame => frame.roundId === tieProof!.successorRoundId && result && frame.wallTime > result.wallTime);
      if (successor && Date.now() <= deadline) return { ...target, mode: 'tie-rollover', tieProof,
        peer, clickedAt, deadline, animationAt: animation!.wallTime,
        observedAt: successor.wallTime, progressMs: successor.wallTime - clickedAt };
    }
    const ended = animation && frames.filter(frame => frame.wallTime > animation.wallTime
      && frame.gameType === 'ship-captain-crew' && frame.gameStatus === 'session_ended' && frame.roundStatus === 'completed');
    if (ended?.length && target.sccTerminal && readTerminalEvidence && Date.now() < deadline) {
      terminalProof ??= validateSccTerminalEvidence(target, await readTerminalEvidence(deadline));
      const presented = ended.find(frame => frame.announcement === terminalProof!.winnerAnnouncement);
      if (presented && Date.now() <= deadline) return { ...target, mode: 'terminal-result', terminalProof,
        peer, clickedAt, deadline, animationAt: animation!.wallTime,
        observedAt: presented.wallTime, progressMs: presented.wallTime - clickedAt };
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`Dice roll ${target.actionSequence} peer capture did not complete within ${budgetMs} ms of the click`);
    await new Promise(resolve => setTimeout(resolve, Math.min(25, remaining)));
  }
}
