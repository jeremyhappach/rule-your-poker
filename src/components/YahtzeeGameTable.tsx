/**
 * YahtzeeGameTable - Dice game using the same felt layout as Horses/SCC.
 * Uses DiceTableLayout for scatter + fly-in animation and player circles for scores.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiceTableLayout } from "./DiceTableLayout";
import { TurnSpotlight } from "./TurnSpotlight";
import { YahtzeeState, YahtzeeCategory, CATEGORY_LABELS, UPPER_CATEGORIES, LOWER_CATEGORIES } from "@/lib/yahtzeeTypes";
import { rollYahtzeeDice, toggleYahtzeeHold, scoreYahtzeeCategory, advanceYahtzeeTurn, createInitialPlayerState } from "@/lib/yahtzeeGameLogic";
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
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { YahtzeeDie, YahtzeePlayerState } from "@/lib/yahtzeeTypes";

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

/** Convert YahtzeeDie[] to HorsesDieType[] for DiceTableLayout compatibility */
function toHorsesDice(dice: YahtzeeDie[]): HorsesDieType[] {
  return dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
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
  const localRollKeyRef = useRef<number | undefined>(undefined);
  const lastLocalEditAtRef = useRef<number>(0);
  const LOCAL_STATE_PROTECTION_MS = 2000;
  const initializingRef = useRef(false);

  // Local dice state for the active player (smoother interaction)
  const [localDice, setLocalDice] = useState<YahtzeeDie[]>([]);
  const [localRollsRemaining, setLocalRollsRemaining] = useState(3);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  const currentTurnPlayerId = yahtzeeState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const myState = myPlayer && yahtzeeState?.playerStates?.[myPlayer.id];
  const currentTurnState = currentTurnPlayerId ? yahtzeeState?.playerStates?.[currentTurnPlayerId] : null;
  const gamePhase = yahtzeeState?.gamePhase || 'waiting';

  const getPlayerUsername = (player: Player) => {
    if (player.is_bot) return getBotAlias(players, player.user_id);
    return player.profiles?.username || 'Player';
  };

  // Get highest total score for highlighting
  const allTotals = useMemo(() =>
    Object.entries(yahtzeeState?.playerStates || {}).map(([pid, ps]) => ({
      pid,
      total: getTotalScore(ps.scorecard),
    })),
    [yahtzeeState?.playerStates]
  );
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  // Sync local dice with DB state when it's my turn
  useEffect(() => {
    if (!isMyTurn || !myPlayer || !yahtzeeState) return;
    const timeSinceEdit = Date.now() - lastLocalEditAtRef.current;
    if (timeSinceEdit < LOCAL_STATE_PROTECTION_MS) return;

    const ps = yahtzeeState.playerStates[myPlayer.id];
    if (!ps) return;
    setLocalDice(ps.dice);
    setLocalRollsRemaining(ps.rollsRemaining);
  }, [isMyTurn, myPlayer?.id, yahtzeeState?.playerStates, currentTurnPlayerId]);

  // Handle roll
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || isRolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining <= 0) return;

    const rollStartTime = Date.now();
    localRollKeyRef.current = rollStartTime;
    lastLocalEditAtRef.current = rollStartTime;

    const newPs = rollYahtzeeDice(myPs);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);
    setIsRolling(true);

    // Save to DB immediately for observers
    const newState = {
      ...yahtzeeState,
      playerStates: {
        ...yahtzeeState.playerStates,
        [myPlayer.id]: { ...newPs, rollKey: rollStartTime },
      },
    };
    await updateYahtzeeState(currentRoundId, newState);

    setTimeout(() => setIsRolling(false), 1300);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, isRolling]);

  // Handle hold toggle
  const handleToggleHold = useCallback(async (dieIndex: number) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.rollsRemaining === 0) return;

    lastLocalEditAtRef.current = Date.now();
    const newPs = toggleYahtzeeHold(myPs, dieIndex);
    setLocalDice(newPs.dice);

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

    newState = advanceYahtzeeTurn(newState);
    await updateYahtzeeState(currentRoundId, newState);

    // Reset local state for next turn
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

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

      await supabase.rpc('increment_player_chips', {
        p_player_id: winnerId,
        p_amount: pot,
      });

      const chipChanges: Record<string, number> = {};
      chipChanges[winnerId] = pot;
      recordGameResult(
        gameId, yahtzeeState?.currentRound || 1, winnerId,
        `${winnerName} wins`, `Score: ${maxScore}`,
        pot, chipChanges, false, 'yahtzee', null,
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

        for (let roll = 0; roll < 3; roll++) {
          if (ps.rollsRemaining <= 0) break;

          const rollTime = Date.now();
          ps = rollYahtzeeDice(ps);
          state = {
            ...state,
            playerStates: {
              ...state.playerStates,
              [currentTurnPlayerId]: { ...ps, rollKey: rollTime },
            },
          };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 1500));

          if (ps.rollsRemaining <= 0) break;
          if (shouldBotStopRolling(ps)) break;

          const holds = getBotHoldDecision(ps);
          const newDice = ps.dice.map((d, i) => ({ ...d, isHeld: holds[i] }));
          ps = { ...ps, dice: newDice };
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 800));
        }

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

  // Determine dice to display
  const displayDice = isMyTurn ? localDice : (currentTurnState?.dice || []);
  const displayRolls = isMyTurn ? localRollsRemaining : (currentTurnState?.rollsRemaining ?? 3);
  const displayRollKey = isMyTurn
    ? localRollKeyRef.current
    : (currentTurnState as any)?.rollKey;

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

    const diceValues = isActive ? (isMyTurn ? localDice : ps.dice).map(d => d.value) : ps.dice.map(d => d.value);
    const rollsUsed = isActive ? (isMyTurn ? localRollsRemaining : ps.rollsRemaining) : ps.rollsRemaining;
    const potentials = isActive && rollsUsed < 3 ? getPotentialScores(ps.scorecard, diceValues) : {};

    return (
      <div className="w-full space-y-1">
        {/* Row 1: Upper section */}
        <div className="flex gap-0.5">
          {UPPER_CATEGORIES.map(cat => {
            const scored = ps.scorecard.scores[cat];
            const potential = potentials[cat];
            const isAvailable = scored === undefined && isActive && isMyTurn && rollsUsed < 3;

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
                  scored !== undefined ? "text-foreground" : potential !== undefined ? "text-poker-gold/70" : "text-muted-foreground/40"
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
            const isAvailable = scored === undefined && isActive && isMyTurn && rollsUsed < 3;

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
                  scored !== undefined ? "text-foreground" : potential !== undefined ? "text-poker-gold/70" : "text-muted-foreground/40"
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

  // Has the current turn player rolled at least once?
  const hasRolled = displayDice.some(d => d.value !== 0);

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <header className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
        <h1 className="text-xl font-bold text-poker-gold">
          ${anteAmount} YAHTZEE
        </h1>
      </header>

      {/* Pot display */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
          <span className="text-amber-200 text-sm">Pot:</span>
          <span className="text-lg font-bold text-poker-gold">${pot}</span>
        </div>
      </div>

      {/* Turn status */}
      {gamePhase === "playing" && currentPlayer && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/20 px-3 py-1 backdrop-blur-sm">
            <Dice5 className="h-4 w-4 text-amber-300" />
            <span className="text-sm text-foreground/90">
              {isMyTurn ? "Your turn" : `${getPlayerUsername(currentPlayer)}'s turn`}
            </span>
            <Badge variant="secondary" className="text-xs">
              Rolls: {displayRolls}
            </Badge>
          </div>
        </div>
      )}

      {/* Main felt area */}
      <main className={cn("absolute inset-0 pt-28", isMobile ? "px-3 pb-48" : "p-4 pb-40")} aria-label="Yahtzee dice table">
        <div className="relative w-full h-full">
          {/* Player circles around the table */}
          {activePlayers.map((player, idx) => {
            const ps = yahtzeeState.playerStates[player.id];
            const total = ps ? getTotalScore(ps.scorecard) : 0;
            const isWinning = total > 0 && total === maxTotal;
            const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
            const isMe = player.user_id === currentUserId;

            // Calculate position around the table (desktop ring)
            const totalPlayers = activePlayers.length;
            const angle = (idx / totalPlayers) * 2 * Math.PI - Math.PI / 2;
            const centerX = 50;
            const centerY = 48;
            const radiusX = 40;
            const radiusY = 28;
            const x = centerX + radiusX * Math.cos(angle);
            const y = centerY + radiusY * Math.sin(angle);

            return (
              <div
                key={player.id}
                className="absolute z-[105] transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={isHost && player.is_bot && onPlayerClick ? () => onPlayerClick(player) : undefined}
              >
                <div className={cn(
                  "relative flex flex-col items-center gap-1 p-2 rounded-lg border-2 min-w-[80px]",
                  isCurrent && "border-yellow-500 bg-yellow-500/10 z-[110]",
                  isWinning && !isCurrent && "border-green-500 bg-green-500/20",
                  !isCurrent && !isWinning && "border-border/50 bg-black/30",
                  isMe && "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent",
                  isHost && player.is_bot && onPlayerClick && "cursor-pointer hover:bg-white/5 transition-colors"
                )}>
                  {/* Bouncing dice icon for current turn */}
                  {isCurrent && (
                    <Dice5 className="w-4 h-4 text-yellow-400 animate-bounce absolute -top-3" />
                  )}

                  <span className="text-xs text-amber-200 font-medium truncate max-w-[80px]">
                    {getPlayerUsername(player)}
                  </span>

                  {/* Score display */}
                  <span className={cn(
                    "text-lg font-bold tabular-nums",
                    isWinning ? "text-poker-gold" : "text-muted-foreground"
                  )}>
                    {total}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Dice on the felt center - observer view */}
          {gamePhase === "playing" && currentPlayer && !isMyTurn && hasRolled && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
              <DiceTableLayout
                key={currentTurnPlayerId ?? "no-turn"}
                dice={toHorsesDice(displayDice)}
                isRolling={false}
                canToggle={false}
                size="sm"
                gameType="yahtzee"
                showWildHighlight={false}
                isObserver={true}
                hideUnrolledDice={true}
                rollKey={displayRollKey}
                cacheKey={currentTurnPlayerId ?? "no-turn"}
              />
            </div>
          )}

          {/* My turn - "You are rolling" message on felt */}
          {isMyTurn && gamePhase === "playing" && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
              <DiceTableLayout
                dice={[]}
                isRolling={false}
                canToggle={false}
                size="sm"
                gameType="yahtzee"
                showRollingMessage={true}
              />
            </div>
          )}

          {/* Game complete message */}
          {gamePhase === "complete" && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="text-center p-6 bg-amber-900/50 rounded-xl border-2 border-amber-600 backdrop-blur-sm">
                <h3 className="text-2xl font-bold text-poker-gold mb-2">Yahtzee Complete!</h3>
                <p className="text-amber-200">
                  {(() => {
                    const results = Object.entries(yahtzeeState.playerStates).map(([pid, ps]) => ({
                      pid, total: getTotalScore(ps.scorecard),
                    }));
                    results.sort((a, b) => b.total - a.total);
                    const best = results[0];
                    const winner = players.find(p => p.id === best.pid);
                    return winner ? `${getPlayerUsername(winner)} wins with ${best.total}!` : "Winner determined!";
                  })()}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer: My dice + scorecard (when it's my turn) OR opponent scorecard */}
      <footer className="absolute bottom-0 left-0 right-0 z-20 bg-background/80 backdrop-blur-sm border-t border-border/30 px-3 py-2">
        {isMyTurn && myPlayer && gamePhase === "playing" ? (
          <div className="flex flex-col items-center gap-2 max-w-lg mx-auto">
            {/* My dice with DiceTableLayout */}
            <div className="relative w-full h-24">
              <DiceTableLayout
                dice={toHorsesDice(localDice)}
                isRolling={isRolling}
                canToggle={displayRolls < 3 && displayRolls > 0}
                onToggleHold={handleToggleHold}
                size="md"
                gameType="yahtzee"
                showWildHighlight={false}
                rollKey={localRollKeyRef.current}
                cacheKey={myPlayer.id}
              />
            </div>

            {/* Roll button */}
            {displayRolls > 0 && (
              <Button
                onClick={handleRoll}
                disabled={isRolling}
                className="bg-poker-gold text-black hover:bg-amber-400 font-bold px-6"
              >
                <Dice5 className="w-4 h-4 mr-2" />
                {displayRolls === 3 ? 'Roll' : 'Roll Again'}
              </Button>
            )}

            {/* Scorecard */}
            {renderScorecard(myPlayer.id, true)}
          </div>
        ) : currentTurnPlayerId && gamePhase === "playing" ? (
          <div className="max-w-lg mx-auto">
            <p className="text-amber-200/60 text-xs text-center mb-1">
              {currentPlayer ? getPlayerUsername(currentPlayer) : ''}'s Scorecard
            </p>
            {renderScorecard(currentTurnPlayerId, false)}
          </div>
        ) : myPlayer ? (
          <div className="max-w-lg mx-auto">
            <p className="text-amber-200/60 text-xs text-center mb-1">Your Scorecard</p>
            {renderScorecard(myPlayer.id, false)}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
