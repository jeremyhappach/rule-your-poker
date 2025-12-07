import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { User } from "@supabase/supabase-js";
import { GameTable } from "@/components/GameTable";
import { MobileGameTable } from "@/components/MobileGameTable";
import { DealerConfig } from "@/components/DealerConfig";
import { DealerGameSetup } from "@/components/DealerGameSetup";
import { AnteUpDialog } from "@/components/AnteUpDialog";
import { WaitingForPlayersTable } from "@/components/WaitingForPlayersTable";
import { GameOverCountdown } from "@/components/GameOverCountdown";
import { DealerConfirmGameOver } from "@/components/DealerConfirmGameOver";
import { DealerSettingUpGame } from "@/components/DealerSettingUpGame";
import { DealerSelection } from "@/components/DealerSelection";
import { VisualPreferencesProvider, useVisualPreferences, DeckColorMode } from "@/hooks/useVisualPreferences";
import { useGameChat } from "@/hooks/useGameChat";

import { startRound, makeDecision, autoFoldUndecided, proceedToNextRound } from "@/lib/gameLogic";
import { startHolmRound, endHolmRound, proceedToNextHolmRound, checkHolmRoundComplete } from "@/lib/holmGameLogic";
import { addBotPlayer, addBotPlayerSittingOut, makeBotDecisions, makeBotAnteDecisions } from "@/lib/botPlayer";
import { evaluatePlayerStatesEndOfGame, rotateDealerPosition } from "@/lib/playerStateEvaluation";
import { Card as CardType } from "@/lib/cardUtils";
import { Share2, Bot, Settings } from "lucide-react";
import { PlayerOptionsMenu } from "@/components/PlayerOptionsMenu";
import { NotEnoughPlayersCountdown } from "@/components/NotEnoughPlayersCountdown";
import { RejoinNextHandButton } from "@/components/RejoinNextHandButton";
import { BotOptionsDialog } from "@/components/BotOptionsDialog";
import { GameDeckColorModeSync, handleDeckColorModeChange } from "@/components/GameDeckColorModeSync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Player {
  id: string;
  user_id: string;
  chips: number;
  position: number;
  status: string;
  current_decision: string | null;
  decision_locked: boolean | null;
  legs: number;
  is_bot: boolean;
  sitting_out: boolean;
  sitting_out_hands: number;
  ante_decision: string | null;
  auto_ante: boolean;
  sit_out_next_hand: boolean;
  stand_up_next_hand: boolean;
  waiting: boolean;
  deck_color_mode?: string | null;
  created_at?: string;
  profiles?: {
    username: string;
  };
}

interface GameData {
  id: string;
  name?: string;
  status: string;
  buy_in: number;
  pot: number | null;
  current_round: number | null;
  all_decisions_in: boolean | null;
  dealer_position: number | null;
  awaiting_next_round?: boolean | null;
  next_round_number?: number | null;
  ante_decision_deadline?: string | null;
  ante_amount?: number;
  leg_value?: number;
  pussy_tax_enabled?: boolean;
  pussy_tax_value?: number;
  legs_to_win?: number;
  pot_max_enabled?: boolean;
  pot_max_value?: number;
  last_round_result?: string | null;
  pending_session_end?: boolean;
  game_over_at?: string | null;
  created_at?: string;
  total_hands?: number | null;
  game_type?: string | null;
  buck_position?: number | null;
  chucky_cards?: number;
  is_paused?: boolean;
  paused_time_remaining?: number | null;
  rounds?: Round[];
}

