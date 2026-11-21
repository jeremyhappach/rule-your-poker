import {GameArtwork} from '@/components/midnight/GameArtwork';
import {SettingRow,InlineSettingRow,AmountControl,ToggleRow} from '@/components/midnight/Settings';
import type {ReactNode} from 'react';
import {FARKLE_ENDGAME_LABELS,type FarkleEndgame} from '@/lib/farkle/types';
import {useChessAccess} from '@/hooks/useChessAccess';
import {useMegaCompetitionConfig} from '@/hooks/useMegaCompetitionConfig';
import {MegaCompetitionSettings} from './megaCardGolf/MegaCompetitionConfig';
import type {MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';
import {GOLF_HOLE_COUNTS,golfHoleCount,type GolfHoleCount} from '@/lib/golf/matchLength';
import {usePtownWordsAccess} from '@/hooks/usePtownWordsAccess';
import {useCanastaAccess} from '@/hooks/useCanastaAccess';
import {useGolfAccess} from '@/hooks/useGolfAccess';
import {useRacePokerAccess} from '@/hooks/useRacePokerAccess';
import {useBattle31Access} from '@/hooks/useBattle31Access';
import {useOriginalsAccess} from '@/hooks/useOriginalsAccess';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
import {GAME_CATALOG,findGame,eligibility,isDiscovered} from '@/lib/gameCatalog';
import {useQuintzeeAccess} from '@/hooks/useQuintzeeAccess';
import {useBoxdropAccess} from '@/hooks/useBoxdropAccess';
import {useTripFlipAccess} from '@/hooks/useTripFlipAccess';
import {useTakeTwoAccess} from '@/hooks/useTakeTwoAccess';
import {useRoyalFlashAccess} from '@/hooks/useRoyalFlashAccess';
import {useElevenUpAccess} from '@/hooks/useElevenUpAccess';
import { type FarkleDealerFieldsValue } from '@/components/farkle/FarkleDealerFields';
import { farkleLocalSetup, isFarkleLocalQualification } from '@/lib/farkle/localQualification';
import { farkleProductionSetup, loadFarkleAdminDefaults } from '@/lib/farkle/dealerDefaults';
import { useState, useEffect, useRef, useCallback } from "react";
import { useTriTowersTestAccess } from '@/hooks/useTriTowersTestAccess';
import { useRun21Access } from '@/hooks/useRun21Access';
import { TRI_TOWERS } from '@/lib/triTowers/model';
import { triTowersSetupFailureMessage } from '@/lib/triTowers/setupMessages';
import { emit357RuntimeDiag } from "@/lib/threeFiveSeven/runtimeDiag";
import { createPortal } from "react-dom";
import { useLifecycleMount } from "@/lib/canonicalShell/lifecycleDebug";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  useActiveHarnessMap,
} from "@/lib/debugHarness/activeHarnessWarning";
import { CRIBBAGE_GAME_MODES } from "@/lib/cribbageTypes";
import { Lock, Timer, RotateCcw, UserMinus, LogOut } from "lucide-react";
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
import { resolveExactGinRummyRunBackConfig } from "@/lib/ginRummyRunBackConfig";
import { resolveExactRunBackConfig } from "@/lib/dealerGameSetup/runBackConfig";
import {
  resolveSelectedCardGameConfig,
  type CardGameDefaults,
} from "@/lib/dealerGameSetup/cardGameSelection";

/**
 * Every game id that can appear in dealer setup. Harness state for each id is
 * resolved independently from the GLOBAL shared record.
 */
const HARNESS_WARNING_GAME_IDS = [
  'run21',
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
  run_back_config?: Record<string, unknown>;
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
  isAdmin?: boolean;
  gameId: string;
  dealerUsername: string;
  isBot: boolean;
  dealerPlayerId: string;
  dealerPosition: number;
  configDeadline: string | null;
  isPaused?: boolean;
  onTogglePause?: () => void | Promise<void>;
  previousGameType?: string; // The last game type played
  previousGameConfig?: PreviousGameConfig | null; // The previous game's actual config
  sessionGameConfigs?: SessionGameConfigs; // Session-specific configs per game type
  isFirstHand?: boolean; // Whether this is the first hand of the session (no run back option)
  gameSetupTimerSeconds: number; // Cached at session start
  anteDecisionTimerSeconds: number; // Cached at session start
  activePlayerCount?: number; // Number of active players for game restrictions
  realMoney?: boolean;
  activeHumanCount?: number; // Number of active human (non-bot) players
  onConfigComplete: (result: DealerGameSetupCommitResult) => void | Promise<void>;
  onSessionEnd: () => void;
  onSitOut?: () => void; // Callback when dealer chooses to sit out
}

