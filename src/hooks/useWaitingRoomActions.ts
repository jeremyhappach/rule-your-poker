/**
 * useWaitingRoomActions — shared waiting-room action hook.
 *
 * Owns the bot-add queue, the start-game trigger, and the invite
 * action. Consumed by BOTH the legacy `WaitingForPlayersTable`
 * (poker-variant family) and the canonical shell `CanonicalShellWaitingSurface`
 * (Cribbage / Gin Rummy / Yahtzee). Single source of truth so the two
 * surfaces cannot drift in behavior.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AggressionLevel } from "@/lib/botHandStrength";
import { generateUUID } from "@/lib/uuid";
import { logBotAdded } from "@/lib/sessionEventLog";
import { PerfSession } from "@/lib/perf";
import { useDoorbellSound } from "@/hooks/useDoorbellSound";
import { getNextBotNumber, makeBotUsername } from "@/lib/botNaming";
import { recordLifecycleTimelineEvent } from "@/lib/canonicalShell/announcements/announcementDebugLog";

const BOT_AGGRESSION_WEIGHTS: { level: AggressionLevel; weight: number }[] = [
  { level: "very_conservative", weight: 5 },
  { level: "conservative", weight: 20 },
  { level: "normal", weight: 50 },
  { level: "aggressive", weight: 20 },
  { level: "very_aggressive", weight: 5 },
];

function getAggressionLevelForBotId(botId: string): AggressionLevel {
  let hash = 2166136261;
  for (let i = 0; i < botId.length; i++) {
    hash ^= botId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bucket0to99 = (hash >>> 0) % 100;
  let r = bucket0to99;
  for (const { level, weight } of BOT_AGGRESSION_WEIGHTS) {
    r -= weight;
    if (r < 0) return level;
  }
  return "normal";
}

export interface WaitingRoomActor {
  id?: string;
  user_id: string;
  position: number;
  is_bot: boolean;
  sitting_out: boolean;
  waiting?: boolean;
  status?: string;
  created_at?: string;
}

export interface UseWaitingRoomActionsArgs {
  gameId: string;
  players: WaitingRoomActor[];
  currentUserId: string | undefined;
  realMoney?: boolean;
  onGameStart: () => void;
  onBotAdded?: () => void;
  onRejoinRequested?: () => void;
}

export interface UseWaitingRoomActions {
  isObserver: boolean;
  isSeated: boolean;
  isHost: boolean;
  hasEnoughPlayers: boolean;
  hasOpenSeats: boolean;
  seatedPlayerCount: number;
  isAddingBot: boolean;
  viewerNeedsRejoin: boolean;
  viewerIsWaitingToRejoin: boolean;
  isRejoining: boolean;
  handleInvite: () => void;
  handleAddBot: () => void;
  handleStartGame: () => void;
  handleRejoin: () => void;
}

export function useWaitingRoomActions({
  gameId,
  players,
  currentUserId,
  realMoney = false,
  onGameStart,
  onBotAdded,
  onRejoinRequested,
}: UseWaitingRoomActionsArgs): UseWaitingRoomActions {
  const { playDoorbell } = useDoorbellSound();

  const gameStartTriggeredRef = useRef(false);
  const previousPlayerCountRef = useRef(0);
  const [isAddingBot, setIsAddingBot] = useState(false);

  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const addBotQueueRef = useRef(0);
  const addBotProcessingRef = useRef(false);
  const reservedBotPositionsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const occupied = new Set(players.map((p) => p.position));
    for (const pos of reservedBotPositionsRef.current) {
      if (occupied.has(pos)) reservedBotPositionsRef.current.delete(pos);
    }
  }, [players]);

  const currentPlayer = players.find((p) => p.user_id === currentUserId);
  const isSeated = !!currentPlayer;
  const isObserver = !currentPlayer;

  const humanPlayers = players.filter((p) => !p.is_bot);
  const sortedByJoinTime = [...humanPlayers].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const hostPlayer = sortedByJoinTime[0];
  const isHost = !!currentPlayer && hostPlayer?.user_id === currentUserId;

  // Only count seats whose participation intent is actively in/for the next
  // hand. Recovery waiting (after a session sit-out) leaves players with
  // status='observer'/'left' or sitting_out=true; those must NOT satisfy
  // Start Game preconditions until they explicitly rejoin (waiting=true).
  const seatedPlayerCount = players.filter((p) => {
    if (p.status === "observer" || p.status === "left") return false;
    return p.waiting === true || !p.sitting_out;
  }).length;
  const hasEnoughPlayers = seatedPlayerCount >= 2;
  const hasOpenSeats = players.length < 7;

  // Rejoin affordance — viewer is seated but currently sat out and not
  // already queued to rejoin. This is the recovery-waiting signal.
  const viewerNeedsRejoin =
    !!currentPlayer &&
    currentPlayer.sitting_out === true &&
    currentPlayer.waiting !== true;
  const viewerIsWaitingToRejoin =
    !!currentPlayer &&
    currentPlayer.sitting_out === true &&
    currentPlayer.waiting === true;
  const [isRejoining, setIsRejoining] = useState(false);

  // Doorbell on new human joins
  useEffect(() => {
    if (previousPlayerCountRef.current > 0 && players.length > previousPlayerCountRef.current) {
      const prevCount = previousPlayerCountRef.current;
      const newPlayers = players.slice(-Math.max(0, players.length - prevCount));
      if (newPlayers.some((p) => !p.is_bot)) playDoorbell();
    }
    previousPlayerCountRef.current = players.length;
  }, [players.length, players, playDoorbell]);

  const addSingleBot = useCallback(async (): Promise<boolean> => {
    // [ADD_BOT_TRACE] Force-on instrumentation while investigating the
    // 30s post-announcement-provider regression. Every phase logs with
    // a wall-clock delta so we can see exactly where the delay sits
    // (network round-trip vs React render churn vs realtime callback).
    const tStart = performance.now();
    const tag = `[ADD_BOT_TRACE ${Math.random().toString(36).slice(2, 6)}]`;
    const mark = (phase: string, extra?: Record<string, unknown>) => {
      const dt = Math.round(performance.now() - tStart);
      // eslint-disable-next-line no-console
      console.warn(`${tag} +${dt}ms ${phase}`, extra ?? {});
      recordLifecycleTimelineEvent(`add_bot:${phase}`, { tag, dtMs: dt, gameId: gameId?.slice(0, 8), ...(extra ?? {}) });
    };
    mark("addSingleBot:enter", { gameId });
    const perf = new PerfSession("WaitingRoom.addSingleBot", 0);

    const { data: dbPlayers, error: fetchError } = await perf.step(
      "players.selectPositions",
      () => supabase.from("players").select("position").eq("game_id", gameId),
    );
    mark("players.selectPositions:done", { count: dbPlayers?.length, err: fetchError?.message });

    if (fetchError) {
      console.error("Error fetching players for bot add:", fetchError);
      toast.error("Failed to check available seats");
      perf.done({ error: fetchError.message });
      return false;
    }

    if ((dbPlayers?.length ?? 0) >= 7) {
      toast.error("Table is full");
      perf.done({ error: "table_full" });
      return false;
    }

    const occupiedPositions = new Set((dbPlayers ?? []).map((p) => p.position));
    for (const pos of reservedBotPositionsRef.current) occupiedPositions.add(pos);

    const openPositions = [1, 2, 3, 4, 5, 6, 7].filter(
      (pos) => !occupiedPositions.has(pos),
    );

    if (openPositions.length === 0) {
      toast.error("No open seats available");
      perf.done({ error: "no_open_seats" });
      return false;
    }

    const nextPosition = openPositions[Math.floor(Math.random() * openPositions.length)];
    reservedBotPositionsRef.current.add(nextPosition);

    let succeeded = false;
    let botNameForToast = "Bot";

    try {
      const botId = generateUUID();
      const aggressionLevel = getAggressionLevelForBotId(botId);

      // Single source of truth for bot display names. `getBotAlias` will
      // override at render anyway, but writing canonical "Bot N" at
      // insertion eliminates the brief "Bot {hex}" flash on any path
      // that reads `profiles.username` before the alias resolver runs.
      const existingUsernames = (playersRef.current ?? [])
        .filter((p) => p.is_bot)
        .map((p: any) => p?.profiles?.username ?? null);
      const nextNumber = getNextBotNumber(existingUsernames);
      let botName = makeBotUsername({ nextNumber, botId, forceUniqueSuffix: false });
      botNameForToast = botName;

      const { error: profileError } = await perf.step("profiles.insert", () =>
        supabase.from("profiles").insert({
          id: botId,
          username: botName,
          aggression_level: aggressionLevel,
        }),
      );
      mark("profiles.insert:done", { err: profileError?.message });

      if (profileError) {
        if (profileError.code === "23505") {
          botName = makeBotUsername({ nextNumber, botId, forceUniqueSuffix: true });
          botNameForToast = botName;
          const { error: retryError } = await perf.step("profiles.insert.retry", () =>
            supabase.from("profiles").insert({
              id: botId,
              username: botName,
              aggression_level: aggressionLevel,
            }),
          );
          mark("profiles.insert.retry:done", { err: retryError?.message });
          if (retryError) throw new Error(`Failed to create bot profile: ${retryError.message}`);
        } else {
          throw new Error(`Failed to create bot profile: ${profileError.message}`);
        }
      }

      const { error: playerError } = await perf.step("players.insert", () =>
        supabase.from("players").insert({
          user_id: botId,
          game_id: gameId,
          position: nextPosition,
          chips: 0,
          is_bot: true,
          status: "active",
          sitting_out: false,
          waiting: true,
        }),
      );
      mark("players.insert:done", { err: playerError?.message });

      if (playerError) throw new Error(`Failed to add bot: ${playerError.message}`);

      await perf.step("session_events.insert", () =>
        logBotAdded(gameId, currentUserId, nextPosition, botNameForToast),
      );
      mark("session_events.insert:done");

      succeeded = true;
      onBotAdded?.();
      perf.done({ ok: true, nextPosition });
      mark("addSingleBot:exit-ok");
      return true;
    } catch (error: any) {
      console.error("Error adding bot:", error);
      toast.error(error?.message ? `Bot add failed: ${error.message}` : "Bot add failed");
      perf.done({ error: error?.message ?? "unknown" });
      mark("addSingleBot:exit-error", { err: error?.message });
      return true;
    } finally {
      if (!succeeded) reservedBotPositionsRef.current.delete(nextPosition);
    }
  }, [gameId, currentUserId, onBotAdded]);

  const processAddBotQueue = useCallback(async () => {
    if (addBotProcessingRef.current) return;
    const tQueueStart = performance.now();
    // eslint-disable-next-line no-console
    console.warn("[ADD_BOT_TRACE] processAddBotQueue:enter", { queueLen: addBotQueueRef.current });
    addBotProcessingRef.current = true;
    setIsAddingBot(true);
    try {
      while (addBotQueueRef.current > 0) {
        addBotQueueRef.current -= 1;
        const didStart = await addSingleBot();
        if (!didStart) break;
      }
    } finally {
      addBotProcessingRef.current = false;
      setIsAddingBot(false);
      // eslint-disable-next-line no-console
      console.warn(
        `[ADD_BOT_TRACE] processAddBotQueue:exit total=${Math.round(performance.now() - tQueueStart)}ms`,
      );
    }
  }, [addSingleBot]);


  const handleAddBot = useCallback(() => {
    if (addBotProcessingRef.current || isAddingBot) return;
    if (realMoney) {
      toast.error("Bots are disabled for real money sessions");
      return;
    }
    if (!isSeated) {
      toast.error("Sit down first, then add a bot");
      return;
    }
    if (!isHost) {
      toast.error("Only the host can add bots");
      return;
    }
    if (playersRef.current.length >= 7) {
      toast.error("Table is full");
      return;
    }
    addBotQueueRef.current += 1;
    void processAddBotQueue();
  }, [isAddingBot, isSeated, isHost, realMoney, processAddBotQueue]);

  const handleStartGame = useCallback(() => {
    if (!hasEnoughPlayers || gameStartTriggeredRef.current) return;
    gameStartTriggeredRef.current = true;
    console.log("🃏 SHUFFLE UP AND DEAL! 🃏");
    setTimeout(() => onGameStart(), 500);
  }, [hasEnoughPlayers, onGameStart]);

  const handleInvite = useCallback(() => {
    const gameUrl = window.location.href;
    navigator.clipboard
      .writeText(gameUrl)
      .then(() => toast.success("Game link copied to clipboard!"))
      .catch(() => toast.info(`Share this link: ${gameUrl}`));
  }, []);

  const handleRejoin = useCallback(async () => {
    if (!currentPlayer?.id || isRejoining) return;
    setIsRejoining(true);
    try {
      const { handlePlayerRejoin } = await import("@/lib/playerStateEvaluation");
      const ok = await handlePlayerRejoin(currentPlayer.id);
      if (ok) {
        onRejoinRequested?.();
      } else {
        toast.error("Failed to rejoin");
      }
    } finally {
      setIsRejoining(false);
    }
  }, [currentPlayer?.id, isRejoining, onRejoinRequested]);

  return {
    isObserver,
    isSeated,
    isHost,
    hasEnoughPlayers,
    hasOpenSeats,
    seatedPlayerCount,
    isAddingBot,
    viewerNeedsRejoin,
    viewerIsWaitingToRejoin,
    isRejoining,
    handleInvite,
    handleAddBot,
    handleStartGame,
    handleRejoin,
  };
}