interface Round {
  id: string;
  game_id: string;
  round_number: number;
  cards_dealt: number;
  pot: number;
  status: string;
  decision_deadline: string | null;
  community_cards?: any;
  community_cards_revealed?: number;
  chucky_active?: boolean;
  chucky_cards?: any;
  chucky_cards_revealed?: number;
  current_turn_position?: number | null;
  created_at?: string;
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

// Authoritative card count from the round record - bypasses state sync issues
interface CardStateContext {
  roundId: string;
  roundNumber: number;
  cardsDealt: number; // Authoritative expected card count
}

const Game = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerCards, setPlayerCards] = useState<PlayerCards[]>([]);
  const [cardStateContext, setCardStateContext] = useState<CardStateContext | null>(null); // Authoritative card count
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [anteTimeLeft, setAnteTimeLeft] = useState<number | null>(null);
  const [showAnteDialog, setShowAnteDialog] = useState(false);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [hasShownEndingToast, setHasShownEndingToast] = useState(false);
  const [lastTurnPosition, setLastTurnPosition] = useState<number | null>(null);
  const [timerTurnPosition, setTimerTurnPosition] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'stay' | 'fold' | null>(null);
  const [decisionTimerSeconds, setDecisionTimerSeconds] = useState<number>(30);
  const decisionTimerRef = useRef<number>(30); // Use ref for immediate access
  const anteProcessingRef = useRef(false);
  const isPausedRef = useRef<boolean | undefined>(false); // Track pause state for timer interval
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Track timer interval for cleanup
  const [decisionDeadline, setDecisionDeadline] = useState<string | null>(null); // Server deadline for timer sync
  const [cachedRoundData, setCachedRoundData] = useState<Round | null>(null); // Cache round data during game_over to preserve community cards
  const cachedRoundRef = useRef<Round | null>(null); // Ref for immediate cache access (survives re-renders)
  const gameTypeSwitchingRef = useRef<boolean>(false); // Guard against realtime overwrites during game type switches
  
  // Track previous game config for "Running it Back" detection
  interface PreviousGameConfig {
    game_type: string | null;
    ante_amount: number;
    leg_value: number;
    legs_to_win: number;
    pussy_tax_enabled: boolean;
    pussy_tax_value: number;
    pot_max_enabled: boolean;
    pot_max_value: number;
    chucky_cards: number;
  }
  const [previousGameConfig, setPreviousGameConfig] = useState<PreviousGameConfig | null>(null);
  const [isRunningItBack, setIsRunningItBack] = useState(false);
  const [showNotEnoughPlayers, setShowNotEnoughPlayers] = useState(false);
  const [selectedBot, setSelectedBot] = useState<Player | null>(null);
  const [showBotOptions, setShowBotOptions] = useState(false);
  
  // Chat functionality
  const { chatBubbles, sendMessage: sendChatMessage, isSending: isChatSending, getPositionForUserId } = useGameChat(gameId, players);
  
  // Player options state
  const [playerOptions, setPlayerOptions] = useState({
    autoAnte: false,
    sitOutNextHand: false,
    standUpNextHand: false,
  });
  
  // Player options - synced with database
  const handlePlayerOptionChange = async (option: 'auto_ante' | 'sit_out_next_hand' | 'stand_up_next_hand', value: boolean) => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    
    // Optimistic update
    setPlayerOptions(prev => ({
      ...prev,
      [option === 'auto_ante' ? 'autoAnte' : option === 'sit_out_next_hand' ? 'sitOutNextHand' : 'standUpNextHand']: value
    }));
    
    // Persist to database
    const { error } = await supabase
      .from('players')
      .update({ [option]: value })
      .eq('id', currentPlayer.id);
    
    if (error) {
      console.error('[PLAYER OPTIONS] Failed to save:', error);
      // Revert on error
      setPlayerOptions(prev => ({
        ...prev,
        [option === 'auto_ante' ? 'autoAnte' : option === 'sit_out_next_hand' ? 'sitOutNextHand' : 'standUpNextHand']: !value
      }));
    }
  };
  
  const handleStandUpNow = async () => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    
    // Stand up = set sitting_out to false and remove from seat
    const { error } = await supabase
      .from('players')
      .update({ 
        sitting_out: false,
        status: 'standing'
      })
      .eq('id', currentPlayer.id);
    
    if (error) {
      console.error('[PLAYER OPTIONS] Failed to stand up:', error);
      toast({ title: "Error", description: "Failed to stand up", variant: "destructive" });
    }
  };
  
  const handleLeaveGameNow = async () => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (!currentPlayer) return;
    
    // Delete the player record entirely
    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', currentPlayer.id);
    
    if (error) {
      console.error('[PLAYER OPTIONS] Failed to leave game:', error);
      toast({ title: "Error", description: "Failed to leave game", variant: "destructive" });
    } else {
      navigate('/');
    }
  };
  
  // Handle pause/resume toggle for host
  const handleTogglePause = useCallback(async () => {
    if (!game || !gameId) return;
    
    const newPausedState = !game.is_paused;
    
    // Get current round for deadline updates - use latest round for Holm games
    const currentRoundData = game.game_type === 'holm-game'
      ? game.rounds?.reduce((latest, r) => (!latest || r.round_number > latest.round_number) ? r : latest, null as Round | null)
      : game.rounds?.find(r => r.round_number === game.current_round);
    
    if (newPausedState) {
      // PAUSING: Save current remaining time
      const remainingTime = timeLeft ?? 0;
      console.log('[PAUSE] Pausing game, saving remaining time:', remainingTime);
      
      // Optimistic UI update
      setGame(prev => prev ? { ...prev, is_paused: true, paused_time_remaining: remainingTime } : prev);
      
      const { error } = await supabase
        .from('games')
        .update({ 
          is_paused: true, 
          paused_time_remaining: remainingTime 
        })
        .eq('id', gameId);
      
      if (error) {
        console.error('[PAUSE] Error pausing:', error);
        setGame(prev => prev ? { ...prev, is_paused: false, paused_time_remaining: null } : prev);
        toast({ title: "Error", description: "Failed to pause game", variant: "destructive" });
      }
    } else {
      // RESUMING: Set new deadline = now + paused_time_remaining
      const savedTime = game.paused_time_remaining ?? decisionTimerRef.current;
      const newDeadline = new Date(Date.now() + savedTime * 1000).toISOString();
      console.log('[PAUSE] Resuming game, setting new deadline:', newDeadline, 'with', savedTime, 'seconds');
      
      // Optimistic UI update
      setGame(prev => prev ? { ...prev, is_paused: false, paused_time_remaining: null } : prev);
      setDecisionDeadline(newDeadline);
      
      // Update game and current round deadline
      const { error: gameError } = await supabase
        .from('games')
        .update({ 
          is_paused: false, 
          paused_time_remaining: null 
        })
        .eq('id', gameId);
      
      if (currentRoundData?.id) {
        const { error: roundError } = await supabase
          .from('rounds')
          .update({ decision_deadline: newDeadline })
          .eq('id', currentRoundData.id);
        
        if (roundError) {
          console.error('[PAUSE] Error updating round deadline:', roundError);
        }
      }
      
      if (gameError) {
        console.error('[PAUSE] Error resuming:', gameError);
        setGame(prev => prev ? { ...prev, is_paused: true } : prev);
        toast({ title: "Error", description: "Failed to resume game", variant: "destructive" });
      }
    }
  }, [game, gameId, timeLeft, toast]);

  // DEBUG: Pause auto-progression for Holm games to debug stale card issues
  // Set to true to enable debug mode (shows "Proceed to Next Round" button)
  const [debugHolmPaused, setDebugHolmPaused] = useState(false); // TEMPORARILY DISABLED - set to true to re-enable
  
  // CRITICAL: Track game state for detecting transitions without relying on realtime payload.old
  const lastKnownGameTypeRef = useRef<string | null>(null);
  const lastKnownRoundRef = useRef<number | null>(null);
  
  // Track max community cards revealed - never decrease during showdowns
  // Must be defined here (not inline) so it's accessible in realtime handlers
  const maxRevealedRef = useRef<number>(0);
  // Track card identity to detect new hands (when cards change completely)
  const cardIdentityRef = useRef<string>('');

  // Load player options from current player when player data changes
  useEffect(() => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    if (currentPlayer) {
      setPlayerOptions({
        autoAnte: currentPlayer.auto_ante || false,
        sitOutNextHand: currentPlayer.sit_out_next_hand || false,
        standUpNextHand: currentPlayer.stand_up_next_hand || false,
      });
    }
  }, [players, user?.id]);

  // Clear pending decision when backend confirms - but keep it visible for 3-5-7 feedback
  useEffect(() => {
    const currentPlayer = players.find(p => p.user_id === user?.id);
    // For 3-5-7, don't clear immediately when decision_locked - keep showing the visual feedback
    // Only clear when all_decisions_in becomes false again (next round)
    if (currentPlayer?.decision_locked && pendingDecision && game?.game_type === 'holm-game') {
      console.log('[PENDING_DECISION] Backend confirmed (Holm), clearing pending decision');
      setPendingDecision(null);
    }
  }, [players, user?.id, pendingDecision, game?.game_type]);

  // Clear pending decision when a new round starts (awaiting_next_round goes from true to false, or new cards dealt)
  const prevAwaitingRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prevAwaiting = prevAwaitingRef.current;
    const currentAwaiting = game?.awaiting_next_round || false;
    
    // Clear when round transitions: awaiting goes from true to false
    if (prevAwaiting === true && currentAwaiting === false && pendingDecision) {
      console.log('[PENDING_DECISION] Round transitioned (awaiting false), clearing pending decision');
      setPendingDecision(null);
    }
    
    prevAwaitingRef.current = currentAwaiting;
  }, [game?.awaiting_next_round, pendingDecision]);
  
  // Also clear when current_round changes (new round started)
  const prevRoundRef = useRef<number | null>(null);
  useEffect(() => {
    const prevRound = prevRoundRef.current;
    const currentRoundNum = game?.current_round || 0;
    
    if (prevRound !== null && currentRoundNum !== prevRound && pendingDecision) {
      console.log('[PENDING_DECISION] Round number changed, clearing pending decision');
      setPendingDecision(null);
    }
    
    prevRoundRef.current = currentRoundNum;
  }, [game?.current_round, pendingDecision]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Store the game URL to redirect back after auth
        const currentPath = window.location.pathname;
        sessionStorage.setItem('redirectAfterAuth', currentPath);
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        // Store the game URL to redirect back after auth
        const currentPath = window.location.pathname;
        sessionStorage.setItem('redirectAfterAuth', currentPath);
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Fetch game defaults for decision timer
  useEffect(() => {
    const fetchGameDefaults = async () => {
      if (!game?.game_type) return;
      
      // Map game_type to defaults table format (holm-game -> holm, 3-5-7-game -> 3-5-7)
      const defaultsGameType = game.game_type === 'holm-game' ? 'holm' : '3-5-7';
      
      const { data, error } = await supabase
        .from('game_defaults')
        .select('decision_timer_seconds')
        .eq('game_type', defaultsGameType)
        .single();
      
      if (data && !error) {
        console.log('[GAME DEFAULTS] Loaded decision_timer_seconds:', data.decision_timer_seconds, 'for', defaultsGameType);
        setDecisionTimerSeconds(data.decision_timer_seconds);
        decisionTimerRef.current = data.decision_timer_seconds;
      } else {
        console.log('[GAME DEFAULTS] No defaults found for', defaultsGameType, ', using fallback of 30 seconds', error);
      }
    };
    
    fetchGameDefaults();
  }, [game?.game_type]);

  useEffect(() => {
    if (!gameId || !user) return;

    console.log('[SUBSCRIPTION] Setting up real-time subscriptions for game:', gameId);
    fetchGameData();

    // Debounce fetch to batch rapid updates during transitions
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchGameData();
      }, 300); // 300ms balances responsiveness and batching
    };

    const channel = supabase
      .channel(`game-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        (payload) => {
          const newData = payload.new as any;
          const oldData = payload.old as any;
          
          console.log('[REALTIME] 🔔 Games table UPDATE:', {
            eventType: payload.eventType,
            newGameType: newData?.game_type,
            oldGameType: oldData?.game_type,
            localGameType: lastKnownGameTypeRef.current,
            newRound: newData?.current_round,
            oldRound: oldData?.current_round,
            localRound: lastKnownRoundRef.current,
            status: newData?.status,
            awaiting_next_round: newData?.awaiting_next_round,
            is_paused: newData?.is_paused
          });
          
          // CRITICAL: Detect game_type changes using LOCAL STATE (refs) as source of truth
          // Realtime payload.old may be empty/incomplete depending on REPLICA IDENTITY settings
          const incomingGameType = newData?.game_type;
          const localGameType = lastKnownGameTypeRef.current;
          
          // CRITICAL FIX: Also clear cards on ANY game_type change, even from null
          // This ensures players who join mid-session get fresh state
          if (incomingGameType && incomingGameType !== localGameType) {
            console.log('[REALTIME] 🎯🎯🎯 GAME TYPE CHANGED (detected via local state):', localGameType, '->', incomingGameType, '- CLEARING ALL CARD STATE!');
            // Update ref immediately
            lastKnownGameTypeRef.current = incomingGameType;
            lastKnownRoundRef.current = null;
            
            // CRITICAL FIX: Immediately update game state to prevent stale rendering
            // This ensures GameTable sees the new game_type BEFORE fetchGameData completes
            setGame(prevGame => prevGame ? {
              ...prevGame,
              game_type: incomingGameType,
              current_round: null,  // Clear round to prevent stale card count calculation
              awaiting_next_round: false,
              status: newData?.status || prevGame.status
            } : null);
            
            // Clear all card state for this client
            setPlayerCards([]);
            setCardStateContext(null);
            setCachedRoundData(null);
            cachedRoundRef.current = null;
            maxRevealedRef.current = 0;
            if (debounceTimer) clearTimeout(debounceTimer);
            // Fetch fresh data after a short delay to allow DB to settle
            setTimeout(() => fetchGameData(), 200);
            return;
          }
          
          // GUARD: Skip realtime fetches during game type switches to prevent overwriting optimistic UI (dealer only)
          if (gameTypeSwitchingRef.current) {
            console.log('[REALTIME] ⏸️ Skipping fetch - game type switch in progress');
            return;
          }

          // CRITICAL: Detect round changes using LOCAL STATE for 3-5-7 sync
          const incomingRound = newData?.current_round;
          const localRound = lastKnownRoundRef.current;
          
          // CRITICAL FIX: Sync when:
          // 1. Incoming round is valid AND different from local
          // 2. OR local is null but incoming is valid (initial state sync)
          // 3. OR local has a value but incoming is different
          const needsRoundSync = incomingRound !== undefined && incomingRound !== null && 
            (localRound === null || incomingRound !== localRound);
          
          if (needsRoundSync) {
            console.log('[REALTIME] 🔄🔄🔄 ROUND CHANGED/SYNC:', localRound, '->', incomingRound, '- FORCING SYNC!');
            lastKnownRoundRef.current = incomingRound;
            
            // CRITICAL: Do NOT clear cards here - causes "Wait..." flash
            // Let fetchGameData atomically replace cards with new round's cards
            setCardStateContext(null);
            // Don't call setPlayerCards([])
            
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            return;
          }
          
          // CRITICAL: Track if we've already handled this update to avoid double-fetching
          let handled = false;
          
          // CRITICAL FIX: Check status changes FIRST - this is most important for game flow
          // When game starts, status changes from 'waiting' to 'ante_decision'/'configuring'
          if (newData && 'status' in newData) {
            const newStatus = newData.status;
            // CRITICAL: Immediately fetch for any status change that affects UI flow
            if (newStatus === 'ante_decision' || newStatus === 'configuring' || newStatus === 'in_progress' || newStatus === 'game_selection' || newStatus === 'waiting') {
              console.log('[REALTIME] 🎮 STATUS CHANGED TO:', newStatus, '- IMMEDIATE FETCH!');
              
              // CRITICAL FIX: Clear ALL card state when a new game is being set up
              // This ensures stale cards from previous game types are removed
              if (newStatus === 'ante_decision' || newStatus === 'configuring' || newStatus === 'game_selection') {
                console.log('[REALTIME] 🧹 NEW GAME SETUP DETECTED - CLEARING ALL CARD STATE!');
                setPlayerCards([]);
                setCardStateContext(null);
                setCachedRoundData(null);
                cachedRoundRef.current = null;
                maxRevealedRef.current = 0;
              }
              
              if (debounceTimer) clearTimeout(debounceTimer);
              fetchGameData();
              // Extra delayed fetches to catch any race conditions with player updates
              setTimeout(() => {
                console.log('[REALTIME] 🎮 STATUS CHANGED - Delayed refetch after 300ms');
                fetchGameData();
              }, 300);
              setTimeout(() => {
                console.log('[REALTIME] 🎮 STATUS CHANGED - Delayed refetch after 700ms');
                fetchGameData();
              }, 700);
              handled = true;
            }
          }
          
          // Handle awaiting_next_round changes (for round transitions within a game)
          if (!handled && newData && 'awaiting_next_round' in newData) {
            if (newData.awaiting_next_round === true) {
              console.log('[REALTIME] ⚡⚡⚡ AWAITING DETECTED - IMMEDIATE FETCH! ⚡⚡⚡');
            } else {
              console.log('[REALTIME] ⚡⚡⚡ AWAITING CLEARED (new hand starting) - CLEARING CACHE & FETCH! ⚡⚡⚡');
              // CRITICAL: Clear cache when new Holm hand starts (awaiting becomes false)
              // This ensures stale Chucky cards and old community cards are cleared
              setCardStateContext(null);
              setCachedRoundData(null);
              cachedRoundRef.current = null;
              maxRevealedRef.current = 0;
              // Don't call setPlayerCards([]) - let fetchGameData atomically replace them
            }
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Handle pause state changes
          if (!handled && newData && 'is_paused' in newData) {
            // Immediately update local game state for pause - don't wait for fetch
            console.log('[REALTIME] ⏸️ PAUSE STATE CHANGED - IMMEDIATE LOCAL UPDATE!', newData.is_paused, 'remaining:', newData.paused_time_remaining);
            
            // CRITICAL: Update ref and clear interval SYNCHRONOUSLY before React render cycle
            isPausedRef.current = newData.is_paused;
            if (newData.is_paused && timerIntervalRef.current) {
              console.log('[REALTIME] ⏸️ Clearing timer interval synchronously on pause');
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            
            setGame(prev => prev ? {
              ...prev,
              is_paused: newData.is_paused,
              paused_time_remaining: newData.paused_time_remaining
            } : prev);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Handle pot changes
          if (!handled && newData && 'pot' in newData) {
            // CRITICAL: Pot changes need immediate sync for all players
            console.log('[REALTIME] 💰 POT CHANGED - IMMEDIATE FETCH!', newData.pot);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            handled = true;
          }
          
          // Fallback to debounced fetch if nothing else handled
          if (!handled) {
            console.log('[REALTIME] No specific trigger, using debounced fetch');
            debouncedFetch();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[REALTIME] Players table changed:', payload.eventType, payload);
          
          // CRITICAL: Immediate fetch for INSERT (new player joined) - essential for PreGameLobby
          if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            console.log('[REALTIME] 👤 PLAYER JOINED/LEFT - IMMEDIATE FETCH!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            return;
          }
          
          // Immediate fetch when ante_decision changes (critical for ante dialog)
          if (payload.new && 'ante_decision' in payload.new) {
            console.log('[REALTIME] 🎲 ANTE DECISION CHANGED - IMMEDIATE FETCH!', payload.new.ante_decision);
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else if (payload.new && 'sitting_out' in payload.new && payload.new.sitting_out === false) {
            // CRITICAL: Player just became active (anted up) - immediate fetch for cards
            console.log('[REALTIME] 🎮 PLAYER BECAME ACTIVE - IMMEDIATE FETCH FOR CARDS!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            // Extra delayed fetch to catch cards that may be dealt after status update
            setTimeout(() => {
              console.log('[REALTIME] 🎮 PLAYER BECAME ACTIVE - Delayed refetch after 1s');
              fetchGameData();
            }, 1000);
          } else {
            debouncedFetch();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[REALTIME] *** ROUNDS TABLE CHANGED ***', payload);
          // Immediate fetch for INSERT (new round started) or turn changes
          if (payload.eventType === 'INSERT') {
            console.log('[REALTIME] 🎴 NEW ROUND INSERTED - Immediate fetch for all clients!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else if (payload.eventType === 'UPDATE' && payload.new && 'current_turn_position' in payload.new) {
            console.log('[REALTIME] Turn change detected! Immediately fetching without debounce');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
          } else {
            console.log('[REALTIME] Other round change, using debounced fetch');
            debouncedFetch();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_cards'
        },
        (payload) => {
          console.log('[REALTIME] Player cards changed:', payload);
          // Immediate fetch for INSERT (cards dealt) - critical for observers and newly active players
          if (payload.eventType === 'INSERT') {
            console.log('[REALTIME] 🃏 CARDS DEALT - Immediate fetch!');
            if (debounceTimer) clearTimeout(debounceTimer);
            fetchGameData();
            // CRITICAL: Cards are inserted BEFORE game status is updated to 'in_progress'
            // This causes a race condition where fetchGameData won't fetch cards because
            // the status check fails. Add delayed refetch to catch the updated status.
            setTimeout(() => {
              console.log('[REALTIME] 🃏 CARDS DEALT - Delayed refetch after status update');
              fetchGameData();
            }, 500);
          } else {
            debouncedFetch();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log('[REALTIME] Profiles table changed:', payload);
          debouncedFetch();
        }
      )
      .subscribe((status) => {
        console.log('[SUBSCRIPTION] Status:', status);
      });

    return () => {
      console.log('[SUBSCRIPTION] Cleaning up subscriptions');
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [gameId, user]);

  // Timer countdown effect
  // Subscribe to real-time updates for rounds to catch turn changes and NEW ROUNDS immediately
  useEffect(() => {
    if (!gameId || !game) return;

    console.log('[REALTIME] Setting up realtime subscription for rounds (INSERT + UPDATE)');
    
    const channel = supabase
      .channel(`rounds-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[REALTIME] *** NEW ROUND CREATED ***', payload);
          const newRoundNumber = (payload.new as any)?.round_number;
          console.log('[REALTIME] 🎲🎲🎲 NEW ROUND:', newRoundNumber, '- CRITICAL SYNC NEEDED!');
          
          // CRITICAL: Update ref immediately to prevent desync
          if (newRoundNumber !== undefined && newRoundNumber !== null) {
            lastKnownRoundRef.current = newRoundNumber;
          }
          
          // CRITICAL: Do NOT clear cards here - let fetchGameData atomically replace them
          // Clearing cards causes brief "Wait..." flash while fetch is in progress
          setCardStateContext(null);
          // Don't call setPlayerCards([]) - just fetch and replace
          
          // Immediate fetch
          fetchGameData();
          
          // Delayed fetch to catch cards that are dealt after round creation
          setTimeout(() => {
            console.log('[REALTIME] 🎲 NEW ROUND - Delayed fetch for cards');
            fetchGameData();
          }, 300);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          console.log('[REALTIME] *** ROUND UPDATE RECEIVED ***', payload);
          console.log('[REALTIME] New turn position:', (payload.new as any).current_turn_position);
          console.log('[REALTIME] Round status:', (payload.new as any).status);
          console.log('[REALTIME] Immediately refetching game data');
          fetchGameData();
        }
      )
      .subscribe();

    return () => {
      console.log('[REALTIME] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [gameId, game?.id]);

  // Update pause ref and clear timer when paused
  
  // Update pause ref and clear timer when paused
  useEffect(() => {
    isPausedRef.current = game?.is_paused;
    // If just paused, immediately clear the timer interval
    if (game?.is_paused && timerIntervalRef.current) {
      console.log('[TIMER COUNTDOWN] Pause detected - clearing interval immediately');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, [game?.is_paused]);

  // Fallback polling for pause state - ensures observers get pause updates even if realtime fails
  useEffect(() => {
    if (!gameId) return;
    
    const pollPauseState = async () => {
      const { data } = await supabase
        .from('games')
        .select('is_paused, paused_time_remaining')
        .eq('id', gameId)
        .single();
      
      if (data && data.is_paused !== isPausedRef.current) {
        console.log('[PAUSE POLL] Pause state mismatch detected! DB:', data.is_paused, 'Local:', isPausedRef.current);
        isPausedRef.current = data.is_paused;
        if (data.is_paused && timerIntervalRef.current) {
          console.log('[PAUSE POLL] Clearing timer interval');
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        // Update game state
        setGame(prev => prev ? { ...prev, is_paused: data.is_paused, paused_time_remaining: data.paused_time_remaining } : prev);
      }
    };
    
    // Poll every 2 seconds as fallback
    const pollInterval = setInterval(pollPauseState, 2000);
    return () => clearInterval(pollInterval);
  }, [gameId]);

  // Simple state tracking refs - no aggressive polling
  const lastSyncedRoundRef = useRef<string | null>(null);

  // Handle paused time display separately from interval management
  useEffect(() => {
    if (game?.is_paused && game.paused_time_remaining !== null && game.paused_time_remaining !== undefined) {
      setTimeLeft(game.paused_time_remaining);
    }
  }, [game?.is_paused, game?.paused_time_remaining]);

  // Server-driven timer countdown - uses ref for pause state to avoid dependency issues
  useEffect(() => {
    // Don't start timer if no deadline or game conditions prevent it
    if (!decisionDeadline || game?.awaiting_next_round || game?.last_round_result || game?.all_decisions_in) {
      console.log('[TIMER COUNTDOWN] Not starting - conditions not met', { 
        decisionDeadline, 
        awaiting: game?.awaiting_next_round, 
        result: game?.last_round_result, 
        allDecisionsIn: game?.all_decisions_in 
      });
      return;
    }

    // Calculate time from server deadline
    const calculateRemaining = () => {
      const deadline = new Date(decisionDeadline).getTime();
      const now = Date.now();
      return Math.max(0, Math.floor((deadline - now) / 1000));
    };

    // Set initial value only if not paused
    if (!isPausedRef.current) {
      setTimeLeft(calculateRemaining());
    }

    // Update every second - check pause state via ref FIRST before any calculation
    const intervalId = setInterval(() => {
      // CRITICAL: Check pause ref immediately - exit before any work if paused
      if (isPausedRef.current) {
        console.log('[TIMER COUNTDOWN] Tick skipped - game is paused');
        return; // Just skip this tick, don't clear interval (let the useEffect handle cleanup)
      }
      const remaining = calculateRemaining();
      console.log('[TIMER COUNTDOWN] Tick (from deadline):', remaining);
      setTimeLeft(remaining);
    }, 1000);

    // Store in ref for external access (realtime handler)
    timerIntervalRef.current = intervalId;

    return () => {
      console.log('[TIMER COUNTDOWN] Cleanup - clearing interval');
      clearInterval(intervalId);
      if (timerIntervalRef.current === intervalId) {
        timerIntervalRef.current = null;
      }
    };
  }, [decisionDeadline, game?.awaiting_next_round, game?.last_round_result, game?.all_decisions_in]);

  // Ante timer countdown effect
  useEffect(() => {
    if (anteTimeLeft === null || anteTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setAnteTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [anteTimeLeft]);

  // Trigger bot ante decisions - INSTANT for bots
  useEffect(() => {
    if (game?.status === 'ante_decision') {
      console.log('[ANTE PHASE] Game entered ante_decision status, triggering bot decisions IMMEDIATELY');
      // Call immediately - no delay needed for bots
      makeBotAnteDecisions(gameId!);
    }
  }, [game?.status, gameId]);

  // CRITICAL: Aggressive polling fallback for realtime reliability issues
  // This handles: newly active players needing cards, ante dialog not showing, game_over stuck
  useEffect(() => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user?.id);
    const isSittingOut = currentPlayer?.sitting_out === true;
    const needsAnteDecision = currentPlayer?.ante_decision === null && game?.status === 'ante_decision';
    const isDealer = currentPlayer?.position === game?.dealer_position;
    const isCreator = currentPlayer?.position === 1;
    
    // Check if player just anted up but has no cards yet (critical race condition)
    const justAntedUpNoCards = 
      currentPlayer && 
      currentPlayer.ante_decision === 'ante_up' && 
      !currentPlayer.sitting_out &&
      game?.status === 'in_progress' &&
      playerCards.length === 0;
    
    // Check if we're waiting for ante_decision status after config complete
    // Non-dealers should poll aggressively when game is in ante_decision but they haven't seen the dialog yet
    const waitingForAnteDialog = 
      game?.status === 'ante_decision' && 
      currentPlayer && 
      currentPlayer.ante_decision === null && 
      !isDealer &&
      !showAnteDialog;
    
    const waitingForAnteStatus = 
      game?.status === 'configuring' || 
      waitingForAnteDialog;
    
    // CRITICAL: Poll when stuck on game_over - dealer may have moved on to game_selection/configuring/ante_decision
    // Non-dealers should poll to detect when the game has transitioned past game_over
    const stuckOnGameOver = 
      game?.status === 'game_over' && 
      currentPlayer && 
      !isDealer;
    
    // Also poll during game_selection if not the dealer - wait for configuring transition
    const waitingForConfig = 
      game?.status === 'game_selection' && 
      currentPlayer && 
      !isDealer;
    
    // CRITICAL: Poll during waiting/dealer_selection for non-creators to detect game start
    const waitingForGameStart = 
      (game?.status === 'waiting' || game?.status === 'dealer_selection') && 
      currentPlayer && 
      !isCreator;
    
    // CRITICAL: Host in waiting status should also poll to see new players joining
    // Realtime INSERT events are unreliable
    const hostWaitingForPlayers = 
      game?.status === 'waiting' && 
      isCreator;
    
    // CRITICAL: Detect stuck Holm game state where all_decisions_in=true but round is still betting
    // and no one can make a decision. This can happen due to race conditions.
    const latestRound = game?.game_type === 'holm-game'
      ? game?.rounds?.reduce((latest: any, r: any) => (!latest || r.round_number > latest.round_number) ? r : latest, null)
      : game?.rounds?.find((r: any) => r.round_number === game?.current_round);
    const stuckHolmState = 
      game?.game_type === 'holm-game' &&
      game?.status === 'in_progress' &&
      game?.all_decisions_in === true &&
      !game?.awaiting_next_round &&
      latestRound?.status === 'betting' &&
      currentPlayer;
    
    // Also detect when Holm game started but no round was created
    const holmNoRound = 
      game?.game_type === 'holm-game' &&
      game?.status === 'in_progress' &&
      !game?.current_round &&
      currentPlayer;
    
    const shouldPoll = isSittingOut || needsAnteDecision || justAntedUpNoCards || waitingForAnteStatus || stuckOnGameOver || waitingForConfig || waitingForGameStart || hostWaitingForPlayers || stuckHolmState || holmNoRound;
    
    if (!shouldPoll) return;
    
    console.log('[CRITICAL POLL] Starting aggressive polling:', {
      isSittingOut,
      needsAnteDecision,
      justAntedUpNoCards,
      waitingForAnteDialog,
      waitingForAnteStatus,
      stuckOnGameOver,
      waitingForConfig,
      waitingForGameStart,
      hostWaitingForPlayers,
      stuckHolmState,
      holmNoRound,
      showAnteDialog,
      gameStatus: game?.status,
      playerCardsCount: playerCards.length
    });
    
    // Poll more frequently (250ms) for critical transitions, 500ms otherwise
    // Host waiting for players polls every 1 second (less aggressive)
    const pollInterval = hostWaitingForPlayers ? 1000 : 
      (waitingForAnteDialog || stuckOnGameOver || waitingForConfig || waitingForGameStart || stuckHolmState || holmNoRound) ? 250 : 500;
    
    const intervalId = setInterval(async () => {
      console.log('[CRITICAL POLL] Polling game data... interval:', pollInterval);
      
      // If stuck in Holm state, try to fix it by resetting all_decisions_in
      if (stuckHolmState) {
        console.log('[CRITICAL POLL] Detected stuck Holm state - attempting recovery');
        // Reset all_decisions_in to allow the game to continue
        await supabase
          .from('games')
          .update({ all_decisions_in: false })
          .eq('id', gameId)
          .eq('all_decisions_in', true)
          .eq('awaiting_next_round', false);
      }
      
      // If Holm game started but no round created, try to create it
      if (holmNoRound && isCreator) {
        console.log('[CRITICAL POLL] Detected Holm game with no round - attempting to start round');
        try {
          await startHolmRound(gameId!, true);
        } catch (e) {
          console.error('[CRITICAL POLL] Failed to start Holm round:', e);
        }
      }
      
      fetchGameData();
    }, pollInterval);
    
    return () => {
      console.log('[CRITICAL POLL] Stopping polling');
      clearInterval(intervalId);
    };
  }, [game?.status, game?.dealer_position, game?.all_decisions_in, game?.awaiting_next_round, game?.game_type, game?.rounds, game?.current_round, players, user?.id, gameId, playerCards.length, showAnteDialog]);
  
  // CRITICAL: 3-5-7 specific round sync polling (fallback for realtime issues)
  // More aggressive polling to prevent round desync between clients
  useEffect(() => {
    if (!gameId || !game) return;
    
    const is357Game = game?.game_type === '3-5-7-game';
    const isActiveGame = game?.status === 'in_progress';
    
    if (!is357Game || !isActiveGame) return;
    
    const syncPoll = async () => {
      const { data: freshGame, error } = await supabase
        .from('games')
        .select('current_round, awaiting_next_round, status')
        .eq('id', gameId)
        .single();
      
      if (error || !freshGame) return;
      
      const localRound = game?.current_round;
      const dbRound = freshGame.current_round;
      
      // Detect desync: DB round is different from local round (including when local is null)
      const needsSync = dbRound !== null && (localRound === null || dbRound !== localRound);
      
      if (needsSync) {
        console.log('[357 SYNC POLL] ⚠️⚠️⚠️ DESYNC DETECTED! DB:', dbRound, 'Local:', localRound, '- FORCING SYNC!');
        lastKnownRoundRef.current = dbRound;
        // CRITICAL: Do NOT clear cards here - let fetchGameData atomically replace them
        // Clearing cards causes brief "Wait..." flash
        setCardStateContext(null);
        // Don't call setPlayerCards([]) - just fetch and replace
        fetchGameData();
      }
    };
    
    // Poll every 750ms as aggressive fallback (critical for round sync)
    const pollInterval = setInterval(syncPoll, 750);
    
    // Also sync immediately on mount
    syncPoll();
    
    return () => clearInterval(pollInterval);
  }, [gameId, game?.game_type, game?.status, game?.current_round]);
  
  useEffect(() => {
    console.log('[ANTE DIALOG DEBUG] Effect triggered:', {
      gameStatus: game?.status,
      hasUser: !!user,
      userId: user?.id,
      playersCount: players.length,
      allPlayers: players.map(p => ({ 
        id: p.id, 
        user_id: p.user_id, 
        position: p.position, 
        ante_decision: p.ante_decision,
        is_bot: p.is_bot,
        sitting_out: p.sitting_out
      })),
      dealerPosition: game?.dealer_position,
      anteDeadline: game?.ante_decision_deadline,
      configComplete: game ? (game as any).config_complete : undefined
    });
    
    console.log('[ANTE DIALOG] ===== useEffect TRIGGERED =====', {
      userId: user?.id,
      userEmail: user?.email,
      gameStatus: game?.status,
      playersCount: players.length,
      allPlayersAnteDecisions: players.map(p => ({ 
        position: p.position, 
        ante_decision: p.ante_decision, 
        user_id: p.user_id,
        sitting_out: p.sitting_out,
        is_me: p.user_id === user?.id
      }))
    });
    
    if (game?.status === 'ante_decision' && user) {
      const currentPlayer = players.find(p => p.user_id === user.id);
      const isDealer = currentPlayer?.position === game.dealer_position;
      
      // Check for "Running it Back" - same game type AND same config
      const isRunBack = previousGameConfig !== null && 
        previousGameConfig.game_type === game.game_type &&
        previousGameConfig.ante_amount === (game.ante_amount || 2) &&
        previousGameConfig.pussy_tax_enabled === (game.pussy_tax_enabled ?? true) &&
        previousGameConfig.pussy_tax_value === (game.pussy_tax_value || 1) &&
        previousGameConfig.pot_max_enabled === (game.pot_max_enabled ?? true) &&
        previousGameConfig.pot_max_value === (game.pot_max_value || 10) &&
        (game.game_type === 'holm-game' || game.game_type === 'holm' 
          ? previousGameConfig.chucky_cards === (game.chucky_cards || 4)
          : previousGameConfig.leg_value === (game.leg_value || 1) && 
            previousGameConfig.legs_to_win === (game.legs_to_win || 3)
        );
      
      console.log('[ANTE DIALOG] Running it back check:', { isRunBack, previousGameConfig, currentConfig: {
        game_type: game.game_type,
        ante_amount: game.ante_amount,
        pussy_tax_enabled: game.pussy_tax_enabled,
        pussy_tax_value: game.pussy_tax_value,
        pot_max_enabled: game.pot_max_enabled,
        pot_max_value: game.pot_max_value,
        chucky_cards: game.chucky_cards,
        leg_value: game.leg_value,
        legs_to_win: game.legs_to_win
      }});
      setIsRunningItBack(isRunBack);
      
      console.log('[ANTE DIALOG] Checking ante dialog:', {
        gameStatus: game?.status,
        hasUser: !!user,
        hasCurrentPlayer: !!currentPlayer,
        currentPlayerId: currentPlayer?.id,
        currentPlayerUserId: currentPlayer?.user_id,
        anteDecision: currentPlayer?.ante_decision,
        anteDecisionType: typeof currentPlayer?.ante_decision,
        anteDecisionIsNull: currentPlayer?.ante_decision === null,
        anteDecisionIsUndefined: currentPlayer?.ante_decision === undefined,
        isDealer,
        dealerPosition: game.dealer_position,
        playerPosition: currentPlayer?.position,
        autoAnte: currentPlayer?.auto_ante,
        shouldShow: currentPlayer && currentPlayer.ante_decision === null && !isDealer && !currentPlayer.auto_ante
      });
      
      // AUTO-ANTE: If player has auto_ante enabled, automatically accept ante (no dialog)
      if (currentPlayer && currentPlayer.ante_decision === null && !isDealer && currentPlayer.auto_ante) {
        console.log('[ANTE DIALOG] ✅ AUTO-ANTE enabled - automatically accepting ante for player:', currentPlayer.id);
        
        // Auto-accept the ante
        supabase
          .from('players')
          .update({
            ante_decision: 'ante_up',
            sitting_out: false,
          })
          .eq('id', currentPlayer.id)
          .then(() => {
            console.log('[ANTE DIALOG] Auto-ante complete');
          });
        
        setShowAnteDialog(false);
        return;
      }
      
      // Don't show ante dialog for dealer (they auto ante up)
      // Show dialog if player exists and hasn't made ante decision and isn't dealer
      if (currentPlayer && currentPlayer.ante_decision === null && !isDealer) {
        console.log('[ANTE DIALOG] ✅ Showing ante dialog for player:', currentPlayer.id);
        setShowAnteDialog(true);
        
        // Calculate ante time left
        if (game.ante_decision_deadline) {
          const deadline = new Date(game.ante_decision_deadline).getTime();
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
          console.log('[ANTE DIALOG] Time left calculation:', { deadline, now, remaining });
          setAnteTimeLeft(remaining);
        }
      } else {
        console.log('[ANTE DIALOG] ❌ NOT showing ante dialog - reasons:', {
          noCurrentPlayer: !currentPlayer,
          anteDecisionNotNull: currentPlayer?.ante_decision !== null,
          anteDecisionValue: currentPlayer?.ante_decision,
          isDealer
        });
        setShowAnteDialog(false);
      }
    } else {
      console.log('[ANTE DIALOG] ❌ Conditions not met for ante dialog:', {
        statusNotAnteDecision: game?.status !== 'ante_decision',
        noUser: !user,
        actualStatus: game?.status
      });
      setShowAnteDialog(false);
    }
  }, [game?.status, game?.ante_decision_deadline, game?.dealer_position, game?.game_type, game?.ante_amount, game?.pussy_tax_enabled, game?.pussy_tax_value, game?.pot_max_enabled, game?.pot_max_value, game?.chucky_cards, game?.leg_value, game?.legs_to_win, players, user, previousGameConfig]);

  // Auto-sit-out when ante timer reaches 0
  useEffect(() => {
    if (anteTimeLeft === 0 && game?.status === 'ante_decision' && user) {
      const currentPlayer = players.find(p => p.user_id === user.id);
      if (currentPlayer && !currentPlayer.ante_decision) {
        supabase
          .from('players')
          .update({
            ante_decision: 'sit_out',
            sitting_out: true,
            waiting: false,
          })
          .eq('id', currentPlayer.id);
      }
    }
  }, [anteTimeLeft, game?.status, players, user]);

  // Session ending tracking (removed toast)

  // Redirect to lobby when session ends
  useEffect(() => {
    if (game?.status === 'session_ended') {
      setTimeout(() => navigate('/'), 2000);
    }
  }, [game?.status, navigate]);

  // Check if all ante decisions are in - with polling fallback
  useEffect(() => {
    if (game?.status !== 'ante_decision') {
      // Reset the ref when we exit ante_decision status
      anteProcessingRef.current = false;
      return;
    }

    const checkAnteDecisions = async () => {
      // Skip if already processing
      if (anteProcessingRef.current) {
        console.log('[ANTE CHECK] Already processing, skipping');
        return;
      }
      
      // CRITICAL: Fetch fresh player data directly from database to avoid stale state issues
      const { data: freshPlayers, error } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId);
      
      if (error || !freshPlayers) {
        console.log('[ANTE CHECK] Error fetching players:', error);
        return;
      }
      
      const decidedCount = freshPlayers.filter(p => p.ante_decision).length;
      const allDecided = freshPlayers.every(p => p.ante_decision);
      console.log('[ANTE CHECK] Fresh players:', freshPlayers.length, 'Decided:', decidedCount, 'All decided:', allDecided, 'Player ante statuses:', freshPlayers.map(p => ({ pos: p.position, ante: p.ante_decision, bot: p.is_bot })));
      
      if (allDecided && freshPlayers.length > 0) {
        console.log('[ANTE CHECK] All players decided, proceeding to start round');
        anteProcessingRef.current = true;
        handleAllAnteDecisionsIn();
      }
    };

    // Check immediately
    checkAnteDecisions();

    // Poll every 1 second as fallback for faster ante detection
    const pollInterval = setInterval(() => {
      console.log('[ANTE POLL] Polling for ante decisions...');
      checkAnteDecisions();
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [game?.status, gameId]);

  // Extract current round info - use cached data during game_over to preserve community cards
  // CRITICAL: For Holm games, always use the LATEST round by round_number (not game.current_round which can be stale)
  const liveRound = game?.game_type === 'holm-game'
    ? game?.rounds?.reduce((latest, r) => (!latest || r.round_number > latest.round_number) ? r : latest, null as Round | null)
    : game?.rounds?.find(r => r.round_number === game.current_round);
  
  // Immediately cache round data in ref when we have valid data with community cards
  // This ensures we capture it before game_over clears current_round
  // Only update cache if revealed count is >= current cached count (never decrease)
  if (liveRound && liveRound.community_cards) {
    const currentCachedRevealed = cachedRoundRef.current?.community_cards_revealed ?? 0;
    const liveRevealed = liveRound.community_cards_revealed ?? 0;
    if (liveRevealed >= currentCachedRevealed) {
      cachedRoundRef.current = liveRound;
    }
  }
  
  // Track previous round state to detect new hands in Holm games
  const prevRoundStateRef = useRef<{ communityCardsHash: string; status: string | undefined }>({ communityCardsHash: '', status: undefined });
  
  // Cache round data when transitioning to game_over, during showdown, or when Chucky is active
  // This ensures community cards and Chucky cards remain visible after game ends
  useEffect(() => {
    // CRITICAL: Detect new Holm hand by checking if community cards changed AND status is 'betting'
    // This indicates startHolmRound reset the round for a new hand
    const currentCommunityHash = JSON.stringify(liveRound?.community_cards || []);
    const prevHash = prevRoundStateRef.current.communityCardsHash;
    const prevStatus = prevRoundStateRef.current.status;
    
    const isNewHolmHand = 
      game?.game_type === 'holm-game' &&
      liveRound?.status === 'betting' &&
      prevHash !== '' && // Not first load
      currentCommunityHash !== prevHash; // Cards actually changed
    
    if (isNewHolmHand) {
      console.log('[CACHE] 🔄 NEW HOLM HAND DETECTED - clearing cache', {
        prevHash: prevHash.slice(0, 50),
        newHash: currentCommunityHash.slice(0, 50),
        prevStatus,
        newStatus: liveRound?.status
      });
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      maxRevealedRef.current = liveRound?.community_cards_revealed ?? 0;
    }
    
    // Update tracking ref
    prevRoundStateRef.current = { 
      communityCardsHash: currentCommunityHash, 
      status: liveRound?.status 
    };
    
    if (liveRound && (
      game?.status === 'game_over' || 
      game?.all_decisions_in || 
      liveRound.chucky_active ||
      liveRound.status === 'completed' ||
      liveRound.status === 'showdown'
    )) {
      // Only update cache if revealed count is >= current cached count (never decrease)
      const currentCachedRevealed = cachedRoundData?.community_cards_revealed ?? 0;
      const liveRevealed = liveRound.community_cards_revealed ?? 0;
      if (liveRevealed >= currentCachedRevealed) {
        setCachedRoundData(liveRound);
        cachedRoundRef.current = liveRound;
      }
    }
    // Clear cache when starting new game
    if (game?.status === 'game_selection' || game?.status === 'configuring') {
      setCachedRoundData(null);
      cachedRoundRef.current = null;
    }
  }, [liveRound, game?.status, game?.all_decisions_in, cachedRoundData?.community_cards_revealed, game?.game_type]);
  
  // Use cached round during game_over if live round is unavailable
  // Priority: liveRound > state cache > ref cache
  const currentRound = liveRound || cachedRoundData || cachedRoundRef.current;
  
  // Compute current card identity to detect new hands
  const communityCards = currentRound?.community_cards as CardType[] | undefined;
  const currentCardIdentity = communityCards?.map(c => `${c.rank}${c.suit}`).join(',') || '';
  
  // Reset when starting new game OR when cards change (new hand)
  if (game?.status === 'game_selection' || game?.status === 'configuring') {
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';
  } else if (currentCardIdentity && currentCardIdentity !== cardIdentityRef.current) {
    // Cards changed - this is a new hand, reset the max
    cardIdentityRef.current = currentCardIdentity;
    maxRevealedRef.current = currentRound?.community_cards_revealed ?? 0;
  } else if (currentRound?.community_cards_revealed !== undefined) {
    // Same hand, only increase max (never decrease)
    maxRevealedRef.current = Math.max(maxRevealedRef.current, currentRound.community_cards_revealed);
  }
  
  // Effective revealed count - use max during showdowns/game_over/completed rounds/awaiting next to prevent re-hiding
  const shouldUseMax = (
    game?.status === 'game_over' || 
    game?.all_decisions_in || 
    currentRound?.status === 'completed' ||
    game?.awaiting_next_round ||
    game?.last_round_result // Keep cards visible while result message is showing
  );
  
  const effectiveCommunityCardsRevealed = shouldUseMax
    ? maxRevealedRef.current
    : (currentRound?.community_cards_revealed ?? 0);
    
  // DETAILED LOGGING for debugging community cards issue
  console.log('[GAME.TSX COMMUNITY_CARDS] ===== CALC =====', {
    shouldUseMax,
    maxRevealedRef: maxRevealedRef.current,
    roundRevealed: currentRound?.community_cards_revealed,
    effectiveRevealed: effectiveCommunityCardsRevealed,
    gameStatus: game?.status,
    allDecisionsIn: game?.all_decisions_in,
    roundStatus: currentRound?.status,
    awaitingNextRound: game?.awaiting_next_round,
    lastRoundResult: game?.last_round_result?.substring(0, 30)
  });

  // CRITICAL: Healing poll for missing round/community cards/player cards in Holm games
  // When we're in_progress with a Holm game but have no community cards OR player cards, poll until we get them
  const roundHealingRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    const isHolmGame = game?.game_type === 'holm-game';
    const isInProgress = game?.status === 'in_progress';
    const hasCommunityCards = communityCards && communityCards.length > 0;
    const hasRoundData = currentRound && currentRound.community_cards;
    
    // Also check for player cards - critical for game type switches
    const hasPlayerCards = playerCards && playerCards.length > 0;
    // For Holm, validate we have 4 cards per player
    const hasValidPlayerCards = hasPlayerCards && playerCards.some(pc => {
      const cards = pc.cards as unknown as any[];
      return cards && cards.length === 4;
    });
    
    const needsCommunityHealing = isHolmGame && isInProgress && !hasCommunityCards && !hasRoundData && !game?.awaiting_next_round;
    const needsPlayerCardHealing = isHolmGame && isInProgress && !hasValidPlayerCards && !game?.awaiting_next_round;
    const needsHealing = needsCommunityHealing || needsPlayerCardHealing;
    
    if (needsHealing) {
      console.log('[ROUND HEAL] 🚑 Holm game needs healing:', {
        needsCommunityHealing,
        needsPlayerCardHealing,
        playerCardsCount: playerCards?.length,
        hasValidPlayerCards
      });
      
      const healingPoll = async () => {
        console.log('[ROUND HEAL] 🔄 Polling for round/player card data...');
        await fetchGameData();
      };
      
      // Start polling every 300ms
      healingPoll(); // Immediate first attempt
      roundHealingRef.current = setInterval(healingPoll, 300);
      
      return () => {
        if (roundHealingRef.current) {
          clearInterval(roundHealingRef.current);
          roundHealingRef.current = null;
        }
      };
    } else if (roundHealingRef.current && hasCommunityCards && hasValidPlayerCards) {
      // Stop polling if we got both community and player cards
      console.log('[ROUND HEAL] ✅ Got community and player cards, stopping poll');
      clearInterval(roundHealingRef.current);
      roundHealingRef.current = null;
    }
  }, [game?.game_type, game?.status, communityCards, currentRound, game?.awaiting_next_round, playerCards]);

  // Auto-trigger bot decisions when appropriate
  useEffect(() => {
    console.log('[BOT TRIGGER EFFECT] Running', {
      status: game?.status,
      all_decisions_in: game?.all_decisions_in,
      game_type: game?.game_type,
      current_turn: currentRound?.current_turn_position,
      round: game?.current_round
    });
    
    if (game?.status === 'in_progress' && !game.all_decisions_in) {
      const isHolmGame = game?.game_type === 'holm-game';
      
      // For Holm games, only trigger if there's a valid turn position
      // For other games, trigger on any undecided bot
      if (isHolmGame && !currentRound?.current_turn_position) {
        console.log('[BOT TRIGGER] Holm game but no turn position set, skipping');
        return;
      }
      
      console.log('[BOT TRIGGER] Triggering bot decisions', {
        game_type: game?.game_type,
        current_turn: currentRound?.current_turn_position,
        round: game?.current_round
      });
      
      // Capture the turn position now to pass to the bot logic (avoids stale DB reads)
      const capturedTurnPosition = currentRound?.current_turn_position;
      
      const botDecisionTimer = setTimeout(async () => {
        console.log('[BOT TRIGGER] *** CALLING makeBotDecisions with turn position:', capturedTurnPosition, '***');
        const botMadeDecision = await makeBotDecisions(gameId!, capturedTurnPosition);
        
        // If bot made a decision, explicitly fetch to get updated turn position
        if (botMadeDecision) {
          console.log('[BOT TRIGGER] *** Bot decided, forcing fetch to get updated turn position ***');
          setTimeout(() => fetchGameData(), 100);
        }
      }, 500);
      
      return () => {
        console.log('[BOT TRIGGER] *** CLEANUP - clearing timeout ***');
        clearTimeout(botDecisionTimer);
      };
    } else {
      console.log('[BOT TRIGGER] Conditions not met for bot trigger');
    }
  }, [
    game?.current_round, 
    game?.status, 
    game?.all_decisions_in, 
    // Only watch turn position for Holm games (turn-based), not 3-5-7 (simultaneous)
    game?.game_type === 'holm-game' ? currentRound?.current_turn_position : null,
    game?.game_type,
    gameId
  ]);

  // Auto-fold when timer reaches 0 - but give a grace period for fresh rounds
  const autoFoldingRef = useRef(false);
  useEffect(() => {
    const isHolmGame = game?.game_type === 'holm-game';
    
    console.log('[TIMER CHECK]', { 
      timeLeft, 
      status: game?.status, 
      all_decisions_in: game?.all_decisions_in, 
      is_paused: game?.is_paused,
      timerTurnPosition,
      currentTurnPosition: currentRound?.current_turn_position,
      isHolmGame,
      shouldAutoFold: timeLeft === 0 && game?.status === 'in_progress' && !game.all_decisions_in && !game?.is_paused
    });
    
    // Don't auto-fold if timer is null or negative (means fresh round)
    // Only auto-fold when timer explicitly reaches 0 and we have positive time tracked
    // For Holm games: Only auto-fold if the turn hasn't changed (timerTurnPosition matches current turn)
    // For 3-5-7 games: Auto-fold when timer reaches 0 (no turn position to check)
    const shouldAutoFold = timeLeft === 0 && 
        game?.status === 'in_progress' && 
        !game.all_decisions_in && 
        !game?.is_paused &&
        !autoFoldingRef.current &&
        (isHolmGame 
          ? (timerTurnPosition !== null && currentRound?.current_turn_position === timerTurnPosition)
          : true); // For 3-5-7, just check timer reached 0
    
    if (shouldAutoFold) {
      autoFoldingRef.current = true;
      if (isHolmGame) {
        console.log('[TIMER EXPIRED HOLM] *** AUTO-FOLDING player at position', timerTurnPosition, '***');
        console.log('[TIMER EXPIRED HOLM] Verification:', {
          timerTurnPosition,
          currentTurnPosition: currentRound?.current_turn_position,
          match: timerTurnPosition === currentRound?.current_turn_position
        });
      } else {
        console.log('[TIMER EXPIRED 3-5-7] *** AUTO-FOLDING undecided players ***');
      }
      // Immediately clear the timer to stop flashing
      setTimeLeft(null);
      setDecisionDeadline(null);
      
      if (isHolmGame) {
        // In Holm, auto-fold the player whose timer expired
        (async () => {
          // CRITICAL: Fetch fresh game and round data to verify state
          const { data: freshGame } = await supabase
            .from('games')
            .select('is_paused')
            .eq('id', gameId!)
            .single();
          
          // Check pause state from database (not local state which may be stale)
          if (freshGame?.is_paused) {
            console.log('[TIMER EXPIRED HOLM] *** GAME IS PAUSED - SKIPPING AUTO-FOLD ***');
            autoFoldingRef.current = false;
            fetchGameData(); // Sync local state
            return;
          }
          
          // CRITICAL: Fetch latest round by round_number DESC, NOT game.current_round which may be stale
          const { data: freshRound } = await supabase
            .from('rounds')
            .select('*')
            .eq('game_id', gameId!)
            .order('round_number', { ascending: false })
            .limit(1)
            .single();
            
          if (!freshRound) {
            console.log('[TIMER EXPIRED HOLM] Fresh round not found');
            autoFoldingRef.current = false;
            return;
          }
          
          // Verify the turn hasn't changed since timer started
          if (freshRound.current_turn_position !== timerTurnPosition) {
            console.log('[TIMER EXPIRED HOLM] *** TURN HAS CHANGED - SKIPPING AUTO-FOLD ***', {
              expected: timerTurnPosition,
              actual: freshRound.current_turn_position
            });
            autoFoldingRef.current = false;
            // Refetch to sync with new turn
            fetchGameData();
            return;
          }
          
          const { data: currentTurnPlayer } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId!)
            .eq('position', timerTurnPosition)
            .single();
            
          if (currentTurnPlayer && !currentTurnPlayer.decision_locked) {
            console.log('[TIMER EXPIRED HOLM] Auto-folding player at position', currentTurnPlayer.position);
            await makeDecision(gameId!, currentTurnPlayer.id, 'fold');
            await checkHolmRoundComplete(gameId!);
            console.log('[TIMER EXPIRED HOLM] *** Realtime will trigger refetch after auto-fold ***');
          } else {
            console.log('[TIMER EXPIRED HOLM] Player already decided or not found');
          }
          
          autoFoldingRef.current = false;
        })().catch(err => {
          console.error('[TIMER EXPIRED HOLM] Error auto-folding:', err);
          autoFoldingRef.current = false;
        });
      } else {
        // For 3-5-7 games, also check pause state from database
        (async () => {
          const { data: freshGame } = await supabase
            .from('games')
            .select('is_paused')
            .eq('id', gameId!)
            .single();
          
          if (freshGame?.is_paused) {
            console.log('[TIMER EXPIRED 3-5-7] *** GAME IS PAUSED - SKIPPING AUTO-FOLD ***');
            autoFoldingRef.current = false;
            fetchGameData();
            return;
          }
          
          await autoFoldUndecided(gameId!);
          fetchGameData();
          autoFoldingRef.current = false;
        })().catch(err => {
          console.error('[TIMER EXPIRED] Error auto-folding:', err);
          autoFoldingRef.current = false;
        });
      }
    }
  }, [timeLeft, game?.status, game?.all_decisions_in, gameId, game?.is_paused, game?.game_type, timerTurnPosition, currentRound?.current_turn_position]);

  // Auto-proceed to next round when awaiting (with 4-second delay to show results)
  const awaitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameStateAtTimerStart = useRef<{ awaiting: boolean; round: number } | null>(null);
  const awaitingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Poll for awaiting_next_round when round is completed and all decisions are in
  useEffect(() => {
    const isHolmGame = game?.game_type === 'holm-game';
    const roundCompleted = currentRound?.status === 'completed';
    const allDecisionsIn = game?.all_decisions_in === true;
    const alreadyAwaiting = game?.awaiting_next_round === true;
    const gameInProgress = game?.status === 'in_progress';
    
    // For 3-5-7 games: poll when round is completed and all decisions are in
    const shouldPoll = !isHolmGame && gameInProgress && roundCompleted && allDecisionsIn && !alreadyAwaiting;
    
    console.log('[AWAITING_POLL] Check', {
      shouldPoll,
      isHolmGame,
      roundCompleted,
      allDecisionsIn,
      alreadyAwaiting,
      gameInProgress
    });
    
    if (shouldPoll && !awaitingPollRef.current) {
      console.log('[AWAITING_POLL] 🔄 Starting poll for awaiting_next_round');
      
      awaitingPollRef.current = setInterval(async () => {
        console.log('[AWAITING_POLL] 🔍 Checking for awaiting_next_round...');
        
        const { data: freshGame } = await supabase
          .from('games')
          .select('awaiting_next_round, last_round_result, next_round_number')
          .eq('id', gameId)
          .single();
        
        console.log('[AWAITING_POLL] Fresh data:', freshGame);
        
        if (freshGame?.awaiting_next_round) {
          console.log('[AWAITING_POLL] ✅ DETECTED awaiting_next_round! Triggering refetch');
          if (awaitingPollRef.current) {
            clearInterval(awaitingPollRef.current);
            awaitingPollRef.current = null;
          }
          await fetchGameData();
        }
      }, 500); // Poll every 500ms
    } else if (!shouldPoll && awaitingPollRef.current) {
      console.log('[AWAITING_POLL] 🛑 Stopping poll');
      clearInterval(awaitingPollRef.current);
      awaitingPollRef.current = null;
    }
    
    return () => {
      if (awaitingPollRef.current) {
        clearInterval(awaitingPollRef.current);
        awaitingPollRef.current = null;
      }
    };
  }, [gameId, game?.game_type, currentRound?.status, game?.all_decisions_in, game?.awaiting_next_round, game?.status]);
  
  useEffect(() => {
    const currentAwaiting = game?.awaiting_next_round || false;
    const currentRound = game?.current_round || 0;
    
    console.log('[AUTO_PROCEED_EFFECT] Running', {
      awaiting: currentAwaiting,
      status: game?.status,
      hasTimer: awaitingTimerRef.current !== null,
      gameId: gameId,
      gameType: game?.game_type,
      savedState: gameStateAtTimerStart.current
    });
    
    // If awaiting state changed to true and we don't have a timer yet
    if (currentAwaiting && 
        gameId && 
        game?.status !== 'game_over' && 
        !awaitingTimerRef.current) {
      
      // Clear timer immediately when awaiting next round
      setTimeLeft(null);
      setDecisionDeadline(null);
      
      // Save the game state when we start the timer
      gameStateAtTimerStart.current = { awaiting: true, round: currentRound };
      
      // DEBUG MODE: For Holm games, don't auto-proceed if debugHolmPaused is true
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame && debugHolmPaused) {
        console.log('[AWAITING_NEXT_ROUND] 🔧 DEBUG MODE: Auto-proceed paused. Click "Proceed to Next Round" button manually.');
        return;
      }
      
      console.log('[AWAITING_NEXT_ROUND] Starting 4-second timer', {
        game_type: game?.game_type,
        current_round: currentRound,
        pot: game?.pot,
        last_result: game?.last_round_result
      });
      
      // Wait 4 seconds to show the result, then start next round
      awaitingTimerRef.current = setTimeout(async () => {
        console.log('[AWAITING_NEXT_ROUND] Timer fired after 4 seconds');
        const timerId = awaitingTimerRef.current;
        awaitingTimerRef.current = null;
        gameStateAtTimerStart.current = null;
        
        try {
          const isHolmGame = game?.game_type === 'holm-game';
          console.log('[AWAITING_NEXT_ROUND] Calling proceed function', { isHolmGame, gameId });
          
          if (isHolmGame) {
            await proceedToNextHolmRound(gameId);
          } else {
            await proceedToNextRound(gameId);
          }
          
          console.log('[AWAITING_NEXT_ROUND] Proceed function completed successfully');
          
          // Refetch after a short delay
          await new Promise(resolve => setTimeout(resolve, 500));
          await fetchGameData();
          
          console.log('[AWAITING_NEXT_ROUND] Game data refetched');
        } catch (error) {
          console.error('[AWAITING_NEXT_ROUND] ERROR during proceed:', error);
        }
      }, 4000);
      
      console.log('[AWAITING_NEXT_ROUND] Timer started, will fire in 4 seconds');
    }
    // If awaiting changed to false, clear any existing timer
    else if (!currentAwaiting && awaitingTimerRef.current) {
      console.log('[AWAITING_NEXT_ROUND] No longer awaiting, clearing timer');
      clearTimeout(awaitingTimerRef.current);
      awaitingTimerRef.current = null;
      gameStateAtTimerStart.current = null;
    }
    
    return () => {
      // Don't clear timer on cleanup during normal re-renders
      // Timer will persist across re-renders
    };
  }, [game?.awaiting_next_round, gameId, game?.status, game?.game_type]);

  // Clear timer when results are shown
  useEffect(() => {
    if (game?.last_round_result) {
      console.log('[RESULT] Clearing timer for result display');
      setTimeLeft(null);
      setDecisionDeadline(null);
    }
  }, [game?.last_round_result]);

  // Removed failsafe - countdown component now handles completion reliably

  const fetchGameData = async () => {
    console.log('[FETCH] ========== STARTING FETCH ==========');
    if (!gameId || !user) return;

    console.log('[FETCH] Fetching game data...');

    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .select('*, rounds(*)')
      .eq('id', gameId)
      .single();

    if (gameError) {
      console.error('Failed to fetch game:', gameError);
      return;
    }
    
    // CRITICAL: Update refs for detecting changes via local state comparison
    const prevGameType = lastKnownGameTypeRef.current;
    const prevRound = lastKnownRoundRef.current;
    lastKnownGameTypeRef.current = gameData?.game_type || null;
    lastKnownRoundRef.current = gameData?.current_round ?? null;
    
    console.log('[FETCH] Game data received:', {
      current_round: gameData?.current_round,
      prev_round: prevRound,
      status: gameData?.status,
      game_type: gameData?.game_type,
      prev_game_type: prevGameType,
      awaiting_next_round: gameData?.awaiting_next_round,
      rounds_count: gameData?.rounds?.length,
      round_numbers: gameData?.rounds?.map((r: any) => r.round_number)
    });
    
    // CRITICAL: If game type changed since last fetch (including from null), clear all card state
    // This catches the initial load case where prevGameType is null
    if (gameData?.game_type && prevGameType !== gameData?.game_type) {
      console.log('[FETCH] 🎯🎯🎯 GAME TYPE CHANGE DETECTED IN FETCH:', prevGameType, '->', gameData.game_type, '- CLEARING CARDS!');
      setPlayerCards([]);
      setCachedRoundData(null);
      cachedRoundRef.current = null;
      maxRevealedRef.current = 0;
    }

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        profiles(username)
      `)
      .eq('game_id', gameId)
      .order('position');

    if (playersError) {
      console.error('Failed to fetch players:', playersError);
      return;
    }

    console.log('[FETCH] Players fetched:', playersData?.length, 'Status:', gameData?.status, 'Ante decisions:', playersData?.map(p => ({ 
      id: p.id, 
      user_id: p.user_id, 
      pos: p.position, 
      ante: p.ante_decision, 
      is_bot: p.is_bot 
    })));

    // Users join as observers - they must select a seat to become a player

    // Fetch player cards if game is in progress or game_over (keep cards visible during announcements)
    // CRITICAL: Also fetch if current_round is null but status is in_progress (race condition fix)
    const shouldFetchCards = gameData.status === 'in_progress' || gameData.status === 'game_over';
    
    if (shouldFetchCards) {
      // For Holm games, don't fetch cards during round transitions (awaiting_next_round) UNLESS game_over
      const isHolmGame = gameData.game_type === 'holm-game';
      const keepCards = gameData.status === 'game_over' || !isHolmGame || !gameData.awaiting_next_round;
      
      // Keep cards visible during results announcement (last_round_result exists)
      const keepCardsForResults = isHolmGame && gameData.awaiting_next_round && gameData.last_round_result;
      
      if (keepCards || keepCardsForResults) {
        // CRITICAL: For Holm games, ALWAYS fetch the most recent round by round_number DESC
        // This prevents stale game.current_round from causing mismatched cards during evaluation
        // The backend evaluation also uses round_number DESC, so frontend must match
        let roundData: { id: string; round_number: number; cards_dealt: number } | null = null;
        
        if (isHolmGame) {
          // HOLM: Always fetch most recent round - current_round can be stale
          const { data } = await supabase
            .from('rounds')
            .select('id, round_number, cards_dealt')
            .eq('game_id', gameId)
            .order('round_number', { ascending: false })
            .limit(1)
            .maybeSingle();
          roundData = data;
          
          if (roundData && gameData.current_round && roundData.round_number !== gameData.current_round) {
            console.warn('[FETCH] ⚠️ Round mismatch! game.current_round:', gameData.current_round, 'most recent round:', roundData.round_number);
          }
        } else if (gameData.current_round) {
          // 3-5-7: Use current_round as it's critical for determining wild cards
          const { data } = await supabase
            .from('rounds')
            .select('id, round_number, cards_dealt')
            .eq('game_id', gameId)
            .eq('round_number', gameData.current_round)
            .maybeSingle();
          roundData = data;
        } else {
          // Fallback: get the most recent round
          const { data } = await supabase
            .from('rounds')
            .select('id, round_number, cards_dealt')
            .eq('game_id', gameId)
            .order('round_number', { ascending: false })
            .limit(1)
            .maybeSingle();
          roundData = data;
          console.log('[FETCH] current_round is null, using most recent round:', roundData?.id);
        }

        if (roundData) {
          // Store authoritative card context from the round record
          const newCardContext: CardStateContext = {
            roundId: roundData.id,
            roundNumber: roundData.round_number,
            cardsDealt: roundData.cards_dealt
          };
          console.log('[FETCH] Setting card state context:', newCardContext);
          setCardStateContext(newCardContext);
          
          const { data: cardsData, error: cardsError } = await supabase
            .from('player_cards')
            .select('player_id, cards')
            .eq('round_id', roundData.id);

          console.log('[FETCH] 🃏 Cards fetch result:', {
            roundId: roundData.id,
            cardsCount: cardsData?.length || 0,
            cardsError: cardsError?.message,
            playerIds: cardsData?.map(c => c.player_id)
          });

          if (cardsData && cardsData.length > 0) {
            console.log('[FETCH] Setting player cards for round:', cardsData.length, 'players');
            setPlayerCards(cardsData.map(cd => ({
              player_id: cd.player_id,
              cards: cd.cards as unknown as CardType[]
            })));
          } else if (cardsError) {
            console.error('[FETCH] ❌ Cards fetch error (RLS?):', cardsError);
          } else {
            console.log('[FETCH] No cards found for round, keeping existing cards');
            // Don't clear cards if none found - might just be a timing issue
          }
        }
      } else if (isHolmGame && gameData.awaiting_next_round && !gameData.last_round_result) {
        // Clear cards only for Holm games when awaiting next round AND results have been cleared
        console.log('[FETCH] Clearing player cards (Holm game transitioning to next round)');
        setPlayerCards([]);
      }
    } else if (gameData.status !== 'in_progress' && gameData.status !== 'game_over') {
      // Only clear cards when explicitly NOT in active play states
      console.log('[FETCH] Clearing player cards (status:', gameData.status, ')');
      setPlayerCards([]);
    }

    setGame(gameData);
    
    // CRITICAL: Update refs with current game state for realtime change detection
    lastKnownGameTypeRef.current = gameData.game_type;
    lastKnownRoundRef.current = gameData.current_round;
    
    // CRITICAL: Update pause ref immediately when fetching game data
    // This ensures timer stops even if realtime updates aren't working for observers
    isPausedRef.current = gameData.is_paused;
    if (gameData.is_paused && timerIntervalRef.current) {
      console.log('[FETCH] ⏸️ Game is paused - clearing timer interval');
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    // Sort players by position for consistent rendering
    setPlayers((playersData || []).sort((a, b) => a.position - b.position));
    
    // Calculate time left ONLY if game is actively in progress AND not in transition
    // CRITICAL: Never set timeLeft during game_over to prevent unmounting GameOverCountdown
    if (gameData.status === 'in_progress' && 
        gameData.rounds && 
        gameData.rounds.length > 0 &&
        !gameData.awaiting_next_round &&
        !gameData.last_round_result &&
        !gameData.game_over_at) {  // Don't set timeLeft if game_over_at is set
      // CRITICAL: For Holm games, use the LATEST round by round_number (not game.current_round which can be stale)
      const isHolmGame = gameData.game_type === 'holm-game';
      const currentRound = isHolmGame
        ? gameData.rounds.reduce((latest: Round | null, r: Round) => (!latest || r.round_number > latest.round_number) ? r : latest, null)
        : gameData.rounds.find((r: Round) => r.round_number === gameData.current_round);
      
      console.log('[FETCH] Round data:', {
        gameType: gameData.game_type,
        currentRound: currentRound?.id,
        current_turn_position: currentRound?.current_turn_position,
        roundStatus: currentRound?.status,
        decision_deadline: currentRound?.decision_deadline,
        lastTurnPosition,
        timerTurnPosition,
        awaiting_next_round: gameData.awaiting_next_round,
        all_decisions_in: gameData.all_decisions_in
      });
      
      if (currentRound?.decision_deadline) {
        // Store the deadline for server-driven timer
        setDecisionDeadline(currentRound.decision_deadline);
        
        // Holm game: turn-based, needs current_turn_position
        if (isHolmGame && currentRound.current_turn_position) {
          // Check if turn changed
          const turnChanged = lastTurnPosition !== null && lastTurnPosition !== currentRound.current_turn_position;
          
          if (turnChanged) {
            console.log('[FETCH] *** HOLM: TURN CHANGED from', lastTurnPosition, 'to', currentRound.current_turn_position, '***');
            setLastTurnPosition(currentRound.current_turn_position);
            setTimerTurnPosition(currentRound.current_turn_position);
          } else if (lastTurnPosition === null) {
            // First time seeing this round
            console.log('[FETCH] HOLM: First load of round, turn position:', currentRound.current_turn_position);
            setLastTurnPosition(currentRound.current_turn_position);
            setTimerTurnPosition(currentRound.current_turn_position);
          }
        } 
        // 3-5-7 game: simultaneous decisions, no turn position needed
        else if (!isHolmGame) {
          console.log('[FETCH] 3-5-7: Using server deadline for timer');
        }
      } else {
        setDecisionDeadline(null);
        console.log('[FETCH] *** NO TIMER SET - Missing deadline or turn position ***', {
          has_deadline: !!currentRound?.decision_deadline,
          has_turn_position: !!currentRound?.current_turn_position,
          turn_position: currentRound?.current_turn_position,
          round_status: currentRound?.status
        });
      }
    } else {
      // Clear timer for non-playing states or transitions (but not for game_over to avoid disrupting countdown)
      if (!gameData.game_over_at) {
        if (gameData.awaiting_next_round || gameData.last_round_result) {
          console.log('[FETCH] Clearing timer during transition');
          setLastTurnPosition(null); // Reset turn tracking on transition
        } else {
          console.log('[FETCH] Clearing timer, status:', gameData.status);
        }
        setTimeLeft(null);
        setDecisionDeadline(null);
      } else {
        console.log('[FETCH] Skipping timer update during game_over to preserve countdown');
      }
    }
    
    setLoading(false);
  };

  // This function is called when 2+ players are seated in waiting status
  const startGameFromWaiting = async () => {
    if (!gameId) return;

    console.log('[GAME START] SHUFFLE UP AND DEAL! Moving to dealer_selection');
    
    // Set all seated players to active (sitting_out=false, waiting=false)
    await supabase
      .from('players')
      .update({ 
        sitting_out: false,
        waiting: false
      })
      .eq('game_id', gameId);

    // Move to dealer_selection status - the DealerSelection component will handle the animation
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'dealer_selection'
      })
      .eq('id', gameId);

    if (error) {
      console.error('Start game error:', error);
      return;
    }

    // Manual refetch to ensure UI updates immediately
    setTimeout(() => fetchGameData(), 100);
  };

  const selectDealer = async (dealerPosition: number) => {
    if (!gameId) return;

    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'game_selection',
        dealer_position: dealerPosition 
      })
      .eq('id', gameId);

    if (error) {
      console.error('Failed to select dealer:', error);
      return;
    }

    // Manual refetch to ensure UI updates immediately
    // Bot dealers will be handled by DealerGameSetup component
    setTimeout(() => fetchGameData(), 500);
  };

  const handleConfigComplete = async () => {
    if (!gameId) return;

    // Immediately refetch to sync state - bots will start making decisions automatically
    setTimeout(() => fetchGameData(), 100);
  };

  const handleGameSelection = async (gameType: string) => {
    if (!gameId) return;

    console.log('[GAME SELECTION] Selected game:', gameType, 'Previous:', lastKnownGameTypeRef.current);

    // GUARD: Prevent realtime updates from overwriting optimistic UI during switch
    gameTypeSwitchingRef.current = true;

    // IMMEDIATELY update the ref so realtime can detect changes for other clients
    lastKnownGameTypeRef.current = gameType;
    lastKnownRoundRef.current = null;
    
    // IMMEDIATELY clear all card-related state for the dealer
    // This prevents stale card rendering while waiting for database update
    setPlayerCards([]);
    setCachedRoundData(null);
    cachedRoundRef.current = null;
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';

    // OPTIMISTIC UI UPDATE: Immediately update local game state with new game_type
    // This ensures the dealer sees the correct rendering immediately
    setGame(prevGame => prevGame ? {
      ...prevGame,
      game_type: gameType,
      status: 'configuring',
      config_complete: false,
      current_round: null,
      awaiting_next_round: false
    } : null);

    // Reset ante_decision for ALL seated players so they all get the ante popup
    const { error: resetError } = await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId);

    if (resetError) {
      console.error('[GAME SELECTION] Failed to reset ante decisions:', resetError);
    }

    // Save the game type and transition to configuring phase
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'configuring',
        config_complete: false,
        game_type: gameType
      })
      .eq('id', gameId);

    if (error) {
      console.error('Failed to start configuration:', error);
      return;
    }

    // Manual refetch to update UI after DB is updated
    // Clear the guard AFTER the fetch so realtime doesn't overwrite during transition
    setTimeout(() => {
      fetchGameData();
      // Clear guard after a longer delay to ensure optimistic update isn't overwritten
      setTimeout(() => {
        gameTypeSwitchingRef.current = false;
        console.log('[GAME SELECTION] Cleared game type switching guard');
      }, 500);
    }, 100);
  };

  const handleGameOverComplete = useCallback(async () => {
    if (!gameId) {
      console.log('[GAME OVER COMPLETE] No gameId, aborting');
      return;
    }

    console.log('[GAME OVER COMPLETE] Starting transition to next game, gameId:', gameId);

    // CRITICAL: Clear all card state IMMEDIATELY when transitioning to new game
    // This prevents stale cards from rendering while waiting for new game setup
    console.log('[GAME OVER COMPLETE] 🧹 CLEARING ALL CARD STATE FOR NEW GAME');
    setPlayerCards([]);
    setCachedRoundData(null);
    cachedRoundRef.current = null;
    maxRevealedRef.current = 0;
    cardIdentityRef.current = '';

    // Check if session should end
    const { data: gameData, error: fetchError } = await supabase
      .from('games')
      .select('pending_session_end, current_round, status, dealer_position')
      .eq('id', gameId)
      .single();

    console.log('[GAME OVER COMPLETE] Game data:', gameData, 'error:', fetchError);

    if (gameData?.pending_session_end) {
      console.log('[GAME OVER] Session should end, transitioning to session_ended');
      await supabase
        .from('games')
        .update({
          status: 'session_ended',
          session_ended_at: new Date().toISOString(),
          total_hands: gameData.current_round || 0,
          pending_session_end: false
        })
        .eq('id', gameId);

      setTimeout(() => navigate('/'), 2000);
      return;
    }

    // STEP 1: Evaluate player states BEFORE dealer rotation
    console.log('[GAME OVER] Evaluating player states end-of-game');
    const { activePlayerCount, eligibleDealerCount, playersRemoved } = await evaluatePlayerStatesEndOfGame(gameId);
    
    console.log('[GAME OVER] After evaluation - active players:', activePlayerCount, 'eligible dealers:', eligibleDealerCount, 'removed:', playersRemoved.length);

    // STEP 2: Check if we have enough players to continue
    // Need: 1+ eligible dealer (non-sitting-out, non-bot) AND 2+ active players (including bots)
    if (eligibleDealerCount < 1 || activePlayerCount < 2) {
      console.log('[GAME OVER] Not enough players to continue! Eligible dealers:', eligibleDealerCount, 'Active players:', activePlayerCount);
      setShowNotEnoughPlayers(true);
      return; // The countdown component will handle session end
    }

    // STEP 3: Rotate dealer to next eligible position
    const currentDealerPosition = gameData?.dealer_position || 1;
    const newDealerPosition = await rotateDealerPosition(gameId, currentDealerPosition);
    
    console.log('[GAME OVER] Dealer rotation:', currentDealerPosition, '->', newDealerPosition);

    console.log('[GAME OVER] Transitioning to game_selection phase for new game');
    
    // CAPTURE previous game config for "Running it Back" detection
    if (game) {
      console.log('[GAME OVER] Capturing previous game config for running-it-back detection');
      setPreviousGameConfig({
        game_type: game.game_type || null,
        ante_amount: game.ante_amount || 2,
        leg_value: game.leg_value || 1,
        legs_to_win: game.legs_to_win || 3,
        pussy_tax_enabled: game.pussy_tax_enabled ?? true,
        pussy_tax_value: game.pussy_tax_value || 1,
        pot_max_enabled: game.pot_max_enabled ?? true,
        pot_max_value: game.pot_max_value || 10,
        chucky_cards: game.chucky_cards || 4
      });
    }

    // CRITICAL: Delete all old rounds and player_cards from the previous game
    // This prevents stale round_number accumulation across game types
    console.log('[GAME OVER] Deleting old rounds and cards from previous game');
    
    // First delete player_cards (they reference rounds)
    const { data: oldRounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('game_id', gameId);
    
    if (oldRounds && oldRounds.length > 0) {
      const oldRoundIds = oldRounds.map(r => r.id);
      await supabase
        .from('player_cards')
        .delete()
        .in('round_id', oldRoundIds);
      
      // Then delete the rounds themselves
      await supabase
        .from('rounds')
        .delete()
        .eq('game_id', gameId);
      
      console.log('[GAME OVER] Deleted', oldRounds.length, 'old rounds and their cards');
    }

    // Reset all players for new game (keep chips, clear ante decisions)
    // Do NOT reset sitting_out - players who joined mid-game stay sitting_out until they ante up
    console.log('[GAME OVER] Resetting player states for new game');
    await supabase
      .from('players')
      .update({ 
        status: 'active',
        current_decision: null,
        decision_locked: false,
        ante_decision: null,
        sit_out_next_hand: false,
        stand_up_next_hand: false
      })
      .eq('game_id', gameId);

    // Skip dealer_announcement, go directly to game_selection
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'game_selection',
        config_complete: false,
        last_round_result: null,
        current_round: null,
        awaiting_next_round: false,
        next_round_number: null,
        pot: 0,
        all_decisions_in: false,
        game_over_at: null,
        buck_position: null,
        total_hands: 0,
        dealer_position: newDealerPosition // Set new dealer position
      })
      .eq('id', gameId);

    if (error) {
      console.error('[GAME OVER] Failed to start game selection:', error);
      return;
    }

    console.log('[GAME OVER] Successfully transitioned to game_selection');

    // Manual refetch to update UI
    // Bot dealers will be handled automatically by DealerGameSetup component
    await fetchGameData();
  }, [gameId, navigate, players, game]);

  // Dealer confirms to skip countdown and go directly to game selection
  const handleDealerConfirmGameOver = useCallback(async () => {
    if (!gameId) return;
    
    console.log('[DEALER CONFIRM] Skipping countdown, going directly to game selection');
    
    // Go directly to game_selection (no countdown)
    await handleGameOverComplete();
  }, [gameId, handleGameOverComplete]);

  // Auto-confirm game over for bot dealers (Holm games)
  // Also auto-proceed if Chucky beat a player (game should continue, not end)
  useEffect(() => {
    if (game?.status === 'game_over' && !game?.game_over_at && game?.last_round_result) {
      // If Chucky beat a player, the game should NOT have ended - auto-proceed to next hand
      if (game.last_round_result.includes('Chucky beat')) {
        console.log('[CHUCKY WIN FIX] Chucky beat player but game_over was set incorrectly - auto-proceeding');
        const timer = setTimeout(async () => {
          // Reset status to in_progress and set awaiting_next_round
          await supabase
            .from('games')
            .update({ 
              status: 'in_progress',
              awaiting_next_round: true 
            })
            .eq('id', gameId);
        }, 2000);
        return () => clearTimeout(timer);
      }
      
      const dealerPlayer = players.find(p => p.position === game.dealer_position);
      if (dealerPlayer?.is_bot) {
        console.log('[BOT DEALER] Auto-confirming game over');
        const timer = setTimeout(() => {
          handleDealerConfirmGameOver();
        }, 2000); // 2 second delay for dramatic effect
        return () => clearTimeout(timer);
      }
    }
  }, [game?.status, game?.game_over_at, game?.last_round_result, game?.dealer_position, players, handleDealerConfirmGameOver, gameId]);

  const handleAllAnteDecisionsIn = async () => {
    if (!gameId) {
      anteProcessingRef.current = false;
      return;
    }

    // CRITICAL: Fetch fresh game status from DB to prevent race conditions in multiplayer
    // React state can be stale, causing both clients to attempt ante processing
    const { data: freshGame, error: gameError } = await supabase
      .from('games')
      .select('status')
      .eq('id', gameId)
      .single();
    
    if (gameError || !freshGame) {
      console.log('[ANTE] Error fetching fresh game status:', gameError);
      anteProcessingRef.current = false;
      return;
    }
    
    // Prevent duplicate calls if already in progress (using FRESH DB data, not stale React state)
    if (freshGame.status === 'in_progress') {
      console.log('[ANTE] Already in progress (fresh check), skipping');
      anteProcessingRef.current = false;
      return;
    }

    console.log('[ANTE] Starting handleAllAnteDecisionsIn');

    // CRITICAL: Fetch fresh player data directly from database - don't use stale React state!
    const { data: freshPlayers, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId);
    
    if (playersError || !freshPlayers) {
      console.error('[ANTE] Error fetching players:', playersError);
      anteProcessingRef.current = false;
      return;
    }

    // Get players who anted up from FRESH database data
    const antedPlayers = freshPlayers.filter(p => p.ante_decision === 'ante_up');
    const sittingOutPlayers = freshPlayers.filter(p => p.ante_decision === 'sit_out' || p.sitting_out);

    console.log('[ANTE] Anted players (from DB):', antedPlayers.length, 'Sitting out:', sittingOutPlayers.length, 'Total players:', freshPlayers.length);

    // Increment sitting_out_hands for players who are sitting out
    // Remove players who have been sitting out for 14+ consecutive games
    for (const player of sittingOutPlayers) {
      const newSittingOutHands = (player.sitting_out_hands || 0) + 1;
      
      if (newSittingOutHands >= 14) {
        // Remove the player from the game
        console.log(`[ANTE] Removing player ${player.id} (${player.position}) after 14 consecutive games sitting out`);
        await supabase
          .from('players')
          .delete()
          .eq('id', player.id);
      } else {
        // Increment the counter
        await supabase
          .from('players')
          .update({ sitting_out_hands: newSittingOutHands })
          .eq('id', player.id);
      }
    }

    // Reset sitting_out_hands for players who anted up
    for (const player of antedPlayers) {
      if (player.sitting_out_hands > 0) {
        await supabase
          .from('players')
          .update({ sitting_out_hands: 0 })
          .eq('id', player.id);
      }
    }

    // Check if we have enough active players (need at least 2)
    if (antedPlayers.length < 2) {
      console.log('[ANTE] Not enough players to play this hand:', antedPlayers.length);
      
      // Set a message to display
      await supabase
        .from('games')
        .update({ 
          last_round_result: 'Not enough players to play this hand',
          status: 'game_over'
        })
        .eq('id', gameId);
      
      // Wait 3 seconds then trigger game over flow
      setTimeout(async () => {
        // Re-fetch fresh players to evaluate states
        const { data: latestPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId);
        
        if (latestPlayers) {
          // Evaluate player states and determine if session should end or continue
          const { activePlayerCount, eligibleDealerCount } = await evaluatePlayerStatesEndOfGame(gameId);
          
          console.log('[ANTE] After evaluation - Active players:', activePlayerCount, 'Eligible dealers:', eligibleDealerCount);
          
          // Need at least 1 eligible dealer AND 2+ active players to continue
          if (eligibleDealerCount >= 1 && activePlayerCount >= 2) {
            // Rotate dealer and start new game selection
            const currentDealerPos = game?.dealer_position || 1;
            const newDealerPos = await rotateDealerPosition(gameId, currentDealerPos);
            await supabase
              .from('games')
              .update({ 
                status: 'game_selection',
                last_round_result: null,
                awaiting_next_round: false,
                dealer_position: newDealerPos
              })
              .eq('id', gameId);
          } else {
            // Start session end countdown
            setShowNotEnoughPlayers(true);
            await supabase
              .from('games')
              .update({ 
                pending_session_end: true,
                game_over_at: new Date(Date.now() + 30000).toISOString()
              })
              .eq('id', gameId);
          }
        }
        
        anteProcessingRef.current = false;
        fetchGameData();
      }, 3000);
      
      return;
    }

    console.log('[ANTE] Starting first round (status will be set by startHolmRound/startRound)');

    // Start first round - let the round start functions handle the status change
    try {
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame) {
        // For Holm game, let startHolmRound handle everything including status
        await startHolmRound(gameId, true); // First hand - collect antes
      } else {
        // For 3-5-7, update status first then start round
        await supabase
          .from('games')
          .update({ status: 'in_progress' })
          .eq('id', gameId);
        await startRound(gameId, 1);
      }
      // Multiple fetches with increasing delays to catch all card data
      setTimeout(() => fetchGameData(), 500);
      setTimeout(() => fetchGameData(), 1500);
      setTimeout(() => fetchGameData(), 3000);
    } catch (error: any) {
      console.error('[ANTE] Error starting round:', error);
      // If round start fails, reset status
      await supabase
        .from('games')
        .update({ status: 'ante_decision' })
        .eq('id', gameId);
      anteProcessingRef.current = false;
    }
  };

  const leaveGame = () => {
    navigate("/");
  };

  const addChips = async (amount: number = 100) => {
    if (!gameId || !user) return;

    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    const { error } = await supabase
      .from('players')
      .update({ chips: currentPlayer.chips + amount })
      .eq('id', currentPlayer.id);

    if (error) {
      console.error('Failed to add chips:', error);
      return;
    }
  };

  const handleStay = async () => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    // Optimistic UI update - show indicator immediately
    setPendingDecision('stay');

    console.log('[PLAYER DECISION] Player staying:', {
      playerId: currentPlayer.id,
      position: currentPlayer.position,
      gameType: game?.game_type
    });

    try {
      await makeDecision(gameId, currentPlayer.id, 'stay');
      
      console.log('[PLAYER DECISION] Stay decision made, checking if round complete');
      
      // Check if round is complete after decision
      if (game?.game_type === 'holm-game') {
        await checkHolmRoundComplete(gameId);
        console.log('[PLAYER DECISION] *** Explicitly fetching after turn advance ***');
        // Explicitly fetch to get updated turn position - don't rely on realtime alone
        setTimeout(() => fetchGameData(), 100);
      }
    } catch (error: any) {
      console.error('Error making stay decision:', error);
      // Clear pending decision on error
      setPendingDecision(null);
    }
  };

  const handleFold = async () => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    // Optimistic UI update - show indicator immediately
    setPendingDecision('fold');

    try {
      await makeDecision(gameId, currentPlayer.id, 'fold');
      
      // Check if round is complete after decision
      if (game?.game_type === 'holm-game') {
        await checkHolmRoundComplete(gameId);
        console.log('[PLAYER DECISION] *** Explicitly fetching after turn advance (fold) ***');
        // Explicitly fetch to get updated turn position - don't rely on realtime alone
        setTimeout(() => fetchGameData(), 100);
      }
    } catch (error: any) {
      console.error('Error making fold decision:', error);
      // Clear pending decision on error
      setPendingDecision(null);
    }
  };

  // DEBUG: Manual proceed to next round (when debugHolmPaused is true)
  const handleDebugProceed = async () => {
    if (!gameId) return;
    console.log('[DEBUG PROCEED] Manually proceeding to next round');
    
    try {
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame) {
        await proceedToNextHolmRound(gameId);
      } else {
        await proceedToNextRound(gameId);
      }
      
      // Refetch after a short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchGameData();
      
      console.log('[DEBUG PROCEED] Done');
    } catch (error) {
      console.error('[DEBUG PROCEED] ERROR:', error);
    }
  };


  const handleEndSession = async () => {
    if (!gameId) return;

    try {
      await supabase
        .from('games')
        .update({
          pending_session_end: true,
        })
        .eq('id', gameId);

      setShowEndSessionDialog(false);
    } catch (error: any) {
      console.error('Error ending session:', error);
    }
  };



  const handleAddBot = async () => {
    if (!gameId) return;

    console.log('[ADD BOT] Starting to add bot player');
    
    try {
      await addBotPlayer(gameId);
      console.log('[ADD BOT] Bot added successfully');
      // Manual refetch to ensure bot shows up immediately
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      console.error('[ADD BOT] Error adding bot:', error);
      toast({
        title: "Error",
        description: "Failed to add bot player",
        variant: "destructive",
      });
    }
  };

  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl);
  };

  const handleSelectSeat = async (position: number) => {
    if (!gameId || !user) {
      toast({
        title: "Error",
        description: "You must be logged in to select a seat.",
        variant: "destructive",
      });
      return;
    }

    const currentPlayer = players.find(p => p.user_id === user.id);
    
    // Setup states where new players can join immediately (not sitting out)
    const setupStates = ['waiting', 'dealer_selection', 'game_selection', 'configuring', 'ante_decision'];
    // If game is actively playing (not in setup/config), new players should sit out until next game
    const gameInProgress = !setupStates.includes(game?.status || '');
    
    // For waiting status (before game starts), players join in "waiting" status (ready to play)
    const isWaitingForPlayers = game?.status === 'waiting';
    
    try {
      if (!currentPlayer) {
        // Check if this user already has a player record in this game (they left and are returning)
        const { data: existingPlayer } = await supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (existingPlayer) {
          // Player is returning - update their position and sitting_out status, keep their chips
          const { error: updateError } = await supabase
            .from('players')
            .update({
              position: position,
              sitting_out: gameInProgress,
              waiting: gameInProgress, // If game in progress, mark as waiting to join next game
              ante_decision: null // Reset ante decision so they get the popup
            })
            .eq('id', existingPlayer.id);
          
          if (updateError) {
            console.error('Error rejoining game:', updateError);
            toast({
              title: "Error Rejoining Game",
              description: updateError.message || "Failed to select seat. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          toast({
            title: "Welcome Back!",
            description: `Returned to seat #${position} with $${existingPlayer.chips} chips.`,
          });
        } else {
          // User is a new observer - insert them as a new player
          // Fetch user's profile to get their deck_color_mode preference
          const { data: userProfile } = await supabase
            .from('profiles')
            .select('deck_color_mode')
            .eq('id', user.id)
            .maybeSingle();
          
          // For waiting status: players join with waiting=true (ready to play when game starts)
          // For other setup phases: players join immediately
          // For in_progress games: players sit out until next game
          const { error: joinError } = await supabase
            .from('players')
            .insert({
              game_id: gameId,
              user_id: user.id,
              chips: 0,
              position: position,
              sitting_out: gameInProgress,
              waiting: isWaitingForPlayers ? true : gameInProgress, // waiting: mark as waiting to play
              ante_decision: null, // Ensure ante_decision is null so they get the popup
              deck_color_mode: userProfile?.deck_color_mode || null // Copy from profile
            });

          if (joinError) {
            console.error('Error joining game:', joinError);
            toast({
              title: "Error Joining Game",
              description: joinError.message || "Failed to select seat. Please try again.",
              variant: "destructive",
            });
            return;
          }
          
          toast({
            title: gameInProgress ? "Seat Reserved" : "Seat Selected",
            description: gameInProgress 
              ? `You'll join the game at seat #${position} when the next round starts.`
              : `Welcome to seat #${position}!`,
          });
        }
      } else {
        // Existing player changing seats
        // Keep sitting_out status if game is in progress
        const { error: updateError } = await supabase
          .from('players')
          .update({
            position: position,
            sitting_out: gameInProgress ? currentPlayer.sitting_out : false
          })
          .eq('id', currentPlayer.id);
          
        if (updateError) {
          console.error('Error changing seats:', updateError);
          toast({
            title: "Error Changing Seats",
            description: updateError.message || "Failed to change seats. Please try again.",
            variant: "destructive",
          });
          return;
        }
        
        toast({
          title: "Seat Changed",
          description: `Moved to seat #${position}`,
        });
      }
      
      // Refetch to update UI
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      console.error('Error selecting seat:', error);
      toast({
        title: "Unexpected Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading || !game) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const gameName = game.name || `Game #${gameId?.slice(0, 8)}`;
  const sessionStartTime = game.created_at ? new Date(game.created_at).toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  }) : '';
  const handsPlayed = game.total_hands || 0;

  const isCreator = players[0]?.user_id === user?.id;
  const canStart = game.status === 'waiting' && players.length >= 2 && isCreator;
  const dealerPlayer = players.find(p => p.position === game.dealer_position);
  const isDealer = dealerPlayer?.user_id === user?.id;
  const currentPlayer = players.find(p => p.user_id === user?.id);

  return (
    <VisualPreferencesProvider userId={user?.id}>
      <GameDeckColorModeSync 
        playerId={currentPlayer?.id} 
        playerDeckColorMode={currentPlayer?.deck_color_mode}
        onModeChange={() => {}}
      />
    <div className={`min-h-screen ${isMobile ? 'p-0' : 'p-4'} bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`}>
      <div className={`${isMobile ? '' : 'max-w-7xl mx-auto space-y-6'}`}>
        {/* Desktop header */}
        {!isMobile && (
          <div className="flex justify-between items-center">
            <div className="flex items-start gap-3">
              {/* Player Options Menu - only show if player is seated */}
              {currentPlayer && (
                <PlayerOptionsMenu
                  isSittingOut={currentPlayer.sitting_out}
                  isObserver={false}
                  waiting={currentPlayer.waiting}
                  autoAnte={playerOptions.autoAnte}
                  sitOutNextHand={playerOptions.sitOutNextHand}
                  standUpNextHand={playerOptions.standUpNextHand}
                  onAutoAnteChange={(v) => handlePlayerOptionChange('auto_ante', v)}
                  onSitOutNextHandChange={(v) => handlePlayerOptionChange('sit_out_next_hand', v)}
                  onStandUpNextHandChange={(v) => handlePlayerOptionChange('stand_up_next_hand', v)}
                  onStandUpNow={handleStandUpNow}
                  onLeaveGameNow={handleLeaveGameNow}
                  variant="desktop"
                  gameStatus={game.status}
                  isHost={isCreator}
                  isPaused={game.is_paused}
                  onTogglePause={(game.status === 'in_progress' || game.status === 'configuring' || game.status === 'game_selection') ? handleTogglePause : undefined}
                  onAddBot={async () => {
                    try {
                      await addBotPlayerSittingOut(gameId!);
                      fetchGameData();
                    } catch (error: any) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                    }
                  }}
                  canAddBot={players.length < 7 && (game.status === 'in_progress' || game.status === 'waiting')}
                  deckColorMode={(currentPlayer.deck_color_mode as 'two_color' | 'four_color') || 'four_color'}
                  onDeckColorModeChange={async (mode) => {
                    await handleDeckColorModeChange(currentPlayer.id, mode, fetchGameData);
                  }}
                />
              )}
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">Peoria Poker League</h1>
                <p className="text-muted-foreground">{gameName}</p>
                <p className="text-sm text-muted-foreground">Session started at: {sessionStartTime}</p>
                <p className="text-sm text-muted-foreground">{handsPlayed} hands played</p>
              </div>
            </div>
            <div className="flex gap-2">
              {game.status === 'in_progress' && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex gap-2">
                    {isCreator && players.length < 7 && (
                      <Button 
                        variant="outline" 
                        onClick={async () => {
                          try {
                            await addBotPlayerSittingOut(gameId!);
                            fetchGameData();
                          } catch (error: any) {
                            toast({ title: "Error", description: error.message, variant: "destructive" });
                          }
                        }}
                      >
                        <Bot className="w-4 h-4 mr-2" />
                        Add Bot
                      </Button>
                    )}
                    {isCreator && (
                      <Button 
                        variant={game.is_paused ? "default" : "outline"} 
                        onClick={handleTogglePause}
                      >
                        {game.is_paused ? '▶️ Resume' : '⏸️ Pause'}
                      </Button>
                    )}
                  </div>
                  {game.is_paused && (
                    <Badge variant="destructive" className="animate-pulse text-sm px-3 py-1">
                      ⏸️ GAME PAUSED
                    </Badge>
                  )}
                </div>
              )}
              {game.status === 'waiting' && (
                <Button variant="default" onClick={handleInvite}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Invite Players
                </Button>
              )}
              {isCreator && ['in_progress', 'ante_decision', 'dealer_selection', 'game_selection', 'configuring'].includes(game.status) && (
                <Button variant="destructive" onClick={() => setShowEndSessionDialog(true)}>
                  End Session
                </Button>
              )}
              {/* Only show Leave Game if player is sitting out or is an observer */}
              {(!players.find(p => p.user_id === user?.id) || players.find(p => p.user_id === user?.id)?.sitting_out) && (
                <Button variant="outline" onClick={leaveGame}>
                  Leave Game
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Mobile header - minimal */}
        {isMobile && (
          <div className="flex items-center justify-between px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">PPL</span>
              {/* Player Options Menu - only show if player is seated */}
              {currentPlayer && (
                <PlayerOptionsMenu
                  isSittingOut={currentPlayer.sitting_out}
                  isObserver={false}
                  waiting={currentPlayer.waiting}
                  autoAnte={playerOptions.autoAnte}
                  sitOutNextHand={playerOptions.sitOutNextHand}
                  standUpNextHand={playerOptions.standUpNextHand}
                  onAutoAnteChange={(v) => handlePlayerOptionChange('auto_ante', v)}
                  onSitOutNextHandChange={(v) => handlePlayerOptionChange('sit_out_next_hand', v)}
                  onStandUpNextHandChange={(v) => handlePlayerOptionChange('stand_up_next_hand', v)}
                  onStandUpNow={handleStandUpNow}
                  onLeaveGameNow={handleLeaveGameNow}
                  variant="mobile"
                  gameStatus={game.status}
                  isHost={isCreator}
                  isPaused={game.is_paused}
                  onTogglePause={(game.status === 'in_progress' || game.status === 'configuring' || game.status === 'game_selection') ? handleTogglePause : undefined}
                  onAddBot={async () => {
                    try {
                      await addBotPlayerSittingOut(gameId!);
                      fetchGameData();
                    } catch (error: any) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                    }
                  }}
                  canAddBot={players.length < 7 && (game.status === 'in_progress' || game.status === 'waiting')}
                  deckColorMode={(currentPlayer.deck_color_mode as 'two_color' | 'four_color') || 'four_color'}
                  onDeckColorModeChange={async (mode) => {
                    await handleDeckColorModeChange(currentPlayer.id, mode, fetchGameData);
                  }}
                />
              )}
            </div>
            <span className="text-xs text-muted-foreground">{gameName}</span>
          </div>
        )}

        {/* waiting status - show empty table with seat selection */}
        {game.status === 'waiting' && (
          <WaitingForPlayersTable
            gameId={gameId!}
            players={players}
            currentUserId={user?.id}
            onSelectSeat={handleSelectSeat}
            onGameStart={startGameFromWaiting}
            isMobile={isMobile}
          />
        )}

        {(game.status === 'dealer_selection' || game.status === 'game_selection' || game.status === 'configuring' || game.status === 'game_over' || game.status === 'session_ended') && (
          <>
            {game.status === 'dealer_selection' && (
              <DealerSelection 
                players={players}
                onComplete={selectDealer}
              />
            )}
            {(game.status === 'game_over' || game.status === 'session_ended') && game.last_round_result && !game.last_round_result.includes('Chucky beat') ? (
              <div className="relative">
                {isMobile ? (
                  <MobileGameTable
                    players={players}
                    currentUserId={user?.id}
                    pot={game.pot || 0}
                    currentRound={game.current_round || 0}
                    allDecisionsIn={true}
                    playerCards={playerCards}
                    timeLeft={null}
                    lastRoundResult={game.last_round_result}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value || 1}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                    communityCards={currentRound?.community_cards as CardType[] | undefined}
                    communityCardsRevealed={effectiveCommunityCardsRevealed}
                    chuckyCards={currentRound?.chucky_cards as CardType[] | undefined}
                    chuckyCardsRevealed={currentRound?.chucky_cards_revealed}
                    chuckyActive={currentRound?.chucky_active}
                    gameType={game.game_type}
                    roundStatus={currentRound?.status}
                    isGameOver={!game.game_over_at}
                    isDealer={isDealer || dealerPlayer?.is_bot || false}
                    onNextGame={handleDealerConfirmGameOver}
                  />
                ) : (
                  <>
                    <GameTable
                      players={players}
                      currentUserId={user?.id}
                      pot={game.pot || 0}
                      currentRound={game.current_round || 0}
                      allDecisionsIn={true}
                      playerCards={playerCards}
                      timeLeft={null}
                      lastRoundResult={null}
                      dealerPosition={game.dealer_position}
                      legValue={game.leg_value || 1}
                      legsToWin={game.legs_to_win || 3}
                      potMaxEnabled={game.pot_max_enabled ?? true}
                      potMaxValue={game.pot_max_value || 10}
                      pendingSessionEnd={false}
                      awaitingNextRound={false}
                      onStay={() => {}}
                      onFold={() => {}}
                      onSelectSeat={handleSelectSeat}
                      communityCards={currentRound?.community_cards as CardType[] | undefined}
                      communityCardsRevealed={effectiveCommunityCardsRevealed}
                      chuckyCards={currentRound?.chucky_cards as CardType[] | undefined}
                      chuckyCardsRevealed={currentRound?.chucky_cards_revealed}
                      chuckyActive={currentRound?.chucky_active}
                      gameType={game.game_type}
                      roundStatus={currentRound?.status}
                    />
                    {game.game_over_at ? (
                      <GameOverCountdown
                        winnerMessage={game.last_round_result}
                        nextDealer={dealerPlayer || { id: '', position: game.dealer_position || 1, profiles: { username: `Player ${game.dealer_position || 1}` } }}
                        onComplete={handleGameOverComplete}
                        gameOverAt={game.game_over_at}
                        isSessionEnded={game.status === 'session_ended'}
                        pendingSessionEnd={game.pending_session_end || false}
                      />
                    ) : (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30">
                        <DealerConfirmGameOver
                          isDealer={isDealer || dealerPlayer?.is_bot || false}
                          onConfirm={handleDealerConfirmGameOver}
                          resultMessage={game.last_round_result}
                        />
                      </div>
                    )}
                  </>
                )}
                {/* Mobile game over countdown */}
                {isMobile && game.game_over_at && (
                  <GameOverCountdown
                    winnerMessage={game.last_round_result}
                    nextDealer={dealerPlayer || { id: '', position: game.dealer_position || 1, profiles: { username: `Player ${game.dealer_position || 1}` } }}
                    onComplete={handleGameOverComplete}
                    gameOverAt={game.game_over_at}
                    isSessionEnded={game.status === 'session_ended'}
                    pendingSessionEnd={game.pending_session_end || false}
                  />
                )}
              </div>
            ) : (game.status === 'game_selection' || game.status === 'configuring') ? (
              <div className="relative">
                {isMobile ? (
                  <MobileGameTable
                    players={players}
                    currentUserId={user?.id}
                    pot={game.pot || 0}
                    currentRound={0}
                    allDecisionsIn={false}
                    playerCards={[]}
                    timeLeft={null}
                    lastRoundResult={null}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value || 1}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                  />
                ) : (
                  <GameTable
                    players={players}
                    currentUserId={user?.id}
                    pot={game.pot || 0}
                    currentRound={0}
                    allDecisionsIn={false}
                    playerCards={[]}
                    timeLeft={null}
                    lastRoundResult={null}
                    dealerPosition={game.dealer_position}
                    legValue={game.leg_value || 1}
                    legsToWin={game.legs_to_win || 3}
                    potMaxEnabled={game.pot_max_enabled ?? true}
                    potMaxValue={game.pot_max_value || 10}
                    pendingSessionEnd={false}
                    awaitingNextRound={false}
                    onStay={() => {}}
                    onFold={() => {}}
                    onSelectSeat={handleSelectSeat}
                  />
                )}
                {(isDealer || dealerPlayer?.is_bot) ? (
                  <DealerGameSetup
                    gameId={gameId!}
                    dealerUsername={dealerPlayer?.profiles?.username || `Player ${game.dealer_position}`}
                    isBot={dealerPlayer?.is_bot || false}
                    dealerPlayerId={dealerPlayer?.id || ''}
                    dealerPosition={game.dealer_position || 1}
                    onConfigComplete={handleConfigComplete}
                    onSessionEnd={() => fetchGameData()}
                  />
                ) : (
                  // Non-dealer waiting message
                  players.some(p => p.user_id === user?.id) && (
                    <DealerSettingUpGame 
                      dealerUsername={dealerPlayer?.profiles?.username || `Player ${game.dealer_position}`}
                    />
                  )
                )}
              </div>
            ) : null}
          </>
        )}

        {game.status === 'ante_decision' && (
          <>
            {/* Show table during ante decisions */}
            {isMobile ? (
              <MobileGameTable
                players={players}
                currentUserId={user?.id}
                pot={game.pot || 0}
                currentRound={0}
                allDecisionsIn={false}
                playerCards={[]}
                timeLeft={anteTimeLeft}
                lastRoundResult={null}
                dealerPosition={game.dealer_position}
                legValue={game.leg_value || 1}
                legsToWin={game.legs_to_win || 3}
                potMaxEnabled={game.pot_max_enabled ?? true}
                potMaxValue={game.pot_max_value || 10}
                pendingSessionEnd={game.pending_session_end || false}
                awaitingNextRound={false}
                onStay={() => {}}
                onFold={() => {}}
                onSelectSeat={handleSelectSeat}
                gameType={game.game_type}
              />
            ) : (
              <GameTable
                players={players}
                currentUserId={user?.id}
                pot={game.pot || 0}
                currentRound={0}
                allDecisionsIn={false}
                playerCards={[]}
                timeLeft={anteTimeLeft}
                lastRoundResult={null}
                dealerPosition={game.dealer_position}
                legValue={game.leg_value || 1}
                legsToWin={game.legs_to_win || 3}
                potMaxEnabled={game.pot_max_enabled ?? true}
                potMaxValue={game.pot_max_value || 10}
                pendingSessionEnd={game.pending_session_end || false}
                awaitingNextRound={false}
                onStay={() => {}}
                onFold={() => {}}
                onSelectSeat={handleSelectSeat}
              />
            )}
            
            {showAnteDialog && user && game.ante_amount !== undefined && (
              <AnteUpDialog
                gameId={gameId!}
                playerId={players.find(p => p.user_id === user.id)?.id || ''}
                gameType={game.game_type}
                anteAmount={game.ante_amount}
                legValue={game.leg_value || 1}
                pussyTaxEnabled={game.pussy_tax_enabled ?? true}
                pussyTaxValue={game.pussy_tax_value || 1}
                legsToWin={game.legs_to_win || 3}
                potMaxEnabled={game.pot_max_enabled ?? true}
                potMaxValue={game.pot_max_value || 10}
                chuckyCards={game.chucky_cards}
                isRunningItBack={isRunningItBack}
                onDecisionMade={() => setShowAnteDialog(false)}
              />
            )}
          </>
        )}

        {game.status === 'completed' && (
          <Card className="border-poker-gold border-4">
            <CardHeader>
              <CardTitle className="text-center text-3xl text-poker-gold">Game Over!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-poker-gold/20 p-6 rounded-lg border-2 border-poker-gold/60">
                <p className="text-poker-gold font-bold text-2xl text-center">
                  {(game as any).last_round_result || 'Game completed'}
                </p>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Final Standings:</h3>
                {players
                  .sort((a, b) => b.legs - a.legs || b.chips - a.chips)
                  .map((p, index) => (
                    <div 
                      key={p.id}
                      className={`flex justify-between items-center p-3 rounded ${
                        index === 0 ? 'bg-poker-gold/20 border border-poker-gold' : 'bg-card'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="text-2xl">🏆</span>}
                        <span className={index === 0 ? 'font-bold text-poker-gold' : ''}>
                          {p.profiles?.username || `Player ${p.position}`}
                          {p.is_bot && ' 🤖'}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <Badge variant={index === 0 ? "default" : "secondary"}>
                          {p.legs} legs
                        </Badge>
                        <Badge variant="outline" className={p.chips < 0 ? 'text-red-500' : ''}>${p.chips}</Badge>
                      </div>
                    </div>
                  ))}
              </div>
              
              <div className="flex gap-2 justify-center">
                <Button onClick={() => navigate('/')} variant="outline">
                  Back to Lobby
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {game.status === 'in_progress' && (
          isMobile ? (
            <MobileGameTable
              players={players}
              currentUserId={user?.id}
              pot={game.pot || 0}
              currentRound={game.current_round || 1}
              allDecisionsIn={game.all_decisions_in || false}
              playerCards={playerCards}
              timeLeft={timeLeft}
              maxTime={decisionTimerSeconds}
              lastRoundResult={(game as any).last_round_result || null}
              dealerPosition={game.dealer_position}
              legValue={game.leg_value || 1}
              legsToWin={game.legs_to_win || 3}
              potMaxEnabled={game.pot_max_enabled ?? true}
              potMaxValue={game.pot_max_value || 10}
              pendingSessionEnd={game.pending_session_end || false}
              awaitingNextRound={game.awaiting_next_round || false}
              gameType={game.game_type}
              communityCards={currentRound?.community_cards as CardType[] | undefined}
              communityCardsRevealed={effectiveCommunityCardsRevealed}
              buckPosition={game.buck_position}
              currentTurnPosition={game.game_type === 'holm-game' ? currentRound?.current_turn_position : null}
              chuckyCards={currentRound?.chucky_cards as CardType[] | undefined}
              chuckyActive={currentRound?.chucky_active}
              chuckyCardsRevealed={currentRound?.chucky_cards_revealed}
              roundStatus={currentRound?.status}
              pendingDecision={pendingDecision}
              isPaused={game.is_paused || false}
              onStay={handleStay}
              onFold={handleFold}
              onSelectSeat={handleSelectSeat}
              isHost={isCreator}
              onBotClick={(bot) => { setSelectedBot(bot as Player); setShowBotOptions(true); }}
              chatBubbles={chatBubbles}
              onSendChat={sendChatMessage}
              isChatSending={isChatSending}
              getPositionForUserId={getPositionForUserId}
            />
          ) : (
            <GameTable
              gameId={gameId}
              players={players}
              currentUserId={user?.id}
              pot={game.pot || 0}
              currentRound={game.current_round || 1}
              allDecisionsIn={game.all_decisions_in || false}
              playerCards={playerCards}
              authoritativeCardCount={cardStateContext?.cardsDealt}
              timeLeft={timeLeft}
              lastRoundResult={(game as any).last_round_result || null}
              dealerPosition={game.dealer_position}
              legValue={game.leg_value || 1}
              legsToWin={game.legs_to_win || 3}
              potMaxEnabled={game.pot_max_enabled ?? true}
              potMaxValue={game.pot_max_value || 10}
              pendingSessionEnd={game.pending_session_end || false}
              awaitingNextRound={game.awaiting_next_round || false}
              gameType={game.game_type}
              communityCards={currentRound?.community_cards as CardType[] | undefined}
              communityCardsRevealed={effectiveCommunityCardsRevealed}
              buckPosition={game.buck_position}
              currentTurnPosition={game.game_type === 'holm-game' ? currentRound?.current_turn_position : null}
              chuckyCards={currentRound?.chucky_cards as CardType[] | undefined}
              chuckyActive={currentRound?.chucky_active}
              chuckyCardsRevealed={currentRound?.chucky_cards_revealed}
              roundStatus={currentRound?.status}
              pendingDecision={pendingDecision}
              isPaused={game.is_paused || false}
              debugHolmPaused={debugHolmPaused}
              onStay={handleStay}
              onFold={handleFold}
              onSelectSeat={handleSelectSeat}
              onRequestRefetch={fetchGameData}
              onDebugProceed={handleDebugProceed}
              isHost={isCreator}
              onBotClick={(bot) => { setSelectedBot(bot as Player); setShowBotOptions(true); }}
              chatBubbles={chatBubbles}
              onSendChat={sendChatMessage}
              isChatSending={isChatSending}
              getPositionForUserId={getPositionForUserId}
            />
          )
        )}
      </div>

      {/* Bot options dialog for host */}
      <BotOptionsDialog
        open={showBotOptions}
        onOpenChange={setShowBotOptions}
        bot={selectedBot}
        onUpdate={fetchGameData}
      />

      {/* Not enough players countdown overlay */}
      {showNotEnoughPlayers && (
        <NotEnoughPlayersCountdown 
          gameId={gameId!} 
          onComplete={() => setShowNotEnoughPlayers(false)}
          onResume={() => {
            setShowNotEnoughPlayers(false);
            // Re-run the end-of-game evaluation which will now find enough players
            handleGameOverComplete();
          }}
        />
      )}

      <AlertDialog open={showEndSessionDialog} onOpenChange={setShowEndSessionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End Session for Everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the session for all players after the current game completes. 
              All players will be notified that this is the last hand.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEndSession}>
              Confirm End Session
            </AlertDialogAction>
          </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>
    </div>
    </VisualPreferencesProvider>
  );
};

export default Game;
