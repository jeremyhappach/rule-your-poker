/**
 * YahtzeeGameTable – mirrors MobileGameTable's visual layout for dice games.
 *
 * Uses the same oval felt with Peoria bridge background, chip stacks around the table,
 * tab bar, timer, and bottom section structure as MobileGameTable does for Horses/SCC.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { HorsesDie } from "./HorsesDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { ChipTransferAnimation } from "./ChipTransferAnimation";
import { MusicToggleButton } from "./MusicToggleButton";
import { QuickEmoticonPicker } from "./QuickEmoticonPicker";
import { ValueChangeFlash } from "./ValueChangeFlash";
import { YahtzeeRollOverlay, UpperBonusOverlay, WinnerOverlay } from "./YahtzeeOverlays";
import {
  YahtzeeState, YahtzeeCategory, CATEGORY_LABELS,
  UPPER_CATEGORIES, LOWER_CATEGORIES, YahtzeeDie,
  UPPER_BONUS_THRESHOLD, UPPER_BONUS_VALUE,
} from "@/lib/yahtzeeTypes";
import { CATEGORY_FULL_NAMES } from "@/lib/yahtzeeTypes";
import { calculateCategoryScore } from "@/lib/yahtzeeScoring";
import {
  rollYahtzeeDice, toggleYahtzeeHold,
  scoreYahtzeeCategory, advanceYahtzeeTurn,
} from "@/lib/yahtzeeGameLogic";
import { getPotentialScores, getTotalScore, isYahtzee, getUpperSubtotal, hasUpperBonus } from "@/lib/yahtzeeScoring";
import {
  getBotHoldDecision, getBotCategoryChoice, shouldBotStopRolling,
} from "@/lib/yahtzeeBotLogic";
import { supabase } from "@/integrations/supabase/client";
import { getBotAlias } from "@/lib/botAlias";
import { cn, formatChipValue } from "@/lib/utils";
import { RotateCcw, MessageSquare, User, Clock, Check } from "lucide-react";
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
  const [lastScoredCategory, setLastScoredCategory] = useState<YahtzeeCategory | null>(null);
  const [lastScoredValue, setLastScoredValue] = useState<number | null>(null);
  // Optimistic scorecard overlay: keeps the scored value visible until DB catches up
  const [optimisticScore, setOptimisticScore] = useState<{ playerId: string; category: YahtzeeCategory; value: number } | null>(null);
  const [scoringInProgress, setScoringInProgress] = useState(false);
  const [pendingZeroCategory, setPendingZeroCategory] = useState<YahtzeeCategory | null>(null);
  const uiRollingTimerRef = useRef<number | null>(null);
  const heldSnapshotRef = useRef<boolean[] | null>(null);
  const botProcessingRef = useRef(false);
  const localRollKeyRef = useRef<number | undefined>(undefined);
  // Cache last opponent's dice so they stay visible on felt during scoring highlight transition
  const [cachedOpponentDice, setCachedOpponentDice] = useState<{ dice: HorsesDieType[]; rollKey?: number; playerId: string } | null>(null);
  const lastLocalEditAtRef = useRef<number>(0);
  const LOCAL_STATE_PROTECTION_MS = 2000;
  const FIRST_ROLL_MS = 1300;
  const ROLL_AGAIN_MS = 1800;
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Overlay states
  const [showYahtzeeOverlay, setShowYahtzeeOverlay] = useState<string | null>(null); // playerName
  const [showBonusOverlay, setShowBonusOverlay] = useState<string | null>(null); // playerName
  const [winnerOverlay, setWinnerOverlay] = useState<{
    winnerName: string;
    scores: { name: string; total: number }[];
    isWinnerMe: boolean;
  } | null>(null);

  // Chip transfer animation
  const [chipTransferTriggerId, setChipTransferTriggerId] = useState<string | null>(null);
  const [chipTransferWinnerPos, setChipTransferWinnerPos] = useState<number>(0);
  const [chipTransferLoserPositions, setChipTransferLoserPositions] = useState<number[]>([]);
  const [chipTransferLoserIds, setChipTransferLoserIds] = useState<string[]>([]);

  // Guard: prevent double-execution of handleGameComplete
  const gameCompleteProcessedRef = useRef(false);
  // Reset guard when a new round starts
  useEffect(() => { gameCompleteProcessedRef.current = false; }, [currentRoundId]);

  // Track upper bonus per player to detect when earned
  const prevUpperBonusRef = useRef<Record<string, boolean>>({});

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
    // Preserve local hold state when syncing from DB to prevent held dice from resetting
    setLocalDice(prev => ps.dice.map((dbDie, i) => ({
      ...dbDie,
      isHeld: prev[i]?.isHeld ?? dbDie.isHeld,
    })));
    setLocalRollsRemaining(ps.rollsRemaining);
  }, [isMyTurn, myPlayer?.id, yahtzeeState?.playerStates, currentTurnPlayerId]);

  // Clear optimistic score once DB has caught up
  useEffect(() => {
    if (!optimisticScore || !yahtzeeState) return;
    const ps = yahtzeeState.playerStates[optimisticScore.playerId];
    if (ps?.scorecard.scores[optimisticScore.category] !== undefined) {
      setOptimisticScore(null);
    }
  }, [yahtzeeState?.playerStates, optimisticScore]);

  /* ---- Detect Yahtzee rolls & upper bonus from DB state changes ---- */
  useEffect(() => {
    if (!yahtzeeState) return;
    for (const [pid, ps] of Object.entries(yahtzeeState.playerStates)) {
      const player = players.find(p => p.id === pid);
      if (!player) continue;
      const name = getPlayerUsername(player);

      // Check upper bonus (only fire once per player)
      const hadBonus = prevUpperBonusRef.current[pid] ?? false;
      const nowHasBonus = hasUpperBonus(ps.scorecard);
      if (nowHasBonus && !hadBonus) {
        setShowBonusOverlay(name);
      }
      prevUpperBonusRef.current[pid] = nowHasBonus;
    }
  }, [yahtzeeState?.playerStates]);

  /* ---- Roll ---- */
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || rolling) {
      console.warn('[YAHTZEE] handleRoll blocked:', { isMyTurn, hasRoundId: !!currentRoundId, hasState: !!yahtzeeState, hasPlayer: !!myPlayer, rolling });
      return;
    }
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining <= 0) {
      console.warn('[YAHTZEE] handleRoll blocked: no player state or no rolls', { hasPs: !!myPs, rolls: myPs?.rollsRemaining });
      return;
    }

    const isFirstRoll = myPs.rollsRemaining === 3;
    const duration = isFirstRoll ? FIRST_ROLL_MS : ROLL_AGAIN_MS;

    heldSnapshotRef.current = localDice.map(d => d.isHeld);
    const t = Date.now();
    localRollKeyRef.current = t;
    lastLocalEditAtRef.current = t;

    // CRITICAL: Apply local hold state to the player state before rolling.
    // The DB state may be stale if the user toggled holds that haven't synced yet.
    const psWithLocalHolds = {
      ...myPs,
      dice: myPs.dice.map((d, i) => ({
        ...d,
        isHeld: localDice[i]?.isHeld ?? d.isHeld,
      })),
    };

    const newPs = rollYahtzeeDice(psWithLocalHolds);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    // Check for Yahtzee roll — delay overlay until dice animation finishes
    const diceValues = newPs.dice.map(d => d.value);
    if (isYahtzee(diceValues) && diceValues[0] !== 0) {
      setTimeout(() => setShowYahtzeeOverlay(getPlayerUsername(myPlayer)), duration + 200);
    }

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
  const pendingHoldUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleToggleHold = useCallback(async (dieIndex: number) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || rolling) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.rollsRemaining === 0) return;

    lastLocalEditAtRef.current = Date.now();
    // Use functional updater so rapid taps always read latest local state
    setLocalDice(prev => {
      const updatedDice = prev.map((die, idx) => ({
        ...die,
        isHeld: idx === dieIndex ? !die.isHeld : die.isHeld,
      }));

      // Debounce the DB write so rapid holds batch into one update
      if (pendingHoldUpdateRef.current) clearTimeout(pendingHoldUpdateRef.current);
      pendingHoldUpdateRef.current = setTimeout(() => {
        pendingHoldUpdateRef.current = null;
        // Read latest local dice at persist time via a hidden ref
        setLocalDice(latest => {
          const newPs = { ...myPs, dice: latest };
          const newState = {
            ...yahtzeeState,
            playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
          };
          updateYahtzeeState(currentRoundId, newState);
          return latest; // no change
        });
      }, 300);

      return updatedDice;
    });
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, rolling]);

  /* ---- Score category ---- */
  const handleScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!isMyTurn || !currentRoundId || !yahtzeeState || !myPlayer || scoringInProgress) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs || myPs.rollsRemaining === 3 || myPs.scorecard.scores[category] !== undefined) return;

    // Check if this would score zero — ask for confirmation
    const diceValues = myPs.dice.map(d => d.value);
    const potentialScore = calculateCategoryScore(category, diceValues);
    if (potentialScore === 0) {
      setPendingZeroCategory(category);
      return;
    }

    await commitScoreCategory(category);
  }, [isMyTurn, currentRoundId, yahtzeeState, myPlayer, scoringInProgress]);

  const commitScoreCategory = useCallback(async (category: YahtzeeCategory) => {
    if (!currentRoundId || !yahtzeeState || !myPlayer) return;
    const myPs = yahtzeeState.playerStates[myPlayer.id];
    if (!myPs) return;

    // Highlight the chosen category and pause for clarity
    setScoringInProgress(true);
    setLastScoredCategory(category);
    const pendingScore = calculateCategoryScore(category, myPs.dice.map(d => d.value));
    setLastScoredValue(pendingScore);

    // If this upper category pushes us to the bonus threshold, fire the overlay now
    if (UPPER_CATEGORIES.includes(category) && myPs.scorecard.scores[category] === undefined) {
      const currentUpperSum = UPPER_CATEGORIES.reduce((s, c) => s + (myPs.scorecard.scores[c] ?? 0), 0);
      const hadBonus = currentUpperSum >= UPPER_BONUS_THRESHOLD;
      const newUpperSum = currentUpperSum + pendingScore;
      if (!hadBonus && newUpperSum >= UPPER_BONUS_THRESHOLD) {
        setShowBonusOverlay(getPlayerUsername(myPlayer));
      }
    }

    const newPs = scoreYahtzeeCategory(myPs, category);
    setLocalDice(newPs.dice);
    setLocalRollsRemaining(newPs.rollsRemaining);

    // Wait 2 seconds so the player can see their selection highlighted
    await new Promise(r => setTimeout(r, 2000));

    let newState = {
      ...yahtzeeState,
      playerStates: { ...yahtzeeState.playerStates, [myPlayer.id]: newPs },
    };
    newState = advanceYahtzeeTurn(newState);
    await updateYahtzeeState(currentRoundId, newState);

    // Keep optimistic score visible until DB subscription catches up
    setOptimisticScore({ playerId: myPlayer.id, category, value: pendingScore });

    setLastScoredCategory(null);
    setLastScoredValue(null);
    setScoringInProgress(false);

    if (newState.gamePhase === 'complete') handleGameComplete(newState);
  }, [currentRoundId, yahtzeeState, myPlayer]);

  /* ---- Game complete ---- */
  const handleGameComplete = async (finalState: YahtzeeState) => {
    // Guard: prevent double-execution (bot controller + human can both see gamePhase=complete)
    if (gameCompleteProcessedRef.current) {
      console.log('[YAHTZEE] handleGameComplete already processed, skipping');
      return;
    }
    gameCompleteProcessedRef.current = true;
    console.log('[YAHTZEE] 🏆 handleGameComplete starting');

    const results = Object.entries(finalState.playerStates)
      .map(([pid, ps]) => ({ pid, total: getTotalScore(ps.scorecard) }))
      .sort((a, b) => b.total - a.total);
    const maxScore = results[0].total;
    const winners = results.filter(r => r.total === maxScore);

    const scoreSummary = results.map(r => r.total).join('-');
    const scoreDetails = results.map(r => {
      const p = players.find(pl => pl.id === r.pid);
      return { name: p ? getPlayerUsername(p) : '?', total: r.total };
    });

    if (winners.length > 1) {
      console.log('[YAHTZEE] Tie detected, ending round as tie');
      await endYahtzeeRound(gameId, null, `Tie ${scoreSummary}`, true);
    } else {
      const winnerId = winners[0].pid;
      const winnerPlayer = players.find(p => p.id === winnerId);
      const winnerName = winnerPlayer ? getPlayerUsername(winnerPlayer) : 'Unknown';
      const isWinnerMe = winnerPlayer?.user_id === currentUserId;

      // Show winner overlay with confetti
      setWinnerOverlay({ winnerName, scores: scoreDetails, isWinnerMe });

      // Chip transfer: each loser pays ante to winner
      const losers = activePlayers.filter(p => p.id !== winnerId);
      const winAmount = losers.length * anteAmount;

      if (winnerPlayer) {
        // Small delay so DOM has rendered chip positions before animation starts
        setTimeout(() => {
          setChipTransferWinnerPos(winnerPlayer.position);
          setChipTransferLoserPositions(losers.map(p => p.position));
          setChipTransferLoserIds(losers.map(p => p.id));
          setChipTransferTriggerId(`yahtzee-win-${Date.now()}`);
        }, 300);
      }

      // Award winner and deduct from losers
      console.log('[YAHTZEE] Awarding chips:', { winnerId, winAmount, loserCount: losers.length });
      await supabase.rpc('increment_player_chips', { p_player_id: winnerId, p_amount: winAmount });
      if (losers.length > 0) {
        await supabase.rpc('decrement_player_chips', {
          player_ids: losers.map(p => p.id),
          amount: anteAmount,
        });
      }
      const chipChanges: Record<string, number> = { [winnerId]: winAmount };
      losers.forEach(l => { chipChanges[l.id] = -anteAmount; });
      // Fire-and-forget result recording
      recordGameResult(gameId, yahtzeeState?.currentRound || 1, winnerId,
        `${winnerName} wins`, `Score: ${scoreSummary}`, winAmount, chipChanges, false, 'yahtzee', null);

      // Delay endYahtzeeRound so winner overlay + chip animation play fully before
      // Game.tsx's game_over handler fires and potentially unmounts YahtzeeGameTable
      console.log('[YAHTZEE] Waiting 2.5s before ending round...');
      await new Promise(r => setTimeout(r, 2500));
      console.log('[YAHTZEE] Calling endYahtzeeRound now');
      await endYahtzeeRound(gameId, winnerId, `${winnerName} wins ${scoreSummary}!`);
      console.log('[YAHTZEE] endYahtzeeRound completed, Game.tsx should handle transition');
    }
  };

  /* ---- Bot logic ---- */
  // Safety: reset botProcessingRef when turn changes away from a bot
  useEffect(() => {
    if (!currentPlayer?.is_bot) {
      botProcessingRef.current = false;
    }
  }, [currentTurnPlayerId]);

  useEffect(() => {
    if (!currentRoundId || !yahtzeeState || gamePhase !== 'playing') return;
    if (!currentTurnPlayerId || !currentPlayer?.is_bot) return;
    if (botProcessingRef.current) return;
    const controllerUserId = yahtzeeState.botControllerUserId;
    if (controllerUserId && controllerUserId !== currentUserId) return;

    botProcessingRef.current = true;
    let cancelled = false;

    const runBot = async () => {
      try {
        let state = { ...yahtzeeState };
        let ps = { ...state.playerStates[currentTurnPlayerId] };
        const botPlayer = players.find(p => p.id === currentTurnPlayerId);
        const botName = botPlayer ? getPlayerUsername(botPlayer) : 'Bot';

        for (let roll = 0; roll < 3; roll++) {
          if (cancelled || ps.rollsRemaining <= 0) break;

          // Decide holds BEFORE rolling (except first roll)
          if (roll > 0) {
            const holds = getBotHoldDecision(ps);
            ps = { ...ps, dice: ps.dice.map((d, i) => ({ ...d, isHeld: holds[i] })) };
          }

          const t = Date.now();
          ps = rollYahtzeeDice(ps);
          state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: { ...ps, rollKey: t } } };
          await updateYahtzeeState(currentRoundId, state);

          await new Promise(r => setTimeout(r, 1800));

          // Check for Yahtzee after dice animation has landed
          const diceValues = ps.dice.map(d => d.value);
          if (isYahtzee(diceValues) && diceValues[0] !== 0) {
            setShowYahtzeeOverlay(botName);
          }

          if (cancelled || ps.rollsRemaining <= 0 || shouldBotStopRolling(ps)) break;
        }

        if (cancelled) return;
        const category = getBotCategoryChoice(ps);

        // Cache bot's dice so they stay visible on felt during scoring highlight
        const botDiceForCache: HorsesDieType[] = ps.dice.map(d => ({ value: d.value, isHeld: false }));
        setCachedOpponentDice({ dice: botDiceForCache, rollKey: ps.rollKey, playerId: currentTurnPlayerId });

        // Highlight the bot's chosen category for 2 seconds (same UX as human)
        setLastScoredCategory(category);
        setScoringInProgress(true);

        ps = scoreYahtzeeCategory(ps, category);
        // Write scored state (but don't advance turn yet) so scorecard updates visually
        state = { ...state, playerStates: { ...state.playerStates, [currentTurnPlayerId]: ps } };
        await updateYahtzeeState(currentRoundId, state);

        await new Promise(r => setTimeout(r, 2000));
        if (cancelled) { setLastScoredCategory(null); setLastScoredValue(null); setScoringInProgress(false); setCachedOpponentDice(null); return; }

        setLastScoredCategory(null);
        setLastScoredValue(null);
        setScoringInProgress(false);
        setCachedOpponentDice(null);

        state = advanceYahtzeeTurn(state);
        await updateYahtzeeState(currentRoundId, state);
        if (state.gamePhase === 'complete') await handleGameComplete(state);
      } catch (e) {
        console.error('[YAHTZEE] Bot error:', e);
        botProcessingRef.current = false;
      }
    };

    const timer = setTimeout(runBot, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
    const potentials: Partial<Record<YahtzeeCategory, number>> = {};

    // Helper: get effective score for a category, considering optimistic + highlight states
    const getEffectiveScore = (cat: YahtzeeCategory): number | undefined => {
      if (isInteractive && lastScoredCategory === cat && lastScoredValue !== null && ps.scorecard.scores[cat] === undefined) {
        return lastScoredValue;
      }
      if (ps.scorecard.scores[cat] !== undefined) return ps.scorecard.scores[cat];
      // Optimistic: DB hasn't caught up yet but we already scored this
      if (optimisticScore && optimisticScore.playerId === playerId && optimisticScore.category === cat) {
        return optimisticScore.value;
      }
      return undefined;
    };

    const upperSum = UPPER_CATEGORIES.reduce((s, c) => s + (getEffectiveScore(c) ?? 0), 0);
    const gotBonus = upperSum >= UPPER_BONUS_THRESHOLD;
    const allUpperFilled = UPPER_CATEGORIES.every(c => getEffectiveScore(c) !== undefined);
    const bonusFailed = allUpperFilled && !gotBonus;

    const renderRow = (categories: YahtzeeCategory[], extra?: React.ReactNode) => (
      <div className="flex gap-1">
        {categories.map(cat => {
          const scored = ps.scorecard.scores[cat];
          const effectiveScored = getEffectiveScore(cat);
          const potential = potentials[cat];
          const isAvailable = effectiveScored === undefined && isInteractive && isMyTurn && rollsUsed < 3;
          const justScored = lastScoredCategory === cat;
          // Show optimistic value when DB hasn't caught up
          const isOptimistic = optimisticScore?.playerId === playerId && optimisticScore?.category === cat && scored === undefined;

          return (
            <button
              key={cat}
              onClick={() => isAvailable && !scoringInProgress ? handleScoreCategory(cat) : undefined}
              disabled={!isAvailable || scoringInProgress}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 px-0.5 rounded-md border transition-all min-w-0 min-h-[44px]",
                justScored
                  ? "bg-green-700/70 border-green-400 ring-2 ring-green-400 scale-105"
                  : (scored !== undefined || isOptimistic)
                    ? (effectiveScored === 0)
                      ? "bg-amber-900/50 border-red-500/70 border-2"
                      : "bg-amber-900/50 border-green-500/70 border-2"
                    : isAvailable && !scoringInProgress && localRollsRemaining === 0
                      ? "bg-amber-800/40 border-poker-gold hover:bg-amber-700/50 cursor-pointer opacity-70"
                      : "bg-muted/20 border-muted-foreground/30 opacity-50"
              )}
            >
              <span className="font-bold text-amber-200 text-[10px] leading-tight">{CATEGORY_LABELS[cat]}</span>
              <span className={cn(
                "font-bold tabular-nums leading-tight",
                justScored
                  ? "text-white text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                  : (scored !== undefined || isOptimistic) ? "text-white text-sm" : "text-transparent text-sm"
              )}>
                {justScored && lastScoredValue !== null ? lastScoredValue : effectiveScored !== undefined ? effectiveScored : '\u00A0'}
              </span>
            </button>
          );
        })}
        {extra}
      </div>
    );

    return (
      <div className="w-full space-y-1">
        {renderRow(UPPER_CATEGORIES, (
          <div className={cn(
            "flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 rounded-md border min-w-0 min-h-[44px]",
            gotBonus
              ? "bg-green-800/60 border-green-400"
              : bonusFailed
                ? "bg-amber-900/50 border-red-500/70 border-2"
                : "bg-muted/20 border-muted-foreground/40"
          )}>
            {gotBonus ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="font-bold text-green-400 tabular-nums text-sm leading-tight">+35</span>
              </>
            ) : bonusFailed ? (
              <span className="font-bold text-red-400 tabular-nums text-sm leading-tight">0</span>
            ) : (
              <span className="font-bold text-white tabular-nums text-sm leading-tight">
                {upperSum}/63
              </span>
            )}
          </div>
        ))}
        {renderRow(LOWER_CATEGORIES)}
        {isInteractive && (
          <div className="flex justify-center">
            <div className="flex flex-col items-center py-1.5 px-3 rounded-md border bg-poker-gold/20 border-poker-gold/60">
              <span className="font-bold text-poker-gold text-[10px] leading-tight">TOTAL</span>
              <span className="font-bold text-poker-gold tabular-nums text-sm leading-tight">
                {(() => {
                  let total = getTotalScore(ps.scorecard);
                  if (optimisticScore?.playerId === playerId && ps.scorecard.scores[optimisticScore.category] === undefined) {
                    total += optimisticScore.value;
                    // If this optimistic score triggers upper bonus
                    if (gotBonus && !hasUpperBonus(ps.scorecard)) total += UPPER_BONUS_VALUE;
                  }
                  return total;
                })()}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---- Render chip stack for a player ---- */
  const renderPlayerChip = (player: Player, compact = false) => {
    const isTheirTurn = player.id === currentTurnPlayerId && gamePhase === 'playing';
    const isMe = player.user_id === currentUserId;
    const ps = yahtzeeState?.playerStates?.[player.id];
    const total = ps ? getTotalScore(ps.scorecard) : 0;
    const isWinning = total > 0 && total === maxTotal && gamePhase === 'complete';

    // Compact mode: small name badge, no chip circle
    if (compact) {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className={cn(
            "text-[10px] font-bold truncate max-w-[60px] text-amber-200 drop-shadow-md px-1.5 py-0.5 rounded bg-black/40",
            isTheirTurn && "animate-pulse ring-1 ring-yellow-400"
          )}>
            {getPlayerUsername(player)}
          </span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-0.5" data-seat-chip-position={player.position}>
        <span className={cn(
          "text-[11px] font-semibold truncate max-w-[70px] text-white drop-shadow-md"
        )}>
          {getPlayerUsername(player)}
        </span>
        <div className="relative">
          {isTheirTurn && (
            <div className="absolute inset-0 rounded-full ring-3 ring-yellow-400" />
          )}
          <div
            data-chip-center={player.position}
            className={cn(
            "relative w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 border-slate-600/50 bg-slate-300",
            isTheirTurn && "animate-turn-pulse",
          )}>
            <span className={cn(
              "font-bold text-sm leading-none",
              player.chips < 0 ? "text-red-600" : "text-slate-800"
            )}>
              ${formatChipValue(Math.round(player.chips))}
            </span>
          </div>
        </div>
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

      {/* Overlays */}
      <YahtzeeRollOverlay
        playerName={showYahtzeeOverlay || ''}
        visible={!!showYahtzeeOverlay}
        onDone={() => setShowYahtzeeOverlay(null)}
      />
      <UpperBonusOverlay
        playerName={showBonusOverlay || ''}
        visible={!!showBonusOverlay}
        onDone={() => setShowBonusOverlay(null)}
      />
      {/* WinnerOverlay removed — dealer announcement handles win display */}

      {/* Zero-score confirmation dialog */}
      <AlertDialog open={!!pendingZeroCategory} onOpenChange={(open) => { if (!open) setPendingZeroCategory(null); }}>
        <AlertDialogContent className="bg-gradient-to-br from-amber-950 to-amber-900 border-2 border-amber-500">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-amber-100 text-lg">
              Take a zero?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-amber-200 text-base">
              Are you sure you want to take 0 for {pendingZeroCategory ? CATEGORY_FULL_NAMES[pendingZeroCategory] : ''}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel
              onClick={() => setPendingZeroCategory(null)}
              className="bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const cat = pendingZeroCategory;
                setPendingZeroCategory(null);
                if (cat) commitScoreCategory(cat);
              }}
              className="bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Yes, take 0
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

        {/* Game name + player scores on felt */}
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-[120] flex flex-col items-center leading-tight">
          <span className="text-white/30 font-bold text-sm uppercase tracking-wider">
            ${anteAmount} YAHTZEE
          </span>
          {gamePhase === 'playing' && (
            <div className="flex gap-4 mt-0.5">
              {activePlayers.map(p => {
                const ps = yahtzeeState?.playerStates?.[p.id];
                const total = ps ? getTotalScore(ps.scorecard) : 0;
                const isTurn = p.id === currentTurnPlayerId;
                return (
                  <span key={p.id} className={cn(
                    "text-base font-extrabold tabular-nums",
                    isTurn ? "text-poker-gold" : "text-white/60"
                  )}>
                    {getPlayerUsername(p)}: {total}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Dice on felt (observer view) OR scorecard (my turn) */}
        {gamePhase === 'playing' && currentPlayer && (() => {
          if (isMyTurn && myPlayer) {
            // My turn: show interactive scorecard ON the felt
            return (
              <>
                <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 z-[110] w-[92%] max-w-[400px]">
                  {renderScorecard(myPlayer.id, true)}
                </div>
                {/* Show cached opponent dice during scoring highlight transition */}
                {cachedOpponentDice && scoringInProgress && (
                  <div className="absolute left-1/2 top-[25%] -translate-x-1/2 -translate-y-1/2 z-[109]">
                    <DiceTableLayout
                      key={cachedOpponentDice.playerId}
                      dice={cachedOpponentDice.dice}
                      isRolling={false}
                      canToggle={false}
                      size="sm"
                      gameType="yahtzee"
                      showWildHighlight={false}
                      isObserver={true}
                      hideUnrolledDice={true}
                      rollKey={cachedOpponentDice.rollKey}
                      cacheKey={cachedOpponentDice.playerId + '-cached'}
                    />
                  </div>
                )}
              </>
            );
          }

          // Opponent's turn: show dice if they've rolled, or a waiting message
          const diceState = getCurrentTurnDice();
          const hasRolled = diceState?.dice.some(d => d.value !== 0);

          if (!hasRolled) {
            // No felt message — the rolling status is shown in the active player box below
            return null;
          }

          return (
            <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-[110]">
              <DiceTableLayout
                key={currentTurnPlayerId ?? "no-turn"}
                dice={diceState!.dice}
                isRolling={false}
                canToggle={false}
                size="md"
                gameType="yahtzee"
                showWildHighlight={false}
                isObserver={true}
                hideUnrolledDice={true}
                animationOrigin={getDiceAnimationOrigin()}
                rollKey={diceState!.rollKey}
                cacheKey={currentTurnPlayerId ?? "no-turn"}
              />
            </div>
          );
        })()}

        {/* Game complete — no static overlay here, WinnerOverlay handles it */}

        {/* Chip transfer animation */}
        <ChipTransferAnimation
          triggerId={chipTransferTriggerId}
          amount={anteAmount}
          winnerPosition={chipTransferWinnerPos}
          loserPositions={chipTransferLoserPositions}
          loserPlayerIds={chipTransferLoserIds}
          currentPlayerPosition={myPlayer?.position ?? null}
          getClockwiseDistance={getClockwiseDistance}
          containerRef={tableContainerRef}
          onAnimationEnd={() => setChipTransferTriggerId(null)}
        />

        {/* Players arranged around the table (chip stacks) — corner positions to avoid scorecard overlap */}
        {(() => {
          const useCompact = false;
          return myPlayer ? (
          <>
            {/* Slot 0: Bottom-left — extreme corner */}
            <div className="absolute bottom-0 -left-3 z-[105]">
              {getPlayerAtSlot(1) && renderPlayerChip(getPlayerAtSlot(1)!, useCompact)}
            </div>
            {/* Slot 1: Top-left — extreme corner */}
            <div className="absolute -left-3 -top-3 z-[105]">
              {getPlayerAtSlot(2) && renderPlayerChip(getPlayerAtSlot(2)!, useCompact)}
            </div>
            {/* Slot 2: Top-left-center — pushed to edge */}
            {getPlayerAtSlot(3) && (
              <div className="absolute left-[10%] -top-3 z-[105]">
                {renderPlayerChip(getPlayerAtSlot(3)!, useCompact)}
              </div>
            )}
            {/* Slot 3: Top-right-center — pushed to edge */}
            {getPlayerAtSlot(4) && (
              <div className="absolute right-[10%] -top-3 z-[105]">
                {renderPlayerChip(getPlayerAtSlot(4)!, useCompact)}
              </div>
            )}
            {/* Slot 4: Top-right — extreme corner */}
            <div className="absolute -right-3 -top-3 z-[105]">
              {getPlayerAtSlot(5) && renderPlayerChip(getPlayerAtSlot(5)!, useCompact)}
            </div>
            {/* Slot 5: Bottom-right — extreme corner */}
            <div className="absolute bottom-0 -right-3 z-[105]">
              {getPlayerAtSlot(6) && renderPlayerChip(getPlayerAtSlot(6)!, useCompact)}
            </div>
          </>
        ) : (
          // Observer mode: extreme corner positions
          activePlayers.filter(p => p.user_id !== currentUserId).map((player, idx) => {
            const positions = [
              '-top-3 -left-3', '-top-3 -right-3',
              'bottom-0 -left-3', 'bottom-0 -right-3',
              '-top-3 left-[10%]', '-top-3 right-[10%]',
            ];
            return (
              <div key={player.id} className={`absolute z-[105] ${positions[idx % positions.length]}`}>
                {renderPlayerChip(player)}
              </div>
            );
          })
        );
        })()}

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
      <div className="flex-1 min-h-0 flex flex-col bg-gradient-to-t from-background via-background to-background/95 border-t border-border overflow-hidden">

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
          <div className="px-2 flex-1 min-h-0 overflow-y-auto">
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

            {/* Roll button — only shown on my turn */}
            {gamePhase === 'playing' && isMyTurn && !scoringInProgress && (
              <div className="flex items-center justify-center min-h-[36px] mt-1 mb-1">
                {localRollsRemaining > 0 ? (
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
                  <Badge className="text-sm px-3 py-1.5 font-medium">Pick a category</Badge>
                )}
              </div>
            )}

            {/* Opponent scorecard when it's not my turn */}
            {!isMyTurn && currentTurnPlayerId && currentTurnPlayerId !== myPlayer?.id && gamePhase === 'playing' && (
              <div className="mt-1 px-1 relative">
                {/* Rolling/turn status message — absolutely positioned so it doesn't push scorecard down */}
                {(() => {
                  const oppPlayer = players.find(p => p.id === currentTurnPlayerId);
                  if (!oppPlayer) return null;
                  const diceState = getCurrentTurnDice();
                  const hasRolled = diceState?.dice.some(d => d.value !== 0);
                  const oppPs = yahtzeeState?.playerStates?.[currentTurnPlayerId];
                  const rollsLeft = oppPs?.rollsRemaining ?? 3;
                  const statusText = !hasRolled || rollsLeft === 3
                    ? `${getPlayerUsername(oppPlayer)} is rolling...`
                    : rollsLeft > 0
                      ? `${getPlayerUsername(oppPlayer)} — Roll ${4 - rollsLeft}`
                      : `${getPlayerUsername(oppPlayer)} choosing...`;
                  return (
                    <p className="text-amber-400 font-semibold text-xs text-center animate-pulse mb-0.5">
                      {statusText}
                    </p>
                  );
                })()}
                <div className="yahtzee-opponent-scorecard">
                  {renderScorecard(currentTurnPlayerId, false)}
                </div>
              </div>
            )}

            {/* My scorecard (read-only summary) when it IS my turn - interactive one is on felt */}
            {isMyTurn && myPlayer && (
              <div className="mt-1 px-1 opacity-60">
                <span className="text-xs text-muted-foreground">Your scorecard is on the table above</span>
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
