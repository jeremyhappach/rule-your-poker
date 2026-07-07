import { useEffect, useRef, useState } from "react";
import { MobileGameTable } from "./MobileGameTable";

import { Button } from "@/components/ui/button";
import { Share2, Bot, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { AggressionLevel } from "@/lib/botHandStrength";
import { generateUUID } from "@/lib/uuid";
import { logBotAdded } from "@/lib/sessionEventLog";
import { PerfSession } from "@/lib/perf";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useDoorbellSound } from "@/hooks/useDoorbellSound";
import { getNextBotNumber, makeBotUsername } from "@/lib/botNaming";
import {
  useWaitingMount,
  recordWaitingLifecycle,
  recordSurfaceOwnership,
} from "@/lib/canonicalShell/waitingTableFlight";
import { useAnnouncements } from "@/lib/canonicalShell/announcements";
import { formatChipValue } from "@/lib/utils";
import { ensureChatFlightRecorderArmed } from "@/lib/chatFlightRecorder";

// Keep bot aggression level distribution consistent with the rest of the app.
const BOT_AGGRESSION_WEIGHTS: { level: AggressionLevel; weight: number }[] = [
  { level: "very_conservative", weight: 5 },
  { level: "conservative", weight: 20 },
  { level: "normal", weight: 50 },
  { level: "aggressive", weight: 20 },
  { level: "very_aggressive", weight: 5 },
];

function getAggressionLevelForBotId(botId: string): AggressionLevel {
  // Stable pseudo-random selection from UUID to avoid relying on Math.random.
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
  waiting?: boolean;
  created_at?: string;
  profiles?: {
    username: string;
  };
}

interface ChatBubble {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
}

interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  username?: string;
}

interface WaitingForPlayersTableProps {
  gameId: string;
  players: Player[];
  currentUserId: string | undefined;
  onSelectSeat: (position: number) => void;
  onGameStart: () => void;
  chatBubbles?: ChatBubble[];
  allMessages?: ChatMessage[];
  onSendChat?: (message: string, imageFile?: File) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  onLeaveGameNow?: () => void;
  realMoney?: boolean;
  onBotAdded?: () => void;
}