type GameDefaults = CardGameDefaults;

const dealerSetupFailureMessage = (error: unknown): string => {
  const message = error !== null && typeof error === 'object'
    && 'message' in error && typeof error.message === 'string'
    ? error.message
    : String(error);
  if (message.includes('real_money_liveness_unavailable')) {
    return 'Real-money deal blocked because server recovery is not healthy. No ante or game state was committed. Try again shortly.';
  }
  return triTowersSetupFailureMessage(message) ?? 'Could not configure the game';
};

const DealerGameSetupInner = ({
  isAdmin = false,
  gameId,
  dealerUsername,
  isBot,
  dealerPlayerId,
  dealerPosition,
  configDeadline,
  isPaused = false,
  onTogglePause,
  previousGameType,
  previousGameConfig,
  sessionGameConfigs,
  isFirstHand = true,
  gameSetupTimerSeconds,
  activePlayerCount = 0,
  activeHumanCount = 0,
  realMoney,
  onConfigComplete,
  onSessionEnd,
  onSitOut,
}: DealerGameSetupProps) => {
  const pauseRef = useRef(isPaused);
  pauseRef.current = isPaused;
  const clockScope = `${gameId}|${dealerPosition}|${configDeadline}|${isPaused}`;
  const clockScopeRef = useRef(clockScope);
  clockScopeRef.current = clockScope;
  const run21Allowed = useRun21Access(gameId);
  const triTowersAllowed = useTriTowersTestAccess(gameId);
  const elevenAllowed = useElevenUpAccess(gameId);
  const canastaAllowed = useCanastaAccess(gameId);
  const golfAllowed = useGolfAccess(gameId);
  const megaCatalog=useMegaCompetitionConfig(gameId);
  const [megaConfig,setMegaConfig]=useState<MegaCompetitionConfig|null>(null);
  const racePokerAllowed = useRacePokerAccess(gameId);
  const battle31Allowed = useBattle31Access(gameId);
  const quintzeeAllowed = useQuintzeeAccess(gameId);
  const chessAllowed=useChessAccess(gameId);
  const wordsAllowed = usePtownWordsAccess(gameId);
  const boxdropAllowed = useBoxdropAccess(gameId);
  const tripFlipAllowed = useTripFlipAccess(gameId);
  const takeTwoAllowed = useTakeTwoAccess(gameId);
  const royalAllowed = useRoyalFlashAccess(gameId);
  const originalsAccess=useOriginalsAccess(gameId);
  const catalogAccess = {'chess':chessAllowed,...originalsAccess,'mega-card-golf':megaCatalog?.enabled??false,'canasta':canastaAllowed,'six-card-golf':golfAllowed,'race-poker':racePokerAllowed,'battle-31':battle31Allowed,'run21':run21Allowed,'tri-towers':triTowersAllowed,'eleven-up':elevenAllowed,'quintzee':quintzeeAllowed,'ptown-words':wordsAllowed,'boxdrop':boxdropAllowed,'trip-flip':tripFlipAllowed,'take-two':takeTwoAllowed,'royal-flash':royalAllowed};
  const catalogRoster = {players:activePlayerCount,humans:activeHumanCount,realMoney};
  const selectionReason = (id:string) => { const game=findGame(id); return game?eligibility(game,catalogRoster,catalogAccess):'Game unavailable'; };
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
  const [expandedSetting,setExpandedSetting]=useState<string|null>(null);
  const selectionGeneration = useRef(0);
  // Default to previous game type if provided, otherwise holm-game (always default to holm for new sessions)
  const [selectedGameType, setSelectedGameType] = useState<string>(previousGameType || "holm-game");
  const [farkleDraft, setFarkleDraft] = useState<FarkleDealerFieldsValue>({ stake: '', target: '', endgame: 'equal_turns' });
  // Timer settings are passed as props (cached at session start)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasSubmittedRef = useRef(false);
  const handleDealerTimeoutRef = useRef<() => void>(() => {});
  const configTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSetup = useCallback(async (
    gameType: DealerGameType | 'farkle',
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
  const [golfHoles,setGolfHoles] = useState<GolfHoleCount>(9);
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



  // Fetch defaults for both card games on mount. A prior dealer-game config is
  // a Run It Back snapshot, not input for a different game's editable form.
  // In particular, Cribbage/Yahtzee legitimately persist zero-valued leg
  // fields that must never briefly become a new 3-5-7 configuration.
  useEffect(() => {
    let cancelled = false;
    setLoadingDefaults(true);
    const fetchAllDefaults = async () => {
      try {
        const [holmResult, threeFiveSevenResult] = await Promise.all([
          supabase.from('game_defaults').select('*').eq('game_type', 'holm').single(),
          supabase.from('game_defaults').select('*').eq('game_type', '3-5-7').single(),
        ]);
        if (cancelled) return;

        if (!holmResult.error && holmResult.data) {
          setHolmDefaults(holmResult.data);
        }
        if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
          setThreeFiveSevenDefaults(threeFiveSevenResult.data);
        }

        // Preload a neutral card-game form only. The selected game's exact
        // config is applied by handleGameSelect below, after it has resolved.
        const initialGameType = previousGameType || 'holm-game';
        if (selectionGeneration.current !== 0) return;
        if (initialGameType === '3-5-7-game' || initialGameType === '3-5-7') {
          if (!threeFiveSevenResult.error && threeFiveSevenResult.data) {
            applyDefaults(threeFiveSevenResult.data);
          }
        } else if (!holmResult.error && holmResult.data) {
          applyDefaults(holmResult.data);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[DEALER SETUP] Failed to load optional game defaults:', error);
        }
      } finally {
        if (!cancelled) setLoadingDefaults(false);
      }
    };

    void fetchAllDefaults();
    return () => {
      cancelled = true;
    };
  }, [previousGameType]);

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

  // Handle dealer timeout - mark as sitting out and re-evaluate
  const handleDealerTimeout = async () => {
    if (hasSubmittedRef.current || pauseRef.current) return;

    // P0 CONTAINMENT: Re-fetch authoritative game state and abort if the game
    // has already advanced past configuration. Prevents stale local timers
    // from kicking players mid-game.
    try {
      const { data: guardData, error: guardErr } = await supabase
        .from('games')
        .select('status, current_game_uuid, config_complete, config_deadline, is_paused')
        .eq('id', gameId)
        .maybeSingle();

      if (pauseRef.current || guardData?.is_paused) return;

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

      if (outcome === 'session_ended') return;

      if (outcome === 'waiting') {
        // Server already wrote status='waiting' and soft-removed sit-outs.
        return;
      }

      // All dispositions are persisted by the canonical deadline owner.
      return;

    } catch (err) {
      console.error('[DEALER SETUP] Timeout handling failed:', err);
      toast.error('Dealer timeout failed — retrying…');

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

    if (pauseRef.current) return;
    const delay = Math.max(0, deadlineMs - Date.now());
    configTimeoutRef.current = setTimeout(() => {
      if (!hasSubmittedRef.current && !pauseRef.current) {
        handleDealerTimeoutRef.current();
      }
    }, delay + 50);
  }, []);

  // The deadline already arrived on the authoritative game snapshot. Arm it
  // directly; the focus/visibility fetch below is only a resync and can never
  // gate the timer or the form on optional defaults/network reads.
  useEffect(() => {
    if (configTimeoutRef.current) {
      clearTimeout(configTimeoutRef.current);
      configTimeoutRef.current = null;
    }
    if (isPaused || isBot || !configDeadline) return;
    const deadlineMs = new Date(configDeadline).getTime();
    if (!Number.isFinite(deadlineMs)) return;
    const remaining = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
    setTimeLeft(remaining);
    scheduleConfigTimeout(deadlineMs);
    if (remaining <= 0 && !hasSubmittedRef.current) {
      handleDealerTimeoutRef.current();
    }
  }, [configDeadline, isBot, isPaused, scheduleConfigTimeout]);

  const syncWithServerDeadline = useCallback(async () => {
    if (isBot || pauseRef.current) return;
    const requestScope = clockScopeRef.current;

    const { data: gameData, error } = await supabase
      .from('games')
      .select('config_deadline, is_paused')
      .eq('id', gameId)
      .maybeSingle();

    if (requestScope !== clockScopeRef.current || pauseRef.current || gameData?.is_paused) return;

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
  }, [gameId, isBot, scheduleConfigTimeout]);

  // Initial sync + resync when app returns to foreground (mobile browsers can pause timers)
  useEffect(() => {
    syncWithServerDeadline();
  }, [syncWithServerDeadline]);

  useEffect(() => {
    if (isBot) return;

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
  }, [isBot, syncWithServerDeadline]);

  // PRIMARY enforcement: the visible countdown reaching zero immediately fires
  // the timeout action on the active client. The setTimeout in scheduleConfigTimeout
  // is a SECONDARY backup (in case display ticking is paused by the OS). Server
  // edge/cron enforcement is TERTIARY. An active client visibly seeing the deadline
  // expire must never depend on background polling.
  useEffect(() => {
    if (isBot || isPaused) return;
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
  }, [isBot, isPaused, timeLeft !== null]);


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
            const exactGinConfig = resolveExactGinRummyRunBackConfig(previousGameConfig);
            if (!exactGinConfig) {
              throw new Error('The previous Gin Rummy configuration is incomplete');
            }
            config = exactGinConfig;
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
    if (selectionReason(gameTypeToSubmit)) return;
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

  const isHolmGame = selectedGameType === 'holm-game';
  // The setup scrim intentionally blocks the table header. Reuse its host-only
  // route action here so touch and keyboard users have the same pause access.
  const pauseControl = (isPaused || onTogglePause) ? (
    <div className="flex shrink-0 items-center justify-end gap-2">
      {isPaused && <Badge variant="secondary">Paused</Badge>}
      {onTogglePause && <Button variant="outline" size="sm" aria-label={isPaused ? 'Resume game' : 'Pause game'} onClick={() => void onTogglePause()}>{isPaused ? 'Resume' : 'Pause'}</Button>}
    </div>
  ) : null;

  const getGameDisplayName = (id:string) => findGame(id)?.name??id;

  const isDiceGame = (gameType: string) => {
    return gameType === 'horses' || gameType === 'ship-captain-crew' || gameType === 'yahtzee';
  };
  
  const isSimpleAnteGame = (gameType: string) => {
    return ['crib-lab','chucky-showdown'].includes(gameType) || gameType === 'canasta' || isDiceGame(gameType) || gameType === 'cribbage' || gameType === 'gin-rummy' || gameType === 'run21' || gameType === TRI_TOWERS.id || gameType === 'eleven-up' || gameType === 'royal-flash' || gameType === 'mega-card-golf' || gameType === 'six-card-golf' || gameType === 'race-poker' || gameType === 'battle-31' || gameType === 'quintzee' || gameType === 'chess' || gameType === 'ptown-words' || gameType === 'boxdrop' || gameType === 'trip-flip' || gameType === 'take-two';
  };

  const handleGameSelect = async (gameType: string) => {
    setExpandedSetting(null);
    if (selectionReason(gameType)) return;
    const generation = ++selectionGeneration.current;
    if (gameType === 'farkle') {
      if (!isFarkleLocalQualification(import.meta.env, window.location.hostname)) {
        try {
          const defaults = await loadFarkleAdminDefaults();
          if (generation !== selectionGeneration.current) return;
          setFarkleDraft({ stake: String(defaults.ante_amount), target: String(defaults.points_to_win), endgame: defaults.farkle_rules.endgame });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Could not load Farkle defaults');
          return;
        }
      }
      setSelectedGameType(gameType); setSelectionStep('config'); return;
    }
    if (gameType === 'run21' && !run21Allowed) return;
    if (gameType === 'canasta' && (!canastaAllowed||activeHumanCount<1)) return;
    if (gameType === 'battle-31' && (!battle31Allowed||activeHumanCount<1)) return;
    if(gameType==='chess'&&!chessAllowed)return;
    if (gameType === 'ptown-words' && !wordsAllowed) return;
    if (gameType === 'boxdrop' && (!boxdropAllowed||activeHumanCount<1)) return;
    if (gameType === 'trip-flip' && (!tripFlipAllowed||activeHumanCount<1)) return;
    if (gameType === 'take-two' && (!takeTwoAllowed||activeHumanCount<1)) return;
    if (gameType === 'royal-flash' && (!royalAllowed||activeHumanCount<1)) return;
    if (gameType === 'eleven-up' && (!elevenAllowed||activeHumanCount<1)) return;
    if (gameType === TRI_TOWERS.id && !triTowersAllowed) return;
    // Check player count restrictions
    const gameInfo = GAME_CATALOG.find(g => g.id === gameType);
    if (gameInfo?.players.max && activePlayerCount > gameInfo.players.max) {
      toast.error(`${gameInfo.name} requires ${gameInfo.players.max} or fewer players`);
      return;
    }
    
    // A card configuration must be fully resolved before its form appears.
    // Otherwise a prior non-card game can donate its zero-valued fields to a
    // 3-5-7/Holm form for one render or until the defaults request completes.
    if (gameType === 'holm-game' || gameType === '3-5-7') {
      const sessionConfig = sessionGameConfigs?.[gameType];
      let defaults = resolveSelectedCardGameConfig(
        gameType,
        sessionConfig,
        gameType === 'holm-game' ? holmDefaults : threeFiveSevenDefaults,
      );
      if (defaults) {
        applyDefaults(defaults);
      } else {

        const { data, error } = await supabase
          .from('game_defaults')
          .select('*')
          .eq('game_type', gameType === 'holm-game' ? 'holm' : '3-5-7')
          .single();
        if (generation !== selectionGeneration.current) return;
        if (error || !data) {
          toast.error(`Could not load ${gameType === 'holm-game' ? 'Holm' : '3-5-7'} settings`);
          return;
        }
        defaults = data;
        if (gameType === 'holm-game') {
          setHolmDefaults(data);
        } else {
          setThreeFiveSevenDefaults(data);
        }
        applyDefaults(defaults);
      }
      setSelectedGameType(gameType);
      setSelectionStep('config');
      return;
    }

    if (isSimpleAnteGame(gameType)) {
      // Fetch defaults for simple ante games (dice, cribbage, gin-rummy)
      const { data: gameDefaults } = await supabase
        .from('game_defaults')
        .select('ante_amount, points_to_win, skunk_enabled, skunk_threshold, double_skunk_enabled, double_skunk_threshold, per_point_value, gin_bonus, undercut_bonus, golf_holes')
        .eq('game_type', gameType)
        .single();
      if (generation !== selectionGeneration.current) return;
      
      if (gameType === 'mega-card-golf' && megaCatalog) setMegaConfig(megaCatalog.defaults);
      if (gameType === 'six-card-golf') setGolfHoles(golfHoleCount(gameDefaults?.golf_holes));
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
    if (generation !== selectionGeneration.current) return;
    setSelectedGameType(gameType);
    setSelectionStep('config');
  };

  const handleSimpleAnteGameSubmit = async (overrideGameType?: string) => {
    if (isSubmitting || hasSubmittedRef.current) return;

    const parsedAnte = Number(anteAmount);
    if (!Number.isInteger(parsedAnte) || parsedAnte < 1) {
      toast.error('Ante must be at least $1');
      return;
    }

    const gameTypeToSubmit = overrideGameType || selectedGameType;
    if (selectionReason(gameTypeToSubmit)) return;
    if (gameTypeToSubmit === 'battle-31' && (!battle31Allowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>2)) { toast.error('Battle 31 requires 2 players including a human'); return; }
    if (gameTypeToSubmit === 'canasta' && (!canastaAllowed||activeHumanCount<1||activePlayerCount!==2)) { toast.error('Canasta requires exactly 2 players including a human'); return; }
    if (gameTypeToSubmit === 'quintzee' && (!quintzeeAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>4)) { toast.error('Quintzee requires 2–4 players including a human, in fake money'); return; }
    if (gameTypeToSubmit === 'ptown-words' && (!wordsAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>4||realMoney)) { toast.error('Ptown Words requires 2–4 players including a human; fake money only'); return; }
    if (gameTypeToSubmit === 'boxdrop' && (!boxdropAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>2)) { toast.error('Boxdrop requires 2 players including a human'); return; }
    if (gameTypeToSubmit === 'trip-flip' && (!tripFlipAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>2)) { toast.error('Trip Flip requires 2 players including a human'); return; }
    if (gameTypeToSubmit === 'take-two' && (!takeTwoAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>7)) { toast.error('Take 2 requires 2–7 players including a human'); return; }
    if (gameTypeToSubmit === 'royal-flash' && (!royalAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>7)) { toast.error('Royal Flash requires 2–7 players including a human'); return; }
    if (gameTypeToSubmit === 'eleven-up' && (!elevenAllowed||activeHumanCount<1||activePlayerCount<2||activePlayerCount>7)) { toast.error('11 Up requires 2–7 players, including a human'); return; }
    if (gameTypeToSubmit === TRI_TOWERS.id && !triTowersAllowed) { toast.error('TriTowers is not released'); return; }
    if (gameTypeToSubmit === 'run21' && !run21Allowed) {
      toast.error('Run21 is unavailable');
      return;
    }
    const simpleTypes = new Set<DealerGameType>([
      'crib-lab','chucky-showdown','canasta', 'cribbage', 'gin-rummy', 'horses', 'ship-captain-crew', 'yahtzee', 'run21', 'tri-towers', 'eleven-up', 'royal-flash', 'take-two', 'trip-flip', 'battle-31', 'quintzee', 'chess', 'ptown-words', 'boxdrop', 'mega-card-golf', 'six-card-golf','race-poker',
    ]);
    if (!simpleTypes.has(gameTypeToSubmit as DealerGameType)) {
      toast.error('Select a supported game');
      return;
    }

    const gameType = gameTypeToSubmit as DealerGameType;
    const dealerGameConfig: Record<string, unknown> = { ante_amount: parsedAnte };
    if (gameType === 'mega-card-golf') {
      if (!megaConfig) throw new Error('Course configuration is unavailable');
      dealerGameConfig.mega=megaConfig;
    }
    if (gameType === 'six-card-golf') dealerGameConfig.holes = golfHoles;
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

  const handleRunBack = async () => {
    if (!previousGameType || selectionReason(previousGameType)) return;
    if (isSubmitting || hasSubmittedRef.current || !previousGameType) return;
    const exactConfig = previousGameConfig?.game_type === previousGameType
      ? resolveExactRunBackConfig(previousGameType, previousGameConfig.run_back_config) : null;
    if (!exactConfig) {
      toast.error('Previous settings are unavailable. Choose the game and settings again.');
      return;
    }
    if (previousGameType === 'gin-rummy') {
      resetStartupFlight('Gin Run It Back submit start');
      recordStartupFlight('PHASE TIMELINE', 'Gin Run It Back exact config submit start', {
        file: 'src/components/DealerGameSetup.tsx', function: 'handleRunBack', caller: 'Run Back button',
        gameId, gameType: previousGameType, dealerPlayerId,
      });
    }
    setIsSubmitting(true);
    hasSubmittedRef.current = true;
    try {
      // Read only the saved authoritative snapshot. React form setters do not
      // update the current handler's closure and must never prepare Run Back.
      const result = await commitSetup(previousGameType as DealerGameType, exactConfig, 'manual-authoritative-run-back');
      if (previousGameType === 'gin-rummy') {
        recordStartupFlight('STATUS TIMELINE', 'Gin Run It Back exact config committed', {
          file: 'src/components/DealerGameSetup.tsx', function: 'handleRunBack', caller: 'configure_dealer_game result',
          gameId, gameType: previousGameType, dealerGameId: result.dealer_game.id, status: result.game.status,
        });
      }
    } catch (error) {
      console.error('[RUN BACK] Atomic setup failed:', error);
      hasSubmittedRef.current = false;
      setIsSubmitting(false);
      toast.error(dealerSetupFailureMessage(error));
    }
  };

  const handleBackToGameSelection = () => {
    setSelectionStep('game');
  };

  const setting=(label:string,value:ReactNode,children:ReactNode)=><SettingRow key={label} label={label} value={value} open={expandedSetting===label} onToggle={()=>setExpandedSetting(old=>old===label?null:label)}>{children}</SettingRow>;
  const inlineSetting=(label:string,children:ReactNode)=><InlineSettingRow key={label} label={label}>{children}</InlineSettingRow>;
  const amount=(label:string,value:string,onChange:(value:string)=>void,min=1,max?:number,prefix='$')=><AmountControl label={label} value={value} onChange={onChange} min={min} max={max} prefix={prefix}/>;
  const optionalAmount=(label:string,enabled:boolean,toggle:(value:boolean)=>void,value:string,change:(value:string)=>void)=>setting(label,enabled?'$'+value:'Off',<div className="midnight-optional-controls"><ToggleRow label={label+' enabled'} checked={enabled} onChange={toggle}/>{enabled&&amount(label,value,change)}</div>);

  const heading=(title:string,instruction:string)=><header className="midnight-setup-heading">
    {selectionStep==='game'&&<img className="midnight-picker-crown" src="/game-branding/approved-picker-crown.webp" alt="Peoria Poker League"/>}
    <div className="midnight-setup-toolbar">{selectionStep==='config'?<small>PEORIA POKER LEAGUE</small>:<h2>{title}</h2>}<div className="midnight-setup-clock">{timeLeft!==null&&<Badge variant={timeLeft<=10?'destructive':'default'}><Timer className="w-4 h-4"/>{timeLeft}s</Badge>}{pauseControl}</div></div>
    <div className={'midnight-setup-identity'+(selectionStep==='config'?' midnight-scene-header':'')} data-scene-game={selectionStep==='config'?selectedGameType:undefined}>{selectionStep==='config'?<><div><h2>{title}</h2><p className="sr-only">{dealerUsername}, {instruction}</p></div><GameArtwork game={selectedGameType} surface="setup"/></>:<p className="sr-only">{dealerUsername}, {instruction}</p>}</div>
    {activeHarnessMap[selectedGameType]?.active&&<p className="text-red-400">Harness: {activeHarnessMap[selectedGameType].label}</p>}
  </header>;

  // Game selection step - tabbed layout with Cards vs Dice
  if (selectionStep === 'game') {
    return (
      <div
        data-dealer-game-setup-step="game-selection"
        data-dealer-game-setup-game-id={gameId}
        className="midnight-setup fixed inset-0 flex items-center justify-center"
        style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
      >
        <Card className="w-full max-w-2xl border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark max-h-[100%] overflow-y-auto">
          <CardContent className="p-3 space-y-3 sm:p-5">
            {heading('Choose a game','choose game type')}

            <DealerGamePicker previousGame={previousGameType} roster={catalogRoster} access={catalogAccess} onSelect={handleGameSelect} harnesses={activeHarnessMap}/>

            {/* Run Back option - only show on 2nd+ game of session */}
            {!isFirstHand && previousGameType && previousGameConfig && !!findGame(previousGameType) && isDiscovered(findGame(previousGameType)!, catalogAccess) && (
              <div className="pt-3 border-t border-poker-gold/30">
                <button
                  onClick={handleRunBack}
                  disabled={isSubmitting || !!previousGameType && !!selectionReason(previousGameType)}
                  title={previousGameType ? selectionReason(previousGameType)??undefined : undefined}
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
            <div className="midnight-footer">
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
  if (selectionStep === 'config' && selectedGameType === 'farkle') {
    const localTest = isAdmin && isFarkleLocalQualification(import.meta.env, window.location.hostname);
    const submitFarkleSetup = async () => {
      if (hasSubmittedRef.current) return;
      try {
        const config = (localTest ? farkleLocalSetup : farkleProductionSetup)(farkleDraft.stake, farkleDraft.target, farkleDraft.endgame);
        hasSubmittedRef.current = true;
        setIsSubmitting(true);
        await commitSetup('farkle', config, localTest ? 'isolated-test-only-setup' : 'approved-production-setup');
      } catch (error) {
        hasSubmittedRef.current = false;
        setIsSubmitting(false);
        toast.error(error instanceof Error ? error.message : dealerSetupFailureMessage(error));
      }
    };
    return <div className="midnight-setup fixed inset-0 flex items-center justify-center" style={{ zIndex: SHELL_Z.MODAL_OVERLAY }} data-dealer-game-setup-step="config" data-dealer-game-setup-selected-game="farkle">
      <Card className="w-full max-w-md border-poker-gold bg-poker-felt"><CardContent className="space-y-4 p-6">
        {heading('Farkle','configure your game')}
        <div className="midnight-settings">
 {inlineSetting('Match Stake',amount('Stake',farkleDraft.stake,stake=>setFarkleDraft({...farkleDraft,stake})))}
 {inlineSetting('Target Score',<Input aria-label="Target Score" value={farkleDraft.target} inputMode="numeric" onChange={e=>setFarkleDraft({...farkleDraft,target:e.target.value})}/>)}
 {inlineSetting('Endgame',<select aria-label="Endgame" value={farkleDraft.endgame} onChange={e=>setFarkleDraft({...farkleDraft,endgame:e.target.value as FarkleEndgame})}>{Object.entries(FARKLE_ENDGAME_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>)}
</div>
        {localTest&&<p className="text-sm text-amber-200">TEST ONLY: isolated local scoring configuration.</p>}
        <div className="midnight-footer"><Button variant="outline" onClick={() => setSelectionStep('game')}>Back</Button><Button disabled={isSubmitting || !!selectionReason("farkle")} onClick={submitFarkleSetup}>{localTest ? 'Start TEST ONLY Game' : 'Start Game'}</Button></div>
      </CardContent></Card>
    </div>;
  }
  if (selectionStep === 'config') {
    // Simple ante games only need ante configuration.
    if (isSimpleAnteGame(selectedGameType)) {
      const isCribbage = selectedGameType === 'cribbage';
      const isGinRummy = selectedGameType === 'gin-rummy';
      
      const gameDisplayName=findGame(selectedGameType)?.name??selectedGameType;
      const stakeLabel=['horses','ship-captain-crew','yahtzee','cribbage','gin-rummy'].includes(selectedGameType)?'Ante':'Match Stake';
      const cribLabels:Record<string,string>={full:'Full',half:'Half (61 points)',super_quick:'Quick',sprint:'Sprint',custom:'Custom'};

      return (
        <div
          data-dealer-game-setup-step="config"
          data-dealer-game-setup-game-id={gameId}
          data-dealer-game-setup-selected-game={selectedGameType}
          className="midnight-setup fixed inset-0 flex items-center justify-center"
          style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
        >
          {/* Shared compact configuration surface; expanded editors retain their controls. */}
          <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark flex flex-col max-h-full">
            <CardContent className="pt-6 pb-6 flex min-h-0 flex-1 flex-col gap-4">
              {heading(gameDisplayName,'configure your game')}

              <div className="midnight-setup-body min-h-0 flex-1">
                <div className="midnight-settings">
                {inlineSetting(stakeLabel,amount(stakeLabel==='Ante'?'Ante ($)':'Match stake ($)',anteAmount,setAnteAmount))}
                {selectedGameType==='mega-card-golf'&&megaCatalog&&megaConfig&&setting('Course',megaConfig.course.name,<MegaCompetitionSettings courses={megaCatalog.courses} value={megaConfig} onChange={setMegaConfig}/>)}
                {selectedGameType==='six-card-golf'&&inlineSetting('Match length',<select id="golf-match-length" aria-label="Match length" value={golfHoles} onChange={e=>setGolfHoles(golfHoleCount(Number(e.target.value)))}>{GOLF_HOLE_COUNTS.map(n=><option key={n} value={n}>{n} holes</option>)}</select>)}
                {isCribbage&&<>
                  {inlineSetting('Game Mode',<select aria-label="Game Mode" value={cribbageGameMode} onChange={e=>setCribbageGameMode(e.target.value as import('@/lib/cribbageTypes').CribbageGameMode)}>{CRIBBAGE_GAME_MODES.map(mode=><option key={mode.id} value={mode.id}>{cribLabels[mode.id]} — {mode.description}</option>)}</select>)}
                  {cribbageGameMode==='custom'&&inlineSetting('Points to Win',<Input aria-label="Points to Win" type="number" min="1" value={customPointsToWin} onChange={e=>setCustomPointsToWin(e.target.value)}/>)}
                  {cribbageGameMode!=='sprint'&&cribbageGameMode!=='custom'&&<ToggleRow label="Skunks" description="2× & 3× payout multipliers" checked={skunksEnabled} onChange={setSkunksEnabled}/>}
                </>}
                {isGinRummy&&<>
                  {inlineSetting('Match Target',<select aria-label="Match Target" value={ginRummyPointsToWin} onChange={e=>setGinRummyPointsToWin(Number(e.target.value))}><option value={100}>Standard — 100 pts</option><option value={50}>Short — 50 pts</option></select>)}
                  {inlineSetting('Per-Point Value',amount('Per-Point Value ($)',String(ginRummyPerPointValue),v=>setGinRummyPerPointValue(parseInt(v)||0),0))}
                  {inlineSetting('Gin',amount('Gin (pts)',String(ginRummyGinBonus),v=>setGinRummyGinBonus(parseInt(v)||0),0,undefined,''))}
                  {inlineSetting('Undercut',amount('Undercut (pts)',String(ginRummyUndercutBonus),v=>setGinRummyUndercutBonus(parseInt(v)||0),0,undefined,''))}
                </>}
                </div>
              </div>

              <div className="midnight-footer shrink-0">
                <button
                  onClick={handleBackToGameSelection}
                  className="flex-1 p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
                >
                  ← Back
                </button>
                <Button
                  data-dealer-game-start={selectedGameType}
                  onClick={() => handleSimpleAnteGameSubmit()}
                  disabled={isSubmitting || !!selectionReason(selectedGameType)}
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
      className="midnight-setup fixed inset-0 flex items-center justify-center"
      style={{ zIndex: SHELL_Z.MODAL_OVERLAY }}
    >
      <Card className="w-full max-w-lg border-poker-gold border-4 bg-gradient-to-br from-poker-felt to-poker-felt-dark flex flex-col max-h-full">
        <CardContent className="pt-6 pb-6 flex min-h-0 flex-1 flex-col gap-4">
          {heading(findGame(selectedGameType)?.name??selectedGameType,'configure your game')}

          <div className="midnight-setup-body min-h-0 flex-1">
            <div className="midnight-settings">
              {inlineSetting('Ante',amount('Ante ($)',anteAmount,setAnteAmount))}
              {selectedGameType==='holm-game'&&inlineSetting('Chucky Cards',amount('Chucky Cards',chuckyCards,setChuckyCards,2,7,''))}
              {selectedGameType==='3-5-7'&&<>
                {inlineSetting('Leg Value',amount('Leg Value ($)',legValue,setLegValue))}
                {inlineSetting('Rollover',amount('Rollover ($)',rolloverAmount,setRolloverAmount))}
                {inlineSetting('Legs to Win',amount('Legs to Win',legsToWin,setLegsToWin,1,undefined,''))}
              </>}
              {optionalAmount('Pussy Tax',pussyTaxEnabled,setPussyTaxEnabled,pussyTaxValue,setPussyTaxValue)}
              {optionalAmount('Pot Max',potMaxEnabled,setPotMaxEnabled,potMaxValue,setPotMaxValue)}
              {selectedGameType==='holm-game'?<ToggleRow label="Rabbit Hunt" description="Show hidden cards when everyone folds" checked={rabbitHunt} onChange={setRabbitHunt}/>:<ToggleRow label="Secret Reveal at Showdown" description="In rounds 1–2, players who stay can see each other's cards" checked={revealAtShowdown} onChange={setRevealAtShowdown}/>}
            </div>
          </div>

          <div className="midnight-footer shrink-0">
            {/* Back Button */}
            <button
              onClick={handleBackToGameSelection}
              className="w-full p-3 rounded-lg border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              ← Back
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
