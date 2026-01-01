/**
 * Ship Captain Crew Bot Decision Logic
 * 
 * Bot strategy:
 * - Ship (6), Captain (5), Crew (4) auto-freeze, no decision needed
 * - For cargo dice: ALL or NOTHING (re-roll both or stop)
 * - If not winning or tied: always re-roll cargo
 * - If winning or tied with cargo 8+: hold (stop rolling)
 * - If winning or tied with cargo 2-7: re-roll (can improve)
 */

import { SCCHand, SCCHandResult, evaluateSCCHand, isQualified } from './sccGameLogic';

interface SCCBotDecisionContext {
  currentHand: SCCHand;
  rollsRemaining: number;
  currentWinningResult: SCCHandResult | null;
}

interface SCCBotDecision {
  shouldStopRolling: boolean;
  reasoning: string;
}

/**
 * Determine if bot should stop rolling (lock in hand) or continue
 */
export function getSCCBotDecision(context: SCCBotDecisionContext): SCCBotDecision {
  const { currentHand, rollsRemaining, currentWinningResult } = context;
  
  // If out of rolls, must stop
  if (rollsRemaining === 0) {
    return {
      shouldStopRolling: true,
      reasoning: 'No rolls remaining',
    };
  }

  // If haven't rolled yet (shouldn't happen but safety check)
  if (rollsRemaining === 3) {
    return {
      shouldStopRolling: false,
      reasoning: 'Must roll at least once',
    };
  }

  // If not qualified (missing 6-5-4), must keep rolling
  if (!isQualified(currentHand)) {
    return {
      shouldStopRolling: false,
      reasoning: 'Not qualified yet - need Ship/Captain/Crew',
    };
  }

  // We're qualified - evaluate our hand
  const ourResult = evaluateSCCHand(currentHand);
  const ourCargo = ourResult.cargoSum;

  // If no current winning hand, we're the first to roll
  if (!currentWinningResult) {
    // First player: hold at 8+, re-roll at 7 and below
    if (ourCargo >= 8) {
      return {
        shouldStopRolling: true,
        reasoning: `First player with cargo ${ourCargo} (8+): holding`,
      };
    } else {
      return {
        shouldStopRolling: false,
        reasoning: `First player with cargo ${ourCargo} (7 or less): re-rolling`,
      };
    }
  }

  // There's a current winning hand
  const winningCargo = currentWinningResult.cargoSum;
  const winningIsQualified = currentWinningResult.isQualified;

  // If winning hand is NQ, we're automatically winning
  if (!winningIsQualified) {
    // We're qualified, they're not - we're winning
    // Same logic as first player: hold at 8+
    if (ourCargo >= 8) {
      return {
        shouldStopRolling: true,
        reasoning: `Winning (opponent NQ), cargo ${ourCargo} (8+): holding`,
      };
    } else {
      return {
        shouldStopRolling: false,
        reasoning: `Winning (opponent NQ), cargo ${ourCargo} (7 or less): re-rolling to improve`,
      };
    }
  }

  // Both qualified - compare cargo
  if (ourCargo > winningCargo) {
    // We're winning
    if (ourCargo >= 8) {
      return {
        shouldStopRolling: true,
        reasoning: `Winning with cargo ${ourCargo} vs ${winningCargo} (8+): holding`,
      };
    } else {
      return {
        shouldStopRolling: false,
        reasoning: `Winning with cargo ${ourCargo} vs ${winningCargo} (7 or less): re-rolling to improve`,
      };
    }
  } else if (ourCargo === winningCargo) {
    // We're tied
    if (ourCargo >= 8) {
      return {
        shouldStopRolling: true,
        reasoning: `Tied with cargo ${ourCargo} (8+): holding`,
      };
    } else {
      return {
        shouldStopRolling: false,
        reasoning: `Tied with cargo ${ourCargo} (7 or less): re-rolling to try to win`,
      };
    }
  } else {
    // We're losing - always re-roll to try to beat them
    return {
      shouldStopRolling: false,
      reasoning: `Losing with cargo ${ourCargo} vs ${winningCargo}: must re-roll`,
    };
  }
}

/**
 * Simple helper: should bot stop rolling?
 */
export function shouldSCCBotStopRolling(
  currentHand: SCCHand,
  rollsRemaining: number,
  currentWinningResult: SCCHandResult | null
): boolean {
  const decision = getSCCBotDecision({
    currentHand,
    rollsRemaining,
    currentWinningResult,
  });
  
  console.log(`[SCC Bot] ${decision.reasoning}`);
  return decision.shouldStopRolling;
}
