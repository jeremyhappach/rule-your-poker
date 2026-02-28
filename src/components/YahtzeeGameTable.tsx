/**
 * YahtzeeGameTable - Placeholder component for Yahtzee dice game
 * Will be expanded with full scorecard, dice area, and turn management
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { TurnSpotlight } from "./TurnSpotlight";
import { YahtzeeState, YahtzeeCategory, CATEGORY_LABELS, UPPER_CATEGORIES, LOWER_CATEGORIES } from "@/lib/yahtzeeTypes";
import { rollYahtzeeDice, toggleYahtzeeHold, scoreYahtzeeCategory, advanceYahtzeeTurn } from "@/lib/yahtzeeGameLogic";
import { getPotentialScores, getTotalScore } from "@/lib/yahtzeeScoring";
import { getBotHoldDecision, getBotCategoryChoice, shouldBotStopRolling } from "@/lib/yahtzeeBotLogic";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
import { cn } from "@/lib/utils";
import { Dice5, Lock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { recordGameResult } from "@/lib/gameLogic";
import { endYahtzeeRound } from "@/lib/yahtzeeRoundLogic";

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot: boolean;
  sitting_out: boolean;
  profiles?: { username: string };
}

interface YahtzeeGameTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  yahtzeeState: YahtzeeState | null;
  onRefetch: () => void;
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
}

async function updateYahtzeeState(roundId: string, state: YahtzeeState): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ yahtzee_state: state } as any)
    .eq("id", roundId);
  return error;
}

export function YahtzeeGameTable({
  gameId,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  currentRoundId,
  yahtzeeState,
  onRefetch,
  isHost = false,
  onPlayerClick,
}: YahtzeeGameTableProps) {
  const isMobile = useIsMobile();
  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef(false);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  const currentTurnPlayerId = yahtzeeState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const myState = myPlayer && yahtzeeState?.playerStates?.[myPlayer.id];
  const currentTurnState = currentTurnPlayerId ? yahtzeeState?.playerStates?.[currentTurnPlayerId] : null;
  const gamePhase = yahtzeeState?.gamePhase || 'waiting';

  const getPlayerUsername = (player: Player) => {
    if (player.is_bot) {
      return getBotAlias(players, player.user_id);
    }
    return player.profiles?.username || 'Player';
  };

  // Get highest total score for highlighting
  const allTotals = Object.entries(yahtzeeState?.playerStates || {}).map(([pid, ps]) => ({
    pid,
    total: getTotalScore(ps.scorecard),
  }));
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  // Handle roll
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || isRolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining <= 0) return;

    setIsRolling(true);
    const newPs = rollYahtzeeDice(myPs);
    const newState = {
      ...yahtzeeState,
      playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
    };

    await updateYahtzeeState(currentRoundId, newState);
    setTimeout(() => setIsRolling(false), 800);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, isRolling]);

  // Handle hold toggle
  const handleToggleHold = useCallback(async (dieIndex: number) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.rollsRemaining === 0) return;

    const newPs = toggleYahtzeeHold(myPs, dieIndex);
    const newState = {
      ...yahtzeeState,
      playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
    };
    await updateYahtzeeState(currentRoundId, newState);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer]);

  // Handle category selection
  const handleScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3) return;
    if (myPs.scorecard.scores[category] !== undefined) return;

    const newPs = scoreYahtzeeCategory(myPs, category);
    let newState = {
      ...yahtzeeState,
      playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
    };

    // Advance turn
    newState = advanceYahtzeeTurn(newState);
    await updateYahtzeeState(currentRoundId, newState);

    // Check if game is over
    if (newState.gamePhase === 'complete') {
      handleGameComplete(newState);
    }
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer]);

  // Handle game completion
  const handleGameComplete = async (finalState: YahtzeeState) => {
    const results = Object.entries(finalState.playerStates).map(([pid, ps]) => ({
      pid,
      total: getTotalScore(ps.scorecard),
    }));
    results.sort((a, b) => b.total - a.total);

    const maxScore = results[0].total;
    const winners = results.filter(r => r.total === maxScore);
    const isTie = winners.length > 1;

    if (isTie) {
      await endYahtzeeRound(gameId, null, 'Tie', true);
    } else {
      const winnerId = winners[0].pid;
      const winnerPlayer = players.find(p => p.id === winnerId);
      const winnerName = winnerPlayer ? getPlayerUsername(winnerPlayer) : 'Unknown';

      // Award pot
      await supabase.rpc('increment_player_chips', {
        p_player_id: winnerId,
        p_amount: pot,
      });

      // Record result
      const chipChanges: Record<string, number> = {};
      chipChanges[winnerId] = pot;
      recordGameResult(
        gameId, yahtzeeState?.currentRound || 1, winnerId,
        `${winnerName} wins`, `Score: ${maxScore}`,
        pot, chipChanges, false, 'yahtzee',
        null,
      );

      await endYahtzeeRound(gameId, winnerId, `${winnerName} wins with ${maxScore}!`);
    }
  };

  // Bot logic
  useEffect(() => {
    if (!currentRoundId || !yahtzeeState || gamePhase !== 'playing') return;
    if (!currentTurnPlayerId || !currentPlayer?.is_bot) return;
    if (botProcessingRef.current) return;

    const controllerUserId = yahtzeeState.botControllerUserId;
    if (controllerUserId && controllerUserId !== currentUserId) return;

    botProcessingRef.current = true;

    const runBot = async () => {
      try {
        let state = { ...yahtzeeState };
        let ps = { ...state.playerStates[currentTurnPlayerId] };

        // Roll up to 3 times
        for (let roll = 0; roll < 3; roll++) {
          if (ps.rollsRemaining <= 0) break;

          // Roll
          ps = rollYahtzeeDice(ps);
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 1200));

          if (ps.rollsRemaining <= 0) break;
          if (shouldBotStopRolling(ps)) break;

          // Hold decision
          const holds = getBotHoldDecision(ps);
          const newDice = ps.dice.map((d, i) => ({ ...d, isHeld: holds[i] }));
          ps = { ...ps, dice: newDice };
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 800));
        }

        // Score
        const category = getBotCategoryChoice(ps);
        ps = scoreYahtzeeCategory(ps, category);
        state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
        state = advanceYahtzeeTurn(state);
        await updateYahtzeeState(currentRoundId, state);

        if (state.gamePhase === 'complete') {
          await handleGameComplete(state);
        }
      } finally {
        botProcessingRef.current = false;
      }
    };

    const timer = setTimeout(runBot, 1500);
    return () => clearTimeout(timer);
  }, [currentRoundId, currentTurnPlayerId, currentPlayer?.is_bot, gamePhase]);

  // Dice display for current turn
  const displayDice = currentTurnState?.dice || [];
  const displayRolls = currentTurnState?.rollsRemaining ?? 3;

  // Loading state
  if (!yahtzeeState || !currentRoundId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-poker-gold animate-pulse text-lg font-bold">Loading Yahtzee...</p>
      </div>
    );
  }

  // Two-row scorecard component
  const renderScorecard = (playerId: string, isActive: boolean) => {
    const ps = yahtzeeState.playerStates[playerId];
    if (!ps) return null;

    const diceValues = ps.dice.map(d => d.value);
    const potentials = isActive && ps.rollsRemaining < 3 ? getPotentialScores(ps.scorecard, diceValues) : {};

    return (
      <div className="w-full space-y-1">
        {/* Row 1: Upper section */}
        <div className="flex gap-0.5">
          {UPPER_CATEGORIES.map(cat => {
            const scored = ps.scorecard.scores[cat];
            const potential = potentials[cat];
            const isAvailable = scored === undefined && isActive && isMyTurn && ps.rollsRemaining < 3;

            return (
              <button
                key={cat}
                onClick={() => isAvailable ? handleScoreCategory(cat) : undefined}
                disabled={!isAvailable}
                className={cn(
                  "flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border transition-all min-w-0",
                  scored !== undefined
                    ? "bg-amber-900/40 border-amber-700/50"
                    : isAvailable
                      ? "bg-amber-800/30 border-poker-gold hover:bg-amber-700/50 cursor-pointer"
                      : "bg-muted/20 border-muted-foreground/20"
                )}
              >
                <span className="font-bold text-amber-200 text-[10px]">{CATEGORY_LABELS[cat]}</span>
                <span className={cn(
                  "font-bold tabular-nums",
                  scored !== undefined ? "text-white" : potential !== undefined ? "text-poker-gold/70" : "text-muted-foreground/40"
                )}>
                  {scored !== undefined ? scored : potential !== undefined ? potential : '—'}
                </span>
              </button>
            );
          })}
          {/* Upper bonus indicator */}
          <div className="flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border bg-muted/10 border-muted-foreground/20 min-w-0">
            <span className="font-bold text-amber-200/60 text-[10px]">BN</span>
            <span className="font-bold text-muted-foreground/60 tabular-nums">
              {(() => {
                const upper = UPPER_CATEGORIES.reduce((s, c) => s + (ps.scorecard.scores[c] ?? 0), 0);
                return upper >= 63 ? '35' : `${upper}/63`;
              })()}
            </span>
          </div>
        </div>
        {/* Row 2: Lower section */}
        <div className="flex gap-0.5">
          {LOWER_CATEGORIES.map(cat => {
            const scored = ps.scorecard.scores[cat];
            const potential = potentials[cat];
            const isAvailable = scored === undefined && isActive && isMyTurn && ps.rollsRemaining < 3;

            return (
              <button
                key={cat}
                onClick={() => isAvailable ? handleScoreCategory(cat) : undefined}
                disabled={!isAvailable}
                className={cn(
                  "flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border transition-all min-w-0",
                  scored !== undefined
                    ? "bg-amber-900/40 border-amber-700/50"
                    : isAvailable
                      ? "bg-amber-800/30 border-poker-gold hover:bg-amber-700/50 cursor-pointer"
                      : "bg-muted/20 border-muted-foreground/20"
                )}
              >
                <span className="font-bold text-amber-200 text-[10px]">{CATEGORY_LABELS[cat]}</span>
                <span className={cn(
                  "font-bold tabular-nums",
                  scored !== undefined ? "text-white" : potential !== undefined ? "text-poker-gold/70" : "text-muted-foreground/40"
                )}>
                  {scored !== undefined ? scored : potential !== undefined ? potential : '—'}
                </span>
              </button>
            );
          })}
          {/* Total */}
          <div className="flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border bg-poker-gold/20 border-poker-gold/50 min-w-0">
            <span className="font-bold text-poker-gold text-[10px]">TOT</span>
            <span className="font-bold text-poker-gold tabular-nums">
              {getTotalScore(ps.scorecard)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col items-center justify-center relative">
      {/* Player scores around the edges */}
      <div className="absolute top-2 left-0 right-0 flex justify-center gap-4 px-4">
        {activePlayers.map(player => {
          const ps = yahtzeeState.playerStates[player.id];
          if (!ps) return null;
          const total = getTotalScore(ps.scorecard);
          const isWinning = total > 0 && total === maxTotal;
          const isTurn = player.id === currentTurnPlayerId;
          return (
            <div key={player.id} className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-lg border",
              isTurn ? "border-poker-gold bg-amber-900/40" : "border-muted-foreground/20 bg-muted/10"
            )}>
              <span className="text-amber-200 text-xs font-medium">{getPlayerUsername(player)}</span>
              <span className={cn(
                "font-bold tabular-nums text-sm",
                isWinning ? "text-poker-gold" : "text-muted-foreground"
              )}>
                {total}
              </span>
            </div>
          );
        })}
      </div>

      {/* Center: Dice area */}
      <div className="flex flex-col items-center gap-3 mt-12">
        {/* Current player indicator */}
        <div className="text-center">
          <span className="text-poker-gold font-bold text-sm">
            {currentPlayer ? getPlayerUsername(currentPlayer) : ''}
            {isMyTurn ? ' (You)' : "'s turn"}
          </span>
          <span className="text-amber-200/60 text-xs ml-2">
            Roll {3 - displayRolls}/3
          </span>
        </div>

        {/* Dice */}
        <div className="flex gap-2">
          {displayDice.map((die, idx) => (
            <HorsesDie
              key={idx}
              value={die.value}
              isHeld={die.isHeld}
              isRolling={isRolling && !die.isHeld}
              canToggle={isMyTurn && displayRolls < 3 && displayRolls > 0}
              onToggle={() => handleToggleHold(idx)}
              size="lg"
              showWildHighlight={false}
            />
          ))}
        </div>

        {/* Roll button */}
        {isMyTurn && displayRolls > 0 && (
          <Button
            onClick={handleRoll}
            disabled={isRolling}
            className="bg-poker-gold text-black hover:bg-amber-400 font-bold px-6"
          >
            <Dice5 className="w-4 h-4 mr-2" />
            {displayRolls === 3 ? 'Roll' : 'Roll Again'}
          </Button>
        )}

        {/* Scorecard below dice */}
        {isMyTurn && myPlayer && (
          <div className="w-full max-w-lg mt-2">
            {renderScorecard(myPlayer.id, true)}
          </div>
        )}

        {/* When not my turn, show opponent's scorecard */}
        {!isMyTurn && currentTurnPlayerId && (
          <div className="w-full max-w-lg mt-2">
            <p className="text-amber-200/60 text-xs text-center mb-1">
              {currentPlayer ? getPlayerUsername(currentPlayer) : ''}'s Scorecard
            </p>
            {renderScorecard(currentTurnPlayerId, false)}
          </div>
        )}
      </div>
    </div>
  );
}
