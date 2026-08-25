import { useState, useEffect, useRef, useCallback } from "react";
import { emit357RuntimeDiag } from "@/lib/threeFiveSeven/runtimeDiag";
import { createPortal } from "react-dom";
import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useActiveHarnessInfo,
  useActiveHarnessMap,
} from "@/lib/debugHarness/activeHarnessWarning";
import { CRIBBAGE_GAME_MODES } from "@/lib/cribbageTypes";
import { Lock, Timer, Plus, Minus, Spade, Dice5, RotateCcw, UserMinus, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
// playerStateEvaluation helpers no longer needed here — config timeout uses
// the shared handle_config_deadline_timeout RPC for atomic state transitions.
import { logSittingOutSet } from "@/lib/sittingOutDebugLog";
import { logSessionEvent, logSessionDeleted } from "@/lib/sessionEventLog";
// startCribbageRound is now called from Game.tsx after dealer selection completes
import { persistSyncDebugEvent } from "@/lib/persistSyncDebugEvent";
import { toast } from "sonner";
import { recordStartupFlight, resetStartupFlight } from "@/lib/startupFlightRecorder";
import {
  configureDealerGame,
  type DealerGameSetupCommitResult,
  type DealerGameType,
} from "@/lib/dealerGameSetupAuthority";

/**
 * Every game id that can appear in dealer setup. Harness state for each id is
 * resolved independently from the GLOBAL shared record.
 */
const HARNESS_WARNING_GAME_IDS = [
  'holm-game',
  '3-5-7',
  'cribbage',
  'gin-rummy',
  'horses',
  'ship-captain-crew',
  'yahtzee',
];

/** Red "H" marker shown on any game whose global harness is actually active. */
const HarnessBadge = () => (
  <span
    className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-red-600 text-[11px] font-extrabold leading-none text-white"
    title="A test harness is active for this game"
  >
    H
  </span>
);


import {
  useWaitingMount,
  recordSurfaceOwnership,
  recordWaitingLifecycle,
} from "@/lib/canonicalShell/waitingTableFlight";
import { SHELL_Z } from "@/lib/canonicalShell/zLayers";

// P0 #2 INSTRUMENTATION: log every dealer_games insertion path with caller/reason.
// This identifies which client/code-path creates new dealer_games mid-session
// (suspected root cause of the runaway "isFirstHand:true" loop).
function logDealerGameCreated(
  gameId: string,
  gameType: string,
  dealerGameId: string,
  reason: string,
  extra?: Record<string, unknown>,
): void {
  persistSyncDebugEvent({
    gameId,
    gameType,
    handNumber: 0,
    roundId: null,
    eventType: 'invariant',
    severity: 'info',
    eventName: 'dealer-game-row-created',
    payload: {
      caller: 'DealerGameSetup.tsx',
      reason,
      dealerGameId: dealerGameId.slice(0, 8),
      extra: extra ?? null,
      tsClient: Date.now(),
    },
  });
}

type SelectionStep = 'game' | 'config';

interface PreviousGameConfig {
  game_type: string | null;
  ante_amount: number;
  rollover_amount: number;
  leg_value: number;
  legs_to_win: number;
  pussy_tax_enabled: boolean;
  pussy_tax_value: number;
  pot_max_enabled: boolean;
  pot_max_value: number;
  chucky_cards: number;
  rabbit_hunt: boolean;
  reveal_at_showdown: boolean;
  // Cribbage-specific fields
  points_to_win?: number;
  skunk_enabled?: boolean;
  skunk_threshold?: number;
  double_skunk_enabled?: boolean;
  double_skunk_threshold?: number;
  cribbage_game_mode?: string; // 'full' | 'half' | 'super_quick' | 'sprint' | 'custom'
  custom_points_to_win?: number; // For custom mode
  per_point_value?: number;
  gin_bonus?: number;
  undercut_bonus?: number;
}

type SessionGameConfigs = Partial<Record<string, PreviousGameConfig>>;

interface DealerGameSetupProps {
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  dealerPosition: number;
  configDeadline: string | null;
  previousGameType?: string; // The last game type played
  previousGameConfig?: PreviousGameConfig | null; // The previous game's actual config
  sessionGameConfigs?: SessionGameConfigs; // Session-specific configs per game type
  isFirstHand?: boolean; // Whether this is the first hand of the session (no run back option)
  gameSetupTimerSeconds: number; // Cached at session start
  anteDecisionTimerSeconds: number; // Cached at session start
  activePlayerCount?: number; // Number of active players for game restrictions
  activeHumanCount?: number; // Number of active human (non-bot) players
  onConfigComplete: (result: DealerGameSetupCommitResult) => void | Promise<void>;
  onSessionEnd: () => void;
  onSitOut?: () => void; // Callback when dealer chooses to sit out
}

interface GameDefaults {
  ante_amount: number;
  rollover_amount: number;
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

const dealerSetupFailureMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('real_money_liveness_unavailable')) {
    return 'Real-money deal blocked because server recovery is not healthy. No ante or game state was committed. Try again shortly.';
  }
  return 'Could not configure the game';
};

