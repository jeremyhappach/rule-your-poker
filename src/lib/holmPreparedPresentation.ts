export interface HolmPreparedPresentationRoundLike {
  id: string;
  dealer_game_id?: string | null;
  hand_number?: number | null;
  status?: string | null;
  holm_predecessor_round_id?: string | null;
}

export type HolmClientPresentationRoundSelection<T extends HolmPreparedPresentationRoundLike> = {
  mode: 'published' | 'held-predecessor' | 'prepared-successor';
  round: T;
  predecessorRound: T;
};

export interface HolmPreparedAcknowledgementIdentity {
  dealerGameId: string;
  predecessorRoundId: string;
  successorRoundId: string;
  handNumber: number;
  handContextId: string;
}

export function getHolmPreparedAcknowledgementIdentity<
  T extends HolmPreparedPresentationRoundLike,
>(
  selection: HolmClientPresentationRoundSelection<T> | null,
  dealerGameId: string | null | undefined,
): HolmPreparedAcknowledgementIdentity | null {
  if (!dealerGameId || selection?.mode !== 'prepared-successor') return null;
  const predecessorRoundId = selection.round.holm_predecessor_round_id;
  const handNumber = selection.round.hand_number ?? null;
  if (
    !predecessorRoundId
    || predecessorRoundId !== selection.predecessorRound.id
    || handNumber === null
    || handNumber < 1
  ) return null;

  return {
    dealerGameId,
    predecessorRoundId,
    successorRoundId: selection.round.id,
    handNumber,
    handContextId: `${selection.round.id}:h${handNumber}`,
  };
}

/**
 * Select the exact round one browser may present.
 *
 * - A live predecessor barrier always wins, even if server fallback already
 *   published H2. That keeps every tab independently ordered.
 * - Once this browser released H1, it may present the exact prepared H2 before
 *   the authoritative game pointer moves.
 * - A fresh/reconnecting browser that never observed H1 live enters prepared
 *   H2 directly and never replays historical settlement.
 */
export function selectHolmClientPresentationRound<
  T extends HolmPreparedPresentationRoundLike,
>({
  rounds,
  dealerGameId,
  publishedRound,
  barrierRoundId,
  predecessorObservedLive,
  predecessorReleased,
  awaitingNextRound,
}: {
  rounds: readonly T[];
  dealerGameId: string | null | undefined;
  publishedRound: T | null;
  barrierRoundId: string | null | undefined;
  predecessorObservedLive: boolean;
  predecessorReleased: boolean;
  awaitingNextRound: boolean;
}): HolmClientPresentationRoundSelection<T> | null {
  if (!dealerGameId || !publishedRound) return null;

  if (barrierRoundId) {
    const held = rounds.find((round) =>
      round.id === barrierRoundId
      && round.dealer_game_id === dealerGameId,
    );
    if (held) {
      return {
        mode: held.id === publishedRound.id ? 'published' : 'held-predecessor',
        round: held,
        predecessorRound: held,
      };
    }
  }

  if (awaitingNextRound) {
    const prepared = rounds.find((round) =>
      round.dealer_game_id === dealerGameId
      && round.holm_predecessor_round_id === publishedRound.id
      && round.hand_number === (publishedRound.hand_number ?? 0) + 1
      && round.status === 'dealing',
    );
    if (prepared && (predecessorReleased || !predecessorObservedLive)) {
      return {
        mode: 'prepared-successor',
        round: prepared,
        predecessorRound: publishedRound,
      };
    }
  }

  return {
    mode: 'published',
    round: publishedRound,
    predecessorRound: publishedRound,
  };
}