export const WaitingForPlayersTable = ({
  gameId,
  players,
  currentUserId,
  onSelectSeat,
  onGameStart,
  chatBubbles = [],
  allMessages = [],
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onLeaveGameNow,
  realMoney = false,
  onBotAdded,
}: WaitingForPlayersTableProps) => {
  // Prevent screen from dimming while waiting for players
  useWakeLock(true);
  
  // Doorbell sound when new player joins
  const { playDoorbell } = useDoorbellSound();
  
  const gameStartTriggeredRef = useRef(false);
  const previousPlayerCountRef = useRef(0);
  const [isAddingBot, setIsAddingBot] = useState(false);

  // ── Waiting-table flight recorder (instrumentation only) ────────
  useWaitingMount('WaitingTable', {
    impl: 'WaitingForPlayersTable',
    gameId,
    playerCount: players.length,
  });
  useEffect(() => {
    recordWaitingLifecycle('WaitingTable ready (poker-variant)', {
      gameId,
      playerCount: players.length,
      seatedCount: players.filter(p => p.position != null).length,
      realMoney,
    });
    recordSurfaceOwnership('WaitingTable', {
      SeatOwner: 'Shell:MobileGameTable seat clusters',
      ChipOwner: 'Shell:CanonicalChipDisc (via MobileGameTable)',
      ControlOwner: 'Slot:WaitingForPlayersTable (Invite/AddBot/Start)',
      AnnouncementOwner: 'Shell:CanonicalAnnouncementProvider rail',
      HUDOwner: 'Shell:ShellTabBar via MobileGameTable',
    }, { gameId, impl: 'WaitingForPlayersTable' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playersRef = useRef<Player[]>(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const addBotQueueRef = useRef(0);
  const addBotProcessingRef = useRef(false);
  const reservedBotPositionsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    // As soon as the backend/poll shows a position as occupied, release any local reservation.
    const occupied = new Set(players.map((p) => p.position));
    for (const pos of reservedBotPositionsRef.current) {
      if (occupied.has(pos)) reservedBotPositionsRef.current.delete(pos);
    }
  }, [players]);

  // Check if current user is seated
  const currentPlayer = players.find((p) => p.user_id === currentUserId);
  const isSeated = !!currentPlayer;

  // Host is the first human player who joined (earliest created_at)
  const humanPlayers = players.filter((p) => !p.is_bot);
  const sortedByJoinTime = [...humanPlayers].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const hostPlayer = sortedByJoinTime[0];
  const isHost = currentPlayer && hostPlayer?.user_id === currentUserId;

  // Count seated players (active or waiting to play)
  const seatedPlayerCount = players.filter((p) => p.waiting === true || !p.sitting_out).length;
  const hasEnoughPlayers = seatedPlayerCount >= 2;
  const hasOpenSeats = players.length < 7;

  // Add bot for waiting phase (joins as active, ready to play)
  // Users may tap quickly to add multiple bots, so we queue requests and reserve positions locally
  // to prevent collisions before the next poll updates the players list.
  const enqueueAddBot = () => {
    // Guard against double-tap / repeated clicks while a bot add is in-flight.
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

    const currentPlayers = playersRef.current;
    if (currentPlayers.length >= 7) {
      toast.error("Table is full");
      return;
    }

    addBotQueueRef.current += 1;
    void processAddBotQueue();
  };

  const processAddBotQueue = async () => {
    if (addBotProcessingRef.current) return;
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
    }
  };

  const addSingleBot = async (): Promise<boolean> => {
    const perf = new PerfSession("WaitingForPlayersTable.addSingleBot", 300);

    // CRITICAL: Fetch actual positions from DB to avoid stale state causing duplicate key errors
    const { data: dbPlayers, error: fetchError } = await perf.step("players.selectPositions", () =>
      supabase.from("players").select("position").eq("game_id", gameId)
    );

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

    // Find open positions using fresh DB data + locally reserved positions
    const occupiedPositions = new Set((dbPlayers ?? []).map((p) => p.position));
    for (const pos of reservedBotPositionsRef.current) occupiedPositions.add(pos);

    const allPositions = [1, 2, 3, 4, 5, 6, 7];
    const openPositions = allPositions.filter((pos) => !occupiedPositions.has(pos));

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

      // Canonical "Bot N" naming at insertion time — same source of
      // truth that `botPlayer.ts` and `useWaitingRoomActions` use. Avoids
      // any window where DB rows carry "Bot {hex}" before `getBotAlias`
      // overrides at render.
      const existingUsernames = (playersRef.current ?? [])
        .filter((p) => p.is_bot)
        .map((p) => p?.profiles?.username ?? null);
      const nextNumber = getNextBotNumber(existingUsernames);
      let botName = makeBotUsername({ nextNumber, botId, forceUniqueSuffix: false });
      botNameForToast = botName;

      const { error: profileError } = await perf.step("profiles.insert", () =>
        supabase.from("profiles").insert({
          id: botId,
          username: botName,
          aggression_level: aggressionLevel,
        })
      );

      if (profileError) {
        if (profileError.code === "23505") {
          botName = makeBotUsername({ nextNumber, botId, forceUniqueSuffix: true });
          botNameForToast = botName;

          const { error: retryError } = await perf.step("profiles.insert.retry", () =>
            supabase.from("profiles").insert({
              id: botId,
              username: botName,
              aggression_level: aggressionLevel,
            })
          );

          if (retryError) {
            throw new Error(`Failed to create bot profile: ${retryError.message}`);
          }
        } else {
          throw new Error(`Failed to create bot profile: ${profileError.message}`);
        }
      }

      // Create bot player - active and ready to play (not sitting out)
      const { error: playerError } = await perf.step("players.insert", () =>
        supabase.from("players").insert({
          user_id: botId,
          game_id: gameId,
          position: nextPosition,
          chips: 0,
          is_bot: true,
          status: "active",
          sitting_out: false,
          waiting: true, // Waiting to start game
        })
      );

      if (playerError) {
        throw new Error(`Failed to add bot: ${playerError.message}`);
      }

      // Log bot addition event
      await perf.step("session_events.insert", () => logBotAdded(gameId, currentUserId, nextPosition, botNameForToast));

      succeeded = true;
      // Immediately notify parent to refetch - don't wait for realtime
      onBotAdded?.();
      perf.done({ ok: true, nextPosition });
      return true;
    } catch (error: any) {
      console.error("Error adding bot:", error);
      toast.error(error?.message ? `Bot add failed: ${error.message}` : "Bot add failed");
      perf.done({ error: error?.message ?? "unknown" });
      return true; // keep queue moving, user can tap again
    } finally {
      // Only release reservation on failure; on success we'll release once players update.
      if (!succeeded) reservedBotPositionsRef.current.delete(nextPosition);
    }
  };

  // Handle host clicking Start Game button
  const handleStartGame = () => {
    if (!hasEnoughPlayers || gameStartTriggeredRef.current) return;
    
    gameStartTriggeredRef.current = true;
    
    console.log('🃏 SHUFFLE UP AND DEAL! 🃏');
    
    // Small delay to let players see the announcement
    setTimeout(() => {
      onGameStart();
    }, 500);
  };

  // Track player count and play doorbell when new human player joins
  useEffect(() => {
    // Only play if count increased (not on initial mount or when players leave)
    if (previousPlayerCountRef.current > 0 && players.length > previousPlayerCountRef.current) {
      // Check if the new player(s) are human (not bots we just added)
      const prevCount = previousPlayerCountRef.current;
      const newPlayers = players.slice(-Math.max(0, players.length - prevCount));
      const hasNewHuman = newPlayers.some(p => !p.is_bot);
      
      if (hasNewHuman) {
        playDoorbell();
      }
    }
    previousPlayerCountRef.current = players.length;
  }, [players.length, players, playDoorbell]);

  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl).then(() => {
      toast.success("Game link copied to clipboard!");
    }).catch(() => {
      toast.info(`Share this link: ${gameUrl}`);
    });
  };

  // Check if user is an observer (not seated)
  const isObserver = !currentPlayer;

  // Felt slot content — passive informational message only.
  // No buttons, no invite controls, no bot controls, no start-game.
  // Those live in the Active Player Content Pane (bottom HUD).
  const renderFeltMessage = () => {
    const playerWord = seatedPlayerCount === 1 ? "Player" : "Players";
    return (
      <div className="absolute left-0 right-0 flex justify-center z-10 pointer-events-none top-[18%]">
        <div className="bg-black/55 backdrop-blur-sm rounded-xl px-5 py-2.5 border border-amber-600/40">
          <p className="text-amber-200 font-semibold text-base tracking-wide">
            {seatedPlayerCount} {playerWord} Seated
          </p>
        </div>
      </div>
    );
  };

  // Active Player Content Pane — gameplay actions for the waiting table.
  // Dealer (host): Invite + Add Bot + Start Game (Start hidden until 2+ seated).
  // Non-dealer: Share only.
  const renderActivePane = () => {
    // Identity is owned canonically by PreSessionSeatLayer →
    // CanonicalSeatCluster (felt). No bespoke identity row here.


    if (!isHost) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-start gap-4 pt-3">
          <div className="w-full flex flex-col items-center justify-start gap-3">
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {hasEnoughPlayers
                ? "Waiting for host to start the game."
                : "Share the table link to invite more players."}
            </p>
            <Button
              onClick={handleInvite}
              className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      );
    }


    return (
      <div className="h-full w-full flex flex-col items-center justify-start gap-4 pt-3">
        <div className="w-full flex flex-col items-center justify-start gap-3">
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            {hasEnoughPlayers
              ? "Ready when you are."
              : "Add a bot or invite a friend to fill the table."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={handleInvite}
              className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Invite
            </Button>
            {hasOpenSeats && !realMoney && (
              <Button
                type="button"
                disabled={isAddingBot}
                aria-busy={isAddingBot}
                onClick={(e) => {
                  e.currentTarget.blur();
                  enqueueAddBot();
                }}
                className="bg-[hsl(220_45%_14%)] hover:bg-[hsl(220_45%_20%)] text-amber-200 border-2 border-amber-500 font-bold shadow-lg shadow-black/40 disabled:opacity-70"
              >
                {isAddingBot ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4 mr-2" />
                    Add Bot
                  </>
                )}
              </Button>
            )}
            {hasEnoughPlayers && (
              <Button
                data-start-game-btn
                onClick={handleStartGame}
                className="bg-poker-chip-green hover:bg-poker-chip-green/80 text-white border-2 border-poker-chip-green font-bold shadow-lg shadow-black/40"
              >
                🃏 Start Game
              </Button>
            )}
          </div>
        </div>
        
      </div>
    );
  };

  // Canonical announcement rail — "Waiting for Players" / "Ready to Start!".
  // Persistent ambient for the entire waiting phase; cleared on unmount.
  //
  // CRITICAL: The announcements context value re-identifies whenever ambient/
  // transient state changes. If we depend on `announcements` directly, then
  // emit() → ambient state change → context value re-identifies → effect
  // re-runs → cleanup calls clearAmbient → ambient state change → context
  // value re-identifies → ... → "Maximum update depth exceeded" → the
  // RouteErrorBoundary catches → <Game> remounts → bootstrap shell re-enters
  // mid-route. Stash the context in a ref and depend only on primitives so
  // the effect runs once per (gameId, hasEnoughPlayers, seatedPlayerCount)
  // change rather than once per ambient mutation.
  const announcements = useAnnouncements();
  const announcementsRef = useRef(announcements);
  useEffect(() => {
    announcementsRef.current = announcements;
  }, [announcements]);
  useEffect(() => {
    if (!gameId) return;
    const id = `${gameId}:waiting-table:${hasEnoughPlayers ? 'ready' : 'waiting'}`;
    announcementsRef.current.emit({
      id,
      type: 'waiting_for_players',
      scope: { dealerGameId: gameId },
      payload: {
        text: hasEnoughPlayers ? 'Ready to Start!' : 'Waiting for Players',
        subtitle:
          seatedPlayerCount > 0
            ? `${seatedPlayerCount} ${seatedPlayerCount === 1 ? 'player' : 'players'} seated`
            : undefined,
      },
    });
    return () => {
      announcementsRef.current.clearAmbient('waiting_for_players');
    };
  }, [gameId, hasEnoughPlayers, seatedPlayerCount]);

  // Empty props for the table (no cards, no game state)
  // Only allow seat selection for observers
  // Hide pot during waiting phase
  const emptyTableProps = {
    players,
    currentUserId,
    pot: 0, // Will be hidden via isWaitingPhase prop
    currentRound: 0,
    allDecisionsIn: false,
    playerCards: [] as { player_id: string; cards: any[] }[],
    timeLeft: null,
    lastRoundResult: null,
    dealerPosition: null,
    legValue: 1,
    legsToWin: 3,
    potMaxEnabled: true,
    potMaxValue: 10,
    pendingSessionEnd: false,
    awaitingNextRound: false,
    onStay: () => {},
    onFold: () => {},
    onSelectSeat: isObserver ? onSelectSeat : undefined, // Only observers can select seats
    isWaitingPhase: true, // Signal to hide pot
  };

  return (
    <MobileGameTable
      {...emptyTableProps}
      chatBubbles={chatBubbles}
      allMessages={allMessages}
      onSendChat={onSendChat}
      isChatSending={isChatSending}
      getPositionForUserId={getPositionForUserId}
      onLeaveGameNow={onLeaveGameNow}
      isHost={isHost}
      waitingSlotContent={renderFeltMessage()}
      waitingActivePaneContent={renderActivePane()}
    />
  );
};
