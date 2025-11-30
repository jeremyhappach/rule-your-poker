import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import { GameTable } from "@/components/GameTable";
import { DealerConfig } from "@/components/DealerConfig";
import { AnteUpDialog } from "@/components/AnteUpDialog";
import { DealerSelection } from "@/components/DealerSelection";
import { PreGameLobby } from "@/components/PreGameLobby";
import { GameOverCountdown } from "@/components/GameOverCountdown";
import { GameSelection } from "@/components/GameSelection";

import { startRound, makeDecision, autoFoldUndecided, proceedToNextRound } from "@/lib/gameLogic";
import { startHolmRound, endHolmRound, proceedToNextHolmRound } from "@/lib/holmGameLogic";
import { addBotPlayer, makeBotDecisions, makeBotAnteDecisions } from "@/lib/botPlayer";
import { Card as CardType } from "@/lib/cardUtils";
import { Share2, Bot } from "lucide-react";
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
  ante_decision: string | null;
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
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
}

const Game = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<GameData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerCards, setPlayerCards] = useState<PlayerCards[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [anteTimeLeft, setAnteTimeLeft] = useState<number | null>(null);
  const [showAnteDialog, setShowAnteDialog] = useState(false);
  const [showEndSessionDialog, setShowEndSessionDialog] = useState(false);
  const [hasShownEndingToast, setHasShownEndingToast] = useState(false);

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
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        (payload) => {
          console.log('[REALTIME] Games table changed:', payload);
          debouncedFetch();
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
          console.log('[REALTIME] Players table changed:', payload);
          debouncedFetch();
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
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || isPaused || game?.awaiting_next_round || game?.last_round_result || game?.all_decisions_in) {
      console.log('[TIMER COUNTDOWN] Stopped', { timeLeft, isPaused, awaiting: game?.awaiting_next_round, result: game?.last_round_result, allDecisionsIn: game?.all_decisions_in });
      return;
    }

    console.log('[TIMER COUNTDOWN] Starting interval, current timeLeft:', timeLeft);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          console.log('[TIMER COUNTDOWN] Reached 0, prev was:', prev);
          return 0;
        }
        const newTime = prev - 1;
        console.log('[TIMER COUNTDOWN] Tick:', prev, '→', newTime);
        return newTime;
      });
    }, 1000);

    return () => {
      console.log('[TIMER COUNTDOWN] Cleanup');
      clearInterval(timer);
    };
  }, [timeLeft, isPaused, game?.awaiting_next_round, game?.last_round_result, game?.all_decisions_in]);

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

  // Trigger bot ante decisions
  useEffect(() => {
    if (game?.status === 'ante_decision') {
      console.log('[ANTE PHASE] Game entered ante_decision status, triggering bot decisions');
      const botAnteTimer = setTimeout(() => {
        console.log('[ANTE PHASE] Calling makeBotAnteDecisions');
        makeBotAnteDecisions(gameId!);
      }, 500); // Give time for game data to be fetched

      return () => clearTimeout(botAnteTimer);
    }
  }, [game?.status, gameId]);

  // Check if ante dialog should show
  useEffect(() => {
    if (game?.status === 'ante_decision' && user) {
      const currentPlayer = players.find(p => p.user_id === user.id);
      const isDealer = currentPlayer?.position === game.dealer_position;
      
      // Don't show ante dialog for dealer (they auto ante up)
      if (currentPlayer && !currentPlayer.ante_decision && !isDealer) {
        setShowAnteDialog(true);
        
        // Calculate ante time left
        if (game.ante_decision_deadline) {
          const deadline = new Date(game.ante_decision_deadline).getTime();
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
          setAnteTimeLeft(remaining);
        }
      } else {
        setShowAnteDialog(false);
      }
    } else {
      setShowAnteDialog(false);
    }
  }, [game?.status, game?.ante_decision_deadline, game?.dealer_position, players, user]);

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
    if (game?.status !== 'ante_decision') return;

    const checkAnteDecisions = () => {
      const decidedCount = players.filter(p => p.ante_decision).length;
      const allDecided = players.every(p => p.ante_decision);
      console.log('[ANTE CHECK] Players:', players.length, 'Decided:', decidedCount, 'All decided:', allDecided, 'Player ante statuses:', players.map(p => ({ pos: p.position, ante: p.ante_decision, bot: p.is_bot })));
      
      if (allDecided && players.length > 0) {
        console.log('[ANTE CHECK] All players decided, proceeding to start round');
        handleAllAnteDecisionsIn();
      }
    };

    // Check immediately
    checkAnteDecisions();

    // Poll every 2 seconds as fallback (reduced from 500ms to prevent flickering)
    const pollInterval = setInterval(() => {
      console.log('[ANTE POLL] Polling for ante decisions...');
      fetchGameData();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [game?.status, players, gameId]);

  // Trigger bot decisions when round starts
  useEffect(() => {
    if (game?.status === 'in_progress' && !game.all_decisions_in && timeLeft !== null) {
      // Instant bot decisions for testing
      const botDecisionTimer = setTimeout(() => {
        makeBotDecisions(gameId!);
      }, 100);

      return () => clearTimeout(botDecisionTimer);
    }
  }, [game?.current_round, gameId]);

  // Auto-fold when timer reaches 0
  useEffect(() => {
    console.log('[TIMER CHECK]', { 
      timeLeft, 
      status: game?.status, 
      all_decisions_in: game?.all_decisions_in, 
      isPaused,
      shouldAutoFold: timeLeft === 0 && game?.status === 'in_progress' && !game.all_decisions_in && !isPaused
    });
    
    // Only auto-fold if timer expired AND all_decisions_in is still false
    if (timeLeft === 0 && game?.status === 'in_progress' && !game.all_decisions_in && !isPaused) {
      console.log('[TIMER EXPIRED] Auto-folding undecided players');
      const isHolmGame = game?.game_type === 'holm-game';
      
      if (isHolmGame) {
        // For Holm game, auto-fold then end the round
        autoFoldUndecided(gameId!).then(() => {
          endHolmRound(gameId!);
        }).catch(err => {
          console.error('[TIMER EXPIRED] Error in Holm game:', err);
        });
      } else {
        autoFoldUndecided(gameId!).catch(err => {
          console.error('[TIMER EXPIRED] Error auto-folding:', err);
        });
      }
    }
  }, [timeLeft, game?.status, game?.all_decisions_in, gameId, isPaused]);

  // Auto-proceed to next round when awaiting (with 4-second delay to show results)
  // Using a ref to prevent multiple simultaneous timeouts
  const proceedingToNextRoundRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Don't proceed if game is in game_over status (let GameOverCountdown handle it)
    if (game?.awaiting_next_round && gameId && !proceedingToNextRoundRef.current && game.status !== 'game_over') {
      // Clear timer immediately when awaiting next round
      setTimeLeft(null);
      
      console.log('[AWAITING_NEXT_ROUND] Waiting 4 seconds before proceeding to next round');
      proceedingToNextRoundRef.current = true;
      
      // Wait 4 seconds to show the result, then start next round
      const timer = setTimeout(async () => {
        console.log('[AWAITING_NEXT_ROUND] Proceeding to next round');
        try {
          const isHolmGame = game?.game_type === 'holm-game';
          if (isHolmGame) {
            await proceedToNextHolmRound(gameId);
          } else {
            await proceedToNextRound(gameId);
          }
        } catch (error) {
          console.error('[AWAITING_NEXT_ROUND] Error proceeding:', error);
        } finally {
          proceedingToNextRoundRef.current = false;
        }
      }, 4000);
      
      return () => {
        console.log('[AWAITING_NEXT_ROUND] Cleanup: cancelling timeout');
        clearTimeout(timer);
        proceedingToNextRoundRef.current = false;
      };
    }
  }, [game?.awaiting_next_round, gameId, game?.status]);

  // Clear timer when results are shown
  useEffect(() => {
    if (game?.last_round_result) {
      console.log('[RESULT] Clearing timer for result display');
      setTimeLeft(null);
    }
  }, [game?.last_round_result]);

  // Removed failsafe - countdown component now handles completion reliably

  const fetchGameData = async () => {
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

    console.log('[FETCH] Players fetched:', playersData?.length, 'Ante decisions:', playersData?.map(p => ({ pos: p.position, ante: p.ante_decision })));

    // Users join as observers - they must select a seat to become a player

    // Fetch player cards if game is in progress
    if (gameData.status === 'in_progress' && gameData.current_round) {
      const { data: roundData } = await supabase
        .from('rounds')
        .select('id')
        .eq('game_id', gameId)
        .eq('round_number', gameData.current_round)
        .single();

      if (roundData) {
        const { data: cardsData } = await supabase
          .from('player_cards')
          .select('player_id, cards')
          .eq('round_id', roundData.id);

        if (cardsData) {
          setPlayerCards(cardsData.map(cd => ({
            player_id: cd.player_id,
            cards: cd.cards as unknown as CardType[]
          })));
        }
      }
    } else {
      // Clear cards when not in active play to prevent showing old cards
      setPlayerCards([]);
    }

    setGame(gameData);
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
      const currentRound = gameData.rounds.find((r: Round) => r.round_number === gameData.current_round);
      if (currentRound?.decision_deadline) {
        const deadline = new Date(currentRound.decision_deadline).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
        console.log('[FETCH] Setting timeLeft from deadline:', { deadline: new Date(deadline), now: new Date(now), remaining, all_decisions_in: gameData.all_decisions_in });
        setTimeLeft(remaining);
      }
    } else {
      // Clear timer for non-playing states or transitions (but not for game_over to avoid disrupting countdown)
      if (!gameData.game_over_at) {
        if (gameData.awaiting_next_round || gameData.last_round_result) {
          console.log('[FETCH] Clearing timer during transition');
        } else {
          console.log('[FETCH] Clearing timer, status:', gameData.status);
        }
        setTimeLeft(null);
      } else {
        console.log('[FETCH] Skipping timer update during game_over to preserve countdown');
      }
    }
    
    setLoading(false);
  };

  const startGame = async () => {
    if (!gameId) return;

    // Start game and show table immediately - dealer selection will happen on the table
    const { error } = await supabase
      .from('games')
      .update({ 
        status: 'dealer_selection',
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

    const dealerPlayer = players.find(p => p.position === dealerPosition);

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

    // Make bot decision if dealer is a bot
    if (dealerPlayer?.is_bot && gameId) {
      // Bot immediately selects a game
      setTimeout(() => {
        handleGameSelection('3-5-7');
      }, 1000);
    }

    // Manual refetch to ensure UI updates immediately
    setTimeout(() => fetchGameData(), 500);
  };

  const handleConfigComplete = async () => {
    if (!gameId) return;

    // Immediately refetch to sync state - bots will start making decisions automatically
    setTimeout(() => fetchGameData(), 100);
  };

  const handleGameSelection = async (gameType: string) => {
    if (!gameId) return;

    console.log('[GAME SELECTION] Selected game:', gameType);

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

    // Manual refetch to update UI
    setTimeout(() => fetchGameData(), 100);
  };

  const handleGameOverComplete = useCallback(async () => {
    if (!gameId) {
      console.log('[GAME OVER COMPLETE] No gameId, aborting');
      return;
    }

    console.log('[GAME OVER COMPLETE] Starting transition to next game, gameId:', gameId);

    // Check if session should end
    const { data: gameData, error: fetchError } = await supabase
      .from('games')
      .select('pending_session_end, current_round, status')
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

    console.log('[GAME OVER] Transitioning to game_selection phase for new game');

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
        game_over_at: null
      })
      .eq('id', gameId);

    if (error) {
      console.error('[GAME OVER] Failed to start game selection:', error);
      return;
    }

    console.log('[GAME OVER] Successfully transitioned to game_selection');

    // Manual refetch to update UI
    setTimeout(() => fetchGameData(), 100);
  }, [gameId, navigate]);

  const handleAllAnteDecisionsIn = async () => {
    if (!gameId) return;

    // Prevent duplicate calls if already in progress
    if (game?.status === 'in_progress') {
      console.log('[ANTE] Already in progress, skipping');
      return;
    }

    console.log('[ANTE] Starting handleAllAnteDecisionsIn');

    // Get players who anted up
    const antedPlayers = players.filter(p => p.ante_decision === 'ante_up');

    console.log('[ANTE] Anted players:', antedPlayers.length);

    if (antedPlayers.length === 0) {
      await supabase
        .from('games')
        .update({ status: 'waiting' })
        .eq('id', gameId);
      
      return;
    }

    console.log('[ANTE] Updating game status to in_progress');

    // Update game status to in_progress
    const { error } = await supabase
      .from('games')
      .update({ status: 'in_progress' })
      .eq('id', gameId);

    if (error) {
      console.error('[ANTE] Error updating game status:', error);
      return;
    }

    console.log('[ANTE] Starting first round');

    // Start first round
    try {
      const isHolmGame = game?.game_type === 'holm-game';
      if (isHolmGame) {
        await startHolmRound(gameId, 1);
      } else {
        await startRound(gameId, 1);
      }
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      console.error('[ANTE] Error starting round:', error);
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

    try {
      await makeDecision(gameId, currentPlayer.id, 'stay');
    } catch (error: any) {
      console.error('Error making stay decision:', error);
    }
  };

  const handleFold = async () => {
    if (!gameId || !user) return;
    
    const currentPlayer = players.find(p => p.user_id === user.id);
    if (!currentPlayer) return;

    try {
      await makeDecision(gameId, currentPlayer.id, 'fold');
    } catch (error: any) {
      console.error('Error making fold decision:', error);
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
    if (!gameId || !user) return;

    const currentPlayer = players.find(p => p.user_id === user.id);
    
    try {
      if (!currentPlayer) {
        // User is an observer - insert them as a new player
        const { error: joinError } = await supabase
          .from('players')
          .insert({
            game_id: gameId,
            user_id: user.id,
            chips: 0,
            position: position,
            sitting_out: false
          });

        if (joinError) throw joinError;
      } else {
        // Existing player changing seats
        await supabase
          .from('players')
          .update({
            position: position,
            sitting_out: false
          })
          .eq('id', currentPlayer.id);
      }
      
      // Refetch to update UI
      setTimeout(() => fetchGameData(), 500);
    } catch (error: any) {
      console.error('Error ending session:', error);
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

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Peoria Home Game Poker</h1>
            <p className="text-muted-foreground">{gameName}</p>
            <p className="text-sm text-muted-foreground">Session started at: {sessionStartTime}</p>
            <p className="text-sm text-muted-foreground">{handsPlayed} hands played</p>
          </div>
          <div className="flex gap-2">
            {game.status !== 'configuring' && (
              <Badge variant={game.status === 'in_progress' ? 'default' : 'secondary'}>
                {game.status === 'in_progress' ? 'In Progress' : game.status}
              </Badge>
            )}
            {game.status === 'in_progress' && (
              <Button 
                variant={isPaused ? "default" : "outline"} 
                onClick={() => setIsPaused(!isPaused)}
              >
                {isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </Button>
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
            <Button variant="outline" onClick={leaveGame}>
              Leave Game
            </Button>
          </div>
        </div>


        {game.status === 'waiting' && (
          <PreGameLobby
            players={players}
            currentUserId={user?.id}
            onStartGame={startGame}
            onAddBot={handleAddBot}
            canStart={canStart}
          />
        )}

        {(game.status === 'dealer_selection' || game.status === 'game_selection' || game.status === 'configuring' || game.status === 'game_over' || game.status === 'session_ended') && (
          <>
            {(game.status === 'game_over' || game.status === 'session_ended') && game.last_round_result ? (
              <>
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
                {game.game_over_at && (
                  <GameOverCountdown
                    winnerMessage={game.last_round_result}
                    nextDealer={dealerPlayer || { id: '', position: game.dealer_position || 1, profiles: { username: `Player ${game.dealer_position || 1}` } }}
                    onComplete={handleGameOverComplete}
                    gameOverAt={game.game_over_at}
                    isSessionEnded={game.status === 'session_ended'}
                  />
                )}
              </>
            ) : game.status === 'dealer_selection' ? (
              <div className="relative">
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
                <DealerSelection
                  players={players}
                  onComplete={(position) => {
                    selectDealer(position);
                  }}
                />
              </div>
            ) : game.status === 'game_selection' ? (
              <div className="relative">
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
                <GameSelection onSelectGame={handleGameSelection} />
              </div>
            ) : (
              // Configuring phase
              <>
                {isDealer || dealerPlayer?.is_bot ? (
                  <DealerConfig 
                    gameId={gameId!} 
                    dealerUsername={dealerPlayer?.profiles?.username || `Player ${game.dealer_position}`}
                    isBot={dealerPlayer?.is_bot || false}
                    dealerPlayerId={dealerPlayer?.id || ''}
                    gameType={game.game_type || '3-5-7'}
                    currentAnteAmount={game.ante_amount || 2}
                    currentLegValue={game.leg_value || 1}
                    currentPussyTaxEnabled={game.pussy_tax_enabled ?? true}
                    currentPussyTaxValue={game.pussy_tax_value || 1}
                    currentLegsToWin={game.legs_to_win || 3}
                    currentPotMaxEnabled={game.pot_max_enabled ?? true}
                    currentPotMaxValue={game.pot_max_value || 10}
                    currentChuckyCards={game.chucky_cards || 4}
                    onConfigComplete={handleConfigComplete}
                  />
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center space-y-4">
                        <p className="text-lg font-semibold">
                          {dealerPlayer?.profiles?.username || `Player ${game.dealer_position}`} is the dealer
                        </p>
                        <p className="text-muted-foreground">
                          Waiting for the dealer to configure game parameters...
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {game.status === 'ante_decision' && (
          <>
            {/* Show table during ante decisions */}
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
            
            {showAnteDialog && user && game.ante_amount !== undefined && (
              <AnteUpDialog
                gameId={gameId!}
                playerId={players.find(p => p.user_id === user.id)?.id || ''}
                anteAmount={game.ante_amount}
                legValue={game.leg_value || 1}
                pussyTaxEnabled={game.pussy_tax_enabled ?? true}
                pussyTaxValue={game.pussy_tax_value || 1}
                legsToWin={game.legs_to_win || 3}
                potMaxEnabled={game.pot_max_enabled ?? true}
                potMaxValue={game.pot_max_value || 10}
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
          <GameTable
            players={players}
            currentUserId={user?.id}
            pot={game.pot || 0}
            currentRound={game.current_round || 1}
            allDecisionsIn={game.all_decisions_in || false}
            playerCards={playerCards}
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
            communityCards={game.rounds?.find(r => r.round_number === game.current_round)?.community_cards as CardType[] | undefined}
            communityCardsRevealed={game.rounds?.find(r => r.round_number === game.current_round)?.community_cards_revealed}
            buckPosition={game.buck_position}
            onStay={handleStay}
            onFold={handleFold}
            onSelectSeat={handleSelectSeat}
          />
        )}
      </div>

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
  );
};

export default Game;
