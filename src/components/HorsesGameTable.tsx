import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorsesDie } from "./HorsesDie";
import { SCCDie } from "./SCCDie";
import { DiceTableLayout } from "./DiceTableLayout";
import { HorsesPlayerArea } from "./HorsesPlayerArea";
import { NoQualifyAnimation } from "./NoQualifyAnimation";
import { MidnightAnimation } from "./MidnightAnimation";
import { TurnSpotlight } from "./TurnSpotlight";
import {
  HorsesHand,
  HorsesHandResult,
  HorsesDie as HorsesDieType,
  createInitialHand,
  rollDice,
  toggleHold,
  lockInHand,
  evaluateHand,
  determineWinners,
} from "@/lib/horsesGameLogic";
import {
  SCCHand,
  SCCHandResult,
  SCCDie as SCCDieType,
  createInitialSCCHand,
  reconstructSCCHand,
  rollSCCDice,
  lockInSCCHand,
  evaluateSCCHand,
  determineSCCWinners,
  isQualified,
  getSCCDisplayOrder,
} from "@/lib/sccGameLogic";
import {
  getBotHoldDecision,
  shouldBotStopRolling,
  applyHoldDecision,
} from "@/lib/horsesBotLogic";
import { getSCCBotDecision, shouldSCCBotStopRolling } from "@/lib/sccBotLogic";
import { Dice5, Lock, RotateCcw } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getBotAlias } from "@/lib/botAlias";
import { snapshotPlayerChips } from "@/lib/gameLogic";

interface Player {
  id: string;
  user_id: string;
  position: number;
  chips: number;
  is_bot: boolean;
  sitting_out: boolean;
  profiles?: {
    username: string;
  };
}

interface HorsesGameTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  anteAmount: number;
  dealerPosition: number;
  currentRoundId: string | null;
  horsesState: HorsesStateFromDB | null;
  onRefetch: () => void;
  gameType?: string;
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
}

// Database state structure - supports both Horses and SCC dice types
interface PlayerDiceState {
  dice: HorsesDieType[] | SCCDieType[];
  rollsRemaining: number;
  isComplete: boolean;
  result?: HorsesHandResult | SCCHandResult;
  /** Per-die mask of what was held before completion (freeze layout at last-roll start) */
  heldMaskBeforeComplete?: boolean[];
  /** Legacy: number of dice held before completion */
  heldCountBeforeComplete?: number;
}

export interface HorsesStateFromDB {
  currentTurnPlayerId: string | null;
  playerStates: Record<string, PlayerDiceState>;
  gamePhase: "waiting" | "playing" | "complete";
  turnOrder: string[]; // Player IDs in turn order
  /** Single-client bot driver to avoid multi-client state fights */
  botControllerUserId?: string | null;
  /** ISO timestamp deadline for the current turn */
  turnDeadline?: string | null;
}

