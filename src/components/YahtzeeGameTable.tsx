/**
 * YahtzeeGameTable – mirrors HorsesGameTable layout exactly (mobile only).
 *
 * Two differences from Horses:
 *  1. During MY roll → my scorecard shows on the felt (below the dice)
 *  2. During OPPONENT's roll → their scorecard shows in the active player area
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { HorsesPlayerArea } from "./HorsesPlayerArea";
import { TurnSpotlight } from "./TurnSpotlight";
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
import { Dice5, RotateCcw } from "lucide-react";
import { recordGameResult } from "@/lib/gameLogic";
import { endYahtzeeRound } from "@/lib/yahtzeeRoundLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";

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

function toHorsesDice(dice: YahtzeeDie[]): HorsesDieType[] {
  return dice.map(d => ({ value: d.value, isHeld: d.isHeld }));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function YahtzeeGameTable({
  gameId, players, currentUserId, pot, anteAmount, dealerPosition,
  currentRoundId, yahtzeeState, onRefetch, isHost = false, onPlayerClick,
}: YahtzeeGameTableProps) {

  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef(false);
  const localRollKeyRef = useRef<number | undefined>(undefined);
  const lastLocalEditAtRef = useRef<number>(0);
  const LOCAL_STATE_PROTECTION_MS = 2000;
  const ROLL_ANIMATION_MS = 1300;
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
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || isRolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining <= 0) return;

    const t = Date.now();
    localRollKeyRef.current = t;
    lastLocalEditAtRef.current = t;

    const newPs = rollYahtzeeDice(myPs);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);
    setIsRolling(true);

    const newState = {
      ...yahtzeeState,
      playerStates: {
        ...yahtzeeState.playerStates,
        [myPlayer.id]: { ...newPs, rollKey: t },
      },
    };
    await updateYahtzeeState(currentRoundId, newState);
    setTimeout(() => setIsRolling(false), ROLL_ANIMATION_MS);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, isRolling]);

  /* ---- Hold toggle ---- */
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

  /* ---- Derived display values ---- */
  const displayDice = isMyTurn ? localDice : (currentTurnState?.dice || []);
  const displayRolls = isMyTurn ? localRollsRemaining : (currentTurnState?.rollsRemaining ?? 3);
  const displayRollKey = isMyTurn ? localRollKeyRef.current : (currentTurnState as any)?.rollKey;
  const hasRolled = displayDice.some(d => d.value !== 0);

  /* ---- Scorecard renderer ---- */
  const renderScorecard = (playerId: string, isActive: boolean) => {
    const ps = yahtzeeState?.playerStates?.[playerId];
    if (!ps) return null;

    const diceValues = isActive && isMyTurn ? localDice.map(d => d.value) : ps.dice.map(d => d.value);
    const rollsUsed = isActive && isMyTurn ? localRollsRemaining : ps.rollsRemaining;
    const potentials = isActive && rollsUsed < 3 ? getPotentialScores(ps.scorecard, diceValues) : {};

    const renderRow = (categories: YahtzeeCategory[], extra?: React.ReactNode) => (
      <div className="flex gap-0.5">
        {categories.map(cat => {
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
                    ? "bg-amber-800/30 border-poker-gold hover:bg-amber-700/50 cursor-pointer animate-pulse"
                    : "bg-muted/20 border-muted-foreground/20"
              )}
            >
              <span className="font-bold text-amber-200 text-[10px] leading-tight">{CATEGORY_LABELS[cat]}</span>
              <span className={cn(
                "font-bold tabular-nums text-xs leading-tight",
                scored !== undefined ? "text-foreground" : potential !== undefined ? "text-poker-gold/70" : "text-muted-foreground/40"
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
      <div className="w-full space-y-0.5">
        {renderRow(UPPER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border bg-muted/10 border-muted-foreground/20 min-w-0">
            <span className="font-bold text-amber-200/60 text-[10px] leading-tight">BN</span>
            <span className="font-bold text-muted-foreground/60 tabular-nums text-xs leading-tight">
              {upperSum >= 63 ? '35' : `${upperSum}/63`}
            </span>
          </div>
        ))}
        {renderRow(LOWER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-1 px-0.5 rounded text-xs border bg-poker-gold/20 border-poker-gold/50 min-w-0">
            <span className="font-bold text-poker-gold text-[10px] leading-tight">TOT</span>
            <span className="font-bold text-poker-gold tabular-nums text-xs leading-tight">
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
  /*  RENDER – mirrors HorsesGameTable mobile layout exactly          */
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
        {/* -------- HEADER -------- */}
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

        {/* -------- TABLE (felt + seat row) -------- */}
        <main className="px-3 pb-2 overflow-hidden" aria-label="Yahtzee game table">
          <div className="flex h-full flex-col">
            {/* Other players row */}
            <section className="flex gap-3 overflow-x-auto pb-2" aria-label="Players">
              {mobileSeatPlayers.map((player) => {
                const ps = yahtzeeState.playerStates[player.id];
                const total = ps ? getTotalScore(ps.scorecard) : 0;
                const isWinning = total > 0 && total === maxTotal;
                const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                const isMe = player.user_id === currentUserId;

                return (
                  <div key={player.id} className="shrink-0">
                    <div className={cn(
                      "relative flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 min-w-[80px]",
                      isCurrent && "border-yellow-500 bg-yellow-500/10",
                      isWinning && !isCurrent && "border-green-500 bg-green-500/20",
                      !isCurrent && !isWinning && "border-border/50 bg-black/30",
                      isMe && "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent",
                    )}>
                      {isCurrent && (
                        <Dice5 className="w-4 h-4 text-yellow-400 animate-bounce absolute -top-3" />
                      )}
                      <span className="text-xs text-amber-200 font-medium truncate max-w-[80px]">
                        {getPlayerUsername(player)}
                      </span>
                      <span className={cn(
                        "text-sm font-bold tabular-nums",
                        isWinning ? "text-poker-gold" : "text-muted-foreground"
                      )}>
                        {total}
                      </span>
                    </div>
                  </div>
                );
              })}
            </section>

            {/* Felt area */}
            <section className="flex-1 flex items-end justify-center pb-3" aria-label="Felt">
              <div className="w-full max-w-[560px] rounded-[32px] border border-border/40 bg-background/10 p-4 backdrop-blur-sm shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]">
                <div className="flex flex-col items-center gap-3">
                  {/* Dice display area */}
                  <div className="flex gap-2">
                    {(() => {
                      if (gamePhase !== "playing" || !currentPlayer) return null;

                      // My turn – show my dice inline (same as Horses shows them for the roller)
                      if (isMyTurn) {
                        if (!hasRolled) {
                          return (
                            <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                              You are rolling
                            </p>
                          );
                        }
                        // Show dice inline after rolling
                        return localDice
                          .filter(d => d.value !== 0)
                          .map((die, idx) => (
                            <HorsesDie
                              key={idx}
                              value={die.value}
                              isHeld={die.isHeld}
                              isRolling={isRolling && !die.isHeld}
                              canToggle={displayRolls < 3 && displayRolls > 0}
                              onToggle={() => handleToggleHold(idx)}
                              size="md"
                              showWildHighlight={false}
                            />
                          ));
                      }

                      // Opponent's turn – show their dice on the felt
                      if (!hasRolled) return null;
                      return displayDice
                        .filter(d => d.value !== 0)
                        .map((die, idx) => (
                          <HorsesDie
                            key={idx}
                            value={die.value}
                            isHeld={false}
                            isRolling={false}
                            canToggle={false}
                            onToggle={() => { }}
                            size="md"
                            showWildHighlight={false}
                          />
                        ));
                    })()}
                  </div>

                  {/* Hold hint */}
                  {isMyTurn && hasRolled && displayRolls > 0 && displayRolls < 3 && (
                    <p className="text-xs text-amber-200/70">Tap dice to hold/unhold</p>
                  )}

                  {/* MY TURN: Scorecard on the felt */}
                  {isMyTurn && myPlayer && hasRolled && (
                    <div className="w-full mt-1">
                      {renderScorecard(myPlayer.id, true)}
                    </div>
                  )}

                  {/* Game complete */}
                  {gamePhase === "complete" && (
                    <div className="mt-1 text-center p-4 bg-amber-900/50 rounded-xl border-2 border-amber-600 w-full">
                      <h3 className="text-xl font-bold text-poker-gold mb-1">Yahtzee Complete!</h3>
                      <p className="text-amber-200 text-sm">
                        {(() => {
                          const results = Object.entries(yahtzeeState.playerStates)
                            .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
                            .sort((a, b) => b.total - a.total);
                          const best = results[0];
                          const winner = players.find(p => p.id === best.pid);
                          return winner ? `${getPlayerUsername(winner)} wins with ${best.total}!` : "Winner determined!";
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>

        {/* -------- ACTIVE PLAYER AREA -------- */}
        <section className="px-3 pb-2" aria-label="Active player">
          <div className="flex justify-center">
            <div className="w-full max-w-sm flex flex-col items-center gap-2">
              {currentPlayer ? (
                isMyTurn ? (
                  /* My turn: show my player area with score (no scorecard – that's on the felt) */
                  <div className={cn(
                    "relative flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 min-w-[140px]",
                    "border-yellow-500 bg-yellow-500/10",
                    "ring-2 ring-blue-500 ring-offset-1 ring-offset-transparent",
                  )}>
                    <Dice5 className="w-4 h-4 text-yellow-400 animate-bounce absolute -top-3" />
                    <span className="text-xs text-amber-200 font-medium">
                      {getPlayerUsername(currentPlayer)} (You)
                    </span>
                    <span className={cn(
                      "text-lg font-bold tabular-nums",
                      (myPlayer && getTotalScore(yahtzeeState.playerStates[myPlayer.id]?.scorecard) === maxTotal && maxTotal > 0)
                        ? "text-poker-gold" : "text-muted-foreground"
                    )}>
                      {myPlayer ? getTotalScore(yahtzeeState.playerStates[myPlayer.id]?.scorecard) : 0}
                    </span>
                  </div>
                ) : (
                  /* Opponent's turn: show their player area + their scorecard */
                  <div className="w-full flex flex-col items-center gap-2">
                    <div className={cn(
                      "relative flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 min-w-[140px]",
                      "border-yellow-500 bg-yellow-500/10",
                    )}>
                      <Dice5 className="w-4 h-4 text-yellow-400 animate-bounce absolute -top-3" />
                      <span className="text-xs text-amber-200 font-medium">
                        {getPlayerUsername(currentPlayer)}
                      </span>
                      <span className={cn(
                        "text-lg font-bold tabular-nums",
                        (getTotalScore(yahtzeeState.playerStates[currentTurnPlayerId!]?.scorecard) === maxTotal && maxTotal > 0)
                          ? "text-poker-gold" : "text-muted-foreground"
                      )}>
                        {getTotalScore(yahtzeeState.playerStates[currentTurnPlayerId!]?.scorecard)}
                      </span>
                    </div>
                    {/* Opponent's scorecard in the active area */}
                    <div className="w-full">
                      {renderScorecard(currentTurnPlayerId!, false)}
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-border/50 bg-background/15 px-4 py-3 text-sm text-muted-foreground">
                  Waiting for the next turn...
                </div>
              )}
            </div>
          </div>
        </section>

        {/* -------- FOOTER (actions) -------- */}
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
                  disabled={displayRolls <= 0 || isRolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1 animate-slow-pulse-red" />
                  Roll{displayRolls === 3 ? "" : " Again"}
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
