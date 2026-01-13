import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Timer, Plus, Minus, Spade, Dice5, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { evaluatePlayerStatesEndOfGame, rotateDealerPosition } from "@/lib/playerStateEvaluation";
import { logSittingOutSet } from "@/lib/sittingOutDebugLog";
import { toast } from "sonner";

type SelectionStep = 'category' | 'cards' | 'dice';

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
  rabbit_hunt: boolean;
  reveal_at_showdown: boolean;
}

interface SessionGameConfigs {
  'holm-game'?: PreviousGameConfig;
  '3-5-7'?: PreviousGameConfig;
}

interface DealerGameSetupProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  dealerPosition: number;
  previousGameType?: string; // The last game type played
  previousGameConfig?: PreviousGameConfig | null; // The previous game's actual config
  sessionGameConfigs?: SessionGameConfigs; // Session-specific configs per game type
  isFirstHand?: boolean; // Whether this is the first hand of the session (no run back option)
  onConfigComplete: () => void;
  onSessionEnd: () => void;
}

interface GameDefaults {
  ante_amount: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
  rabbit_hunt: boolean;
  reveal_at_showdown: boolean;
}

export const DealerGameSetup = ({
  gameId,
  dealerUsername,
  isBot,
  dealerPlayerId,
  dealerPosition,
  previousGameType,
  previousGameConfig,
  sessionGameConfigs,
  isFirstHand = true,
  onConfigComplete,
  onSessionEnd,
}: DealerGameSetupProps) => {
  // Selection step: category -> cards/dice
  const [selectionStep, setSelectionStep] = useState<SelectionStep>('category');
  // Default to previous game type if provided, otherwise holm-game (always default to holm for new sessions)
  const [selectedGameType, setSelectedGameType] = useState<string>(previousGameType || "holm-game");
  const [timeLeft, setTimeLeft] = useState(30);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeletingEmptySession, setShowDeletingEmptySession] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const hasSubmittedRef = useRef(false);
  const handleDealerTimeoutRef = useRef<() => void>(() => {});
  const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Mount delay to prevent brief flash during rapid status transitions
  // The component waits 50ms before rendering to ensure parent isn't about to unmount it
  const [mountReady, setMountReady] = useState(false);
  useEffect(() => {
    const mountTimer = setTimeout(() => setMountReady(true), 50);
    return () => clearTimeout(mountTimer);
  }, []);
  
  // Config state - use strings for free text input with validation on save
  const [anteAmount, setAnteAmount] = useState("2");
  const [legValue, setLegValue] = useState("1");
  const [pussyTaxEnabled, setPussyTaxEnabled] = useState(true);
  const [pussyTaxValue, setPussyTaxValue] = useState("1");
  const [legsToWin, setLegsToWin] = useState("3");
  const [potMaxEnabled, setPotMaxEnabled] = useState(true);
  const [potMaxValue, setPotMaxValue] = useState("10");
  const [chuckyCards, setChuckyCards] = useState("4");
  const [rabbitHunt, setRabbitHunt] = useState(false);
  const [revealAtShowdown, setRevealAtShowdown] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  
  // Cache defaults for both game types
  const [holmDefaults, setHolmDefaults] = useState<GameDefaults | null>(null);
  const [threeFiveSevenDefaults, setThreeFiveSevenDefaults] = useState<GameDefaults | null>(null);

  // Fetch defaults for both game types on mount
  useEffect(() => {
    const fetchAllDefaults = async () => {
      const [holmResult, threeFiveSevenResult] = await Promise.all([
        supabase.from('game_defaults').select('*').eq('game_type', 'holm').single(),
        supabase.from('game_defaults').select('*').eq('game_type', '3-5-7').single(),
      ]);

      if (!holmResult.error && holmResult.data) {
        setHolmDefaults(holmResult.data);
      }
      if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
        setThreeFiveSevenDefaults(threeFiveSevenResult.data);
      }
      
      // PRIORITY 1: Use previous game config if available (for config persistence between games)
      if (previousGameConfig) {
        console.log('[DEALER SETUP] Using previous game config:', previousGameConfig);
        setAnteAmount(String(previousGameConfig.ante_amount));
        setLegValue(String(previousGameConfig.leg_value));
        setLegsToWin(String(previousGameConfig.legs_to_win));
        setPussyTaxEnabled(previousGameConfig.pussy_tax_enabled);
        setPussyTaxValue(String(previousGameConfig.pussy_tax_value));
        setPotMaxEnabled(previousGameConfig.pot_max_enabled);
        setPotMaxValue(String(previousGameConfig.pot_max_value));
        setChuckyCards(String(previousGameConfig.chucky_cards));
        setRabbitHunt(previousGameConfig.rabbit_hunt ?? false);
        setRevealAtShowdown(previousGameConfig.reveal_at_showdown ?? false);
        setLoadingDefaults(false);
        return;
      }
      
      // PRIORITY 2: Apply defaults based on previousGameType or default to holm
      const initialGameType = previousGameType || 'holm-game';
      if (initialGameType === '3-5-7-game' || initialGameType === '3-5-7') {
        if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
          applyDefaults(threeFiveSevenResult.data);
        }
      } else {
        if (!holmResult.error && holmResult.data) {
          applyDefaults(holmResult.data);
        }
      }
      
      setLoadingDefaults(false);
    };

    fetchAllDefaults();
  }, [previousGameType, previousGameConfig]);

  // Apply defaults when game type changes
  const applyDefaults = (defaults: GameDefaults) => {
    setAnteAmount(String(defaults.ante_amount));
    setLegValue(String(defaults.leg_value));
    setLegsToWin(String(defaults.legs_to_win));
    setPussyTaxEnabled(defaults.pussy_tax_enabled);
    setPussyTaxValue(String(defaults.pussy_tax_value));
    setPotMaxEnabled(defaults.pot_max_enabled);
    setPotMaxValue(String(defaults.pot_max_value));
    setChuckyCards(String(defaults.chucky_cards));
    setRabbitHunt(defaults.rabbit_hunt ?? false);
    setRevealAtShowdown(defaults.reveal_at_showdown ?? false);
  };

  // Update config when tab changes - PRIORITY: session config > global defaults
  // Only applies to card games (holm-game, 3-5-7) - dice games don't have persistent configs
  const handleGameTypeChange = (gameType: string) => {
    setSelectedGameType(gameType);
    
    // Only card games have session configs
    if (gameType === 'holm-game' || gameType === '3-5-7') {
      // Normalize game type key for session configs lookup
      const sessionKey = gameType === 'holm-game' ? 'holm-game' : '3-5-7';
      const sessionConfig = sessionGameConfigs?.[sessionKey];
      
      // PRIORITY 1: Use session-specific config if available (remembers settings from earlier in session)
      if (sessionConfig && sessionConfig.game_type === gameType) {
        console.log('[DEALER SETUP] Using session config for', gameType, ':', sessionConfig);
        setAnteAmount(String(sessionConfig.ante_amount));
        setLegValue(String(sessionConfig.leg_value));
        setLegsToWin(String(sessionConfig.legs_to_win));
        setPussyTaxEnabled(sessionConfig.pussy_tax_enabled);
        setPussyTaxValue(String(sessionConfig.pussy_tax_value));
        setPotMaxEnabled(sessionConfig.pot_max_enabled);
        setPotMaxValue(String(sessionConfig.pot_max_value));
        setChuckyCards(String(sessionConfig.chucky_cards));
        setRabbitHunt(sessionConfig.rabbit_hunt ?? false);
        setRevealAtShowdown(sessionConfig.reveal_at_showdown ?? false);
        return;
      }
      
      // PRIORITY 2: Fall back to global defaults
      const defaults = gameType === 'holm-game' ? holmDefaults : threeFiveSevenDefaults;
      if (defaults) {
        console.log('[DEALER SETUP] Using global defaults for', gameType);
        applyDefaults(defaults);
      }
    }
  };

  // Handle dealer timeout - mark as sitting out and re-evaluate
  const handleDealerTimeout = async () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    try {
      console.log('[DEALER SETUP] Dealer timed out, marking as sitting out');

      // Log this status change for debugging (before the update)
      // Need to fetch the current player's user_id and username for logging
      const { data: dealerPlayerData } = await supabase
        .from('players')
        .select('user_id, sitting_out, is_bot, profiles(username)')
        .eq('id', dealerPlayerId)
        .single();

      if (dealerPlayerData && !dealerPlayerData.is_bot) {
        await logSittingOutSet(
          dealerPlayerId,
          dealerPlayerData.user_id,
          gameId,
          dealerPlayerData.profiles?.username,
          dealerPlayerData.is_bot,
          dealerPlayerData.sitting_out,
          'Dealer timed out during game setup/configuration',
          'DealerGameSetup.tsx:handleDealerTimeout',
          { dealer_position: dealerPosition, dealer_username: dealerUsername }
        );
      }

      // Mark dealer as sitting out
      const { error: sitOutError } = await supabase
        .from('players')
        .update({ sitting_out: true, waiting: false })
        .eq('id', dealerPlayerId);

      if (sitOutError) throw sitOutError;

      // Evaluate all player states
      const { activePlayerCount, activeHumanCount, eligibleDealerCount } =
        await evaluatePlayerStatesEndOfGame(gameId);

      console.log(
        '[DEALER SETUP] After timeout evaluation - active:',
        activePlayerCount,
        'active humans:',
        activeHumanCount,
        'eligible dealers:',
        eligibleDealerCount
      );

      const deleteEmptySession = async () => {
        console.log('[DEALER SETUP] Deleting empty session (no hands played)');

        // Delete in FK-safe order
        const { data: roundRows } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId);

        const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);

        if (roundIds.length > 0) {
          const { error } = await supabase.from('player_cards').delete().in('round_id', roundIds);
          if (error) throw error;
        }

        {
          const { error } = await supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId);
          if (error) throw error;
        }
        {
          const { error } = await supabase.from('chat_messages').delete().eq('game_id', gameId);
          if (error) throw error;
        }
        {
          const { error } = await supabase.from('rounds').delete().eq('game_id', gameId);
          if (error) throw error;
        }
        {
          const { error } = await supabase.from('players').delete().eq('game_id', gameId);
          if (error) throw error;
        }
        {
          const { error } = await supabase.from('games').delete().eq('id', gameId);
          if (error) throw error;
        }
      };

      // Priority 1: If no active human players, END SESSION or DELETE if empty
      if (activeHumanCount < 1) {
        console.log('[DEALER SETUP] No active human players');

        const { data: gameData, error: gameError } = await supabase
          .from('games')
          .select('total_hands')
          .eq('id', gameId)
          .maybeSingle();

        if (gameError) throw gameError;

        const totalHands = gameData?.total_hands || 0;

        // Also check game_results as backup - if any results exist, session has history
        const { count: resultsCount, error: resultsError } = await supabase
          .from('game_results')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', gameId);

        if (resultsError) throw resultsError;

        const hasHistory = totalHands > 0 || (resultsCount ?? 0) > 0;

        console.log('[DEALER SETUP] Session history check:', { totalHands, resultsCount, hasHistory });

        if (!hasHistory) {
          // No hands played - show 5s message then delete
          setShowDeletingEmptySession(true);
          setDeleteCountdown(5);

          const interval = setInterval(() => {
            setDeleteCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          // Give UI time to show message before deletion
          setTimeout(async () => {
            try {
              await deleteEmptySession();
              onSessionEnd();
            } catch (err) {
              console.error('[DEALER SETUP] Failed to delete empty session:', err);
              toast.error('Failed to delete empty session');
              hasSubmittedRef.current = false;
            }
          }, 5000);

          return;
        }

        // Has game history - end session normally
        console.log('[DEALER SETUP] Has game history, ending session');
        const { error: endError } = await supabase
          .from('games')
          .update({
            status: 'session_ended',
            pending_session_end: false,
            session_ended_at: new Date().toISOString(),
            game_over_at: new Date().toISOString(),
            // Clear any old countdowns so rejoin doesn't show a stale 0s timer
            config_deadline: null,
            ante_decision_deadline: null,
            awaiting_next_round: false,
            config_complete: false,
          })
          .eq('id', gameId);

        if (endError) throw endError;

        onSessionEnd();
        return;
      }

      // Priority 2: Check if we can continue (need 1+ eligible dealer AND 2+ active players)
      if (activePlayerCount < 2 || eligibleDealerCount < 1) {
        console.log('[DEALER SETUP] Not enough players, reverting to waiting');
        // Revert to waiting status
        const { error: waitError } = await supabase
          .from('games')
          .update({
            status: 'waiting',
            awaiting_next_round: false,
            last_round_result: null,
          })
          .eq('id', gameId);

        if (waitError) throw waitError;

        return;
      }

      // Rotate dealer to next eligible player
      const newDealerPosition = await rotateDealerPosition(gameId, dealerPosition);

      console.log('[DEALER SETUP] Rotating dealer from', dealerPosition, 'to', newDealerPosition);

      // Update game with new dealer and reset config_complete to trigger new dealer setup
      const { error: rotateError } = await supabase
        .from('games')
        .update({
          dealer_position: newDealerPosition,
          config_complete: false,
        })
        .eq('id', gameId);

      if (rotateError) throw rotateError;

      // The game state change will trigger re-render with new dealer
      onConfigComplete();
    } catch (err) {
      console.error('[DEALER SETUP] Timeout handling failed:', err);
      toast.error('Dealer timeout failed — retrying…');

      // Try server-side enforcement as a fallback (bypasses client-side permission issues)
      try {
        await supabase.functions.invoke('enforce-deadlines', { body: { gameId } });
      } catch {
        // ignore
      }

      // Allow retry on next tick if we're still on this screen
      hasSubmittedRef.current = false;
    }
  };

  // Keep ref updated with latest handleDealerTimeout function
  useEffect(() => {
    handleDealerTimeoutRef.current = handleDealerTimeout;
  }, [handleDealerTimeout]);

  const scheduleConfigTimeout = useCallback((deadlineMs: number) => {
    if (configTimeoutRef.current) {
      clearTimeout(configTimeoutRef.current);
      configTimeoutRef.current = null;
    }

    const delay = Math.max(0, deadlineMs - Date.now());
    configTimeoutRef.current = setTimeout(() => {
      if (!hasSubmittedRef.current) {
        handleDealerTimeoutRef.current();
      }
    }, delay + 50);
  }, []);

  const syncWithServerDeadline = useCallback(async () => {
    if (isBot || loadingDefaults) return;

    const { data: gameData, error } = await supabase
      .from('games')
      .select('config_deadline')
      .eq('id', gameId)
      .maybeSingle();

    if (error) {
      console.error('[DEALER SETUP] Failed to fetch server deadline:', error);
      return;
    }

    if (gameData?.config_deadline) {
      const deadlineMs = new Date(gameData.config_deadline).getTime();
      const remaining = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));

      console.log('[DEALER SETUP] Synced with server deadline, remaining:', remaining, 's');

      setTimeLeft(remaining);
      scheduleConfigTimeout(deadlineMs);

      if (remaining <= 0 && !hasSubmittedRef.current) {
        console.log('[DEALER SETUP] Deadline expired on sync, triggering timeout');
        handleDealerTimeoutRef.current();
      }
      return;
    }

    // No deadline set yet - set one now (fallback for edge cases)
    const deadlineIso = new Date(Date.now() + 30000).toISOString();
    const { error: setErr } = await supabase
      .from('games')
      .update({ config_deadline: deadlineIso })
      .eq('id', gameId);

    if (setErr) {
      console.error('[DEALER SETUP] Failed to set fallback deadline:', setErr);
      return;
    }

    console.log('[DEALER SETUP] No server deadline found, set fallback deadline');
    setTimeLeft(30);
    scheduleConfigTimeout(new Date(deadlineIso).getTime());
  }, [gameId, isBot, loadingDefaults, scheduleConfigTimeout]);

  // Initial sync + resync when app returns to foreground (mobile browsers can pause timers)
  useEffect(() => {
    syncWithServerDeadline();
  }, [syncWithServerDeadline]);

  useEffect(() => {
    if (isBot || loadingDefaults) return;

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncWithServerDeadline();
      }
    };

    window.addEventListener('focus', syncWithServerDeadline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', syncWithServerDeadline);
      document.removeEventListener('visibilitychange', onVisibility);
      if (configTimeoutRef.current) {
        clearTimeout(configTimeoutRef.current);
        configTimeoutRef.current = null;
      }
    };
  }, [isBot, loadingDefaults, syncWithServerDeadline]);

  // Countdown timer - display only (timeout enforcement is scheduled off the server deadline)
  useEffect(() => {
    if (isBot || loadingDefaults) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBot, loadingDefaults]);


  // Auto-submit for bots - with 5 second delay and 80/20 run-it-back logic
  useEffect(() => {
    if (isBot && !loadingDefaults && !hasSubmittedRef.current) {
      // Determine if bot should change game type (20% chance) or run it back (80%)
      const shouldChangeGame = Math.random() < 0.2;
      
      if (shouldChangeGame && previousGameType) {
        // Change to the OTHER game type
        const newGameType = previousGameType === 'holm-game' ? '3-5-7' : 'holm-game';
        console.log('[BOT DEALER] Changing game type from', previousGameType, 'to', newGameType);
        setSelectedGameType(newGameType);
        
        // Load session config or defaults for the new game type
        // Only use session config if it's for the same game type (not a dice game config)
        const sessionConfig = sessionGameConfigs?.[newGameType];
        if (sessionConfig && sessionConfig.game_type === newGameType) {
          setAnteAmount(String(sessionConfig.ante_amount));
          setLegValue(String(sessionConfig.leg_value));
          setLegsToWin(String(sessionConfig.legs_to_win));
          setPussyTaxEnabled(sessionConfig.pussy_tax_enabled);
          setPussyTaxValue(String(sessionConfig.pussy_tax_value));
          setPotMaxEnabled(sessionConfig.pot_max_enabled);
          setPotMaxValue(String(sessionConfig.pot_max_value));
          setChuckyCards(String(sessionConfig.chucky_cards));
          setRabbitHunt(sessionConfig.rabbit_hunt ?? false);
          setRevealAtShowdown(sessionConfig.reveal_at_showdown ?? false);
        } else {
          const defaults = newGameType === 'holm-game' ? holmDefaults : threeFiveSevenDefaults;
          if (defaults) applyDefaults(defaults);
        }
      } else {
        console.log('[BOT DEALER] Running it back with same config');
      }
      
      // Wait 5 seconds before submitting to simulate dealer thinking
      const timer = setTimeout(() => {
        if (!hasSubmittedRef.current) {
          hasSubmittedRef.current = true;
          handleSubmit();
        }
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isBot, loadingDefaults, previousGameType, sessionGameConfigs, holmDefaults, threeFiveSevenDefaults]);

  const handleSubmit = async (overrideGameType?: string) => {
    if (isSubmitting || hasSubmittedRef.current) return;

    // Use override if provided (for run back), otherwise use state
    const gameTypeToSubmit = overrideGameType || selectedGameType;

    // Guard: card submit should never run with a dice game type
    if (gameTypeToSubmit === 'horses' || gameTypeToSubmit === 'ship-captain-crew') {
      toast.error('Select a card game (Holm or 3-5-7)');
      return;
    }

    // Validate all numeric fields
    const parsedAnte = parseInt(anteAmount) || 0;
    const parsedLegValue = parseInt(legValue) || 0;
    const parsedLegsToWin = parseInt(legsToWin) || 0;
    const parsedPussyTax = parseInt(pussyTaxValue) || 0;
    const parsedPotMax = parseInt(potMaxValue) || 0;
    const parsedChucky = parseInt(chuckyCards) || 0;
    
    // Validation
    if (parsedAnte < 1) {
      console.error('Invalid Ante: must be at least $1');
      return;
    }
    if (parsedLegValue < 1) {
      console.error('Invalid Leg Value: must be at least $1');
      return;
    }
    if (parsedLegsToWin < 1) {
      console.error('Invalid Legs to Win: must be at least 1');
      return;
    }
    if (pussyTaxEnabled && parsedPussyTax < 1) {
      console.error('Invalid Pussy Tax: must be at least $1');
      return;
    }
    if (potMaxEnabled && parsedPotMax < 1) {
      console.error('Invalid Pot Max: must be at least $1');
      return;
    }
    if (gameTypeToSubmit === 'holm-game' && (parsedChucky < 2 || parsedChucky > 7)) {
      console.error('Invalid Chucky Cards: must be between 2-7');
      return;
    }
    
    setIsSubmitting(true);
    hasSubmittedRef.current = true;

    console.log('[DEALER SETUP] Submitting game config:', { gameTypeToSubmit, parsedAnte, parsedLegValue, parsedChucky });

    const isHolmGame = gameTypeToSubmit === 'holm-game';
    const anteDeadline = new Date(Date.now() + 10000).toISOString();
    
    const updateData: any = {
      game_type: gameTypeToSubmit,
      ante_amount: parsedAnte,
      leg_value: parsedLegValue,
      pussy_tax_enabled: pussyTaxEnabled,
      pussy_tax_value: parsedPussyTax,
      pussy_tax: parsedPussyTax,
      legs_to_win: parsedLegsToWin,
      pot_max_enabled: potMaxEnabled,
      pot_max_value: parsedPotMax,
      config_complete: true,
      status: 'ante_decision',
      ante_decision_deadline: anteDeadline,
    };

    if (isHolmGame) {
      updateData.chucky_cards = parsedChucky;
      updateData.rabbit_hunt = rabbitHunt;
      // CRITICAL (Holm only): pre-set round 1 + first-hand flag to prevent stale card flashes
      updateData.current_round = 1;
      updateData.is_first_hand = true;
    } else {
      updateData.reveal_at_showdown = revealAtShowdown;
    }

    const { error } = await supabase
      .from('games')
      .update(updateData)
      .eq('id', gameId);

    if (error) {
      console.error('[DEALER SETUP] Error:', error);
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      return;
    }

    // Reset ante_decision for all non-dealer players
    await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId)
      .neq('id', dealerPlayerId);

    // Auto ante up the dealer
    await supabase
      .from('players')
      .update({ 
        ante_decision: 'ante_up',
        sitting_out: false
      })
      .eq('id', dealerPlayerId);

    console.log('[DEALER SETUP] ✅ Config complete');
    onConfigComplete();
  };

  // Bots don't show any UI - the announcement is handled by the parent
  if (isBot) {
    return null;
  }

  // Hide modal immediately when submitting to prevent flicker on rapid selection
  if (isSubmitting) {
    return null;
  }

  // Delay mount to prevent brief flash during rapid status transitions
  // If component unmounts within 50ms, user never sees any modal
  if (!mountReady) {
    return null;
  }

  if (loadingDefaults) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <Card className="max-w-md mx-4 border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-amber-100">Loading game defaults...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isHolmGame = selectedGameType === 'holm-game';

  const getGameDisplayName = (gameType: string) => {
    switch (gameType) {
      case '3-5-7': return '3-5-7';
      case 'holm-game': return 'Holm';
      case 'horses': return 'Horses';
      case 'ship-captain-crew': return 'Ship';
      default: return gameType;
    }
  };
  
  const isDiceGame = (gameType: string) => {
    return gameType === 'horses' || gameType === 'ship-captain-crew';
  };

  const handleCategorySelect = (category: 'cards' | 'dice') => {
    setSelectionStep(category);

    // If we're going to the card setup screen, make sure we start with a CARD game type.
    // Otherwise we can accidentally submit the previous dice game type.
    if (category === 'cards') {
      const defaultCardType = previousGameType && !isDiceGame(previousGameType)
        ? previousGameType
        : 'holm-game';
      handleGameTypeChange(defaultCardType);
    }
    
    // If we're going to dice selection, CLEAR the selected game type so we show the
    // game selection screen instead of jumping straight to config of the previous dice game.
    if (category === 'dice') {
      // Reset to a non-dice placeholder so the dice selection UI shows
      setSelectedGameType('');
    }
  };

  const handleDiceGameSelect = async (gameType: string) => {
    if (gameType === 'horses' || gameType === 'ship-captain-crew') {
      // Dice games are ready - set game type and go to config step
      setSelectedGameType(gameType);
      setSelectionStep('dice');
      
      // Fetch defaults for this game type (fall back to horses defaults if SCC doesn't have its own)
      const { data: gameDefaults } = await supabase
        .from('game_defaults')
        .select('ante_amount')
        .eq('game_type', gameType)
        .single();
      
      if (gameDefaults) {
        setAnteAmount(String(gameDefaults.ante_amount));
      } else {
        // Fall back to horses defaults for SCC
        const { data: horsesDefaults } = await supabase
          .from('game_defaults')
          .select('ante_amount')
          .eq('game_type', 'horses')
          .single();
        if (horsesDefaults) {
          setAnteAmount(String(horsesDefaults.ante_amount));
        }
      }
    } else {
      toast.info("Coming soon!");
    }
  };
  
  const handleDiceGameSubmit = async (overrideGameType?: string) => {
    if (isSubmitting || hasSubmittedRef.current) return;
    
    const parsedAnte = parseInt(anteAmount) || 2;
    if (parsedAnte < 1) {
      toast.error('Ante must be at least $1');
      return;
    }
    
    setIsSubmitting(true);
    hasSubmittedRef.current = true;
    
    // Use override if provided (for run back), otherwise use state
    const gameTypeToSubmit = overrideGameType || selectedGameType;
    const gameTypeName = gameTypeToSubmit === 'ship-captain-crew' ? 'Ship' : 'Horses';
    console.log(`[DEALER SETUP] Submitting ${gameTypeName} game config, game_type:`, gameTypeToSubmit);
    
    const anteDeadline = new Date(Date.now() + 10000).toISOString();
    
    const { error } = await supabase
      .from('games')
      .update({
        game_type: gameTypeToSubmit,
        ante_amount: parsedAnte,
        config_complete: true,
        status: 'ante_decision',
        ante_decision_deadline: anteDeadline,
        // Reset card game specific fields
        leg_value: 0,
        legs_to_win: 0,
        pot_max_enabled: false,
        pussy_tax_enabled: false,
      })
      .eq('id', gameId);
    
    if (error) {
      console.error('[DEALER SETUP] Error:', error);
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      return;
    }
    
    // Reset ante_decision for all non-dealer players
    await supabase
      .from('players')
      .update({ ante_decision: null })
      .eq('game_id', gameId)
      .neq('id', dealerPlayerId);
    
    // Auto ante up the dealer
    await supabase
      .from('players')
      .update({ 
        ante_decision: 'ante_up',
        sitting_out: false
      })
      .eq('id', dealerPlayerId);
    
    console.log(`[DEALER SETUP] ✅ ${gameTypeName} config complete`);
    onConfigComplete();
  };

  const handleRunBack = () => {
    if (previousGameType && previousGameConfig) {
      // Use previous config and submit immediately
      // CRITICAL: Pass the game type directly to submit functions to avoid async state issues
      setSelectedGameType(previousGameType);
      setAnteAmount(String(previousGameConfig.ante_amount));
      
      // For dice games, we only need ante - submit with dice game handler
      if (isDiceGame(previousGameType)) {
        // Pass game type directly to avoid state race condition
        handleDiceGameSubmit(previousGameType);
      } else {
        // Card games need full config - set state then submit with explicit game type
        setLegValue(String(previousGameConfig.leg_value));
        setLegsToWin(String(previousGameConfig.legs_to_win));
        setPussyTaxEnabled(previousGameConfig.pussy_tax_enabled);
        setPussyTaxValue(String(previousGameConfig.pussy_tax_value));
        setPotMaxEnabled(previousGameConfig.pot_max_enabled);
        setPotMaxValue(String(previousGameConfig.pot_max_value));
        setChuckyCards(String(previousGameConfig.chucky_cards));
        setRabbitHunt(previousGameConfig.rabbit_hunt ?? false);
        setRevealAtShowdown(previousGameConfig.reveal_at_showdown ?? false);
        // Pass game type directly to avoid state race condition
        handleSubmit(previousGameType);
      }
    }
  };

  const handleBackToCategory = () => {
    setSelectionStep('category');
  };

  // Category selection step
  if (selectionStep === 'category') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-6 pb-6 space-y-6">
            {/* Header with Timer */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-poker-gold">Dealer Setup</h2>
                <p className="text-amber-100 text-sm">{dealerUsername}, choose game type</p>
              </div>
              <Badge 
                variant={timeLeft <= 10 ? "destructive" : "default"} 
                className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
              >
                <Timer className="w-4 h-4" />
                {timeLeft}s
              </Badge>
            </div>

            {/* Category Selection */}
            <div className="grid grid-cols-2 gap-4">
              {/* Cards option */}
              <button
                onClick={() => handleCategorySelect('cards')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="flex flex-col items-center space-y-3">
                  <Spade className="w-12 h-12 text-poker-gold" />
                  <h3 className="text-xl font-bold text-poker-gold">Cards</h3>
                  <p className="text-sm text-amber-200">Poker games</p>
                </div>
              </button>

              {/* Dice option */}
              <button
                onClick={() => handleCategorySelect('dice')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="flex flex-col items-center space-y-3">
                  <Dice5 className="w-12 h-12 text-poker-gold" />
                  <h3 className="text-xl font-bold text-poker-gold">Dice</h3>
                  <p className="text-sm text-amber-200">Dice games</p>
                </div>
              </button>
            </div>

            {/* Run Back option - only show on 2nd+ game of session */}
            {!isFirstHand && previousGameType && previousGameConfig && (
              <div className="pt-4 border-t border-poker-gold/30">
                <button
                  onClick={handleRunBack}
                  className="w-full p-4 rounded-lg border-2 transition-all border-amber-600 bg-amber-800/30 hover:bg-amber-800/50 hover:scale-[1.02] cursor-pointer flex items-center justify-center gap-3"
                >
                  <RotateCcw className="w-6 h-6 text-amber-400" />
                  <span className="text-lg font-bold text-amber-400">
                    Run Back {getGameDisplayName(previousGameType)}
                  </span>
                </button>
              </div>
            )}

            <p className="text-xs text-amber-200/60 text-center">
              If timer expires without action, you'll be marked as sitting out
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dice games selection step - show Horses config if selected
  if (selectionStep === 'dice') {
    // If a dice game is selected, show config UI
    if (selectedGameType === 'horses' || selectedGameType === 'ship-captain-crew') {
      const isSCC = selectedGameType === 'ship-captain-crew';
      const gameDisplayName = isSCC ? 'Ship' : 'Horses';
      const gameRulesText = isSCC 
        ? '5 dice • Up to 3 rolls • Get 6-5-4 (Ship-Captain-Crew) • Max cargo wins'
        : '5 dice • Up to 3 rolls • 1s are wild • Highest hand wins';
      
      return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
            <CardContent className="pt-6 pb-6 space-y-6">
              {/* Header with Timer */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-poker-gold">{gameDisplayName} Setup</h2>
                  <p className="text-amber-100 text-sm">{dealerUsername}, configure ante</p>
                </div>
                <Badge 
                  variant={timeLeft <= 10 ? "destructive" : "default"} 
                  className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
                >
                  <Timer className="w-4 h-4" />
                  {timeLeft}s
                </Badge>
              </div>

              {/* Dice Game Config */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="ante-dice" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-dice"
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                
                <p className="text-sm text-amber-200/70 text-center">
                  {gameRulesText}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Go back to dice game selection, not category
                    setSelectedGameType('');
                  }}
                  className="flex-1 p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
                >
                  ← Back
                </button>
                <Button
                  onClick={() => handleDiceGameSubmit()}
                  disabled={isSubmitting}
                  className="flex-1 bg-poker-gold hover:bg-amber-500 text-black font-bold"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Starting...' : `Start ${gameDisplayName}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    
    // Show dice game selection
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark">
          <CardContent className="pt-6 pb-6 space-y-6">
            {/* Header with Timer */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-poker-gold">Select Dice Game</h2>
                <p className="text-amber-100 text-sm">{dealerUsername}, choose a dice game</p>
              </div>
              <Badge 
                variant={timeLeft <= 10 ? "destructive" : "default"} 
                className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
              >
                <Timer className="w-4 h-4" />
                {timeLeft}s
              </Badge>
            </div>

            {/* Dice Game Selection */}
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleDiceGameSelect('horses')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="space-y-2 text-center">
                  <h3 className="text-xl font-bold text-poker-gold">Horses</h3>
                  <p className="text-sm text-amber-200">5 dice poker • Up to 3 rolls</p>
                </div>
              </button>

              <button
                onClick={() => handleDiceGameSelect('ship-captain-crew')}
                className="relative p-6 rounded-lg border-2 transition-all border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 hover:scale-105 cursor-pointer"
              >
                <div className="space-y-2 text-center">
                  <h3 className="text-xl font-bold text-poker-gold">Ship Captain Crew</h3>
                  <p className="text-sm text-amber-200">Get 6-5-4, then max cargo</p>
                </div>
              </button>
            </div>

            <button
              onClick={handleBackToCategory}
              className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              ← Back to Game Types
            </button>

            <p className="text-xs text-amber-200/60 text-center">
              If timer expires without action, you'll be marked as sitting out
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Cards selection step - show poker game tabs
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark max-h-[90vh] overflow-y-auto">
        <CardContent className="pt-6 pb-6 space-y-4">
          {/* Header with Timer */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-poker-gold">Card Game Setup</h2>
              <p className="text-amber-100 text-sm">{dealerUsername}, configure your game</p>
            </div>
            <Badge 
              variant={timeLeft <= 10 ? "destructive" : "default"} 
              className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
            >
              <Timer className="w-4 h-4" />
              {timeLeft}s
            </Badge>
          </div>

          {/* Game Type Tabs */}
          <Tabs value={selectedGameType} onValueChange={handleGameTypeChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-amber-900/50">
              <TabsTrigger 
                value="holm-game" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-black"
              >
                Holm Game
              </TabsTrigger>
              <TabsTrigger 
                value="3-5-7" 
                className="data-[state=active]:bg-poker-gold data-[state=active]:text-black"
              >
                3-5-7
              </TabsTrigger>
            </TabsList>

            {/* Holm Game Config */}
            <TabsContent value="holm-game" className="space-y-4 mt-4">
              <p className="text-amber-200 text-sm text-center">4 cards + 4 community cards vs Chucky</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ante-holm" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-holm"
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chucky" className="text-amber-100 text-sm">Chucky Cards</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                      onClick={() => setChuckyCards(String(Math.max(2, (parseInt(chuckyCards) || 4) - 1)))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      id="chucky"
                      type="text"
                      inputMode="numeric"
                      value={chuckyCards}
                      onChange={(e) => setChuckyCards(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white text-center flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                      onClick={() => setChuckyCards(String(Math.min(7, (parseInt(chuckyCards) || 4) + 1)))}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pussy Tax</Label>
                    <Switch checked={pussyTaxEnabled} onCheckedChange={setPussyTaxEnabled} />
                  </div>
                  {pussyTaxEnabled && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pot Max</Label>
                    <Switch checked={potMaxEnabled} onCheckedChange={setPotMaxEnabled} />
                  </div>
                  {potMaxEnabled && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-poker-gold/20">
                <div className="space-y-0.5">
                  <Label className="text-amber-100 text-sm">Rabbit Hunt</Label>
                  <p className="text-xs text-amber-200/60">Show hidden cards when everyone folds</p>
                </div>
                <Switch checked={rabbitHunt} onCheckedChange={setRabbitHunt} />
              </div>
            </TabsContent>

            {/* 3-5-7 Config */}
            <TabsContent value="3-5-7" className="space-y-4 mt-4">
              <p className="text-amber-200 text-sm text-center">Classic Three, Five, Seven poker with wild cards</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ante-357" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-357"
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="leg-value" className="text-amber-100 text-sm">Leg Value ($)</Label>
                  <Input
                    id="leg-value"
                    type="text"
                    inputMode="numeric"
                    value={legValue}
                    onChange={(e) => setLegValue(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="legs-to-win" className="text-amber-100 text-sm">Legs to Win</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                    onClick={() => setLegsToWin(String(Math.max(1, (parseInt(legsToWin) || 3) - 1)))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    id="legs-to-win"
                    type="text"
                    inputMode="numeric"
                    value={legsToWin}
                    onChange={(e) => setLegsToWin(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white text-center flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-poker-gold/50 text-poker-gold hover:bg-poker-gold/20"
                    onClick={() => setLegsToWin(String((parseInt(legsToWin) || 3) + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pussy Tax</Label>
                    <Switch checked={pussyTaxEnabled} onCheckedChange={setPussyTaxEnabled} />
                  </div>
                  {pussyTaxEnabled && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={pussyTaxValue}
                      onChange={(e) => setPussyTaxValue(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-amber-100 text-sm">Pot Max</Label>
                    <Switch checked={potMaxEnabled} onCheckedChange={setPotMaxEnabled} />
                  </div>
                  {potMaxEnabled && (
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={potMaxValue}
                      onChange={(e) => setPotMaxValue(e.target.value)}
                      className="bg-amber-900/30 border-poker-gold/50 text-white"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-amber-100 text-sm">Secret Reveal at Showdown</Label>
                  <p className="text-xs text-amber-200/60">In rounds 1-2, players who stay can see each other's cards</p>
                </div>
                <Switch 
                  checked={revealAtShowdown} 
                  onCheckedChange={setRevealAtShowdown} 
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Back Button */}
          <button
            onClick={handleBackToCategory}
            className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
          >
            ← Back to Game Types
          </button>

          {/* Start Button */}
          <Button 
            onClick={() => handleSubmit()} 
            disabled={isSubmitting}
            className="w-full bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-lg py-6"
          >
            {isSubmitting ? 'Starting...' : `Start ${isHolmGame ? 'Holm Game' : '3-5-7'}`}
          </Button>

          <p className="text-xs text-amber-200/60 text-center">
            If timer expires without action, you'll be marked as sitting out
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