const DealerGameSetupInner = ({
  gameId,
  dealerUsername,
  isBot,
  dealerPlayerId,
  dealerPosition,
  configDeadline,
  previousGameType,
  previousGameConfig,
  sessionGameConfigs,
  isFirstHand = true,
  gameSetupTimerSeconds,
  activePlayerCount = 0,
  activeHumanCount = 0,
  onConfigComplete,
  onSessionEnd,
  onSitOut,
}: DealerGameSetupProps) => {
  // ── DIAGNOSTIC: lifecycle continuity audit (Step 1 of poker shell refactor) ──
  // Confirms which render path actually mounts DealerGameSetup, so we
  // can prove whether the legacy `configuring` sibling branch is the
  // runtime path (and therefore why shell chrome appears missing).
  useLifecycleMount('DealerGameSetup', {
    gameId,
    isBot,
    previousGameType: previousGameType ?? null,
  });
  // ── Waiting-table flight recorder (instrumentation only) ────────
  useWaitingMount('DealerConfig', {
    impl: 'DealerGameSetup',
    gameId,
    isBot,
    previousGameType: previousGameType ?? null,
  });
  useEffect(() => {
    recordWaitingLifecycle('DealerConfig entered', {
      gameId, isBot, previousGameType: previousGameType ?? null,
    });
    recordSurfaceOwnership('DealerConfig', {
      SeatOwner: '(not applicable — modal form)',
      ChipOwner: '(not applicable)',
      ControlOwner: 'Slot:DealerGameSetup (game/config tabs)',
      AnnouncementOwner: 'Shell:SessionLifecycleAnnouncer (dealer_configuring ambient)',
      HUDOwner: '(none)',
    }, { gameId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Selection step: game selection -> config
  const [selectionStep, setSelectionStep] = useState<SelectionStep>('game');
  // Default to previous game type if provided, otherwise holm-game (always default to holm for new sessions)
  const [selectedGameType, setSelectedGameType] = useState<string>(previousGameType || "holm-game");
  // Timer settings are passed as props (cached at session start)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeletingEmptySession, setShowDeletingEmptySession] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const hasSubmittedRef = useRef(false);
  const handleDealerTimeoutRef = useRef<() => void>(() => {});
  const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSetup = useCallback(async (
    gameType: DealerGameType,
    config: Record<string, unknown>,
    reason: string,
  ) => {
    const result = await configureDealerGame({
      gameId,
      dealerPlayerId,
      expectedDealerPosition: dealerPosition,
      expectedConfigDeadline: configDeadline,
      gameType,
      config,
    });
    logDealerGameCreated(gameId, gameType, result.dealer_game.id, reason, {
      dealerPlayerId,
      deduped: result.deduped,
    });
    if (configTimeoutRef.current) {
      clearTimeout(configTimeoutRef.current);
      configTimeoutRef.current = null;
    }
    await onConfigComplete(result);
    return result;
  }, [configDeadline, dealerPlayerId, dealerPosition, gameId, onConfigComplete]);
  
  // Mount delay to prevent brief flash during rapid status transitions
  // The component waits 50ms before rendering to ensure parent isn't about to unmount it
  const [mountReady, setMountReady] = useState(false);
  useEffect(() => {
    const mountTimer = setTimeout(() => setMountReady(true), 50);
    return () => clearTimeout(mountTimer);
  }, []);
  
  // Config state - use strings for free text input with validation on save
  const [anteAmount, setAnteAmount] = useState("2");
  const [rolloverAmount, setRolloverAmount] = useState("1");
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
  
  // Cribbage-specific settings - now uses preset game modes
  const [cribbageGameMode, setCribbageGameMode] = useState<import('@/lib/cribbageTypes').CribbageGameMode>('full');
  const [skunksEnabled, setSkunksEnabled] = useState(true);
  const [customPointsToWin, setCustomPointsToWin] = useState('61'); // Default for custom mode
  
  // Gin Rummy-specific settings
  const [ginRummyPointsToWin, setGinRummyPointsToWin] = useState(100);
  const [ginRummyPerPointValue, setGinRummyPerPointValue] = useState(0);
   const [ginRummyGinBonus, setGinRummyGinBonus] = useState(25);
   const [ginRummyUndercutBonus, setGinRummyUndercutBonus] = useState(25);
  
  // Cache defaults for both game types
  const [holmDefaults, setHolmDefaults] = useState<GameDefaults | null>(null);
  const [threeFiveSevenDefaults, setThreeFiveSevenDefaults] = useState<GameDefaults | null>(null);
  const [cribbageDefaults, setCribbageDefaults] = useState<any | null>(null);

  // GLOBAL harness visibility. Source of truth is the shared game_defaults /
  // system_settings record (see runtimeCache) — never per-user or per-device.
  // Same resolver the runtime execution gate uses, so display can never drift.
  const activeHarnessMap = useActiveHarnessMap(HARNESS_WARNING_GAME_IDS);



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
        setRolloverAmount(String(previousGameConfig.rollover_amount ?? 1));
        setLegValue(String(previousGameConfig.leg_value));
        setLegsToWin(String(previousGameConfig.legs_to_win));
        setPussyTaxEnabled(previousGameConfig.pussy_tax_enabled);
        setPussyTaxValue(String(previousGameConfig.pussy_tax_value));
        setPotMaxEnabled(previousGameConfig.pot_max_enabled);
        setPotMaxValue(String(previousGameConfig.pot_max_value));
        setChuckyCards(String(previousGameConfig.chucky_cards));
        setRabbitHunt(previousGameConfig.rabbit_hunt ?? false);
        setRevealAtShowdown(previousGameConfig.reveal_at_showdown ?? false);
        
        // Apply cribbage-specific settings if present
        if (previousGameConfig.cribbage_game_mode) {
          setCribbageGameMode(previousGameConfig.cribbage_game_mode as import('@/lib/cribbageTypes').CribbageGameMode);
        }
        if (previousGameConfig.skunk_enabled !== undefined) {
          setSkunksEnabled(previousGameConfig.skunk_enabled);
        }
        if (previousGameConfig.custom_points_to_win !== undefined) {
          setCustomPointsToWin(String(previousGameConfig.custom_points_to_win));
        }
        
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
    setRolloverAmount(String(defaults.rollover_amount ?? 1));
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

  // Update config when a card game is selected - PRIORITY: session config > global defaults
  // Applies to card games (holm-game, 3-5-7, cribbage) - dice games don't have persistent configs
  const handleGameTypeChange = (gameType: string) => {
    setSelectedGameType(gameType);
    
    // Card games with session config persistence
    if (gameType === 'holm-game' || gameType === '3-5-7' || gameType === 'cribbage') {
      const sessionConfig = sessionGameConfigs?.[gameType];
      
      // PRIORITY 1: Use session-specific config if available (remembers settings from earlier in session)
      if (sessionConfig && sessionConfig.game_type === gameType) {
        console.log('[DEALER SETUP] Using session config for', gameType, ':', sessionConfig);
        setAnteAmount(String(sessionConfig.ante_amount));
        setRolloverAmount(String(sessionConfig.rollover_amount ?? 1));
        setLegValue(String(sessionConfig.leg_value));
        setLegsToWin(String(sessionConfig.legs_to_win));
        setPussyTaxEnabled(sessionConfig.pussy_tax_enabled);
        setPussyTaxValue(String(sessionConfig.pussy_tax_value));
        setPotMaxEnabled(sessionConfig.pot_max_enabled);
        setPotMaxValue(String(sessionConfig.pot_max_value));
        setChuckyCards(String(sessionConfig.chucky_cards));
        setRabbitHunt(sessionConfig.rabbit_hunt ?? false);
        setRevealAtShowdown(sessionConfig.reveal_at_showdown ?? false);
        
        // Apply cribbage-specific settings if present
        if (gameType === 'cribbage') {
          if (sessionConfig.cribbage_game_mode) {
            setCribbageGameMode(sessionConfig.cribbage_game_mode as import('@/lib/cribbageTypes').CribbageGameMode);
          }
          if (sessionConfig.skunk_enabled !== undefined) {
            setSkunksEnabled(sessionConfig.skunk_enabled);
          }
          if (sessionConfig.custom_points_to_win !== undefined) {
            setCustomPointsToWin(String(sessionConfig.custom_points_to_win));
          }
        }
        return;
      }
      
      // PRIORITY 2: Fall back to global defaults
      const defaults = gameType === 'holm-game' ? holmDefaults : 
                       gameType === '3-5-7' ? threeFiveSevenDefaults : null;
      if (defaults) {
        console.log('[DEALER SETUP] Using global defaults for', gameType);
        applyDefaults(defaults);
      }
    }
  };

  // Handle dealer timeout - mark as sitting out and re-evaluate
  const handleDealerTimeout = async () => {
    if (hasSubmittedRef.current) return;

    // P0 CONTAINMENT: Re-fetch authoritative game state and abort if the game
    // has already advanced past configuration. Prevents stale local timers
    // from kicking players mid-game.
    try {
      const { data: guardData, error: guardErr } = await supabase
        .from('games')
        .select('status, current_game_uuid, config_complete, config_deadline')
        .eq('id', gameId)
        .maybeSingle();

      const allowedStatuses = new Set(['dealer_selection', 'configuring', 'game_selection']);
      const statusOk = guardData && allowedStatuses.has(guardData.status);
      const configOk = guardData && guardData.config_complete === false;

      // Resolve whether current_game_uuid points to a TRULY active dealer game.
      // A stale completed prior dealer_game must not block config-phase timeout.
      let blockerStatus: string | null = null;
      let blockerActive = false;
      if (guardData?.current_game_uuid) {
        const { data: blockerRow } = await supabase
          .from('games')
          .select('status')
          .eq('id', guardData.current_game_uuid)
          .maybeSingle();
        blockerStatus = blockerRow?.status ?? null;
        const inactiveStatuses = new Set([
          'completed', 'session_ended', 'waiting',
          'dealer_selection', 'game_selection', 'configuring',
        ]);
        blockerActive = !!blockerStatus && !inactiveStatuses.has(blockerStatus);
      }

      if (guardErr || !guardData || !statusOk || !configOk || blockerActive) {
        console.warn('[DEALER SETUP] dealer-timeout-suppressed', {
          gameId,
          status: guardData?.status,
          config_complete: guardData?.config_complete,
          current_game_uuid: guardData?.current_game_uuid,
          blocker_status: blockerStatus,
          blocker_active: blockerActive,
          config_deadline: guardData?.config_deadline,
          error: guardErr?.message,
        });
        if (configTimeoutRef.current) {
          clearTimeout(configTimeoutRef.current);
          configTimeoutRef.current = null;
        }
        return;
      }
    } catch (e) {
      console.warn('[DEALER SETUP] dealer-timeout-suppressed (guard fetch threw)', e);
      return;
    }

    hasSubmittedRef.current = true;

    try {
      console.log('[DEALER SETUP] Dealer timed out — delegating to shared handler');

      // Log config timeout event (observability only)
      await logSessionEvent({
        gameId,
        eventType: 'config_timeout',
        eventData: { dealer_position: dealerPosition, dealer_username: dealerUsername, is_bot: isBot },
      });

      if (!isBot) {
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
      }

      // SHARED AUTHORITATIVE HANDLER — single source of truth for next-game
      // config timeout. Handles sit-out, eligibility, atomic rotation with
      // fresh deadline, real-money archive, history-based session end, OR
      // revert to 'waiting' with sit-out soft-removal.
      const { data: outcomeData, error: rpcError } = await supabase.rpc(
        'handle_config_deadline_timeout' as any,
        { _game_id: gameId } as any
      );

      if (rpcError) throw rpcError;

      const outcome = (outcomeData as any)?.outcome as string | undefined;
      console.log('[DEALER SETUP] Shared handler outcome:', outcomeData);

      if (outcome === 'rotated') {
        // Rotation completed atomically server-side; Realtime synchronizes the
        // newly selected dealer, but it is not a setup-completion trigger.
        return;
      }

      if (outcome === 'suppressed') {
        // Game already advanced — nothing to do.
        return;
      }

      if (outcome === 'session_ended') {
        onSessionEnd();
        return;
      }

      if (outcome === 'waiting') {
        // Server already wrote status='waiting' and soft-removed sit-outs.
        return;
      }

      // outcome === 'empty_no_humans' → caller shows 5s countdown then deletes.
      const deleteEmptySession = async () => {
        console.log('[DEALER SETUP] Deleting empty session (no hands played)');

        // Delete in FK-safe order, but parallelize where possible
        const { data: roundRows } = await supabase
          .from('rounds')
          .select('id')
          .eq('game_id', gameId);

        const roundIds = (roundRows ?? []).map((r: any) => r.id).filter(Boolean);

        // Parallel delete: these 3 don't depend on each other
        const parallelDeletes = [
          roundIds.length > 0 
            ? supabase.from('player_cards').delete().in('round_id', roundIds)
            : Promise.resolve({ error: null }),
          supabase.from('chip_stack_emoticons').delete().eq('game_id', gameId),
          supabase.from('chat_messages').delete().eq('game_id', gameId),
        ];
        
        const results = await Promise.all(parallelDeletes);
        for (const { error } of results) {
          if (error) throw error;
        }

        // Sequential deletes (FK dependencies): rounds -> players -> games
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

      // Empty session with no humans: keep client-side 5s UI countdown then cascade delete.
      await logSessionDeleted(gameId, undefined, 'Config timeout with no active humans and no history', false);

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
    // Don't sync until defaults are loaded
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

    // A configuration identity without a committed deadline is invalid. Do
    // not manufacture a browser-owned identity that the authority RPC did
    // not publish.
    console.error('[DEALER SETUP] Authoritative config deadline is missing');
    setTimeLeft(null);
  }, [gameId, isBot, loadingDefaults, scheduleConfigTimeout, gameSetupTimerSeconds]);

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

  // PRIMARY enforcement: the visible countdown reaching zero immediately fires
  // the timeout action on the active client. The setTimeout in scheduleConfigTimeout
  // is a SECONDARY backup (in case display ticking is paused by the OS). Server
  // edge/cron enforcement is TERTIARY. An active client visibly seeing the deadline
  // expire must never depend on background polling.
  useEffect(() => {
    if (isBot || loadingDefaults) return;
    if (timeLeft === null) return; // Wait for initial sync

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // PRIMARY trigger: display countdown reached zero on this active client.
          if (!hasSubmittedRef.current) {
            console.log('[DEALER SETUP] Display countdown reached 0 — firing timeout (primary)');
            handleDealerTimeoutRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBot, loadingDefaults, timeLeft !== null]);


  // Bot dealers use the same exact-identity authority path as human dealers.
  useEffect(() => {
    if (!isBot || loadingDefaults || hasSubmittedRef.current) return;

    const submitBotSetup = async () => {
      hasSubmittedRef.current = true;
      try {
        const requestedType = previousGameType === '3-5-7-game'
          ? '3-5-7'
          : previousGameType;
        const supportedTypes = new Set<DealerGameType>([
          '3-5-7', 'holm-game', 'cribbage', 'gin-rummy',
          'horses', 'ship-captain-crew', 'yahtzee',
        ]);
        let gameType: DealerGameType;
        let config: Record<string, unknown>;

        if (requestedType && previousGameConfig && supportedTypes.has(requestedType as DealerGameType)) {
          gameType = requestedType as DealerGameType;
          if (gameType === '3-5-7' || gameType === 'holm-game') {
            config = {
              ante_amount: previousGameConfig.ante_amount,
              rollover_amount: previousGameConfig.rollover_amount ?? 1,
              leg_value: previousGameConfig.leg_value,
              pussy_tax_enabled: previousGameConfig.pussy_tax_enabled,
              pussy_tax_value: previousGameConfig.pussy_tax_value,
              legs_to_win: previousGameConfig.legs_to_win,
              pot_max_enabled: previousGameConfig.pot_max_enabled,
              pot_max_value: previousGameConfig.pot_max_value,
              chucky_cards: gameType === 'holm-game' ? previousGameConfig.chucky_cards : null,
              rabbit_hunt: gameType === 'holm-game' ? (previousGameConfig.rabbit_hunt ?? false) : null,
              reveal_at_showdown: gameType === '3-5-7' ? (previousGameConfig.reveal_at_showdown ?? false) : null,
            };
          } else if (gameType === 'cribbage') {
            const skunkEnabled = previousGameConfig.skunk_enabled ?? true;
            const doubleSkunkEnabled = skunkEnabled && (previousGameConfig.double_skunk_enabled ?? true);
            config = {
              ante_amount: previousGameConfig.ante_amount,
              points_to_win: previousGameConfig.points_to_win ?? 121,
              skunk_enabled: skunkEnabled,
              skunk_threshold: skunkEnabled ? (previousGameConfig.skunk_threshold ?? 91) : 0,
              double_skunk_enabled: doubleSkunkEnabled,
              double_skunk_threshold: doubleSkunkEnabled
                ? (previousGameConfig.double_skunk_threshold ?? 61)
                : 0,
              game_mode: previousGameConfig.cribbage_game_mode ?? 'full',
            };
          } else if (gameType === 'gin-rummy') {
            config = {
              ante_amount: previousGameConfig.ante_amount,
              points_to_win: previousGameConfig.points_to_win ?? ginRummyPointsToWin,
              per_point_value: previousGameConfig.per_point_value ?? ginRummyPerPointValue,
              gin_bonus: previousGameConfig.gin_bonus ?? ginRummyGinBonus,
              undercut_bonus: previousGameConfig.undercut_bonus ?? ginRummyUndercutBonus,
            };
          } else {
            config = { ante_amount: previousGameConfig.ante_amount || 2 };
          }
        } else {
          const defaults = holmDefaults || threeFiveSevenDefaults;
          if (!defaults) throw new Error('No bot dealer defaults are available');
          gameType = holmDefaults ? 'holm-game' : '3-5-7';
          config = {
            ante_amount: defaults.ante_amount,
            rollover_amount: defaults.rollover_amount ?? 1,
            leg_value: defaults.leg_value,
            pussy_tax_enabled: defaults.pussy_tax_enabled,
            pussy_tax_value: defaults.pussy_tax_value,
            legs_to_win: defaults.legs_to_win,
            pot_max_enabled: defaults.pot_max_enabled,
            pot_max_value: defaults.pot_max_value,
            chucky_cards: gameType === 'holm-game' ? defaults.chucky_cards : null,
            rabbit_hunt: gameType === 'holm-game' ? (defaults.rabbit_hunt ?? false) : null,
            reveal_at_showdown: gameType === '3-5-7' ? (defaults.reveal_at_showdown ?? false) : null,
          };
        }

        const result = await commitSetup(gameType, config, 'bot-dealer-authoritative-setup');
        console.log('[BOT DEALER] ✅ Atomic config complete:', result.dealer_game.id);
      } catch (error) {
        console.error('[BOT DEALER] Atomic setup failed:', error);
        hasSubmittedRef.current = false;
        toast.error('Bot dealer setup failed');
      }
    };

    void submitBotSetup();
  }, [
    commitSetup,
    ginRummyGinBonus,
    ginRummyPerPointValue,
    ginRummyPointsToWin,
    ginRummyUndercutBonus,
    holmDefaults,
    isBot,
    loadingDefaults,
    previousGameConfig,
    previousGameType,
    threeFiveSevenDefaults,
  ]);
  const handleSubmit = async (overrideGameType?: string) => {
    if (isSubmitting || hasSubmittedRef.current) return;

    const gameTypeToSubmit = overrideGameType || selectedGameType;
    if (gameTypeToSubmit !== 'holm-game' && gameTypeToSubmit !== '3-5-7') {
      toast.error('Select a card game (Holm or 3-5-7)');
      return;
    }

    const parsedAnte = parseInt(anteAmount) || 0;
    const parsedRollover = parseInt(rolloverAmount) || 0;
    const parsedLegValue = parseInt(legValue) || 0;
    const parsedLegsToWin = parseInt(legsToWin) || 0;
    const parsedPussyTax = parseInt(pussyTaxValue) || 0;
    const parsedPotMax = parseInt(potMaxValue) || 0;
    const parsedChucky = parseInt(chuckyCards) || 0;

    if (parsedAnte < 1) {
      toast.error('Ante must be at least $1');
      return;
    }
    if (gameTypeToSubmit === '3-5-7' && parsedRollover < 1) {
      toast.error('Rollover must be at least $1');
      return;
    }
    if (parsedLegValue < 1 || parsedLegsToWin < 1) {
      toast.error('Leg value and legs to win must be at least 1');
      return;
    }
    if (pussyTaxEnabled && parsedPussyTax < 1) {
      toast.error('Pussy tax must be at least $1 when enabled');
      return;
    }
    if (potMaxEnabled && parsedPotMax < 1) {
      toast.error('Pot max must be at least $1 when enabled');
      return;
    }
    if (gameTypeToSubmit === 'holm-game' && (parsedChucky < 2 || parsedChucky > 7)) {
      toast.error('Chucky cards must be between 2 and 7');
      return;
    }

    setIsSubmitting(true);
    hasSubmittedRef.current = true;
    const isHolmGame = gameTypeToSubmit === 'holm-game';
    const dealerGameConfig = {
      ante_amount: parsedAnte,
      rollover_amount: isHolmGame ? null : parsedRollover,
      leg_value: parsedLegValue,
      pussy_tax_enabled: pussyTaxEnabled,
      pussy_tax_value: parsedPussyTax,
      legs_to_win: parsedLegsToWin,
      pot_max_enabled: potMaxEnabled,
      pot_max_value: parsedPotMax,
      chucky_cards: isHolmGame ? parsedChucky : null,
      rabbit_hunt: isHolmGame ? rabbitHunt : null,
      reveal_at_showdown: isHolmGame ? null : revealAtShowdown,
    };

    try {
      const result = await commitSetup(
        gameTypeToSubmit,
        dealerGameConfig,
        'manual-authoritative-card-setup',
      );
      emit357RuntimeDiag('dealer_game_boundary_reset', {
        gameId,
        dealerGameId: result.dealer_game.id,
      }, {
        origin: 'configure_dealer_game',
        branch: 'ante_decision',
        gameTypeToSubmit,
        isHolmGame,
        atomic: true,
      });
      console.log('[DEALER SETUP] ✅ Atomic config complete:', result.dealer_game.id);
    } catch (error) {
      console.error('[DEALER SETUP] Atomic card setup failed:', error);
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      toast.error(dealerSetupFailureMessage(error));
    }
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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center"
        style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
      >
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
      case 'gin-rummy': return 'Gin Rummy';
      case 'yahtzee': return 'Yahtzee';
      default: return gameType;
    }
  };
  
  const isDiceGame = (gameType: string) => {
    return gameType === 'horses' || gameType === 'ship-captain-crew' || gameType === 'yahtzee';
  };
  
  const isSimpleAnteGame = (gameType: string) => {
    return isDiceGame(gameType) || gameType === 'cribbage' || gameType === 'gin-rummy';
  };

  const handleGameSelect = async (gameType: string) => {
    // Check player count restrictions
    const gameInfo = allGames.find(g => g.id === gameType);
    if (gameInfo?.maxPlayers && activePlayerCount > gameInfo.maxPlayers) {
      toast.error(`${gameInfo.name} requires ${gameInfo.maxPlayers} or fewer players`);
      return;
    }
    
    setSelectedGameType(gameType);
    setSelectionStep('config');
    
    // For card games with complex config, load session config or defaults
    if (gameType === 'holm-game' || gameType === '3-5-7') {
      handleGameTypeChange(gameType);
    } else if (isSimpleAnteGame(gameType)) {
      // Fetch defaults for simple ante games (dice, cribbage, gin-rummy)
      const { data: gameDefaults } = await supabase
        .from('game_defaults')
        .select('ante_amount, points_to_win, skunk_enabled, skunk_threshold, double_skunk_enabled, double_skunk_threshold, per_point_value, gin_bonus, undercut_bonus')
        .eq('game_type', gameType)
        .single();
      
      if (gameDefaults) {
        setAnteAmount(String(gameDefaults.ante_amount));
        
        // Apply cribbage-specific defaults (use full game as default mode)
        if (gameType === 'cribbage') {
          setCribbageDefaults(gameDefaults);
          setCribbageGameMode('full');
          setSkunksEnabled(gameDefaults.skunk_enabled ?? true);
        }
        
        // Apply gin-rummy-specific defaults
        if (gameType === 'gin-rummy') {
          setGinRummyPointsToWin(gameDefaults.points_to_win ?? 100);
          setGinRummyPerPointValue(gameDefaults.per_point_value ?? 0);
           setGinRummyGinBonus(gameDefaults.gin_bonus ?? 25);
           setGinRummyUndercutBonus(gameDefaults.undercut_bonus ?? 25);
        }
      } else {
        // Fall back to default ante
        setAnteAmount('5');
        if (gameType === 'cribbage') {
          setCribbageGameMode('full');
          setSkunksEnabled(true);
        }
        if (gameType === 'gin-rummy') {
          setGinRummyPointsToWin(100);
          setGinRummyPerPointValue(0);
           setGinRummyGinBonus(25);
           setGinRummyUndercutBonus(25);
        }
      }
    }
  };

  // Game definitions for unified grid
  const allGames = [
    // Card Games
    { id: 'holm-game', name: 'Holm', description: 'Beat Chucky!', category: 'cards', enabled: true },
    { id: '3-5-7', name: '3-5-7', description: 'Classic wild card poker', category: 'cards', enabled: true },
    { id: 'cribbage', name: 'Cribbage', description: 'Pegging to 121', category: 'cards', enabled: true, maxPlayers: 4 },
    { id: 'gin-rummy', name: 'Gin Rummy', description: 'Meld & knock', category: 'cards', enabled: true, maxPlayers: 2 },
    
    // Dice Games
    { id: 'horses', name: 'Horses', description: '5 dice, best hand wins', category: 'dice', enabled: true },
    { id: 'ship-captain-crew', name: 'Ship Captain Crew', description: '6-5-4', category: 'dice', enabled: true },
    { id: 'yahtzee', name: 'Yahtzee', description: 'Fill your scorecard', category: 'dice', enabled: true },
  ];

  const cardGames = allGames.filter(g => g.category === 'cards');
  const diceGames = allGames.filter(g => g.category === 'dice');

  const isGameDisabled = (game: typeof allGames[0]) => {
    if (!game.enabled) return true;
    if (game.maxPlayers && activePlayerCount > game.maxPlayers) return true;
    return false;
  };

  const getPlayerRestrictionLabel = (game: typeof allGames[0]) => {
    if (game.maxPlayers) {
      return `${game.maxPlayers} max`;
    }
    return null;
  };
  
  const handleSimpleAnteGameSubmit = async (overrideGameType?: string) => {
    if (isSubmitting || hasSubmittedRef.current) return;

    const parsedAnte = parseInt(anteAmount, 10);
    if (!Number.isInteger(parsedAnte) || parsedAnte < 1) {
      toast.error('Ante must be at least $1');
      return;
    }

    const gameTypeToSubmit = overrideGameType || selectedGameType;
    const simpleTypes = new Set<DealerGameType>([
      'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee',
    ]);
    if (!simpleTypes.has(gameTypeToSubmit as DealerGameType)) {
      toast.error('Select a supported game');
      return;
    }

    const gameType = gameTypeToSubmit as DealerGameType;
    const dealerGameConfig: Record<string, unknown> = { ante_amount: parsedAnte };
    if (gameType === 'cribbage') {
      const selectedMode = CRIBBAGE_GAME_MODES.find((mode) => mode.id === cribbageGameMode)
        ?? CRIBBAGE_GAME_MODES[0];
      const effectiveSkunksEnabled =
        selectedMode.id !== 'sprint' && selectedMode.id !== 'custom' && skunksEnabled;
      const pointsToWin = selectedMode.id === 'custom'
        ? Math.max(1, parseInt(customPointsToWin, 10) || 61)
        : selectedMode.pointsToWin;
      dealerGameConfig.points_to_win = pointsToWin;
      dealerGameConfig.skunk_enabled = effectiveSkunksEnabled;
      dealerGameConfig.skunk_threshold = effectiveSkunksEnabled ? selectedMode.skunkThreshold : 0;
      dealerGameConfig.double_skunk_enabled =
        effectiveSkunksEnabled && selectedMode.doubleSkunkThreshold !== null;
      dealerGameConfig.double_skunk_threshold =
        effectiveSkunksEnabled && selectedMode.doubleSkunkThreshold !== null
          ? selectedMode.doubleSkunkThreshold
          : 0;
      dealerGameConfig.game_mode = selectedMode.id;
      if (selectedMode.id === 'custom') {
        dealerGameConfig.custom_points_to_win = pointsToWin;
      }
    } else if (gameType === 'gin-rummy') {
      dealerGameConfig.points_to_win = ginRummyPointsToWin;
      dealerGameConfig.per_point_value = ginRummyPerPointValue;
      dealerGameConfig.gin_bonus = ginRummyGinBonus;
      dealerGameConfig.undercut_bonus = ginRummyUndercutBonus;
      resetStartupFlight('Gin config submit start');
      recordStartupFlight('PHASE TIMELINE', 'dealer_selected / Gin atomic config submit start', {
        file: 'src/components/DealerGameSetup.tsx',
        function: 'handleSimpleAnteGameSubmit',
        caller: 'dealer submit button',
        gameId,
        gameType,
        dealerPlayerId,
      });
    }

    setIsSubmitting(true);
    hasSubmittedRef.current = true;
    try {
      const result = await commitSetup(
        gameType,
        dealerGameConfig,
        'manual-authoritative-simple-setup',
      );
      if (gameType === 'gin-rummy') {
        recordStartupFlight('STATUS TIMELINE', 'Gin atomic config committed', {
          file: 'src/components/DealerGameSetup.tsx',
          function: 'handleSimpleAnteGameSubmit',
          caller: 'configure_dealer_game result',
          gameId,
          gameType,
          dealerGameId: result.dealer_game.id,
          status: result.game.status,
        });
      }
      console.log('[DEALER SETUP] ✅ Atomic config complete:', result.dealer_game.id);
    } catch (error) {
      console.error('[DEALER SETUP] Atomic simple-game setup failed:', error);
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      toast.error(dealerSetupFailureMessage(error));
    }
  };

  const handleRunBack = () => {
    if (previousGameType && previousGameConfig) {
      if (previousGameType === 'gin-rummy') {
      }

      // Use previous config and submit immediately
      // CRITICAL: Pass the game type directly to submit functions to avoid async state issues
      setSelectedGameType(previousGameType);
      setAnteAmount(String(previousGameConfig.ante_amount));
      setRolloverAmount(String(previousGameConfig.rollover_amount ?? 1));
      
      // Simple ante games only need ante configuration.
      if (isSimpleAnteGame(previousGameType)) {
        // Pass game type directly to avoid state race condition
        handleSimpleAnteGameSubmit(previousGameType);
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

  const handleBackToGameSelection = () => {
    setSelectionStep('game');
  };

  // Determine which tab to default to based on previous game
  const getDefaultTab = () => {
    if (previousGameType) {
      return isDiceGame(previousGameType) ? 'dice' : 'cards';
    }
    return 'cards';
  };

  // Game selection step - tabbed layout with Cards vs Dice
  if (selectionStep === 'game') {
    return (
      <div
        data-dealer-game-setup-step="game-selection"
        data-dealer-game-setup-game-id={gameId}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
      >
        <Card className="w-full max-w-2xl border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark max-h-[90vh] overflow-y-auto">
          <CardContent className="pt-6 pb-6 space-y-5">
            {/* Header with Timer */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-poker-gold">Dealer Setup</h2>
                <p className="text-amber-100 text-sm">{dealerUsername}, choose game type</p>
              </div>
              {timeLeft !== null && (
                <Badge 
                  variant={timeLeft <= 10 ? "destructive" : "default"} 
                  className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
                >
                  <Timer className="w-4 h-4" />
                  {timeLeft}s
                </Badge>
              )}
            </div>

            {/* Tabbed Game Selection */}
            <Tabs defaultValue={getDefaultTab()} className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-poker-felt-dark border border-poker-gold/30">
                <TabsTrigger 
                  value="cards" 
                  className="data-[state=active]:bg-poker-gold data-[state=active]:text-poker-felt-dark flex items-center gap-2"
                >
                  <Spade className="w-4 h-4" />
                  Card Games
                </TabsTrigger>
                <TabsTrigger 
                  value="dice" 
                  className="data-[state=active]:bg-poker-gold data-[state=active]:text-poker-felt-dark flex items-center gap-2"
                >
                  <Dice5 className="w-4 h-4" />
                  Dice Games
                </TabsTrigger>
              </TabsList>

              {/* Card Games Tab */}
              <TabsContent value="cards" className="mt-4">
                <div className="flex flex-col gap-2">
                  {cardGames.map((game) => {
                    const disabled = isGameDisabled(game);
                    const restriction = getPlayerRestrictionLabel(game);
                    
                    return (
                      <button
                        key={game.id}
                        data-dealer-game-option={game.id}
                        onClick={() => handleGameSelect(game.id)}
                        disabled={disabled}
                        className={`
                          relative w-full h-14 py-3 px-4 rounded-lg border-2 transition-all flex items-center justify-between
                          ${disabled
                            ? 'border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50'
                            : 'border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 cursor-pointer'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {activeHarnessMap[game.id]?.active && <HarnessBadge />}
                          {!game.enabled && (
                            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}

                          <span className={`text-base font-bold ${disabled ? 'text-gray-400' : 'text-poker-gold'}`}>
                            {game.name}
                          </span>
                          <span className={`text-sm ${disabled ? 'text-gray-500' : 'text-amber-200/80'}`}>
                            — {game.description}
                          </span>
                        </div>
                        {restriction && (
                          <span className={`text-xs font-medium flex-shrink-0 ${
                            activePlayerCount > (game.maxPlayers || 99) 
                              ? 'text-red-400' 
                              : 'text-amber-400'
                          }`}>
                            {restriction}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              {/* Dice Games Tab */}
              <TabsContent value="dice" className="mt-4">
                <div className="flex flex-col gap-2">
                  {diceGames.map((game) => (
                    <button
                      key={game.id}
                      data-dealer-game-option={game.id}
                      onClick={() => handleGameSelect(game.id)}
                      className="relative w-full h-14 py-3 px-4 rounded-lg border-2 transition-all flex items-center gap-3 border-poker-gold bg-amber-900/30 hover:bg-amber-900/50 cursor-pointer"
                    >
                      {activeHarnessMap[game.id]?.active && <HarnessBadge />}
                      <span className="text-base font-bold text-poker-gold">
                        {game.name}
                      </span>
                      <span className="text-sm text-amber-200/80">

                        — {game.description}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            {/* Run Back option - only show on 2nd+ game of session */}
            {!isFirstHand && previousGameType && previousGameConfig && (
              <div className="pt-3 border-t border-poker-gold/30">
                <button
                  onClick={handleRunBack}
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-lg border-2 transition-all border-amber-600 bg-amber-800/30 hover:bg-amber-800/50 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  <span className="text-base font-bold text-amber-400">
                    Run Back {getGameDisplayName(previousGameType)}
                  </span>
                </button>
              </div>
            )}

            {/* Sit Out and End Session options */}
            <div className="pt-3 border-t border-poker-gold/30 flex flex-col gap-2">
              {/* Sit Out - always show when handler is provided */}
              {onSitOut && (
                <button
                  onClick={onSitOut}
                  className="w-full py-3 px-4 rounded-lg border-2 transition-all border-gray-500 bg-gray-700/30 hover:bg-gray-700/50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <UserMinus className="w-5 h-5 text-gray-300" />
                  <span className="text-base font-bold text-gray-300">
                    Sit Out
                  </span>
                </button>
              )}
              
              {/* End Session - only show if sole active human */}
              {activeHumanCount === 1 && (
                <button
                  onClick={onSessionEnd}
                  className="w-full py-3 px-4 rounded-lg border-2 transition-all border-red-600/70 bg-red-900/30 hover:bg-red-900/50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <LogOut className="w-5 h-5 text-red-400" />
                  <span className="text-base font-bold text-red-400">
                    End Session
                  </span>
                </button>
              )}
            </div>

            <p className="text-xs text-amber-200/60 text-center">
              If timer expires without action, you'll be marked as sitting out
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Config step - show config UI based on selected game type
  if (selectionStep === 'config') {
    // Simple ante games only need ante configuration.
    if (isSimpleAnteGame(selectedGameType)) {
      const isSCC = selectedGameType === 'ship-captain-crew';
      const isHorses = selectedGameType === 'horses';
      const isCribbage = selectedGameType === 'cribbage';
      const isGinRummy = selectedGameType === 'gin-rummy';
      const isYahtzee = selectedGameType === 'yahtzee';
      
      const gameDisplayName = isSCC ? 'Ship' : isHorses ? 'Horses' : isCribbage ? 'Cribbage' : isGinRummy ? 'Gin Rummy' : isYahtzee ? 'Yahtzee' : selectedGameType;
      const gameRulesText = isSCC 
        ? '5 dice • Up to 3 rolls • Get 6-5-4 (Ship-Captain-Crew) • Max cargo wins'
        : isHorses 
          ? '5 dice • Up to 3 rolls • 1s are wild • Highest hand wins'
          : isGinRummy
              ? '10 cards • Draw & discard • Knock at ≤10 deadwood • Match to target'
              : isYahtzee
                ? '5 dice • 13 categories • Highest total wins'
                : 'First to 121 • Skunk (2x) if loser < 91 • Double-skunk (3x) if < 61';
      
      return (
        <div
          data-dealer-game-setup-step="config"
          data-dealer-game-setup-game-id={gameId}
          data-dealer-game-setup-selected-game={selectedGameType}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
        >
          {/* Viewport-safe dialog: header + footer pinned, body scrolls. */}
          <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark flex flex-col max-h-[calc(100dvh-2rem)]">
            <CardContent className="pt-6 pb-6 flex min-h-0 flex-1 flex-col gap-4">
              {/* Header with Timer */}
              <div className="flex shrink-0 items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-poker-gold">{gameDisplayName} Setup</h2>
                  <p className="text-amber-100 text-sm">{dealerUsername}, configure ante</p>
                  {activeHarnessMap[selectedGameType]?.active && (
                    <p className="mt-1 text-sm font-bold text-red-500">
                      Harness: {activeHarnessMap[selectedGameType].label}
                    </p>
                  )}
                </div>
                {timeLeft !== null && (
                  <Badge 
                    variant={timeLeft <= 10 ? "destructive" : "default"} 
                    className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
                  >
                    <Timer className="w-4 h-4" />
                    {timeLeft}s
                  </Badge>
                )}
              </div>

              {/* Simple Game Config */}
              <div className="space-y-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">

                <div className="space-y-1">
                  <Label htmlFor="ante-simple" className="text-amber-100 text-sm">Ante ($)</Label>
                  <Input
                    id="ante-simple"
                    type="text"
                    inputMode="numeric"
                    value={anteAmount}
                    onChange={(e) => setAnteAmount(e.target.value)}
                    className="bg-amber-900/30 border-poker-gold/50 text-white"
                  />
                </div>
                
                {/* Cribbage-specific settings - preset game modes */}
                {isCribbage && (
                  <>
                    {/* Game Mode Selection — compact dropdown (same modes/values) */}
                    <div className="space-y-1">
                      <Label className="text-amber-100 text-sm">Game Mode</Label>
                      <Select
                        value={cribbageGameMode}
                        onValueChange={(v) =>
                          setCribbageGameMode(v as import('@/lib/cribbageTypes').CribbageGameMode)
                        }
                      >
                        <SelectTrigger className="bg-amber-900/30 border-poker-gold/50 text-white">
                          <SelectValue placeholder="Select game mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {CRIBBAGE_GAME_MODES.map((mode) => (
                            <SelectItem key={mode.id} value={mode.id}>
                              {mode.label} — {mode.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Custom points input - only show when custom mode selected */}
                    {cribbageGameMode === 'custom' && (
                      <div className="space-y-1">
                        <Label className="text-amber-100 text-sm">Points to Win</Label>
                        <Input
                          type="number"
                          min="1"
                          value={customPointsToWin}
                          onChange={(e) => setCustomPointsToWin(e.target.value)}
                          className="bg-amber-900/30 border-amber-700/50 text-white"
                          placeholder="Enter target points"
                        />
                        <p className="text-xs text-amber-200/50">Skunks disabled for custom games</p>
                      </div>
                    )}

                    
                    {/* Skunks Toggle - only show if mode supports skunks (not sprint or custom) */}
                    {cribbageGameMode !== 'sprint' && cribbageGameMode !== 'custom' && (
                      <div className="flex items-center justify-between pt-2">
                        <div>
                          <Label htmlFor="skunks-toggle" className="text-amber-100 text-sm">Skunks</Label>
                          <p className="text-xs text-amber-200/50">2x & 3x payout multipliers</p>
                        </div>
                        <Switch
                          id="skunks-toggle"
                          checked={skunksEnabled}
                          onCheckedChange={setSkunksEnabled}
                        />
                      </div>
                    )}
                    
                    {/* Mode description */}
                    <div className="text-xs text-amber-200/60 bg-amber-900/20 rounded-lg p-2 text-center">
                      {cribbageGameMode === 'full' && skunksEnabled && 'Skunk <91 (2x) • Double Skunk <61 (3x)'}
                      {cribbageGameMode === 'full' && !skunksEnabled && 'No skunk multipliers'}
                      {cribbageGameMode === 'half' && skunksEnabled && 'Skunk <31 (2x) • Double Skunk <15 (3x)'}
                      {cribbageGameMode === 'half' && !skunksEnabled && 'No skunk multipliers'}
                      {cribbageGameMode === 'super_quick' && skunksEnabled && 'Quick: Skunk <30 (2x) • No double skunk'}
                      {cribbageGameMode === 'super_quick' && !skunksEnabled && 'Quick: No skunk multipliers'}
                      {cribbageGameMode === 'sprint' && 'Quick game, no skunk penalties'}
                      {cribbageGameMode === 'custom' && `First to ${customPointsToWin || '?'} points, no skunks`}
                    </div>
                  </>
                )}
                
                {/* Gin Rummy-specific settings */}
                {isGinRummy && (
                  <>
                    {/* Match Mode Selection */}
                    <div className="space-y-2">
                      <Label className="text-amber-100 text-sm">Match Target</Label>
                      <div className="flex flex-col gap-2">
                        {[
                          { pts: 100, label: 'Standard', desc: '100 pts' },
                          { pts: 50, label: 'Short', desc: '50 pts' },
                        ].map((mode) => (
                          <button
                            key={mode.pts}
                            type="button"
                            onClick={() => setGinRummyPointsToWin(mode.pts)}
                            className={`w-full py-2.5 px-4 rounded-lg border transition-all flex items-center justify-between ${
                              ginRummyPointsToWin === mode.pts
                                ? 'border-poker-gold bg-poker-gold/20 text-white'
                                : 'border-amber-700/50 bg-amber-900/20 text-amber-200 hover:bg-amber-900/40'
                            }`}
                          >
                            <span className="font-medium">{mode.label}</span>
                            <span className="text-sm opacity-70">{mode.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Per-point value */}
                    <div className="space-y-1">
                      <Label className="text-amber-100 text-sm">Per-Point Value ($)</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={ginRummyPerPointValue}
                        onChange={(e) => setGinRummyPerPointValue(parseInt(e.target.value) || 0)}
                        className="bg-amber-900/30 border-poker-gold/50 text-white"
                      />
                      <p className="text-xs text-amber-200/50">0 = disabled (flat ante only)</p>
                    </div>
                    
                     {/* Bonus points */}
                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <Label className="text-amber-100 text-sm">Gin (pts)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={ginRummyGinBonus}
                            onChange={(e) => setGinRummyGinBonus(parseInt(e.target.value) || 0)}
                            className="bg-amber-900/30 border-poker-gold/50 text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-amber-100 text-sm">Undercut (pts)</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={ginRummyUndercutBonus}
                            onChange={(e) => setGinRummyUndercutBonus(parseInt(e.target.value) || 0)}
                            className="bg-amber-900/30 border-poker-gold/50 text-white"
                          />
                        </div>
                      </div>
                     
                     {/* Summary */}
                     <div className="text-xs text-amber-200/60 bg-amber-900/20 rounded-lg p-2 text-center">
                       Match to {ginRummyPointsToWin} pts
                       {ginRummyPerPointValue > 0 && ` • $${ginRummyPerPointValue}/pt`}
                       {ginRummyGinBonus > 0 && ` • Gin +${ginRummyGinBonus}pts`}
                       {ginRummyUndercutBonus > 0 && ` • Undercut +${ginRummyUndercutBonus}pts`}
                     </div>
                  </>
                )}
                
                {!isCribbage && !isGinRummy && (
                  <p className="text-sm text-amber-200/70 text-center">
                    {gameRulesText}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2 pb-[env(safe-area-inset-bottom)]">
                <button
                  onClick={handleBackToGameSelection}
                  className="flex-1 p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
                >
                  ← Back
                </button>
                <Button
                  data-dealer-game-start={selectedGameType}
                  onClick={() => handleSimpleAnteGameSubmit()}
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
  }

  // Cards selection step - show poker game tabs
  return (
    <div
      data-dealer-game-setup-step="config"
      data-dealer-game-setup-game-id={gameId}
      data-dealer-game-setup-selected-game={selectedGameType}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
    >
      <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark flex flex-col max-h-[calc(100dvh-2rem)]">
        <CardContent className="pt-6 pb-6 flex min-h-0 flex-1 flex-col gap-4">
          {/* Header with Timer */}
          <div className="flex shrink-0 items-center justify-between">

            <div>
              <h2 className="text-2xl font-bold text-poker-gold">Card Game Setup</h2>
              <p className="text-amber-100 text-sm">{dealerUsername}, configure your game</p>
              {activeHarnessMap[selectedGameType]?.active && (
                <p className="mt-1 text-sm font-bold text-red-500">
                  Harness: {activeHarnessMap[selectedGameType].label}
                </p>
              )}
            </div>
            {timeLeft !== null && (
              <Badge 
                variant={timeLeft <= 10 ? "destructive" : "default"} 
                className={`text-lg px-3 py-1 flex items-center gap-1 ${timeLeft <= 10 ? 'animate-pulse' : ''}`}
              >
                <Timer className="w-4 h-4" />
                {timeLeft}s
              </Badge>
            )}
          </div>

          {/* Scrollable configuration body — footer stays reachable */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {/* The game is fixed by the preceding selection screen. */}
            {/* Holm Game Config */}
            {selectedGameType === 'holm-game' && (
              <div className="space-y-4">
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
              </div>
            )}

            {/* 3-5-7 Config */}
            {selectedGameType === '3-5-7' && (
              <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
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
                <div className="space-y-1">
                  <Label htmlFor="rollover-357" className="text-amber-100 text-sm">Rollover ($)</Label>
                  <Input
                    id="rollover-357"
                    type="text"
                    inputMode="numeric"
                    value={rolloverAmount}
                    onChange={(e) => setRolloverAmount(e.target.value)}
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
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2 pb-[env(safe-area-inset-bottom)]">
            {/* Back Button */}
            <button
              onClick={handleBackToGameSelection}
              className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              ← Back to Game Types
            </button>

            {/* Start Button */}
            <Button 
              data-dealer-game-start={selectedGameType}
              onClick={() => handleSubmit()} 
              disabled={isSubmitting}
              className="w-full bg-poker-gold hover:bg-poker-gold/80 text-black font-bold text-lg py-6"
            >
              {isSubmitting ? 'Starting...' : `Start ${isHolmGame ? 'Holm Game' : '3-5-7'}`}
            </Button>

            <p className="text-xs text-amber-200/60 text-center">
              If timer expires without action, you'll be marked as sitting out
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Public DealerGameSetup wrapper — portals the modal to document.body
 * so it escapes the PersistentTableShell stacking context. Without
 * this, the shell's PreSessionSeatLayer (a nested zIndex:2 region
 * inside the shell's zIndex:1 stacking context) could paint chip
 * clusters above the modal. Portaling lifts the entire modal to <body>;
 * the root then uses the canonical modal band so it also occludes the
 * shell's z78 high-card reveal and z80/82 transport layers.
 */
export const DealerGameSetup = (props: DealerGameSetupProps) => {
  if (typeof document === 'undefined') return null;
  return createPortal(<DealerGameSetupInner {...props} />, document.body);
};
