import { useEffect, useRef, useState } from "react";
import { GameTable } from "./GameTable";
import { MobileGameTable } from "./MobileGameTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Share2, Users, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AggressionLevel } from "@/lib/botHandStrength";
import { generateUUID } from "@/lib/uuid";


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
  isMobile: boolean;
  chatBubbles?: ChatBubble[];
  allMessages?: ChatMessage[];
  onSendChat?: (message: string, imageFile?: File) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  onLeaveGameNow?: () => void;
  realMoney?: boolean;
}

export const WaitingForPlayersTable = ({
  gameId,
  players,
  currentUserId,
  onSelectSeat,
  onGameStart,
  isMobile,
  chatBubbles = [],
  allMessages = [],
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onLeaveGameNow,
  realMoney = false,
}: WaitingForPlayersTableProps) => {
  const gameStartTriggeredRef = useRef(false);
  const previousPlayerCountRef = useRef(0);

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
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const isSeated = !!currentPlayer;
  
  // Host is the first human player who joined (earliest created_at)
  const humanPlayers = players.filter(p => !p.is_bot);
  const sortedByJoinTime = [...humanPlayers].sort((a, b) => {
    if (!a.created_at || !b.created_at) return 0;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const hostPlayer = sortedByJoinTime[0];
  const isHost = currentPlayer && hostPlayer?.user_id === currentUserId;
  
  // Count seated players (active or waiting to play)
  const seatedPlayerCount = players.filter(p => p.waiting === true || !p.sitting_out).length;
  const hasEnoughPlayers = seatedPlayerCount >= 2;
  const hasOpenSeats = players.length < 7;

  // Add bot for waiting phase (joins as active, ready to play)
  // Users may tap quickly to add multiple bots, so we queue requests and reserve positions locally
  // to prevent collisions before the next poll updates the players list.
  const enqueueAddBot = () => {
    const currentPlayers = playersRef.current;
    if (currentPlayers.length >= 7) return;

    addBotQueueRef.current += 1;
    void processAddBotQueue();
  };

  const processAddBotQueue = async () => {
    if (addBotProcessingRef.current) return;
    addBotProcessingRef.current = true;

    try {
      while (addBotQueueRef.current > 0) {
        addBotQueueRef.current -= 1;
        const didStart = await addSingleBot();
        if (!didStart) break;
      }
    } finally {
      addBotProcessingRef.current = false;
    }
  };

  const addSingleBot = async (): Promise<boolean> => {
    const currentPlayers = playersRef.current;
    if (currentPlayers.length >= 7) return false;

    // Find open positions (include locally reserved positions so rapid taps don't collide)
    const occupiedPositions = new Set(currentPlayers.map((p) => p.position));
    for (const pos of reservedBotPositionsRef.current) occupiedPositions.add(pos);

    const allPositions = [1, 2, 3, 4, 5, 6, 7];
    const openPositions = allPositions.filter((pos) => !occupiedPositions.has(pos));

    if (openPositions.length === 0) return false;

    const nextPosition = openPositions[Math.floor(Math.random() * openPositions.length)];
    reservedBotPositionsRef.current.add(nextPosition);

    let succeeded = false;

    try {
      // Create bot profile with guaranteed-unique name using UUID suffix first time
      const botId = generateUUID();
      const aggressionLevel = getAggressionLevelForBotId(botId);
      
      // Use a short unique suffix from the bot ID to avoid collisions during rapid adds
      const suffix = botId.replace(/-/g, '').slice(0, 6);
      const botName = `Bot ${suffix}`;

      // Insert bot profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: botId,
          username: botName,
          aggression_level: aggressionLevel,
        });

      if (profileError) {
        // If still collides (extremely rare), try with full suffix
        if (profileError.code === '23505') {
          const fullSuffix = botId.replace(/-/g, '').slice(0, 12);
          const fallbackName = `Bot ${fullSuffix}`;
          
          const { error: retryError } = await supabase
            .from('profiles')
            .insert({
              id: botId,
              username: fallbackName,
              aggression_level: aggressionLevel,
            });
          
          if (retryError) {
            throw new Error(`Failed to create bot profile: ${retryError.message}`);
          }
        } else {
          throw new Error(`Failed to create bot profile: ${profileError.message}`);
        }
      }

      // Create bot player - active and ready to play (not sitting out)
      const { error: playerError } = await supabase
        .from('players')
        .insert({
          user_id: botId,
          game_id: gameId,
          position: nextPosition,
          chips: 0,
          is_bot: true,
          status: 'active',
          sitting_out: false,
          waiting: true, // Waiting to start game
        });

      if (playerError) {
        throw new Error(`Failed to add bot: ${playerError.message}`);
      }

      succeeded = true;
      return true;
    } catch (error: any) {
      console.error('Error adding bot:', error);
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

  // Track player count (without toast notification)
  useEffect(() => {
    previousPlayerCountRef.current = players.length;
  }, [players.length]);

  const handleInvite = () => {
    const gameUrl = window.location.href;
    navigator.clipboard.writeText(gameUrl);
    console.log('Game link copied to clipboard');
  };

  // Check if user is an observer (not seated)
  const isObserver = !currentPlayer;

  // Felt message - positioned in center of felt area
  const renderFeltMessage = () => (
    <div className={`absolute left-0 right-0 flex justify-center z-10 pointer-events-none ${isMobile ? 'top-[18%]' : 'top-1/2 -translate-y-1/2'}`}>
      <div className="bg-black/70 backdrop-blur-sm rounded-xl px-6 py-4 border border-amber-600/50 max-w-xs text-center">
        <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
        {isObserver ? (
          <>
            <p className="text-amber-300 font-bold text-lg mb-1">Choose a Seat!</p>
            <p className="text-amber-300/70 text-sm">
              Game starts when 2+ players are seated
            </p>
          </>
        ) : (
          <>
            <p className="text-amber-300 font-bold text-lg mb-1">
              {hasEnoughPlayers ? 'Ready to Start!' : 'Waiting for Players'}
            </p>
            <p className="text-amber-300/70 text-sm mb-3">
              {hasEnoughPlayers 
                ? (isHost ? 'Click Start Game to begin' : 'Waiting for host to start game')
                : `${seatedPlayerCount}/2+ players seated`
              }
            </p>
            <div className="flex flex-col gap-2 pointer-events-auto">
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleInvite}
                  className="border-amber-600 text-amber-300 hover:bg-amber-600/20"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Invite
                </Button>
                {isHost && hasOpenSeats && !realMoney && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={(e) => {
                      // On mobile Safari, :hover can “stick” after tap; keep styles stable and
                      // avoid leaving the button in a visually “disabled” looking state.
                      e.currentTarget.blur();
                      const startBtn = document.querySelector('[data-start-game-btn]') as HTMLButtonElement;
                      if (startBtn) startBtn.focus();
                      enqueueAddBot();
                    }}
                    className="border-amber-600 bg-transparent text-amber-300 hover:bg-amber-600/20 hover:text-amber-300 focus-visible:bg-amber-600/10 focus-visible:text-amber-300 active:bg-amber-600/20 active:text-amber-300"
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    Add Bot
                  </Button>
                )}
              </div>
              {isHost && hasEnoughPlayers && (
                <Button
                  data-start-game-btn
                  onClick={handleStartGame}
                  className="bg-amber-600 hover:bg-amber-700 text-black font-bold"
                >
                  🃏 Start Game
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

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
    <div className="relative">
      {isMobile ? (
        <MobileGameTable
          {...emptyTableProps}
          chatBubbles={chatBubbles}
          allMessages={allMessages}
          onSendChat={onSendChat}
          isChatSending={isChatSending}
          getPositionForUserId={getPositionForUserId}
          onLeaveGameNow={onLeaveGameNow}
          isHost={isHost}
        />
      ) : (
        <GameTable
          {...emptyTableProps}
          chatBubbles={chatBubbles}
          onSendChat={onSendChat}
          isChatSending={isChatSending}
          onLeaveGameNow={onLeaveGameNow}
        />
      )}
      {renderFeltMessage()}
      
      {/* Header showing player count */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20">
        <Badge 
          variant="outline" 
          className="bg-black/60 border-amber-600/50 text-amber-300 px-3 py-1"
        >
          <Users className="w-4 h-4 mr-2" />
          {seatedPlayerCount} Player{seatedPlayerCount !== 1 ? 's' : ''} Seated
        </Badge>
      </div>
    </div>
  );
};
