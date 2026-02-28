/**
 * YahtzeeGameTable – mirrors HorsesGameTable mobile layout exactly.
 *
 * Two differences from Horses:
 *  1. During MY roll → scorecard replaces the "result badge" in the active player area
 *  2. During OPPONENT's roll → their scorecard replaces the "rolling..." status in the active player area
 *
 * The felt is identical to Horses:
 *  - My turn: "You are rolling" text on felt (dice are in active player area below)
 *  - Opponent turn: their dice fly in on the felt via DiceTableLayout
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { HorsesPlayerArea } from "./HorsesPlayerArea";
import { MusicToggleButton } from "./MusicToggleButton";
import {
  YahtzeeState, YahtzeeCategory, CATEGORY_LABELS,
  UPPER_CATEGORIES, LOWER_CATEGORIES, YahtzeeDie,
} from "@/lib/yahtzeeTypes";
import {
  rollYahtzeeDice, toggleYahtzeeHold,
  scoreYahtzeeCategory, advanceYahtzeeTurn,
} from "@/lib/yahtzeeGameLogic";
import { getPotentialScores, getTotalScore } from "@/lib/yahtzeeScoring";
import {
  getBotHoldDecision, getBotCategoryChoice, shouldBotStopRolling,
} from "@/lib/yahtzeeBotLogic";
import { supabase } from "@/integrations/supabase/client";
import { getBotAlias } from "@/lib/botAlias";
import { cn } from "@/lib/utils";
import { RotateCcw } from "lucide-react";
import { recordGameResult } from "@/lib/gameLogic";
import { endYahtzeeRound } from "@/lib/yahtzeeRoundLogic";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function updateYahtzeeState(roundId: string, state: YahtzeeState): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ yahtzee_state: state } as any)
    .eq("id", roundId);
  return error;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function YahtzeeGameTable({
  gameId, players, currentUserId, pot, anteAmount, dealerPosition,
  currentRoundId, yahtzeeState, onRefetch, isHost = false, onPlayerClick,
}: YahtzeeGameTableProps) {

  const [isRolling, setIsRolling] = useState(false);
  const [uiRolling, setUiRolling] = useState(false);
  const uiRollingTimerRef = useRef<number | null>(null);
  const heldSnapshotRef = useRef<boolean[] | null>(null);
  const botProcessingRef = useRef(false);
  const localRollKeyRef = useRef<number | undefined>(undefined);
  const lastLocalEditAtRef = useRef<number>(0);
  const LOCAL_STATE_PROTECTION_MS = 2000;
  const FIRST_ROLL_MS = 1300;
  const ROLL_AGAIN_MS = 1800;
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Local dice state for smoother interaction during my turn
  const [localDice, setLocalDice] = useState<YahtzeeDie[]>([]);
  const [localRollsRemaining, setLocalRollsRemaining] = useState(3);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  const currentTurnPlayerId = yahtzeeState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const currentTurnState = currentTurnPlayerId ? yahtzeeState?.playerStates?.[currentTurnPlayerId] : null;
  const gamePhase = yahtzeeState?.gamePhase || 'waiting';

  // Other players (everyone except the current turn player) – for the seat row
  const mobileSeatPlayers = currentTurnPlayerId
    ? activePlayers.filter(p => p.id !== currentTurnPlayerId)
    : activePlayers;

  const getPlayerUsername = (player: Player) =>
    player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || 'Player');

  // Scores for player-area badges
  const allTotals = useMemo(() =>
    Object.entries(yahtzeeState?.playerStates || {}).map(([pid, ps]) => ({
      pid, total: getTotalScore(ps.scorecard),
    })), [yahtzeeState?.playerStates]);
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  const rolling = uiRolling || isRolling;
  const rollNumber = Math.min(3, Math.max(1, 4 - localRollsRemaining));
  const showMyDice = isMyTurn && gamePhase === "playing" && localRollsRemaining < 3;

  // Cleanup
  useEffect(() => {
    return () => {
      if (uiRollingTimerRef.current != null) {
        window.clearTimeout(uiRollingTimerRef.current);
      }
    };
  }, []);

  /* ---- Sync local dice with DB ---- */
  useEffect(() => {
    if (!isMyTurn || !myPlayer || !yahtzeeState) return;
    if (Date.now() - lastLocalEditAtRef.current < LOCAL_STATE_PROTECTION_MS) return;
    const ps = yahtzeeState.playerStates[myPlayer.id];
    if (!ps) return;
    setLocalDice(ps.dice);
    setLocalRollsRemaining(ps.rollsRemaining);
  }, [isMyTurn, myPlayer?.id, yahtzeeState?.playerStates, currentTurnPlayerId]);

  /* ---- Roll ---- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || rolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining <= 0) return;

    const isFirstRoll = myPs.rollsRemaining === 3;
    const duration = isFirstRoll ? FIRST_ROLL_MS : ROLL_AGAIN_MS;

    // Snapshot held state before roll
    heldSnapshotRef.current = localDice.map(d => d.isHeld);

    const t = Date.now();
    localRollKeyRef.current = t;
    lastLocalEditAtRef.current = t;

    const newPs = rollYahtzeeDice(myPs);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    // Start UI rolling mask
    setUiRolling(true);
    if (uiRollingTimerRef.current != null) window.clearTimeout(uiRollingTimerRef.current);
    uiRollingTimerRef.current = window.setTimeout(() => {
      setUiRolling(false);
      heldSnapshotRef.current = null;
      uiRollingTimerRef.current = null;
    }, duration);

    const newState = {
      ...yahtzeeState,
      playerStates: {
        ...yahtzeeState.playerStates,
        [myPlayer.id]: { ...newPs, rollKey: t },
      },
    };
    await updateYahtzeeState(currentRoundId, newState);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, rolling, localDice]);

  /* ---- Hold toggle ---- */
  const handleToggleHold = useCallback(async (dieIndex: number) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || rolling) return;
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
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, rolling]);

  /* ---- Score category ---- */
  const handleScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.scorecard.scores[category] !== undefined) return;

    const newPs = scoreYahtzeeCategory(myPs, category);
    let newState = {
      ...yahtzeeState,
      playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
    };
    newState = advanceYahtzeeTurn(newState);
    await updateYahtzeeState(currentRoundId, newState);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    if (newState.gamePhase === 'complete') handleGameComplete(newState);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer]);

  /* ---- Game complete ---- */
  const handleGameComplete = async (finalState: YahtzeeState) => {
    const results = Object.entries(finalState.playerStates)
      .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
      .sort((a, b) => b.total - a.total);
    const maxScore = results[0].total;
    const winners = results.filter(r => r.total === maxScore);

    if (winners.length > 1) {
      await endYahtzeeRound(gameId, null, 'Tie', true);
    } else {
      const winnerId = winners[0].pid;
      const winnerPlayer = players.find(p => p.id === winnerId);
      const winnerName = winnerPlayer ? getPlayerUsername(winnerPlayer) : 'Unknown';
      await supabase.rpc('increment_player_chips', { p_player_id: winnerId, p_amount: pot });
      const chipChanges: Record<string, number> = { [winnerId]: pot };
      recordGameResult(gameId, yahtzeeState?.currentRound || 1, winnerId,
        `${winnerName} wins`, `Score: ${maxScore}`, pot, chipChanges, false, 'yahtzee', null);
      await endYahtzeeRound(gameId, winnerId, `${winnerName} wins with ${maxScore}!`);
    }
  };

  /* ---- Bot logic ---- */
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
          const t = Date.now();
          ps = rollYahtzeeDice(ps);
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: { ...ps, rollKey: t } } };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 1500));

          if (ps.rollsRemaining <= 0 || shouldBotStopRolling(ps)) break;

          const holds = getBotHoldDecision(ps);
          ps = { ...ps, dice: ps.dice.map((d, i) => ({ ...d, isHeld: holds[i] })) };
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
          await updateYahtzeeState(currentRoundId, state);
          await new Promise(r => setTimeout(r, 800));
        }

        const category = getBotCategoryChoice(ps);
        ps = scoreYahtzeeCategory(ps, category);
        state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
        state = advanceYahtzeeTurn(state);
        await updateYahtzeeState(currentRoundId, state);
        if (state.gamePhase === 'complete') await handleGameComplete(state);
      } finally {
        botProcessingRef.current = false;
      }
    };

    const timer = setTimeout(runBot, 1500);
    return () => clearTimeout(timer);
  }, [currentRoundId, currentTurnPlayerId, currentPlayer?.is_bot, gamePhase]);

  /* ---- Scorecard renderer ---- */
  const renderScorecard = (playerId: string, isInteractive: boolean) => {
    const ps = yahtzeeState?.playerStates?.[playerId];
    if (!ps) return null;

    const diceValues = isInteractive && isMyTurn ? localDice.map(d => d.value) : ps.dice.map(d => d.value);
    const rollsUsed = isInteractive && isMyTurn ? localRollsRemaining : ps.rollsRemaining;
    const potentials = isInteractive && rollsUsed < 3 ? getPotentialScores(ps.scorecard, diceValues) : {};

    const renderRow = (categories: YahtzeeCategory[], extra?: React.ReactNode) => (
      <div className="flex gap-1">
        {categories.map(cat => {
          const scored = ps.scorecard.scores[cat];
          const potential = potentials[cat];
          const isAvailable = scored === undefined && isInteractive && isMyTurn && rollsUsed < 3;

          return (
            <button
              key={cat}
              onClick={() => isAvailable ? handleScoreCategory(cat) : undefined}
              disabled={!isAvailable}
              className={cn(
                "flex-1 flex flex-col items-center py-2 px-1 rounded-md border-2 transition-all min-w-0",
                scored !== undefined
                  ? "bg-amber-900/50 border-amber-700/60"
                  : isAvailable
                    ? "bg-amber-800/40 border-poker-gold hover:bg-amber-700/50 cursor-pointer animate-pulse"
                    : "bg-muted/20 border-muted-foreground/30"
              )}
            >
              <span className="font-bold text-amber-200 text-sm leading-tight">{CATEGORY_LABELS[cat]}</span>
              <span className={cn(
                "font-bold tabular-nums text-base leading-tight mt-0.5",
                scored !== undefined ? "text-foreground" : potential !== undefined ? "text-poker-gold/80" : "text-muted-foreground/50"
              )}>
                {scored !== undefined ? scored : potential !== undefined ? potential : '—'}
              </span>
            </button>
          );
        })}
        {extra}
      </div>
    );

    const upperSum = UPPER_CATEGORIES.reduce((s, c) => s + (ps.scorecard.scores[c] ?? 0), 0);

    return (
      <div className="w-full space-y-1.5">
        {renderRow(UPPER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-2 px-1 rounded-md border-2 bg-muted/10 border-muted-foreground/30 min-w-0">
            <span className="font-bold text-amber-200/70 text-sm leading-tight">BN</span>
            <span className="font-bold text-muted-foreground/70 tabular-nums text-base leading-tight mt-0.5">
              {upperSum >= 63 ? '35' : `${upperSum}/63`}
            </span>
          </div>
        ))}
        {renderRow(LOWER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-2 px-1 rounded-md border-2 bg-poker-gold/20 border-poker-gold/60 min-w-0">
            <span className="font-bold text-poker-gold text-sm leading-tight">TOT</span>
            <span className="font-bold text-poker-gold tabular-nums text-base leading-tight mt-0.5">
              {getTotalScore(ps.scorecard)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  /* ---- Loading ---- */
  if (!yahtzeeState || !currentRoundId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-poker-gold animate-pulse text-lg font-bold">Loading Yahtzee...</p>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER – EXACT copy of HorsesGameTable mobile layout            */
  /* ================================================================ */
  return (
    <div
      ref={tableContainerRef}
      className="relative w-full h-full min-h-0 rounded-xl overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at center, hsl(142 30% 25%) 0%, hsl(142 40% 15%) 60%, hsl(142 50% 10%) 100%)",
        boxShadow: "inset 0 0 100px rgba(0,0,0,0.5)",
      }}
    >
      <div className="grid h-full grid-rows-[auto_1fr_auto_auto]">
        {/* -------- HEADER (identical to Horses) -------- */}
        <header className="px-4 pt-4 pb-2 text-center">
          <h1 className="text-xl font-bold text-poker-gold">
            ${anteAmount} YAHTZEE
          </h1>

          <div className="mt-2 flex justify-center">
            <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
              <span className="text-amber-200 text-sm">Pot:</span>
              <span className="text-lg font-bold text-poker-gold">${pot}</span>
            </div>
          </div>
        </header>

        {/* -------- TABLE (seat row + felt) – identical to Horses -------- */}
        <main className="px-3 pb-2 overflow-hidden" aria-label="Yahtzee game table">
          <div className="flex h-full flex-col">
            {/* Other players row – uses HorsesPlayerArea exactly like Horses */}
            <section className="flex gap-3 overflow-x-auto pb-2" aria-label="Players">
              {mobileSeatPlayers.map((player) => {
                const ps = yahtzeeState.playerStates[player.id];
                const total = ps ? getTotalScore(ps.scorecard) : 0;
                const isWinning = total > 0 && total === maxTotal && gamePhase === "complete";
                const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                const isMe = player.user_id === currentUserId;

                return (
                  <div key={player.id} className="shrink-0">
                    <HorsesPlayerArea
                      username={getPlayerUsername(player)}
                      position={player.position}
                      isCurrentTurn={isCurrent}
                      isCurrentUser={isMe}
                      handResult={gamePhase === "complete" && total > 0
                        ? { description: `Score: ${total}`, rank: total, tiebreaker: [] } as any
                        : null}
                      isWinningHand={isWinning}
                      hasTurnCompleted={gamePhase === "complete"}
                      gameType="yahtzee"
                      isBot={player.is_bot}
                      onClick={isHost && player.is_bot && onPlayerClick ? () => onPlayerClick(player) : undefined}
                    />
                  </div>
                );
              })}
            </section>

            {/* Felt (rolls happen here) – identical oval to Horses */}
            <section className="flex-1 flex items-end justify-center pb-3" aria-label="Felt">
              <div className="w-full max-w-[560px] rounded-[32px] border border-border/40 bg-background/10 p-4 backdrop-blur-sm shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col items-center gap-3">
                  {(() => {
                    if (gamePhase !== "playing" || !currentPlayer) {
                      if (gamePhase === "complete") {
                        const results = Object.entries(yahtzeeState.playerStates)
                          .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
                          .sort((a, b) => b.total - a.total);
                        const best = results[0];
                        const winner = players.find(p => p.id === best.pid);
                        return (
                          <div className="mt-1 text-center p-4 bg-amber-900/50 rounded-xl border-2 border-amber-600 w-full">
                            <h3 className="text-xl font-bold text-poker-gold mb-1">Yahtzee Complete!</h3>
                            <p className="text-amber-200 text-sm">
                              {winner ? `${getPlayerUsername(winner)} wins with ${best.total}!` : "Winner determined!"}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }

                    // MY TURN: Show my dice on the felt (like Horses shows "You are rolling")
                    if (isMyTurn && myPlayer) {
                      if (!showMyDice) {
                        return (
                          <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                            You are rolling
                          </p>
                        );
                      }
                      // Show my dice on the felt
                      return (
                        <>
                          <div className="flex gap-2">
                            {localDice.map((die, idx) => {
                              const heldAtRollStart = heldSnapshotRef.current?.[idx] ?? die.isHeld;
                              const shouldAnimate = rolling && !heldAtRollStart;
                              const showHeldStyling = localRollsRemaining > 0 && die.isHeld && !shouldAnimate;

                              return (
                                <HorsesDie
                                  key={idx}
                                  value={die.value}
                                  isHeld={showHeldStyling}
                                  isRolling={shouldAnimate}
                                  canToggle={!rolling && localRollsRemaining > 0 && localRollsRemaining < 3}
                                  onToggle={() => handleToggleHold(idx)}
                                  size="lg"
                                  showWildHighlight={false}
                                />
                              );
                            })}
                          </div>
                          {localRollsRemaining > 0 && localRollsRemaining < 3 && (
                            <p className="text-xs text-amber-200/70">Tap dice to hold/unhold</p>
                          )}
                        </>
                      );
                    }

                    // OPPONENT TURN: Show their dice on the felt (like Horses)
                    const opponentDice = currentTurnState?.dice || [];
                    const hasRolled = opponentDice.some(d => d.value !== 0);
                    if (!hasRolled) {
                      return (
                        <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                          {getPlayerUsername(currentPlayer)} is rolling
                        </p>
                      );
                    }

                    return (
                      <div className="flex gap-2">
                        {opponentDice
                          .filter(d => d.value !== 0)
                          .map((die, idx) => (
                            <HorsesDie
                              key={idx}
                              value={die.value}
                              isHeld={false}
                              isRolling={false}
                              canToggle={false}
                              onToggle={() => {}}
                              size="md"
                              showWildHighlight={false}
                            />
                          ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* -------- ACTIVE PLAYER (fixed section) -------- */}
        <section className="px-3 pb-2" aria-label="Active player">
          <div className="flex justify-center">
            <div className="w-full flex flex-col items-center gap-1">
              {currentPlayer && gamePhase === "playing" ? (
                <div className="w-full">
                  {/* Active player name label */}
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-poker-gold">
                      {isMyTurn ? getPlayerUsername(currentPlayer) : getPlayerUsername(currentPlayer)}
                    </span>
                    <span className="text-xs text-muted-foreground">Seat {currentPlayer.position}</span>
                    {isMyTurn && localRollsRemaining === 0 && (
                      <Badge variant="outline" className="text-xs border-poker-gold text-poker-gold">Pick a category</Badge>
                    )}
                    {!isMyTurn && (
                      <span className="text-xs text-amber-400 animate-pulse">Rolling...</span>
                    )}
                  </div>
                  {/* Scorecard - interactive for me, read-only for opponent */}
                  {renderScorecard(isMyTurn ? myPlayer!.id : currentTurnPlayerId!, isMyTurn)}
                </div>
              ) : !currentPlayer ? (
                <div className="rounded-lg border border-border/50 bg-background/15 px-4 py-3 text-sm text-muted-foreground">
                  Waiting for the next turn...
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* -------- FOOTER – identical to Horses -------- */}
        <footer
          className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
          aria-label="Actions"
        >
          <div className="flex items-center justify-center gap-3">
            <MusicToggleButton variant="compact" />

            {isMyTurn && gamePhase === "playing" ? (
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 backdrop-blur-sm">
                <Button
                  onClick={handleRoll}
                  disabled={localRollsRemaining <= 0 || rolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1 animate-slow-pulse-red" />
                  Roll{localRollsRemaining === 3 ? "" : " Again"}
                </Button>
              </div>
            ) : (
              <div className="h-10" />
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