// Helpers to update horses_state in rounds table.
// IMPORTANT: Full-state overwrites can cause turn flip-flopping if any client writes a stale snapshot.
// Use atomic RPCs for per-player updates + advancing the turn.
async function updateHorsesState(roundId: string, state: HorsesStateFromDB): Promise<Error | null> {
  const { error } = await supabase
    .from("rounds")
    .update({ horses_state: state } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .eq("id", roundId);
  return error;
}

async function horsesSetPlayerState(
  roundId: string,
  playerId: string,
  state: PlayerDiceState,
): Promise<HorsesStateFromDB | null> {
  const { data, error } = await supabase.rpc("horses_set_player_state" as any, {
    _round_id: roundId,
    _player_id: playerId,
    _state: state as any,
  } as any);

  if (error) {
    console.error("[HORSES] horses_set_player_state failed:", error);
    return null;
  }

  return (data as any) as HorsesStateFromDB;
}

async function horsesAdvanceTurn(roundId: string, expectedCurrentPlayerId: string): Promise<HorsesStateFromDB | null> {
  const { data, error } = await supabase.rpc("horses_advance_turn" as any, {
    _round_id: roundId,
    _expected_current_player_id: expectedCurrentPlayerId,
  } as any);

  if (error) {
    console.error("[HORSES] horses_advance_turn failed:", error);
    return null;
  }

  return (data as any) as HorsesStateFromDB;
}

export function HorsesGameTable({
  gameId,
  players,
  currentUserId,
  pot,
  anteAmount,
  dealerPosition,
  currentRoundId,
  horsesState,
  onRefetch,
  gameType = 'horses',
  isHost = false,
  onPlayerClick,
}: HorsesGameTableProps) {
  // Determine display title based on game type
  const gameTitle = gameType === 'ship-captain-crew' ? 'Ship' : 'Horses';
  const isMobile = useIsMobile();

  // Determine if this is an SCC game
  const isSCC = gameType === 'ship-captain-crew';

  // Local state for dice rolling animation (use union type for both game types)
  const [localHand, setLocalHand] = useState<HorsesHand | SCCHand>(() => 
    isSCC ? createInitialSCCHand() : createInitialHand()
  );
  const [isRolling, setIsRolling] = useState(false);
  const botProcessingRef = useRef<Set<string>>(new Set());
  const botRunTokenRef = useRef(0);
  const initializingRef = useRef(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Roll animation tracking - increment on each roll to trigger fly-in animation
  const [rollAnimationKey, setRollAnimationKey] = useState(0);

  // Prevent DB rehydration from overwriting the felt while the user is interacting.
  const lastLocalEditAtRef = useRef<number>(0);
  const myTurnKeyRef = useRef<string | null>(null);

  // Bot animation state - show intermediate dice/holds
  const [botDisplayState, setBotDisplayState] = useState<{
    playerId: string;
    dice: HorsesDieType[];
    isRolling: boolean;
    rollKey?: number;
  } | null>(null);

  // Get active players sorted by position
  const activePlayers = players
    .filter(p => !p.sitting_out)
    .sort((a, b) => a.position - b.position);

  // Mobile seating grid players are derived after we know the active turn player (see below).

  // Determine turn order: start LEFT of dealer (dealer goes LAST)
  const getTurnOrder = useCallback(() => {
    if (activePlayers.length === 0) return [];
    
    // Find dealer's index in activePlayers
    const dealerIdx = activePlayers.findIndex(p => p.position === dealerPosition);
    if (dealerIdx === -1) {
      // Fallback: just use position order
      return activePlayers.map(p => p.id);
    }
    
    // Start with player after dealer, wrap around
    const order: string[] = [];
    for (let i = 1; i <= activePlayers.length; i++) {
      const idx = (dealerIdx + i) % activePlayers.length;
      order.push(activePlayers[idx].id);
    }
    return order;
  }, [activePlayers, dealerPosition]);

  // CRITICAL: Track round changes and reset stale state refs.
  // When `currentRoundId` changes, clear processed-win ref so we don't show old results on new hands.
  const prevRoundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentRoundId && currentRoundId !== prevRoundIdRef.current) {
      // New round started - reset refs that depend on round context
      prevRoundIdRef.current = currentRoundId;
      // Clear the processed win ref so a genuine win in a NEW round can be processed
      // (processedWinRoundRef is defined later, but we guard against stale gamePhase here)
    }
  }, [currentRoundId]);

  // Current player from DB state
  const turnOrder = horsesState?.turnOrder || [];
  const currentTurnPlayerId = horsesState?.currentTurnPlayerId;
  const currentPlayer = players.find((p) => p.id === currentTurnPlayerId);
  const isMyTurn = currentPlayer?.user_id === currentUserId;

  // CRITICAL: If horsesState is null/undefined or has no turnOrder, treat as "waiting" to avoid stale win UI
  const hasValidState = horsesState && horsesState.turnOrder && horsesState.turnOrder.length > 0;
  const gamePhase = hasValidState ? (horsesState.gamePhase || "waiting") : "waiting";

  // Clear stale bot display state when the turn changes (prevents bot->bot flash).
  useEffect(() => {
    if (!botDisplayState) return;
    if (botDisplayState.playerId !== currentTurnPlayerId) {
      setBotDisplayState(null);
    }
  }, [currentTurnPlayerId, botDisplayState?.playerId]);

  // Mobile: show the active-turn player in the fixed Active Player section, and everyone else in the table row.
  const mobileSeatPlayers = currentTurnPlayerId
    ? activePlayers.filter(p => p.id !== currentTurnPlayerId)
    : activePlayers;

  // Get my player state from DB
  const myPlayer = players.find(p => p.user_id === currentUserId);
  const myState = myPlayer ? horsesState?.playerStates?.[myPlayer.id] : null;

  // Spotlight helper: calculate clockwise distance from current player to target
  const getClockwiseDistance = useCallback((targetPosition: number) => {
    if (!myPlayer) return 0;
    const myPos = myPlayer.position;
    // Positions are 1-7, calculate clockwise wrap
    if (targetPosition === myPos) return 0;
    const diff = targetPosition - myPos;
    return diff > 0 ? diff : diff + 7;
  }, [myPlayer?.position]);

  // Sync local hand with DB state when it's my turn
  useEffect(() => {
    if (!isMyTurn) {
      myTurnKeyRef.current = null;
      return;
    }

    const myKey = `${currentRoundId ?? "no-round"}:${currentTurnPlayerId ?? "no-turn"}`;
    if (myTurnKeyRef.current !== myKey) {
      myTurnKeyRef.current = myKey;
    }

    if (Date.now() - lastLocalEditAtRef.current < 700) return;

    if (myState && isMyTurn) {
      // For SCC, reconstruct the full hand with hasShip/hasCaptain/hasCrew flags
      if (isSCC) {
        setLocalHand(reconstructSCCHand(
          myState.dice as SCCDieType[],
          myState.rollsRemaining,
          myState.isComplete
        ));
      } else {
        setLocalHand({
          dice: myState.dice,
          rollsRemaining: myState.rollsRemaining,
          isComplete: myState.isComplete,
        });
      }
    }
  }, [isMyTurn, currentRoundId, currentTurnPlayerId, myState?.rollsRemaining, myState?.isComplete]);

  // Calculate winning hands (best result so far among completed players)
  // CRITICAL: Only use playerStates if horsesState is valid (has turnOrder) - prevents stale results from old rounds
  const completedResults = hasValidState
    ? Object.entries(horsesState.playerStates || {})
        .filter(([_, state]) => state.isComplete && state.result)
        .map(([playerId, state]) => ({
          playerId,
          result: state.result! as HorsesHandResult | SCCHandResult,
        }))
    : [];

  // Get current winning result (best hand completed so far)
  const currentWinningResult = completedResults.length > 0
    ? completedResults.reduce((best, curr) => 
        curr.result.rank > best.result.rank ? curr : best
      ).result
    : null;

  // Determine winners based on game type
  // CRITICAL: gamePhase is already guarded to be "waiting" if state is invalid, so this will be empty for new rounds
  const winningPlayerIds = completedResults.length > 0 && gamePhase === "complete"
    ? (isSCC 
        ? determineSCCWinners(completedResults.map(r => r.result as SCCHandResult)).map(i => completedResults[i].playerId)
        : determineWinners(completedResults.map(r => r.result as HorsesHandResult)).map(i => completedResults[i].playerId)
      )
    : [];

  // Announcement: show dealer-style banner text when a player's turn completes
  const [turnAnnouncement, setTurnAnnouncement] = useState<string | null>(null);
  const clearAnnouncementTimerRef = useRef<number | null>(null);
  const announcedTurnsRef = useRef<Set<string>>(new Set());
  const currentTurnState = horsesState?.playerStates?.[currentTurnPlayerId || ""] ?? null;

  // No Qualify animation state for SCC games (any player)
  const [showNoQualifyAnimation, setShowNoQualifyAnimation] = useState(false);
  const [noQualifyPlayerName, setNoQualifyPlayerName] = useState<string | null>(null);
  const noQualifyShownForRef = useRef<Set<string>>(new Set());

  // Midnight animation state for SCC games (when someone rolls a 12)
  const [showMidnightAnimation, setShowMidnightAnimation] = useState(false);
  const [midnightPlayerName, setMidnightPlayerName] = useState<string | null>(null);
  const midnightShownForRef = useRef<Set<string>>(new Set());

  // Detect when ANY player's SCC hand is complete and they rolled Midnight (cargo = 12)
  useEffect(() => {
    if (!isSCC) return;
    if (!currentRoundId) return;
    
    const playerStates = horsesState?.playerStates;
    if (!playerStates) return;
    
    console.log('[MIDNIGHT DEBUG] Checking player states:', Object.keys(playerStates));
    
    for (const [playerId, state] of Object.entries(playerStates)) {
      console.log('[MIDNIGHT DEBUG] Player:', playerId, 'isComplete:', state.isComplete, 'result:', state.result);
      
      if (!state.isComplete || !state.result) continue;
      
      const result = state.result as SCCHandResult;
      console.log('[MIDNIGHT DEBUG] Result check - isQualified:', result.isQualified, 'cargoSum:', result.cargoSum);
      
      // Midnight = qualified with cargo of 12 (highest possible)
      if (result.isQualified && result.cargoSum === 12) {
        const midnightKey = `${currentRoundId}:${playerId}`;
        console.log('[MIDNIGHT DEBUG] Midnight detected! Key:', midnightKey, 'already shown:', midnightShownForRef.current.has(midnightKey));
        
        if (midnightShownForRef.current.has(midnightKey)) continue;
        
        midnightShownForRef.current.add(midnightKey);
        
        const player = players.find(p => p.id === playerId);
        const playerName = player ? getPlayerUsername(player) : null;
        
        console.log('[MIDNIGHT DEBUG] Showing animation for:', playerName);
        setMidnightPlayerName(playerName);
        setShowMidnightAnimation(true);
        break;
      }
    }
  }, [isSCC, currentRoundId, horsesState?.playerStates, players]);

  const handleMidnightAnimationComplete = useCallback(() => {
    setShowMidnightAnimation(false);
    setMidnightPlayerName(null);
  }, []);

  // Detect when the CURRENT USER's SCC hand is complete and they didn't qualify
  // Only show the overlay to the player who rolled no qualify, not to spectators
  useEffect(() => {
    if (!isSCC) return;
    if (!currentRoundId) return;
    if (!currentUserId) return;
    
    // Find the current user's player
    const myPlayer = players.find(p => p.user_id === currentUserId);
    if (!myPlayer) return;
    
    // Only check the current user's state
    const myState = horsesState?.playerStates?.[myPlayer.id];
    if (!myState?.isComplete || !myState?.result) return;
    
    const result = myState.result as SCCHandResult;
    if (!result.isQualified) {
      const noQualifyKey = `${currentRoundId}:${myPlayer.id}`;
      if (noQualifyShownForRef.current.has(noQualifyKey)) return;
      
      noQualifyShownForRef.current.add(noQualifyKey);
      
      // Show animation for the current user (no need for player name since it's them)
      setNoQualifyPlayerName(null);
      setShowNoQualifyAnimation(true);
    }
  }, [isSCC, currentRoundId, currentUserId, horsesState?.playerStates, players]);

  const handleNoQualifyAnimationComplete = useCallback(() => {
    setShowNoQualifyAnimation(false);
    setNoQualifyPlayerName(null);
  }, []);

  // Always clear the pending announcement timer on unmount.
  useEffect(() => {
    return () => {
      if (clearAnnouncementTimerRef.current) {
        window.clearTimeout(clearAnnouncementTimerRef.current);
        clearAnnouncementTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (gamePhase !== "playing") return;
    if (!currentRoundId || !currentTurnPlayerId || !currentPlayer) return;
    if (!currentTurnState?.isComplete || !currentTurnState?.result) return;

    const announceKey = `${currentRoundId}:${currentTurnPlayerId}`;
    if (announcedTurnsRef.current.has(announceKey)) return;
    announcedTurnsRef.current.add(announceKey);

    const playerName = getPlayerUsername(currentPlayer);
    setTurnAnnouncement(`${playerName} rolled ${currentTurnState.result.description}!`);

    // IMPORTANT: do NOT clear this timeout in the effect cleanup, otherwise the banner can persist
    // forever when the turn advances (deps change triggers cleanup before the timeout fires).
    if (clearAnnouncementTimerRef.current) {
      window.clearTimeout(clearAnnouncementTimerRef.current);
    }
    clearAnnouncementTimerRef.current = window.setTimeout(() => {
      setTurnAnnouncement(null);
      clearAnnouncementTimerRef.current = null;
    }, 2500);
  }, [
    gamePhase,
    currentRoundId,
    currentTurnPlayerId,
    currentPlayer,
    currentTurnState?.isComplete,
    currentTurnState?.result,
  ]);

  // Initialize game state when round starts
  useEffect(() => {
    if (!currentRoundId || !gameId) return;
    if (horsesState?.turnOrder?.length > 0) return; // Already initialized
    if (initializingRef.current) return;
    if (activePlayers.length === 0) return;

    initializingRef.current = true;

    const initializeGame = async () => {
      // Use proper turn order: left of dealer first
      const order = getTurnOrder();

      const controllerUserId =
        order
          .map((id) => activePlayers.find((p) => p.id === id))
          .find((p) => p && !p.is_bot)?.user_id ?? null;

      const initialState: HorsesStateFromDB = {
        currentTurnPlayerId: order[0],
        playerStates: {},
        gamePhase: "playing",
        turnOrder: order,
        botControllerUserId: controllerUserId,
      };

      // Initialize each player's state based on game type
      const isSCC = gameType === 'ship-captain-crew';
      order.forEach(playerId => {
        const initHand = isSCC ? createInitialSCCHand() : createInitialHand();
        initialState.playerStates[playerId] = {
          dice: initHand.dice as any,
          rollsRemaining: initHand.rollsRemaining,
          isComplete: false,
        };
      });

      const error = await updateHorsesState(currentRoundId, initialState);
      if (error) {
        console.error("[HORSES] Failed to initialize state:", error);
      }
      initializingRef.current = false;
    };

    initializeGame();
  }, [currentRoundId, activePlayers.length, horsesState?.turnOrder?.length, gameId, getTurnOrder]);

  // Recovery: if gamePhase is "playing" but currentTurnPlayerId is null/missing and we have turnOrder,
  // re-initialize the current turn to the first incomplete player
  const stuckRecoveryKeyRef = useRef<string | null>(null);
  
  // Candidate bot controller for desktop
  const candidateBotControllerUserId = useMemo(() => {
    if (!turnOrder?.length) return null;
    return (
      turnOrder
        .map((id) => players.find((p) => p.id === id))
        .find((p) => p && !p.is_bot)?.user_id ?? null
    );
  }, [turnOrder, players]);
  
  useEffect(() => {
    if (!currentRoundId || !gameId) return;
    if (gamePhase !== "playing") return;
    if (currentTurnPlayerId) return; // Not stuck - there's a current player
    if (!turnOrder.length) return; // No turn order yet - init effect will handle
    if (!currentUserId) return;
    
    // Only let one client (bot controller or first human) attempt recovery
    const iAmController = candidateBotControllerUserId === currentUserId;
    if (!iAmController) return;
    
    const key = `recovery:${currentRoundId}`;
    if (stuckRecoveryKeyRef.current === key) return;
    stuckRecoveryKeyRef.current = key;
    
    console.warn("[HORSES] (desktop) Detected stuck game - attempting recovery", { currentRoundId, turnOrder });
    
    const recover = async () => {
      // Find the first player who hasn't completed their turn
      const nextPlayerId = turnOrder.find((pid) => {
        const state = horsesState?.playerStates?.[pid];
        return !state?.isComplete;
      });
      
      if (!nextPlayerId) {
        // Everyone is complete - set to complete phase
        console.log("[HORSES] Recovery: all players complete, setting phase to complete");
        await updateHorsesState(currentRoundId, {
          ...horsesState!,
          currentTurnPlayerId: null,
          gamePhase: "complete",
        });
      } else {
        // Set the next incomplete player as current
        console.log("[HORSES] Recovery: setting currentTurnPlayerId to", nextPlayerId);
        await updateHorsesState(currentRoundId, {
          ...horsesState!,
          currentTurnPlayerId: nextPlayerId,
          gamePhase: "playing",
        });
      }
    };
    
    // Small delay to avoid race with normal initialization
    const t = window.setTimeout(recover, 1000);
    return () => window.clearTimeout(t);
  }, [
    currentRoundId,
    gameId,
    gamePhase,
    currentTurnPlayerId,
    turnOrder,
    horsesState,
    currentUserId,
    candidateBotControllerUserId,
  ]);

  // Save my dice state to DB (atomic per-player update)
  const saveMyState = useCallback(
    async (
      hand: HorsesHand | SCCHand,
      completed: boolean,
      result?: HorsesHandResult | SCCHandResult,
      heldMaskBeforeComplete?: boolean[],
    ) => {
      if (!currentRoundId || !myPlayer) return;

      const heldCountBeforeComplete = Array.isArray(heldMaskBeforeComplete)
        ? heldMaskBeforeComplete.filter(Boolean).length
        : undefined;

      const newPlayerState: PlayerDiceState = {
        dice: hand.dice,
        rollsRemaining: hand.rollsRemaining,
        isComplete: completed,
        result,
        heldMaskBeforeComplete,
        heldCountBeforeComplete,
      };

      await horsesSetPlayerState(currentRoundId, myPlayer.id, newPlayerState);
    },
    [currentRoundId, myPlayer],
  );

  // Advance to next turn (atomic, guarded in backend)
  const advanceToNextTurn = useCallback(async (expectedCurrentPlayerId?: string | null) => {
    if (!currentRoundId) return;

    const expected = expectedCurrentPlayerId ?? horsesState?.currentTurnPlayerId;
    if (!expected) return;

    await horsesAdvanceTurn(currentRoundId, expected);
  }, [currentRoundId, horsesState?.currentTurnPlayerId]);

  // Handle roll dice
  const handleRoll = useCallback(async () => {
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining <= 0) return;

    // Track which dice were held BEFORE the roll (for layout freeze on completion)
    const heldMaskBeforeRoll = localHand.dice.map((d) => d.isHeld);

    // Roll immediately so the animation displays the NEW dice values (prevents old->new flash)
    const newHand = isSCC 
      ? rollSCCDice(localHand as SCCHand)
      : rollDice(localHand as HorsesHand);

    setIsRolling(true);
    lastLocalEditAtRef.current = Date.now();
    setLocalHand(newHand);
    // Increment roll animation key AFTER setting the new hand so fly-in uses new values
    setRollAnimationKey(prev => prev + 1);

    // Animate for a moment then finalize
    setTimeout(async () => {
      setIsRolling(false);

      // For SCC: Check if we rolled midnight (12 cargo) - auto-lock since it's the best possible
      if (isSCC) {
        const sccHand = newHand as SCCHand;
        const result = evaluateSCCHand(sccHand);
        
        // Midnight = qualified with cargo of 12 (best possible hand)
        if (result.isQualified && result.cargoSum === 12) {
          console.log('[SCC] Midnight rolled! Auto-locking...');
          const lockedHand = lockInSCCHand(sccHand);
          setLocalHand(lockedHand);
          await saveMyState(lockedHand as any, true, result, heldMaskBeforeRoll);
          
          setTimeout(() => {
            advanceToNextTurn(myPlayer?.id ?? null);
          }, 1500);
          return;
        }
      }

      // Save to DB
      if (newHand.rollsRemaining === 0) {
        // Auto-lock when out of rolls - pass held mask from before this roll
        const result = isSCC 
          ? evaluateSCCHand(newHand as SCCHand)
          : evaluateHand((newHand as HorsesHand).dice);
        await saveMyState(newHand as HorsesHand, true, result, heldMaskBeforeRoll);

        setTimeout(() => {
          advanceToNextTurn(myPlayer?.id ?? null);
        }, 1500);
      } else {
        await saveMyState(newHand as HorsesHand, false);
      }
    }, 500);
  }, [isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id, isSCC]);

  // Handle toggle hold - SCC has auto-freeze for 6-5-4, humans cannot toggle SCC dice
  const handleToggleHold = useCallback((index: number) => {
    if (!isMyTurn || localHand.isComplete || localHand.rollsRemaining === 3) return;

    // For SCC: cannot toggle SCC dice (Ship/Captain/Crew are auto-frozen)
    if (isSCC) {
      const sccHand = localHand as SCCHand;
      const die = sccHand.dice[index];
      if (die.isSCC) {
        // Can't unhold Ship/Captain/Crew dice
        return;
      }
      // For cargo dice in SCC, it's all-or-nothing (re-roll both or lock in)
      // So we don't allow individual hold toggling for cargo
      return;
    }

    lastLocalEditAtRef.current = Date.now();

    // Persist holds immediately so DB sync can't revert held dice.
    const nextHand = toggleHold(localHand as HorsesHand, index);
    setLocalHand(nextHand);
    void saveMyState(nextHand as HorsesHand, false);
  }, [isMyTurn, localHand, saveMyState, isSCC]);

  // Handle lock in (end turn early)
  const handleLockIn = useCallback(async () => {
    if (!isMyTurn || localHand.rollsRemaining === 3 || localHand.isComplete) return;

    // Track which dice were held BEFORE lock-in (for layout freeze)
    const heldMaskBeforeLockIn = localHand.dice.map((d) => d.isHeld);

    // For SCC: can only lock in if qualified (have 6-5-4)
    if (isSCC) {
      const sccHand = localHand as SCCHand;
      if (!isQualified(sccHand)) {
        // Can't lock in if not qualified, must keep rolling
        return;
      }
      const lockedHand = lockInSCCHand(sccHand);
      lastLocalEditAtRef.current = Date.now();
      setLocalHand(lockedHand);

      const result = evaluateSCCHand(lockedHand);
      await saveMyState(lockedHand as any, true, result, heldMaskBeforeLockIn);

      setTimeout(() => {
        advanceToNextTurn(myPlayer?.id ?? null);
      }, 1500);
    } else {
      const lockedHand = lockInHand(localHand as HorsesHand);
      lastLocalEditAtRef.current = Date.now();
      setLocalHand(lockedHand);

      const result = evaluateHand(lockedHand.dice);
      await saveMyState(lockedHand, true, result, heldMaskBeforeLockIn);

      setTimeout(() => {
        advanceToNextTurn(myPlayer?.id ?? null);
      }, 1500);
    }
  }, [isMyTurn, localHand, saveMyState, advanceToNextTurn, myPlayer?.id, isSCC]);

  // Bot auto-play with visible animation
  useEffect(() => {
    if (!currentPlayer?.is_bot || gamePhase !== "playing" || !currentRoundId || !horsesState) return;
    if (!currentUserId) return;

    const token = ++botRunTokenRef.current;
    let cancelled = false;

    const run = async () => {
      const botId = currentPlayer.id;

      // Lock immediately to prevent effect re-runs from starting a second bot loop before the first sets its lock.
      if (botProcessingRef.current.has(botId)) return;
      botProcessingRef.current.add(botId);

      // Add 1.5 second delay before SCC bots start their turn (only during active gameplay)
      if (isSCC && gamePhase === 'playing') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (cancelled || botRunTokenRef.current !== token) return;
      }

      try {
        console.log("[HORSES] bot loop start", { roundId: currentRoundId, botId, token });

        // Atomic single-driver claim to prevent multi-client bot turn fights (turn flashing).
        let controllerId = horsesState.botControllerUserId ?? null;

        if (!controllerId) {
          const { data, error } = await supabase.rpc("claim_horses_bot_controller", {
            _round_id: currentRoundId,
          });

          if (error) {
            console.error("[HORSES] Failed to claim bot controller (atomic):", error);
          } else {
            controllerId = (data as any)?.botControllerUserId ?? null; // eslint-disable-line @typescript-eslint/no-explicit-any
          }
        }

        // Fallback (older rounds / unexpected null)
        controllerId =
          controllerId ??
          (turnOrder
            .map((id) => players.find((p) => p.id === id))
            .find((p) => p && !p.is_bot)?.user_id ?? null);

        if (controllerId && controllerId !== currentUserId) return;

        if (cancelled || botRunTokenRef.current !== token) return;

        // Preflight: read the latest horses_state to avoid acting on stale props.
        const { data: roundRow, error: roundErr } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .maybeSingle();

        if (cancelled || botRunTokenRef.current !== token) return;

        if (roundErr) {
          console.error("[HORSES] Failed to preflight round state:", roundErr);
        }

        const latestState = (roundRow as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any

        // If the DB already moved the turn, do nothing.
        if (latestState?.currentTurnPlayerId && latestState.currentTurnPlayerId !== botId) {
          console.log("[HORSES] bot loop abort: turn already moved", {
            roundId: currentRoundId,
            expectedBotId: botId,
            currentTurnPlayerId: latestState.currentTurnPlayerId,
          });
          return;
        }

         const latestBotState = latestState?.playerStates?.[botId];

         // If bot already completed but the turn is still stuck on the bot, advance only.
         if (latestState && latestBotState?.isComplete && latestState.currentTurnPlayerId === botId) {
           console.warn("[HORSES] bot already complete but turn stuck; advancing only", {
             roundId: currentRoundId,
             botId,
           });

           await horsesAdvanceTurn(currentRoundId, botId);
           return;
         }

        if (latestBotState?.isComplete) {
          console.log("[HORSES] bot loop abort: bot already complete", { roundId: currentRoundId, botId });
          return;
        }

        // Prefer the freshest state we just read.
        let stateForWrites: HorsesStateFromDB = latestState
          ? controllerId
            ? { ...latestState, botControllerUserId: controllerId }
            : latestState
          : controllerId
            ? { ...horsesState, botControllerUserId: controllerId }
            : horsesState;

        // Initialize bot hand based on game type
        const isSCCGame = gameType === 'ship-captain-crew';
        let botHand: HorsesHand | SCCHand = stateForWrites?.playerStates?.[botId]
          ? (isSCCGame 
              ? reconstructSCCHand(
                  stateForWrites.playerStates[botId].dice as SCCDieType[],
                  stateForWrites.playerStates[botId].rollsRemaining,
                  stateForWrites.playerStates[botId].isComplete
                )
              : {
                  dice: stateForWrites.playerStates[botId].dice as HorsesDieType[],
                  rollsRemaining: stateForWrites.playerStates[botId].rollsRemaining,
                  isComplete: stateForWrites.playerStates[botId].isComplete,
                }
            )
          : (isSCCGame ? createInitialSCCHand() : createInitialHand());

        // Roll up to 3 times with visible animation
        let botRollKey = Date.now(); // Use timestamp as unique key for each roll
        for (let roll = 0; roll < 3 && botHand.rollsRemaining > 0; roll++) {
          if (cancelled || botRunTokenRef.current !== token) return;

          // Increment roll key for each roll
          botRollKey++;
          
          // Delay before each roll for visibility
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Roll immediately so the fly-in animation "lands" on the NEW values (prevents old->new flash)
          const rolledHand = isSCCGame
            ? rollSCCDice(botHand as SCCHand)
            : rollDice(botHand as HorsesHand);

          // Show "rolling" animation (using rolled values so we don't flash old dice after animation)
          setBotDisplayState({
            playerId: botId,
            dice: rolledHand.dice as HorsesDieType[],
            isRolling: true,
            rollKey: botRollKey,
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));

          if (cancelled || botRunTokenRef.current !== token) return;

          // Commit the rolled values without changing dice again
          botHand = rolledHand;

          // Show result of roll (with same rollKey so animation can complete)
          setBotDisplayState({
            playerId: botId,
            dice: botHand.dice as HorsesDieType[],
            isRolling: false,
            rollKey: botRollKey,
          });

           // Save intermediate state to DB so others can see (atomic per-player)
           await horsesSetPlayerState(currentRoundId, botId, {
             dice: botHand.dice as any,
             rollsRemaining: botHand.rollsRemaining,
             isComplete: false,
           });

          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Check if we should stop rolling based on current hand vs winning hand
          if (isSCCGame) {
            const sccHand = botHand as SCCHand;
            if (shouldSCCBotStopRolling(sccHand, sccHand.rollsRemaining, currentWinningResult as SCCHandResult | null)) {
              console.log(`[SCC Bot] Stopping early - good enough hand`);
              break;
            }
            // SCC doesn't have hold decisions for cargo - it's all or nothing (roll or stop)
            // The bot just rolls until it decides to stop
          } else {
            if (shouldBotStopRolling((botHand as HorsesHand).dice, botHand.rollsRemaining, currentWinningResult as HorsesHandResult | null)) {
              console.log(`[Bot] Stopping early - good enough hand`);
              break;
            }

            // Determine which dice to hold using smart decision logic (Horses only)
            if (botHand.rollsRemaining > 0) {
              const decision = getBotHoldDecision({
                currentDice: (botHand as HorsesHand).dice,
                rollsRemaining: botHand.rollsRemaining,
                currentWinningResult: currentWinningResult as HorsesHandResult | null,
              });

              console.log(`[Bot] Hold decision: ${decision.reasoning}`);
              botHand = applyHoldDecision(botHand as HorsesHand, decision);

              // Show the hold decision
              setBotDisplayState({ playerId: botId, dice: botHand.dice as HorsesDieType[], isRolling: false });

               // Save hold state so others can see (atomic per-player)
               await horsesSetPlayerState(currentRoundId, botId, {
                 dice: botHand.dice as any,
                 rollsRemaining: botHand.rollsRemaining,
                 isComplete: false,
               });

              await new Promise((resolve) => setTimeout(resolve, 800));
            }
          }
        }

        if (cancelled || botRunTokenRef.current !== token) return;

        // Mark complete using appropriate game logic
        let result: HorsesHandResult | SCCHandResult;
        if (isSCCGame) {
          botHand = lockInSCCHand(botHand as SCCHand);
          result = evaluateSCCHand(botHand as SCCHand);
        } else {
          botHand = lockInHand(botHand as HorsesHand);
          result = evaluateHand((botHand as HorsesHand).dice);
        }

        // Keep final bot dice visible until the DB turn advances.
        setBotDisplayState({ playerId: botId, dice: botHand.dice as HorsesDieType[], isRolling: false });

         // Save bot final state to DB (atomic per-player)
         await horsesSetPlayerState(currentRoundId, botId, {
           dice: botHand.dice as any,
           rollsRemaining: 0,
           isComplete: true,
           result,
         });

        // Advance turn after a moment
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (cancelled || botRunTokenRef.current !== token) return;

        // Final guard: if someone already moved the turn, don't overwrite.
        const { data: turnCheck } = await supabase
          .from("rounds")
          .select("horses_state")
          .eq("id", currentRoundId)
          .maybeSingle();

        const checkState = (turnCheck as any)?.horses_state as HorsesStateFromDB | null; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (checkState?.currentTurnPlayerId && checkState.currentTurnPlayerId !== botId) {
          console.log("[HORSES] bot advance abort: turn already changed", {
            roundId: currentRoundId,
            botId,
            currentTurnPlayerId: checkState.currentTurnPlayerId,
          });
          return;
        }

        // Advance turn (atomic + guarded)
        await horsesAdvanceTurn(currentRoundId, botId);

      } finally {
        botProcessingRef.current.delete(botId);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    currentPlayer?.id,
    currentPlayer?.is_bot,
    gamePhase,
    currentRoundId,
    horsesState,
    turnOrder,
    currentWinningResult,
    currentUserId,
    players,
  ]);

  // Handle game complete - award pot to winner
  const processedWinRoundRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (gamePhase !== "complete" || !gameId || !currentRoundId) return;
    if (winningPlayerIds.length === 0) return;
    
    // Prevent duplicate processing
    if (processedWinRoundRef.current === currentRoundId) return;

    // Only the first player in turn order processes the win
    const shouldProcess = turnOrder[0] && players.find(p => p.id === turnOrder[0])?.user_id === currentUserId;
    if (!shouldProcess) return;

    const processWin = async () => {
      // Mark as processed IMMEDIATELY
      processedWinRoundRef.current = currentRoundId;

      if (winningPlayerIds.length > 1) {
        // Tie - trigger re-ante flow
        await supabase
          .from("games")
          .update({
            awaiting_next_round: true,
            last_round_result: "Roll Over",
          })
          .eq("id", gameId);
        return;
      }

      const winnerId = winningPlayerIds[0];
      const winnerPlayer = players.find(p => p.id === winnerId);
      const winnerResult = completedResults.find(r => r.playerId === winnerId);
      
      if (!winnerPlayer || !winnerResult) return;

      // Fetch the actual pot from the database
      const { data: gameData } = await supabase
        .from("games")
        .select("pot, total_hands")
        .eq("id", gameId)
        .single();

      const actualPot = gameData?.pot || pot || 0;
      const handNumber = gameData?.total_hands || 1;

      // Award pot to winner
      const { error: updateError } = await supabase
        .from("players")
        .update({ chips: winnerPlayer.chips + actualPot })
        .eq("id", winnerId);

      if (updateError) {
        console.error("[HORSES] Failed to update winner chips:", updateError);
        return;
      }

      const winnerName = winnerPlayer.is_bot 
        ? getBotAlias(players, winnerPlayer.user_id)
        : (winnerPlayer.profiles?.username || "Unknown");

      // Record the game result
      const chipChanges: Record<string, number> = {};
      players.forEach((p) => {
        if (p.id === winnerId) {
          chipChanges[p.id] = actualPot;
        } else if (!p.sitting_out) {
          chipChanges[p.id] = -(anteAmount || 0);
        }
      });

      await supabase.from("game_results").insert({
        game_id: gameId,
        hand_number: handNumber,
        winner_player_id: winnerId,
        winner_username: winnerName,
        winning_hand_description: winnerResult.result.description,
        pot_won: actualPot,
        player_chip_changes: chipChanges,
        is_chopped: false,
        game_type: "horses",
      });
      
      // Snapshot player chips for session history AFTER awarding prize
      await snapshotPlayerChips(gameId, handNumber);

      // Transition game to game_over and reset pot
      await supabase
        .from("games")
        .update({ 
          status: "game_over",
          pot: 0,
          game_over_at: new Date().toISOString(),
          last_round_result: `${winnerName} wins with ${winnerResult.result.description}`,
        })
        .eq("id", gameId);
    };

    processWin();
  }, [gamePhase, winningPlayerIds, pot, players, currentUserId, gameId, turnOrder, completedResults, currentRoundId, anteAmount]);

  // Get username for player
  const getPlayerUsername = (player: Player) => {
    if (player.is_bot) {
      return getBotAlias(players, player.user_id);
    }
    return player.profiles?.username || `Player ${player.position}`;
  };

  // Get my status for the player area display
  const getMyStatus = (): 'waiting' | 'rolling' | 'done' => {
    if (!myPlayer) return 'waiting';
    if (myState?.isComplete) return 'done';
    if (isMyTurn) return 'rolling';
    return 'waiting';
  };

  // Get dice to display for current turn (bot or from DB)
  const getCurrentTurnDice = () => {
    if (currentPlayer?.is_bot && botDisplayState?.playerId === currentTurnPlayerId) {
      return botDisplayState;
    }

    const state = horsesState?.playerStates?.[currentTurnPlayerId || ""];
    return state ? {
      dice: state.dice,
      isRolling: false,
      heldMaskBeforeComplete: state.heldMaskBeforeComplete,
      heldCountBeforeComplete: state.heldCountBeforeComplete,
      rollKey: botDisplayState?.rollKey,
    } : null;
  };
  
  // Calculate animation origin based on current player position (for observer view)
  // This gives us a position offset from the center of the felt
  const getAnimationOrigin = useCallback((): { x: number; y: number } | undefined => {
    if (!currentPlayer || !activePlayers.length) return undefined;
    
    // Find the index of the current player in activePlayers
    const playerIdx = activePlayers.findIndex(p => p.id === currentPlayer.id);
    if (playerIdx === -1) return undefined;
    
    // Calculate angle position around the table (same formula as in render)
    const totalPlayers = activePlayers.length;
    const angle = (playerIdx / totalPlayers) * 2 * Math.PI - Math.PI / 2;
    
    // The felt container is at 50%, 48% of the parent. Player positions are at radiusX=40%, radiusY=28%
    // Convert to pixel offsets from the center. Assume container ~400px wide, ~300px tall
    // For the animation, we want dice to fly FROM player position TO scatter position
    // The scatter positions are already in pixels relative to center, so we need player pos in same units
    const radiusX = 80; // ~200px * 40%
    const radiusY = 56; // ~200px * 28%
    const x = radiusX * Math.cos(angle);
    const y = radiusY * Math.sin(angle) - 40; // offset up a bit since player is above center
    
    return { x, y };
  }, [currentPlayer, activePlayers]);

  return (
    <div
      ref={tableContainerRef}
      className={cn(
        "relative w-full rounded-xl overflow-hidden",
        // On mobile, DO NOT force viewport units; the parent mobile table controls height.
        isMobile ? "h-full min-h-0" : "h-full min-h-[500px]"
      )}
      style={{
        background:
          "radial-gradient(ellipse at center, hsl(142 30% 25%) 0%, hsl(142 40% 15%) 60%, hsl(142 50% 10%) 100%)",
        boxShadow: "inset 0 0 100px rgba(0,0,0,0.5)",
      }}
    >
      {/* No Qualify Animation for SCC games - full table overlay */}
      {isSCC && (
        <NoQualifyAnimation 
          show={showNoQualifyAnimation}
          playerName={noQualifyPlayerName ?? undefined}
          onComplete={handleNoQualifyAnimationComplete}
        />
      )}
      
      {/* Midnight Animation for SCC games - when someone rolls a 12 */}
      {isSCC && (
        <MidnightAnimation 
          show={showMidnightAnimation}
          playerName={midnightPlayerName ?? undefined}
          onComplete={handleMidnightAnimationComplete}
        />
      )}
      
      {/* Turn Spotlight - DISABLED for dice games */}
      <TurnSpotlight
        currentTurnPosition={currentPlayer?.position ?? null}
        currentPlayerPosition={myPlayer?.position ?? null}
        isObserver={!myPlayer}
        getClockwiseDistance={getClockwiseDistance}
        containerRef={tableContainerRef}
        isVisible={gamePhase === "playing" && currentPlayer !== undefined}
        useFullCoverage={true}
        disabled={true}
      />
      {isMobile ? (
        <div className="grid h-full grid-rows-[auto_1fr_auto_auto]">
          {/* Header - Single line */}
          <header className="px-4 pt-4 pb-2 text-center">
            <h1 className="text-xl font-bold text-poker-gold">
              ${anteAmount} {gameTitle.toUpperCase()}
            </h1>

            <div className="mt-2 flex justify-center">
              <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
                <span className="text-amber-200 text-sm">Pot:</span>
                <span className="text-lg font-bold text-poker-gold">${pot}</span>
              </div>
            </div>
          </header>

          {/* Table (fixed area) */}
          <main className="px-3 pb-2 overflow-hidden" aria-label="Horses game table">
            <div className="flex h-full flex-col">
              {/* Other players row (scrolls sideways, never pushes layout) */}
              <section className="flex gap-3 overflow-x-auto pb-2" aria-label="Players">
                {mobileSeatPlayers.map((player) => {
                  const playerState = horsesState?.playerStates?.[player.id];
                  const isWinner = winningPlayerIds.includes(player.id);
                  const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                  const hasCompleted = playerState?.isComplete || false;
                  const isMe = player.user_id === currentUserId;

                  return (
                    <div key={player.id} className="shrink-0">
                      <HorsesPlayerArea
                        username={getPlayerUsername(player)}
                        position={player.position}
                        isCurrentTurn={isCurrent}
                        isCurrentUser={isMe}
                        handResult={playerState?.result || null}
                        isWinningHand={isWinner && gamePhase === "complete"}
                        hasTurnCompleted={hasCompleted}
                        diceValues={hasCompleted ? playerState?.dice : undefined}
                        myStatus={isMe ? getMyStatus() : undefined}
                        gameType={gameType}
                        isBot={player.is_bot}
                        onClick={isHost && player.is_bot && onPlayerClick ? () => onPlayerClick(player) : undefined}
                      />
                    </div>
                  );
                })}
              </section>

              {/* Felt (rolls happen here) */}
              <section className="flex-1 flex items-end justify-center pb-3" aria-label="Felt">
                <div className="w-full max-w-[560px] rounded-[32px] border border-border/40 bg-background/10 p-4 backdrop-blur-sm shadow-[inset_0_0_60px_rgba(0,0,0,0.35)]">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex gap-2">
                      {(() => {
                        // Waiting / no current player yet
                        if (gamePhase !== "playing" || !currentPlayer) {
                          // Don't show placeholder dice before game starts
                          return null;
                        }

                        // My turn - show "You are rolling" message
                        if (isMyTurn) {
                          const hasRolled = localHand.rollsRemaining < 3;
                          if (!hasRolled) {
                            return (
                              <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                                You are rolling
                              </p>
                            );
                          }
                          // After rolling, still show message (dice are in player box)
                          return (
                            <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
                              You are rolling
                            </p>
                          );
                        }

                        // Someone else's turn - show their dice
                        const diceState = getCurrentTurnDice();
                        if (!diceState) return null;
                        
                        // Hide unrolled dice
                        const hasRolled = diceState.dice.some(d => d.value !== 0);
                        if (!hasRolled) return null;

                        return diceState.dice
                          .filter(die => die.value !== 0)
                          .map((die, idx) => (
                            <HorsesDie
                              key={idx}
                              value={die.value}
                              isHeld={die.isHeld}
                              isRolling={diceState.isRolling}
                              canToggle={false}
                              onToggle={() => {}}
                              size="md"
                            />
                          ));
                      })()}
                    </div>

                    {isMyTurn && localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                      <p className="text-xs text-amber-200/70">Tap dice to hold/unhold</p>
                    )}

                    {gamePhase === "complete" && (
                      <div className="mt-1 text-center p-4 bg-amber-900/50 rounded-xl border-2 border-amber-600 w-full">
                        <h3 className="text-xl font-bold text-poker-gold mb-1">Round Complete!</h3>
                        {winningPlayerIds.length > 1 ? (
                          <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
                        ) : (
                          <p className="text-amber-200">
                            {(() => {
                              const winner = completedResults.find((r) => r.playerId === winningPlayerIds[0]);
                              const winnerPlayer = players.find((p) => p.id === winningPlayerIds[0]);
                              return winner && winnerPlayer
                                ? `${getPlayerUsername(winnerPlayer)} wins with ${winner.result.description}!`
                                : "Winner determined!";
                            })()}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </main>

          {/* Active Player (fixed section) */}
          <section className="px-3 pb-2" aria-label="Active player">
            <div className="flex justify-center">
              <div className="w-full max-w-sm flex flex-col items-center gap-2">
                {turnAnnouncement && (
                  <div className="w-full bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-2 shadow-xl border-2 border-amber-900">
                    <p className="text-slate-900 font-bold text-sm text-center truncate">
                      {turnAnnouncement}
                    </p>
                  </div>
                )}

                {currentPlayer ? (
                  (() => {
                    const playerState = horsesState?.playerStates?.[currentPlayer.id];
                    const isWinner = winningPlayerIds.includes(currentPlayer.id);
                    const hasCompleted = playerState?.isComplete || false;
                    const isMe = currentPlayer.user_id === currentUserId;

                    return (
                      <HorsesPlayerArea
                        username={getPlayerUsername(currentPlayer)}
                        position={currentPlayer.position}
                        isCurrentTurn={gamePhase === "playing"}
                        isCurrentUser={isMe}
                        handResult={playerState?.result || null}
                        isWinningHand={isWinner && gamePhase === "complete"}
                        hasTurnCompleted={hasCompleted}
                        diceValues={hasCompleted ? playerState?.dice : undefined}
                        myStatus={isMe ? getMyStatus() : undefined}
                        gameType={gameType}
                        isBot={currentPlayer.is_bot}
                        onClick={isHost && currentPlayer.is_bot && onPlayerClick ? () => onPlayerClick(currentPlayer) : undefined}
                      />
                    );
                  })()
                ) : (
                  <div className="rounded-lg border border-border/50 bg-background/15 px-4 py-3 text-sm text-muted-foreground">
                    Waiting for the next turn...
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Actions (fixed bottom bar) */}
          <footer
            className="px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            aria-label="Actions"
          >
            {isMyTurn && gamePhase === "playing" ? (
              <div className="mx-auto w-fit flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 backdrop-blur-sm">
                <Button
                  onClick={handleRoll}
                  disabled={localHand.rollsRemaining <= 0 || isRolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1 animate-slow-pulse-red" />
                  Roll{localHand.rollsRemaining === 3 ? "" : " Again"}
                </Button>

                {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                  <Button
                    onClick={handleLockIn}
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-400 hover:bg-amber-500/20"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock In
                  </Button>
                )}
              </div>
            ) : (
              <div className="h-2" />
            )}
          </footer>
        </div>
      ) : (
        <>
          {/* Header - Single line: "$X SHIP" or "$X HORSES" */}
          <header className="absolute top-3 left-1/2 -translate-x-1/2">
            <h1 className="text-xl font-bold text-poker-gold">
              ${anteAmount} {gameTitle.toUpperCase()}
            </h1>
          </header>

          {/* Pot display - moved up */}
          <div className="absolute top-10 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 bg-amber-900/60 px-3 py-1.5 rounded-lg border border-amber-600/50">
              <span className="text-amber-200 text-sm">Pot:</span>
              <span className="text-lg font-bold text-poker-gold">${pot}</span>
            </div>
          </div>

          {/* Turn status (kept out of the felt center to avoid a "modal" feel) */}
          {gamePhase === "playing" && currentPlayer && (
            <div className="absolute top-[72px] left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/20 px-3 py-1 backdrop-blur-sm">
                <Dice5 className="h-4 w-4 text-amber-300" />
                <span className="text-sm text-foreground/90">
                  {isMyTurn ? "Your turn" : `${getPlayerUsername(currentPlayer)}'s turn`}
                </span>
                {isMyTurn ? (
                  <Badge variant="secondary" className="text-xs">
                    Rolls: {localHand.rollsRemaining}
                  </Badge>
                ) : horsesState?.playerStates?.[currentTurnPlayerId || ""] ? (
                  <Badge variant="secondary" className="text-xs">
                    Rolls: {horsesState.playerStates[currentTurnPlayerId || ""].rollsRemaining}
                  </Badge>
                ) : null}
              </div>
            </div>
          )}

          <main
            className={cn("absolute inset-0 pt-28", isMobile ? "px-3 pb-24" : "p-4")}
            aria-label="Horses dice table"
          >
            <div className="relative w-full h-full">
              {/* Position players around the table */}
              {activePlayers.map((player, idx) => {
                const playerState = horsesState?.playerStates?.[player.id];
                const isWinner = winningPlayerIds.includes(player.id);
                const isCurrent = player.id === currentTurnPlayerId && gamePhase === "playing";
                const hasCompleted = playerState?.isComplete || false;
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
                  >
                    <HorsesPlayerArea
                      username={getPlayerUsername(player)}
                      position={player.position}
                      isCurrentTurn={isCurrent}
                      isCurrentUser={isMe}
                      handResult={playerState?.result || null}
                      isWinningHand={isWinner && gamePhase === "complete"}
                      hasTurnCompleted={hasCompleted}
                      diceValues={hasCompleted ? playerState?.dice : undefined}
                      myStatus={isMe ? getMyStatus() : undefined}
                      gameType={gameType}
                      isBot={player.is_bot}
                      onClick={isHost && player.is_bot && onPlayerClick ? () => onPlayerClick(player) : undefined}
                    />
                  </div>
                );
              })}

              {/* Dice on the felt center - for other players watching someone roll */}
              {gamePhase === "playing" && currentPlayer && !isMyTurn && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none">
                  {(() => {
                    const diceState = getCurrentTurnDice();
                    if (!diceState) return null;
                    
                    // Hide unrolled dice (value === 0)
                    const hasRolled = diceState.dice.some(d => d.value !== 0);
                    if (!hasRolled) return null;

                    return (
                      <DiceTableLayout
                        dice={diceState.dice as (HorsesDieType | SCCDieType)[]}
                        isRolling={diceState.isRolling}
                        canToggle={false}
                        size="sm"
                        gameType={gameType}
                        showWildHighlight={!isSCC}
                        isObserver={true}
                        hideUnrolledDice={true}
                        heldMaskBeforeComplete={(diceState as any).heldMaskBeforeComplete}
                        previouslyHeldCount={(diceState as any).heldCountBeforeComplete}
                        animationOrigin={getAnimationOrigin()}
                        rollKey={(diceState as any).rollKey}
                      />
                    );
                  })()}
                </div>
              )}

              {/* My turn - show "You are rolling" message on felt (dice shown in player box) */}
              {isMyTurn && gamePhase === "playing" && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0">
                  <DiceTableLayout
                    dice={[]}
                    isRolling={false}
                    canToggle={false}
                    size="sm"
                    gameType={gameType}
                    showRollingMessage={true}
                  />
                </div>
              )}

              {/* Game complete message */}
              {gamePhase === "complete" && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="text-center p-6 bg-amber-900/50 rounded-xl border-2 border-amber-600 backdrop-blur-sm">
                    <h3 className="text-2xl font-bold text-poker-gold mb-2">Round Complete!</h3>
                    {winningPlayerIds.length > 1 ? (
                      <p className="text-amber-200">It's a tie! Re-ante to continue...</p>
                    ) : (
                      <p className="text-amber-200">
                        {(() => {
                          const winner = completedResults.find((r) => r.playerId === winningPlayerIds[0]);
                          const winnerPlayer = players.find((p) => p.id === winningPlayerIds[0]);
                          return winner && winnerPlayer
                            ? `${getPlayerUsername(winnerPlayer)} wins with ${winner.result.description}!`
                            : "Winner determined!";
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Bottom action bar for my turn (fixed) */}
          {isMyTurn && gamePhase === "playing" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30">
              <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-2 backdrop-blur-sm">
                <Button
                  onClick={handleRoll}
                  disabled={localHand.rollsRemaining <= 0 || isRolling}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <RotateCcw className="w-4 h-4 mr-1 animate-slow-pulse-red" />
                  Roll{localHand.rollsRemaining === 3 ? "" : " Again"}
                </Button>

                {localHand.rollsRemaining < 3 && localHand.rollsRemaining > 0 && (
                  <Button
                    onClick={handleLockIn}
                    size="sm"
                    variant="outline"
                    className="border-amber-500 text-amber-400 hover:bg-amber-500/20"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock In
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
