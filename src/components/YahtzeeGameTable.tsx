/**
 * YahtzeeGameTable – mirrors MobileGameTable's visual layout for dice games.
 *
 * Uses the same oval felt with Peoria bridge background, chip stacks around the table,
 * tab bar, timer, and bottom section structure as MobileGameTable does for Horses/SCC.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { ChipStack } from "./ChipStack";
import { MusicToggleButton } from "./MusicToggleButton";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { ValueChangeFlash } from "./ValueChangeFlash";
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
import { cn, formatChipValue } from "@/lib/utils";
import { RotateCcw, MessageSquare, User, Clock } from "lucide-react";
import { recordGameResult } from "@/lib/gameLogic";
import { endYahtzeeRound } from "@/lib/yahtzeeRoundLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { HandHistory } from "./HandHistory";
import { MobileChatPanel } from "./MobileChatPanel";
import { useGameChat } from "@/hooks/useGameChat";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";

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

// Custom dice icon matching MobileGameTable
const DiceIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor" strokeWidth="0">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="7.5" r="1.5" fill="white" />
    <circle cx="12" cy="12" r="1.5" fill="white" />
    <circle cx="7.5" cy="16.5" r="1.5" fill="white" />
    <circle cx="16.5" cy="16.5" r="1.5" fill="white" />
  </svg>
);

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

  // Tab state
  const [activeTab, setActiveTab] = useState<'cards' | 'chat' | 'lobby' | 'history'>('cards');

  // Local dice state
  const [localDice, setLocalDice] = useState<YahtzeeDie[]>([]);
  const [localRollsRemaining, setLocalRollsRemaining] = useState(3);

  const activePlayers = players.filter(p => !p.sitting_out).sort((a, b) => a.position - b.position);
  const currentTurnPlayerId = yahtzeeState?.currentTurnPlayerId;
  const currentPlayer = players.find(p => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const currentTurnState = currentTurnPlayerId ? yahtzeeState?.playerStates?.[currentTurnPlayerId] : null;
  const gamePhase = yahtzeeState?.gamePhase || 'waiting';

  const getPlayerUsername = (player: Player) =>
    player.is_bot ? getBotAlias(players, player.user_id) : (player.profiles?.username || 'Player');

  // Scores
  const allTotals = useMemo(() =>
    Object.entries(yahtzeeState?.playerStates || {}).map(([pid, ps]) => ({
      pid, total: getTotalScore(ps.scorecard),
    })), [yahtzeeState?.playerStates]);
  const maxTotal = Math.max(0, ...allTotals.map(t => t.total));

  const rolling = uiRolling || isRolling;
  const rollNumber = Math.min(3, Math.max(1, 4 - localRollsRemaining));
  const showMyDice = isMyTurn && gamePhase === "playing" && localRollsRemaining < 3;

  // Clockwise distance for seat positioning
  const getClockwiseDistance = useCallback((targetPosition: number) => {
    if (!myPlayer) return 0;
    const myPos = myPlayer.position;
    if (targetPosition === myPos) return 0;
    const diff = targetPosition - myPos;
    return diff > 0 ? diff : diff + 7;
  }, [myPlayer?.position]);

  // Get player at slot (clockwise from current player)
  const getPlayerAtSlot = useCallback((slotIndex: number) => {
    if (!myPlayer) return null;
    const myPos = myPlayer.position;
    const targetPos = ((myPos + slotIndex) % 7) + 1;
    return activePlayers.find(p => p.position === targetPos && p.id !== myPlayer.id) || null;
  }, [myPlayer, activePlayers]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (uiRollingTimerRef.current != null) window.clearTimeout(uiRollingTimerRef.current);
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

    heldSnapshotRef.current = localDice.map(d => d.isHeld);
    const t = Date.now();
    localRollKeyRef.current = t;
    lastLocalEditAtRef.current = t;

    const newPs = rollYahtzeeDice(myPs);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

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

  /* ---- Felt dice for observer view ---- */
  const getCurrentTurnDice = useCallback(() => {
    if (!currentTurnPlayerId || !yahtzeeState) return null;
    const ps = yahtzeeState.playerStates[currentTurnPlayerId];
    if (!ps) return null;
    return { dice: toHorsesDice(ps.dice), rollKey: ps.rollKey };
  }, [currentTurnPlayerId, yahtzeeState]);

  /* ---- Animation origin ---- */
  const getDiceAnimationOrigin = useCallback((): { x: number; y: number } | undefined => {
    if (!currentPlayer) return undefined;
    const playerIdx = activePlayers.findIndex(p => p.id === currentPlayer.id);
    if (playerIdx === -1) return undefined;
    const totalPlayers = activePlayers.length;
    const angle = (playerIdx / totalPlayers) * 2 * Math.PI - Math.PI / 2;
    return { x: 80 * Math.cos(angle), y: 56 * Math.sin(angle) - 40 };
  }, [currentPlayer, activePlayers]);

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
                "flex-1 flex flex-col items-center py-1.5 px-0.5 rounded-md border transition-all min-w-0",
                scored !== undefined
                  ? "bg-amber-900/50 border-amber-700/60"
                  : isAvailable
                    ? "bg-amber-800/40 border-poker-gold hover:bg-amber-700/50 cursor-pointer animate-pulse"
                    : "bg-muted/20 border-muted-foreground/30"
              )}
            >
              <span className="font-bold text-amber-200 text-[10px] leading-tight">{CATEGORY_LABELS[cat]}</span>
              <span className={cn(
                "font-bold tabular-nums text-sm leading-tight",
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
      <div className="w-full space-y-1">
        {renderRow(UPPER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-1.5 px-0.5 rounded-md border bg-muted/10 border-muted-foreground/30 min-w-0">
            <span className="font-bold text-amber-200/70 text-[10px] leading-tight">BN</span>
            <span className="font-bold text-muted-foreground/70 tabular-nums text-sm leading-tight">
              {upperSum >= 63 ? '35' : `${upperSum}/63`}
            </span>
          </div>
        ))}
        {renderRow(LOWER_CATEGORIES, (
          <div className="flex-1 flex flex-col items-center py-1.5 px-0.5 rounded-md border bg-poker-gold/20 border-poker-gold/60 min-w-0">
            <span className="font-bold text-poker-gold text-[10px] leading-tight">TOT</span>
            <span className="font-bold text-poker-gold tabular-nums text-sm leading-tight">
              {getTotalScore(ps.scorecard)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  /* ---- Render chip stack for a player ---- */
  const renderPlayerChip = (player: Player) => {
    const isTheirTurn = player.id === currentTurnPlayerId && gamePhase === 'playing';
    const isMe = player.user_id === currentUserId;
    const ps = yahtzeeState?.playerStates?.[player.id];
    const total = ps ? getTotalScore(ps.scorecard) : 0;
    const isWinning = total > 0 && total === maxTotal && gamePhase === 'complete';

    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className={cn(
          "text-[11px] font-semibold truncate max-w-[64px] text-center",
          isMe ? "text-foreground" : "text-foreground/80"
        )}>
          {getPlayerUsername(player)}
        </span>
        <div className={cn(
          "relative transition-all duration-300",
          isTheirTurn && "ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent rounded-full"
        )}>
          <ChipStack
            amount={player.chips}
            size={52 as any}
            showDollarSign={true}
          />
        </div>
        {gamePhase === 'complete' && total > 0 && (
          <span className={cn(
            "text-[10px] font-bold",
            isWinning ? "text-green-400" : "text-muted-foreground"
          )}>
            {total}pts
          </span>
        )}
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
  /*  RENDER – mirrors MobileGameTable layout exactly                  */
  /* ================================================================ */
  return (
    <div className="flex flex-col h-[calc(100dvh-60px)] overflow-hidden bg-background relative">

      {/* ===== TABLE AREA (felt with bridge background) ===== */}
      <div ref={tableContainerRef} className="flex-1 relative overflow-hidden min-h-0" style={{ maxHeight: '55vh' }}>

        {/* Oval felt background with bridge image */}
        <div
          className="absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, hsl(142 40% 18%) 0%, hsl(142 50% 10%) 100%)',
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)',
          }}
        >
          <img
            src={peoriaBridgeMobile}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none w-full h-full object-cover"
            style={{ objectPosition: 'center 38%', opacity: 0.28 }}
          />
        </div>

        {/* Game name on felt */}
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center">
          <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
            ${anteAmount} YAHTZEE
          </span>
        </div>

        {/* Pot on felt */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1 rounded-full border border-amber-600/40">
            <span className="text-poker-gold font-bold text-lg">${pot}</span>
          </div>
        </div>

        {/* Dice on felt (observer view) OR "You are rolling" message */}
        {gamePhase === 'playing' && currentPlayer && (() => {
          if (isMyTurn) {
            return (
              <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110] flex flex-col items-center gap-2">
                <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                  You are rolling
                </p>
              </div>
            );
          }

          const diceState = getCurrentTurnDice();
          if (!diceState) return null;
          const hasRolled = diceState.dice.some(d => d.value !== 0);
          if (!hasRolled) return null;

          return (
            <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110]">
              <DiceTableLayout
                key={currentTurnPlayerId ?? "no-turn"}
                dice={diceState.dice}
                isRolling={false}
                canToggle={false}
                size="md"
                gameType="yahtzee"
                showWildHighlight={false}
                isObserver={true}
                hideUnrolledDice={true}
                animationOrigin={getDiceAnimationOrigin()}
                rollKey={diceState.rollKey}
                cacheKey={currentTurnPlayerId ?? "no-turn"}
              />
            </div>
          );
        })()}

        {/* Game complete message on felt */}
        {gamePhase === 'complete' && (() => {
          const results = Object.entries(yahtzeeState.playerStates)
            .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
            .sort((a, b) => b.total - a.total);
          const best = results[0];
          const winner = players.find(p => p.id === best.pid);
          return (
            <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110] text-center">
              <div className="bg-amber-900/80 rounded-xl px-6 py-4 border-2 border-amber-600">
                <h3 className="text-xl font-bold text-poker-gold mb-1">Yahtzee Complete!</h3>
                <p className="text-amber-200 text-sm">
                  {winner ? `${getPlayerUsername(winner)} wins with ${best.total}!` : "Winner determined!"}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Players arranged around the table (chip stacks) */}
        {myPlayer ? (
          <>
            {/* Slot 0: Bottom-left */}
            <div className="absolute bottom-2 left-10 z-[105]">
              {getPlayerAtSlot(1) && renderPlayerChip(getPlayerAtSlot(1)!)}
            </div>
            {/* Slot 1: Middle-left */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[105]">
              {getPlayerAtSlot(2) && renderPlayerChip(getPlayerAtSlot(2)!)}
            </div>
            {/* Slot 2: Top-left */}
            {getPlayerAtSlot(3) && (
              <div className="absolute left-10 top-4 z-[105]">
                {renderPlayerChip(getPlayerAtSlot(3)!)}
              </div>
            )}
            {/* Slot 3: Top-right */}
            {getPlayerAtSlot(4) && (
              <div className="absolute right-10 top-4 z-[105]">
                {renderPlayerChip(getPlayerAtSlot(4)!)}
              </div>
            )}
            {/* Slot 4: Middle-right */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 z-[105]">
              {getPlayerAtSlot(5) && renderPlayerChip(getPlayerAtSlot(5)!)}
            </div>
            {/* Slot 5: Bottom-right */}
            <div className="absolute bottom-2 right-10 z-[105]">
              {getPlayerAtSlot(6) && renderPlayerChip(getPlayerAtSlot(6)!)}
            </div>
          </>
        ) : (
          // Observer mode: absolute positions
          activePlayers.filter(p => p.user_id !== currentUserId).map((player, idx) => {
            const positions = [
              'top-4 left-10', 'left-0 top-1/2 -translate-y-1/2',
              'bottom-2 left-10', 'bottom-2 right-10',
              'right-0 top-1/2 -translate-y-1/2', 'top-4 right-10',
            ];
            return (
              <div key={player.id} className={`absolute z-[105] ${positions[idx % positions.length]}`}>
                {renderPlayerChip(player)}
              </div>
            );
          })
        )}

        {/* Dealer button on felt for current player */}
        {myPlayer && dealerPosition === myPlayer.position && (
          <div className="absolute z-20" style={{ bottom: '8px', left: '45%', transform: 'translateX(-50%)' }}>
            <div className="w-7 h-7 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xs">D</span>
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM SECTION ===== */}
      <div className="flex-1 min-h-0 bg-gradient-to-t from-background via-background to-background/95 border-t border-border overflow-hidden">

        {/* Timer / status area */}
        <div className="h-[44px] shrink-0 flex items-center justify-center px-4">
          {gamePhase === 'playing' && currentPlayer && !currentPlayer.is_bot ? (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-background/60 backdrop-blur-sm border border-border/50">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {isMyTurn ? 'Your turn' : `${getPlayerUsername(currentPlayer)}'s turn`}
              </span>
              <Badge variant="secondary" className="text-xs">
                Rolls: {isMyTurn ? localRollsRemaining : (currentTurnState?.rollsRemaining ?? 0)}
              </Badge>
            </div>
          ) : gamePhase === 'complete' ? (
            <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-sm text-center truncate">
                Game Complete!
              </p>
            </div>
          ) : null}
        </div>

        {/* Tab navigation */}
        <div className="flex items-center justify-center gap-1 px-4 py-1.5 border-b border-border/50">
          <button
            onClick={() => setActiveTab('cards')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'cards'
                ? 'bg-primary/20 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            } ${isMyTurn && activeTab !== 'cards' && gamePhase === 'playing' ? 'animate-pulse ring-2 ring-red-500' : ''}`}
          >
            <DiceIcon className={`w-5 h-5 ${activeTab === 'cards' ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            style={{ flex: '0 0 35%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'chat' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('lobby')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'lobby' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <User className="w-5 h-5" />
          </button>
          <button
            onClick={() => setActiveTab('history')}
            style={{ flex: '0 0 15%' }}
            className={`flex items-center justify-center py-2 px-3 rounded-md transition-all ${
              activeTab === 'history' ? 'bg-primary/20 text-foreground' : 'text-muted-foreground/50 hover:text-muted-foreground'
            }`}
          >
            <Clock className="w-5 h-5" />
          </button>
        </div>

        {/* CARDS/DICE TAB */}
        {activeTab === 'cards' && (
          <div className="px-2 flex flex-col flex-1 overflow-y-auto">
            {/* Dice area */}
            <div className="flex items-center justify-center gap-1 min-h-[60px] mb-1">
              {showMyDice ? (
                localDice.map((die, idx) => {
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
                })
              ) : (
                <div className="h-[52px]" />
              )}
            </div>

            {/* Roll button */}
            <div className="flex items-center justify-center min-h-[36px] mt-1 mb-1">
              {gamePhase === 'playing' && isMyTurn ? (
                localRollsRemaining > 0 ? (
                  <Button
                    size="default"
                    onClick={handleRoll}
                    disabled={rolling}
                    className="font-bold text-sm h-9 px-6"
                  >
                    <RotateCcw className="w-4 h-4 mr-2 animate-slow-pulse-red" />
                    Roll {rollNumber}
                  </Button>
                ) : (
                  <Badge className="text-sm px-3 py-1.5 font-medium">Pick a category below</Badge>
                )
              ) : gamePhase === 'playing' && !isMyTurn ? (
                <Badge variant="secondary" className="text-sm px-3 py-1.5 font-medium">
                  Waiting — {currentPlayer ? `${getPlayerUsername(currentPlayer)}'s turn` : "Next turn"}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-sm px-3 py-1.5 font-medium">Ready</Badge>
              )}
            </div>

            {/* Scorecard */}
            {myPlayer && (
              <div className="mt-1 px-1">
                {renderScorecard(isMyTurn ? myPlayer.id : (currentTurnPlayerId || myPlayer.id), isMyTurn)}
              </div>
            )}

            {/* Player info */}
            {myPlayer && (
              <div className="flex items-center justify-center gap-2 py-2">
                <QuickEmoticonPicker onSelect={() => {}} disabled={true} />
                <p className="text-sm font-semibold text-foreground">
                  {myPlayer.profiles?.username || 'You'}
                  <span className="ml-1 text-green-500">(active)</span>
                </p>
                <span className={cn(
                  "font-bold text-lg",
                  myPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'
                )}>
                  {formatChipValue(myPlayer.chips)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col p-2 overflow-hidden">
            <p className="text-sm text-muted-foreground text-center py-4">Chat coming soon</p>
          </div>
        )}

        {/* LOBBY TAB */}
        {activeTab === 'lobby' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activePlayers.map(player => {
              const ps = yahtzeeState.playerStates[player.id];
              const total = ps ? getTotalScore(ps.scorecard) : 0;
              return (
                <div key={player.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{getPlayerUsername(player)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Score: {total}</span>
                    <span className={cn(
                      "text-sm font-bold",
                      player.chips < 0 ? 'text-destructive' : 'text-poker-gold'
                    )}>
                      {formatChipValue(player.chips)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && gameId && (
          <div className="flex-1 overflow-y-auto">
            <HandHistory gameId={gameId} />
          </div>
        )}
      </div>
    </div>
  );
}
