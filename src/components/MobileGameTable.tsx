import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { CommunityCards } from "./CommunityCards";
import { ChuckyHand } from "./ChuckyHand";
import { ChoppedAnimation } from "./ChoppedAnimation";
import { ChatBubble } from "./ChatBubble";
import { ChatInput } from "./ChatInput";
import { MobileChatPanel } from "./MobileChatPanel";
import { PlayerOptionsMenu } from "./PlayerOptionsMenu";
import { RejoinNextHandButton } from "./RejoinNextHandButton";

import { BucksOnYouAnimation } from "./BucksOnYouAnimation";
import { LegEarnedAnimation } from "./LegEarnedAnimation";
import { MobilePlayerTimer } from "./MobilePlayerTimer";
import { LegIndicator } from "./LegIndicator";
import { BuckIndicator } from "./BuckIndicator";
import { Card as CardType, evaluateHand, formatHandRank, getWinningCardIndices } from "@/lib/cardUtils";
import cubsLogo from "@/assets/cubs-logo.png";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { ChevronUp, ChevronDown } from "lucide-react";

// Custom hook for swipe detection
const useSwipeGesture = (onSwipeUp: () => void, onSwipeDown: () => void) => {
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const minSwipeDistance = 50;
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndY.current = null;
    touchStartY.current = e.targetTouches[0].clientY;
  }, []);
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndY.current = e.targetTouches[0].clientY;
  }, []);
  const onTouchEnd = useCallback(() => {
    if (!touchStartY.current || !touchEndY.current) return;
    const distance = touchStartY.current - touchEndY.current;
    const isSwipeUp = distance > minSwipeDistance;
    const isSwipeDown = distance < -minSwipeDistance;
    if (isSwipeUp) {
      onSwipeUp();
    } else if (isSwipeDown) {
      onSwipeDown();
    }
    touchStartY.current = null;
    touchEndY.current = null;
  }, [onSwipeUp, onSwipeDown]);
  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd
  };
};
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
  sitting_out_hands?: number;
  waiting?: boolean;
  profiles?: {
    username: string;
  };
}
interface PlayerCards {
  player_id: string;
  cards: CardType[];
}
interface ChatBubbleData {
  id: string;
  user_id: string;
  message: string;
  username?: string;
  expiresAt: number;
}

interface MobileGameTableProps {
  players: Player[];
  currentUserId: string | undefined;
  pot: number;
  currentRound: number;
  allDecisionsIn: boolean;
  playerCards: PlayerCards[];
  timeLeft: number | null;
  maxTime?: number;
  lastRoundResult: string | null;
  dealerPosition: number | null;
  legValue: number;
  legsToWin: number;
  potMaxEnabled: boolean;
  potMaxValue: number;
  pendingSessionEnd: boolean;
  awaitingNextRound: boolean;
  gameType?: string | null;
  communityCards?: CardType[];
  communityCardsRevealed?: number;
  buckPosition?: number | null;
  currentTurnPosition?: number | null;
  chuckyCards?: CardType[];
  chuckyActive?: boolean;
  chuckyCardsRevealed?: number;
  roundStatus?: string;
  pendingDecision?: 'stay' | 'fold' | null;
  isPaused?: boolean;
  // Game over props
  isGameOver?: boolean;
  isDealer?: boolean;
  onNextGame?: () => void;
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
  // Host player control
  isHost?: boolean;
  onPlayerClick?: (player: Player) => void;
  // Chat props
  chatBubbles?: ChatBubbleData[];
  allMessages?: { id: string; user_id: string; message: string; username?: string }[];
  onSendChat?: (message: string) => void;
  isChatSending?: boolean;
  getPositionForUserId?: (userId: string) => number | undefined;
  // Observer leave game prop
  onLeaveGameNow?: () => void;
}
export const MobileGameTable = ({
  players,
  currentUserId,
  pot,
  currentRound,
  allDecisionsIn,
  playerCards,
  timeLeft,
  maxTime = 10,
  lastRoundResult,
  dealerPosition,
  legValue,
  legsToWin,
  potMaxEnabled,
  potMaxValue,
  pendingSessionEnd,
  awaitingNextRound,
  gameType,
  communityCards,
  communityCardsRevealed,
  buckPosition,
  currentTurnPosition,
  chuckyCards,
  chuckyActive,
  chuckyCardsRevealed,
  roundStatus,
  pendingDecision,
  isPaused,
  isGameOver,
  isDealer,
  onNextGame,
  onStay,
  onFold,
  onSelectSeat,
  isHost,
  onPlayerClick,
  chatBubbles = [],
  allMessages = [],
  onSendChat,
  isChatSending = false,
  getPositionForUserId,
  onLeaveGameNow,
}: MobileGameTableProps) => {
  const {
    getTableColors,
    getFourColorSuit,
    getCardBackColors,
    getEffectiveDeckColorMode
  } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  const deckColorMode = getEffectiveDeckColorMode();

  // Collapsible card section state
  const [isCardSectionExpanded, setIsCardSectionExpanded] = useState(true);
  
  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture(() => setIsCardSectionExpanded(true),
  // Swipe up = expand
  () => setIsCardSectionExpanded(false) // Swipe down = collapse
  );

  // Chopped animation state
  const [showChopped, setShowChopped] = useState(false);
  const lastChoppedResultRef = useRef<string | null>(null);

  // Buck's on you animation state
  const [showBucksOnYou, setShowBucksOnYou] = useState(false);
  const lastBuckPositionRef = useRef<number | null>(null);
  const bucksOnYouShownRef = useRef(false); // Prevent re-triggering

  // Leg earned animation state
  const [showLegEarned, setShowLegEarned] = useState(false);
  const [legEarnedPlayerName, setLegEarnedPlayerName] = useState('');
  const [legEarnedPlayerPosition, setLegEarnedPlayerPosition] = useState<number | null>(null);
  const playerLegsRef = useRef<Record<string, number>>({});
  
  // Track showdown state and CACHE CARDS during showdown to prevent flickering
  const showdownRoundRef = useRef<number | null>(null);
  const showdownCardsCache = useRef<Map<string, CardType[]>>(new Map());
  
  // Compute showdown state synchronously during render
  // This should trigger when we need to show exposed cards
  const isInEarlyPhase = roundStatus === 'betting' || roundStatus === 'pending' || roundStatus === 'ante';
  const isShowdownActive = gameType === 'holm-game' && 
    (roundStatus === 'showdown' || roundStatus === 'completed' || communityCardsRevealed === 4 || allDecisionsIn);
  
  // Clear showdown cache when:
  // 1. A new round number is detected
  // 2. We're back in an early betting phase (new hand started)
  if (currentRound && showdownRoundRef.current !== null && showdownRoundRef.current !== currentRound) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  // Also clear if we're in early phase, no announcement, AND allDecisionsIn is false (truly new hand)
  if (showdownRoundRef.current !== null && isInEarlyPhase && !lastRoundResult && !allDecisionsIn) {
    showdownRoundRef.current = null;
    showdownCardsCache.current = new Map();
  }
  
  // If showdown is active, cache cards for players who stayed
  if (isShowdownActive && currentRound) {
    if (showdownRoundRef.current === null) {
      showdownRoundRef.current = currentRound;
    }
    // Cache cards for stayed players during this showdown
    if (showdownRoundRef.current === currentRound) {
      players
        .filter(p => p.current_decision === 'stay')
        .forEach(p => {
          // Only cache if we have cards and haven't cached yet
          if (!showdownCardsCache.current.has(p.id)) {
            const playerCardData = playerCards.find(pc => pc.player_id === p.id);
            if (playerCardData && playerCardData.cards.length > 0) {
              showdownCardsCache.current.set(p.id, [...playerCardData.cards]);
            }
          }
        });
    }
  }
  
  // Function to get cards for a player (use cache during showdown)
  const getPlayerCards = (playerId: string): CardType[] => {
    const liveCards = playerCards.find(pc => pc.player_id === playerId)?.cards || [];
    
    // CRITICAL: Once cards are cached for this round, ALWAYS use cache
    // This prevents flickering when isShowdownActive temporarily becomes false
    if (showdownRoundRef.current === currentRound) {
      const cachedCards = showdownCardsCache.current.get(playerId);
      if (cachedCards && cachedCards.length > 0) {
        return cachedCards;
      }
    }
    return liveCards;
  };
  
  // Function to check if a player's cards should be shown
  const isPlayerCardsExposed = (playerId: string): boolean => {
    if (!currentRound) return false;
    // Cards are exposed if: we're in showdown round AND player has cached cards
    return showdownRoundRef.current === currentRound && showdownCardsCache.current.has(playerId);
  };

  // Find current player and their cards
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerCards = currentPlayer ? playerCards.find(pc => pc.player_id === currentPlayer.id)?.cards || [] : [];

  // Calculate lose amount
  const loseAmount = potMaxEnabled ? Math.min(pot, potMaxValue) : pot;

  // Check if current player can decide
  const hasDecided = currentPlayer?.decision_locked || !!pendingDecision;
  const buckIsAssigned = buckPosition !== null && buckPosition !== undefined;
  const roundIsReady = currentTurnPosition !== null && currentTurnPosition !== undefined;
  const roundIsActive = roundStatus === 'betting' || roundStatus === 'active';
  const isPlayerTurn = gameType === 'holm-game' ? buckIsAssigned && roundIsReady && roundIsActive && currentTurnPosition === currentPlayer?.position && !awaitingNextRound : true;
  const canDecide = currentPlayer && !hasDecided && currentPlayer.status === 'active' && !allDecisionsIn && isPlayerTurn && !isPaused && currentPlayerCards.length > 0;

  // Check if we should be in showdown display mode (hide chipstacks, buck, show larger cards)
  // This is true when: 
  // 1. Any player has exposed cards during active showdown, OR
  // 2. We have a result announcement showing (lastRoundResult is set)
  const hasExposedPlayers = players.some(p => isPlayerCardsExposed(p.id));
  // Check if we're showing an announcement (either normal round result or game-over)
  const isShowingAnnouncement = gameType === 'holm-game' && !!lastRoundResult && (awaitingNextRound || isGameOver);
  const isAnyPlayerInShowdown = gameType === 'holm-game' && (hasExposedPlayers || isShowingAnnouncement);

  // Determine winner from lastRoundResult for dimming logic
  const winnerPlayerId = useMemo(() => {
    if (!isShowingAnnouncement || !lastRoundResult) return null;
    // Parse winner from announcement - format usually includes player username
    // Look for patterns like "PlayerName beat", "PlayerName won", "PlayerName wins", "PlayerName earns"
    const result = lastRoundResult.toLowerCase();
    for (const player of players) {
      const username = player.profiles?.username?.toLowerCase() || '';
      if (username && (
        result.includes(`${username} beat`) || 
        result.includes(`${username} won`) || 
        result.includes(`${username} wins`) || 
        result.includes(`${username} earns`)
      )) {
        return player.id;
      }
    }
    return null;
  }, [isShowingAnnouncement, lastRoundResult, players]);

  // Check if current player is the winner (for dimming logic)
  const isCurrentPlayerWinner = winnerPlayerId === currentPlayer?.id;

  // Get winner's cards for highlighting (winner may be current player or another player)
  const winnerCards = useMemo(() => {
    if (!winnerPlayerId || !isShowingAnnouncement) return [];
    if (winnerPlayerId === currentPlayer?.id) {
      return currentPlayerCards;
    }
    // Find winner's cards from playerCards
    const winnerCardData = playerCards.find(pc => pc.player_id === winnerPlayerId);
    return winnerCardData?.cards || [];
  }, [winnerPlayerId, isShowingAnnouncement, currentPlayer?.id, currentPlayerCards, playerCards]);

  // Calculate winning card highlights based on WINNER's hand (not current player)
  const winningCardHighlights = useMemo(() => {
    // Only highlight during announcement phase with winner determined
    if (!isShowingAnnouncement || !winnerCards.length || !communityCards?.length || !winnerPlayerId) {
      return { playerIndices: [], communityIndices: [], kickerPlayerIndices: [], kickerCommunityIndices: [], hasHighlights: false };
    }
    const result = getWinningCardIndices(winnerCards, communityCards, false);
    return { ...result, hasHighlights: true };
  }, [isShowingAnnouncement, winnerCards, communityCards, winnerPlayerId]);

  // Detect Chucky chopped animation
  useEffect(() => {
    if (gameType === 'holm-game' && lastRoundResult && lastRoundResult !== lastChoppedResultRef.current && currentUserId) {
      const currentUsername = currentPlayer?.profiles?.username || '';
      if (!currentUsername) return;
      const is1v1Loss = lastRoundResult.includes(`Chucky beat ${currentUsername} `);
      const isTieBreakerLoss = lastRoundResult.includes('lose to Chucky') && (lastRoundResult.includes(`${currentUsername} and `) || lastRoundResult.includes(` and ${currentUsername} lose`) || lastRoundResult.includes(`! ${currentUsername} lose`));
      if (is1v1Loss || isTieBreakerLoss) {
        lastChoppedResultRef.current = lastRoundResult;
        setShowChopped(true);
      }
    }
  }, [lastRoundResult, gameType, currentPlayer, currentUserId]);

  // Detect buck passed to current player (Holm games only)
  // Also clear showdown state when buck moves - new hand is starting
  useEffect(() => {
    if (gameType === 'holm-game' && buckPosition !== null && buckPosition !== undefined && currentPlayer && buckPosition === currentPlayer.position && lastBuckPositionRef.current !== buckPosition && lastBuckPositionRef.current !== null &&
    // Don't show on initial load
    !bucksOnYouShownRef.current // Don't re-trigger if already shown for this position
    ) {
      // Clear showdown state - new hand starting
      showdownRoundRef.current = null;
      showdownCardsCache.current = new Map();
      
      bucksOnYouShownRef.current = true;
      setShowBucksOnYou(true);
    }

    // Reset the shown flag when buck moves away from current player
    if (buckPosition !== currentPlayer?.position) {
      bucksOnYouShownRef.current = false;
    }
    lastBuckPositionRef.current = buckPosition ?? null;
  }, [buckPosition, currentPlayer, gameType]);

  // Detect when a player earns a leg (3-5-7 games only)
  useEffect(() => {
    if (gameType === 'holm-game') return;
    players.forEach(player => {
      const prevLegs = playerLegsRef.current[player.id] ?? 0;
      const currentLegs = player.legs;

      // Player gained a leg
      if (currentLegs > prevLegs && prevLegs >= 0) {
        const playerName = player.profiles?.username || `Player ${player.position}`;
        setLegEarnedPlayerName(playerName);
        setLegEarnedPlayerPosition(player.position);
        setShowLegEarned(true);
      }
      playerLegsRef.current[player.id] = currentLegs;
    });
  }, [players, gameType]);

  // Map other players to visual slots based on clockwise position from current player
  // Visual slots layout (clockwise from current player at bottom center):
  // Slot 0: 1 seat clockwise (bottom-left in visual layout)
  // Slot 1: 2 seats clockwise (middle-left)  
  // Slot 2: 3 seats clockwise (top-left)
  // Slot 3: 4 seats clockwise (top-right)
  // Slot 4: 5 seats clockwise (middle-right)
  // Slot 5: 6 seats clockwise (bottom-right)
  const currentPos = currentPlayer?.position ?? 1;
  const otherPlayersRaw = players.filter(p => p.user_id !== currentUserId);
  
  // Calculate clockwise distance from current player (1-6 seats away)
  const getClockwiseDistance = (playerPos: number): number => {
    let distance = playerPos - currentPos;
    if (distance <= 0) distance += 7; // Wrap around for positions before current
    return distance;
  };
  
  // Map clockwise distance to visual slot (distance 1 = slot 0, distance 2 = slot 1, etc.)
  // This ensures players appear at their actual relative position, not sequentially
  const getPlayerAtSlot = (slotIndex: number): Player | undefined => {
    const targetDistance = slotIndex + 1; // slot 0 = 1 seat away, slot 1 = 2 seats away, etc.
    return otherPlayersRaw.find(p => getClockwiseDistance(p.position) === targetDistance);
  };

  // Get occupied positions for open seats
  const occupiedPositions = new Set(players.map(p => p.position));
  const maxSeats = 7;
  const allPositions = Array.from({
    length: maxSeats
  }, (_, i) => i + 1);
  const openSeats = allPositions.filter(pos => !occupiedPositions.has(pos));
  // CRITICAL: Only OBSERVERS (users not in the players list at all) can select seats
  // Seated players (including sitting_out) cannot change seats
  const canSelectSeat = onSelectSeat && !currentPlayer;

  // Calculate expected card count for 3-5-7 games
  const getExpectedCardCount = (round: number): number => {
    if (gameType === 'holm-game') return 4;
    if (round === 1) return 3;
    if (round === 2) return 5;
    if (round === 3) return 7;
    return 3;
  };
  const expectedCardCount = getExpectedCardCount(currentRound);

  // Get player status chip background color based on status
  const getPlayerChipBgColor = (player: Player) => {
    // Yellow for waiting (regardless of sitting_out)
    if (player.waiting) {
      return 'bg-yellow-300';
    }
    // White for sitting out (and not waiting)
    if (player.sitting_out) {
      return 'bg-white';
    }
    // Green for active
    return 'bg-green-400';
  };

  // Render player chip - chipstack in center, name below (or above for bottom positions)
  const renderPlayerChip = (player: Player, slotIndex?: number) => {
    const isTheirTurn = gameType === 'holm-game' && currentTurnPosition === player.position && !awaitingNextRound;
    const playerDecision = player.current_decision;
    const playerCardsData = playerCards.find(pc => pc.player_id === player.id);
    // Use getPlayerCards for showdown caching
    const cards = getPlayerCards(player.id);

    // Show card backs for active players even if we don't have their cards data
    const isActivePlayer = player.status === 'active' && !player.sitting_out;
    // For Holm games, hide card backs when player folds
    const hasFolded = gameType === 'holm-game' && playerDecision === 'fold';
    const showCardBacks = isActivePlayer && expectedCardCount > 0 && currentRound > 0 && !hasFolded;
    const cardCountToShow = cards.length > 0 ? cards.length : expectedCardCount;

    // Status chip background color
    const chipBgColor = getPlayerChipBgColor(player);

    // Check if this player's chip stack is clickable by host (any player except self)
    const isClickable = isHost && onPlayerClick && player.user_id !== currentUserId;
    
    // Bottom positions (slot 0 = bottom-left, slot 5 = bottom-right) need name above chip
    const isBottomPosition = slotIndex === 0 || slotIndex === 5;
    
    // Determine if we should show this player's actual cards
    // Either: player has exposed cards in cache, OR we're showing announcement for a stayed player
    const hasExposedCards = isPlayerCardsExposed(player.id) && cards.length > 0;
    const isInAnnouncementShowdown = isShowingAnnouncement && playerDecision === 'stay' && cards.length > 0;
    const isShowdown = gameType === 'holm-game' && (hasExposedCards || isInAnnouncementShowdown);
    
    // During showdown/announcement, hide chip stack to make room for bigger cards
    const hideChipForShowdown = isShowdown;
    
    const isDealer = dealerPosition === player.position;
    const playerLegs = gameType !== 'holm-game' ? player.legs : 0;
    
    // Determine if legs should be on the left (inside for right-side slots 3,4,5)
    const isRightSideSlot = slotIndex !== undefined && slotIndex >= 3;
    
    // Leg indicator element - overlapping circles positioned inside toward table center, barely overlapping chipstack edge
    const legIndicator = playerLegs > 0 && (
      <div className="absolute z-30" style={{
        // Position to barely overlap the chipstack edge (6px inward from edge of 48px circle = 24px radius - 6px = 18px from center)
        ...(isRightSideSlot 
          ? { left: '6px', top: '50%', transform: 'translateY(-50%) translateX(-100%)' }
          : { right: '6px', top: '50%', transform: 'translateY(-50%) translateX(100%)' }
        )
      }}>
        <div className="flex" style={{ flexDirection: isRightSideSlot ? 'row-reverse' : 'row' }}>
          {Array.from({ length: Math.min(playerLegs, legsToWin) }).map((_, i) => (
            <div 
              key={i} 
              className="w-5 h-5 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg"
              style={{
                marginLeft: !isRightSideSlot && i > 0 ? '-8px' : '0',
                marginRight: isRightSideSlot && i > 0 ? '-8px' : '0',
                zIndex: Math.min(playerLegs, legsToWin) - i
              }}
            >
              <span className="text-slate-800 font-bold text-[10px]">L</span>
            </div>
          ))}
        </div>
      </div>
    );
    
    const chipElement = <div className="relative flex items-center gap-1">
        {/* Leg indicators - positioned inside toward table center */}
        {legIndicator}
        
        {/* Chat bubbles above player */}
        {getPositionForUserId && chatBubbles.length > 0 && (
          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1">
            {chatBubbles
              .filter(b => getPositionForUserId(b.user_id) === player.position)
              .map((bubble) => (
                <ChatBubble
                  key={bubble.id}
                  username={bubble.username || 'Unknown'}
                  message={bubble.message}
                  expiresAt={bubble.expiresAt}
                />
              ))}
          </div>
        )}
        
        {/* Dealer button - positioned OUTSIDE (away from table center), barely overlapping chip stack */}
        {isDealer && (
          <div className="absolute z-30" style={{
            ...(isRightSideSlot 
              ? { right: '-2px', top: '50%', transform: 'translateY(-50%) translateX(75%)' }
              : { left: '-2px', top: '50%', transform: 'translateY(-50%) translateX(-75%)' }
            )
          }}>
            <div className="w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-[10px]">D</span>
            </div>
          </div>
        )}
        
        {/* Main chip stack - clickable for host to control players */}
        <div 
          className={`relative ${isClickable ? 'cursor-pointer' : ''}`}
          onClick={isClickable ? () => onPlayerClick(player) : undefined}
        >
          {/* Pulsing green ring for stayed players - separate element so inner circle doesn't pulse */}
          {playerDecision === 'stay' && (
            <div className="absolute inset-0 rounded-full ring-4 ring-green-500 shadow-[0_0_12px_rgba(34,197,94,0.7)] animate-pulse" />
          )}
          {/* Yellow ring for current turn (no pulse on ring, pulse on circle) */}
          {isTheirTurn && playerDecision !== 'stay' && (
            <div className="absolute inset-0 rounded-full ring-3 ring-yellow-400" />
          )}
          <div className={`
            relative w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 border-slate-600/50
            ${chipBgColor}
            ${playerDecision === 'fold' ? 'opacity-50' : ''}
            ${isTheirTurn && playerDecision !== 'stay' ? 'animate-turn-pulse' : ''}
            ${isClickable ? 'active:scale-95' : ''}
          `}>
            <span className={`text-sm font-bold leading-none ${player.chips < 0 ? 'text-red-600' : 'text-slate-800'}`}>
              ${Math.round(player.chips)}
            </span>
          </div>
        </div>
      </div>;
    
    const nameElement = (
      <div className="flex items-center gap-1">
        <span className="text-[11px] truncate max-w-[70px] leading-none font-semibold text-white drop-shadow-md">
          {player.profiles?.username || (player.is_bot ? `Bot` : `P${player.position}`)}
        </span>
      </div>
    );
    
    // Show actual cards during showdown (BIGGER when chip is hidden), otherwise show mini card backs
    // Dim cards for losing players during announcement, highlight winner's cards
    const isLosingPlayer = isShowingAnnouncement && winnerPlayerId && player.id !== winnerPlayerId && playerDecision === 'stay';
    const isWinningPlayer = isShowingAnnouncement && winnerPlayerId === player.id;
    const cardsElement = isShowdown ? (
      <div className={`flex gap-0.5 ${hideChipForShowdown ? 'scale-100' : 'scale-75'} origin-top ${isLosingPlayer ? 'opacity-40 grayscale-[30%]' : ''}`}>
        <PlayerHand 
          cards={cards} 
          isHidden={false}
          highlightedIndices={isWinningPlayer ? winningCardHighlights.playerIndices : []}
          kickerIndices={isWinningPlayer ? winningCardHighlights.kickerPlayerIndices : []}
          hasHighlights={isWinningPlayer && winningCardHighlights.hasHighlights}
        />
      </div>
    ) : (
      isActivePlayer && expectedCardCount > 0 && currentRound > 0 && cardCountToShow > 0 && (
        <div className={`flex ${hasFolded ? 'animate-[foldCards_1.5s_ease-out_forwards]' : ''}`}>
          {Array.from({
            length: Math.min(cardCountToShow, 7)
          }, (_, i) => <div key={i} className="w-2 h-3 rounded-[1px] border border-amber-600/50" style={{
            background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
            marginLeft: i > 0 ? '-3px' : '0', // Overlap card backs
            zIndex: cardCountToShow - i,
            animationDelay: hasFolded ? `${i * 0.05}s` : '0s'
          }} />)}
        </div>
      )
    );
    
    return <div key={player.id} className="flex flex-col items-center gap-0.5">
        {/* Name above for bottom positions */}
        {isBottomPosition && nameElement}
        {/* Hide chip stack during showdown to make room for bigger cards */}
        {!hideChipForShowdown && (
          <MobilePlayerTimer timeLeft={timeLeft} maxTime={maxTime} isActive={isTheirTurn && roundStatus === 'betting'} size={52}>
            {chipElement}
          </MobilePlayerTimer>
        )}
        {/* Name below for other positions */}
        {!isBottomPosition && nameElement}
        {/* Cards - show actual cards during showdown (bigger when chip hidden), or mini card backs otherwise */}
        {cardsElement}
      </div>;
  };
  return <div className="flex flex-col h-[calc(100dvh-60px)] overflow-hidden bg-background relative">
      {/* Status badges moved to bottom section */}
      
      {/* Main table area - USE MORE VERTICAL SPACE */}
      <div className="flex-1 relative overflow-hidden min-h-0" style={{
      maxHeight: '55vh'
    }}>
        {/* Table felt background - wide horizontal ellipse */}
        <div className="absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner" style={{
        background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)'
      }} />
        
        {/* Game name on felt */}
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center">
          <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
            {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
          </span>
          <span className="text-white/40 text-xs font-medium">
            {potMaxEnabled ? `$${potMaxValue} max` : 'No Limit'}
          </span>
          {gameType !== 'holm-game' && <span className="text-white/40 text-xs font-medium">
              {legsToWin} legs to win
            </span>}
        </div>
        
        
        {/* Chopped Animation */}
        <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
        
        {/* Buck's On You Animation (Holm only) */}
        <BucksOnYouAnimation show={showBucksOnYou} onComplete={() => setShowBucksOnYou(false)} />
        
        {/* Leg Earned Animation (3-5-7 only) */}
        <LegEarnedAnimation 
          show={showLegEarned} 
          playerName={legEarnedPlayerName} 
          targetPosition={(() => {
            // Calculate target based on leg-earning player's position
            // Target should be where the NEXT leg indicator will appear (inside toward table center)
            if (!legEarnedPlayerPosition) return undefined;
            
            // If current player earned the leg, animate to bottom center-right (where their leg indicator actually renders)
            if (currentPlayer?.position === legEarnedPlayerPosition) {
              // Legs appear at left: 55%, bottom: 8px on the felt (see line ~879)
              return { top: '92%', left: '55%' };
            }
            
            // Otherwise, calculate slot position for other player
            const currentPos = currentPlayer?.position ?? 1;
            let distance = legEarnedPlayerPosition - currentPos;
            if (distance <= 0) distance += 7;
            const slotIndex = distance - 1;
            
            // Determine if right side slot (legs appear on left of chip)
            const isRightSideSlot = slotIndex >= 3;
            
            // Map slot to approximate screen coordinates (matching slotPositions layout)
            // With offset toward table center where legs actually render
            const slotCoords: Record<number, { top: string; left: string }> = {
              0: { top: '85%', left: '22%' },  // Bottom-left - legs on right side (toward center)
              1: { top: '50%', left: '12%' },  // Left - legs on right side (toward center)
              2: { top: '15%', left: '22%' },  // Top-left - legs on right side (toward center)
              3: { top: '15%', left: '78%' },  // Top-right - legs on left side (toward center)
              4: { top: '50%', left: '88%' },  // Right - legs on left side (toward center)
              5: { top: '85%', left: '78%' },  // Bottom-right - legs on left side (toward center)
            };
            return slotCoords[slotIndex] || { top: '85%', left: '40%' };
          })()}
          onComplete={() => setShowLegEarned(false)} 
        />
        
        {/* Pot display - centered and larger for 3-5-7, above community cards for Holm */}
        <div className={`absolute left-1/2 transform -translate-x-1/2 z-20 ${
          gameType === 'holm-game' 
            ? 'top-[35%] -translate-y-full' 
            : 'top-1/2 -translate-y-1/2'
        }`}>
          <div className={`bg-black/70 backdrop-blur-sm rounded-full border border-poker-gold/60 ${
            gameType === 'holm-game' ? 'px-5 py-1.5' : 'px-8 py-3'
          }`}>
            <span className={`text-poker-gold font-bold ${
              gameType === 'holm-game' ? 'text-xl' : 'text-3xl'
            }`}>${Math.round(pot)}</span>
          </div>
        </div>
        
        {/* Community Cards - vertically centered */}
        {gameType === 'holm-game' && communityCards && communityCards.length > 0 && <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-[1.8]">
            <CommunityCards 
              cards={communityCards} 
              revealed={communityCardsRevealed || 2} 
              highlightedIndices={winningCardHighlights.communityIndices}
              kickerIndices={winningCardHighlights.kickerCommunityIndices}
              hasHighlights={winningCardHighlights.hasHighlights}
            />
          </div>}
        
        {/* Chucky's Hand - directly below community cards, no container */}
        {gameType === 'holm-game' && chuckyActive && chuckyCards && chuckyCards.length > 0 && <div className="absolute top-[62%] left-1/2 transform -translate-x-1/2 z-10 flex items-center gap-1.5">
            <span className="text-red-400 text-sm mr-1">👿</span>
            {chuckyCards.map((card, index) => {
          const isRevealed = index < (chuckyCardsRevealed || 0);
          const isFourColor = deckColorMode === 'four_color';
          const fourColorConfig = getFourColorSuit(card.suit);

          // Card face styling based on deck mode
          const cardBg = isRevealed ? isFourColor && fourColorConfig ? fourColorConfig.bg : 'white' : undefined;
          // Use inline color style for 2-color mode to override dark mode text colors
          const twoColorTextStyle = !isFourColor && isRevealed 
            ? { color: (card.suit === '♥' || card.suit === '♦') ? '#dc2626' : '#000000' } 
            : {};
          
          return <div key={index} className="w-10 h-14 sm:w-11 sm:h-15">
                  {isRevealed ? <div className="w-full h-full rounded-md border-2 border-red-500 flex flex-col items-center justify-center shadow-lg" style={{
              backgroundColor: cardBg,
              ...twoColorTextStyle
            }}>
                      <span className={`text-xl font-black leading-none ${isFourColor ? 'text-white' : ''}`}>
                        {card.rank}
                      </span>
                      {!isFourColor && <span className="text-2xl leading-none -mt-0.5">
                          {card.suit}
                        </span>}
                    </div> : <div className="w-full h-full rounded-md border-2 border-red-600 flex items-center justify-center shadow-lg" style={{
              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`
            }}>
                      <span className="text-amber-400/50 text-xl">?</span>
                    </div>}
                </div>;
        })}
          </div>}
        
        {/* Players arranged clockwise around table from current player's perspective */}
        {/* getPlayerAtSlot(n) returns the player who is n+1 seats clockwise from current player */}
        {/* Slot 0 (1 seat clockwise): Bottom-left */}
        <div className="absolute bottom-2 left-10 z-10">
          {getPlayerAtSlot(0) && renderPlayerChip(getPlayerAtSlot(0)!, 0)}
        </div>
        {/* Slot 1 (2 seats clockwise): Middle-left - moves up during showdown to avoid community cards */}
        <div className={`absolute left-0 z-10 transition-all duration-300 ${
          getPlayerAtSlot(1) && isPlayerCardsExposed(getPlayerAtSlot(1)!.id) 
            ? 'top-[32%] -translate-y-1/2' 
            : 'top-1/2 -translate-y-1/2'
        }`}>
          {getPlayerAtSlot(1) && renderPlayerChip(getPlayerAtSlot(1)!, 1)}
        </div>
        {/* Slot 2 (3 seats clockwise): Top-left */}
        <div className="absolute top-2 left-10 z-10">
          {getPlayerAtSlot(2) && renderPlayerChip(getPlayerAtSlot(2)!, 2)}
        </div>
        {/* Slot 3 (4 seats clockwise): Top-right */}
        <div className="absolute top-2 right-10 z-10">
          {getPlayerAtSlot(3) && renderPlayerChip(getPlayerAtSlot(3)!, 3)}
        </div>
        {/* Slot 4 (5 seats clockwise): Middle-right - moves up during showdown to avoid community cards */}
        <div className={`absolute right-0 z-10 transition-all duration-300 ${
          getPlayerAtSlot(4) && isPlayerCardsExposed(getPlayerAtSlot(4)!.id) 
            ? 'top-[32%] -translate-y-1/2' 
            : 'top-1/2 -translate-y-1/2'
        }`}>
          {getPlayerAtSlot(4) && renderPlayerChip(getPlayerAtSlot(4)!, 4)}
        </div>
        {/* Slot 5 (6 seats clockwise): Bottom-right */}
        <div className="absolute bottom-2 right-10 z-10">
          {getPlayerAtSlot(5) && renderPlayerChip(getPlayerAtSlot(5)!, 5)}
        </div>
        
        {/* Dealer button is now shown on player chip stacks (OUTSIDE position), no separate felt button needed */}
        
        {/* Buck indicator on felt - Holm games only, hide during showdown */}
        {gameType === 'holm-game' && buckPosition !== null && buckPosition !== undefined && !isAnyPlayerInShowdown && (() => {
        // Calculate buck's slot from clockwise distance
        const isCurrentPlayerBuck = currentPlayer?.position === buckPosition;
        const buckSlot = isCurrentPlayerBuck ? -1 : getClockwiseDistance(buckPosition) - 1;

        // Calculate pixel positions - offset from dealer button
        let positionStyle: React.CSSProperties = {
          bottom: '8px',
          left: '55%',
          transform: 'translateX(-50%)',
          transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
        };
        if (!isCurrentPlayerBuck && buckSlot >= 0) {
          // Slot positions match clockwise layout:
          // 0: Bottom-left, 1: Middle-left, 2: Top-left
          // 3: Top-right, 4: Middle-right, 5: Bottom-right
          if (buckSlot === 0) {
            positionStyle = {
              bottom: '46px',
              left: '72px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 1) {
            positionStyle = {
              top: '40%',
              left: '42px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 2) {
            positionStyle = {
              top: '38px',
              left: '72px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 3) {
            positionStyle = {
              top: '38px',
              right: '72px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 4) {
            positionStyle = {
              top: '40%',
              right: '42px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          } else if (buckSlot === 5) {
            positionStyle = {
              bottom: '46px',
              right: '72px',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            };
          }
        }
        return <div className="absolute z-20" style={positionStyle}>
              <div className="relative">
                <div className="absolute inset-0 bg-blue-600 rounded-full blur-sm animate-pulse opacity-75" />
                <div className="relative bg-white rounded-full p-0.5 shadow-lg border-2 border-blue-800 animate-bounce flex items-center justify-center w-7 h-7">
                  <img alt="Buck" className="w-full h-full rounded-full object-cover" src="/lovable-uploads/7ca746e0-8bcb-4dcd-9d87-407f9457deb8.png" />
                </div>
              </div>
            </div>;
      })()}
        
        {/* Current player's legs indicator on felt - 3-5-7 games only */}
        {gameType !== 'holm-game' && currentPlayer && currentPlayer.legs > 0 && (
          <div 
            className="absolute z-20"
            style={{
              bottom: '8px',
              left: '55%',
              transition: 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="flex">
              {Array.from({ length: Math.min(currentPlayer.legs, legsToWin) }).map((_, i) => (
                <div 
                  key={i} 
                  className="w-7 h-7 rounded-full bg-white border-2 border-amber-500 flex items-center justify-center shadow-lg"
                  style={{
                    marginLeft: i > 0 ? '-10px' : '0',
                    zIndex: Math.min(currentPlayer.legs, legsToWin) - i
                  }}
                >
                  <span className="text-slate-800 font-bold text-xs">L</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Open seats for seat selection - show in actual positions around the table */}
        {canSelectSeat && openSeats.length > 0 && (() => {
          // Use same clockwise distance calculation as occupied player positions
          // This ensures open seats appear in their correct relative positions
          const getOpenSeatSlotIndex = (seatPosition: number): number => {
            // Use same calculation as getClockwiseDistance for consistency with occupied players
            let distance = seatPosition - currentPos;
            if (distance <= 0) distance += 7;
            return distance - 1; // Convert 1-6 distance to 0-5 slot index
          };

          const slotPositions: Record<number, string> = {
            0: 'bottom-2 left-10',        // Bottom-left
            1: 'top-1/2 -translate-y-1/2 left-0', // Left
            2: 'top-2 left-10',           // Top-left
            3: 'top-2 right-10',          // Top-right
            4: 'top-1/2 -translate-y-1/2 right-0', // Right
            5: 'bottom-2 right-10',       // Bottom-right
          };

          return openSeats.map(pos => {
            const slotIndex = getOpenSeatSlotIndex(pos);
            const positionClass = slotPositions[slotIndex] || slotPositions[0];
            
            return (
              <div key={pos} className={`absolute z-20 ${positionClass}`}>
                <button 
                  onClick={() => onSelectSeat && onSelectSeat(pos)} 
                  className="w-12 h-12 rounded-full bg-amber-900/40 border-2 border-dashed border-amber-600/70 flex items-center justify-center hover:bg-amber-800/60 hover:border-amber-500 transition-all active:scale-95"
                >
                  <span className="text-amber-300 text-xl">+</span>
                </button>
              </div>
            );
          });
        })()}
        
      </div>
      
      {/* Bottom section - Current player's cards and actions (swipeable) */}
      <div className="flex-1 min-h-0 bg-gradient-to-t from-background via-background to-background/95 border-t border-border touch-pan-x overflow-hidden" {...swipeHandlers}>
        {/* Status badges */}
        {(pendingSessionEnd || isPaused) && <div className="px-4 py-1.5">
            <div className="flex items-center justify-center gap-2">
              {pendingSessionEnd && <Badge variant="destructive" className="text-xs px-2 py-0.5">LAST HAND</Badge>}
              {isPaused && <Badge variant="outline" className="text-xs px-2 py-0.5 border-yellow-500 text-yellow-500">⏸ PAUSED</Badge>}
            </div>
          </div>}
        
        {/* Game Over state - result message with Next Game button */}
        {isGameOver && lastRoundResult && <div className="px-4 py-3">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-3 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-base text-center mb-3">
                {lastRoundResult.split('|||DEBUG:')[0]}
              </p>
              {isDealer && onNextGame ? <Button onClick={onNextGame} className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold">
                  Next Game
                </Button> : <p className="text-slate-700 text-sm text-center">Waiting for dealer to proceed...</p>}
            </div>
          </div>}
        
        {/* Result message - in bottom section (non-game-over) */}
        {!isGameOver && lastRoundResult && (awaitingNextRound || roundStatus === 'completed' || roundStatus === 'showdown' || allDecisionsIn || chuckyActive) && <div className="px-4 py-2">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-sm text-center">
                {lastRoundResult.split('|||DEBUG:')[0]}
              </p>
            </div>
          </div>}
        
        
        {/* Collapse toggle */}
        <button onClick={() => setIsCardSectionExpanded(!isCardSectionExpanded)} className="w-full flex items-center justify-center py-0.5 text-muted-foreground hover:text-foreground transition-colors">
          {isCardSectionExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
        </button>
        
        {/* Collapsed view - Game Lobby with all players */}
        {!isCardSectionExpanded && <div className="px-3 pb-4 flex-1 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground">Game Lobby</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Pot: <span className="text-poker-gold font-bold">${Math.round(pot)}</span>
                </span>
              </div>
            </div>
            
            {/* Chat panel in collapsed view - always visible */}
            {onSendChat && (
              <div className="mb-3">
                <MobileChatPanel
                  messages={allMessages}
                  onSend={onSendChat}
                  isSending={isChatSending}
                />
              </div>
            )}
            
            {/* All players list */}
            <div className="space-y-2">
              {players.sort((a, b) => a.position - b.position).map(player => {
            const isCurrentUser = player.user_id === currentUserId;
            const isDealing = player.position === dealerPosition;
            const hasBuck = player.position === buckPosition;
            return <div key={player.id} className={`
                        flex items-center justify-between p-2.5 rounded-lg border
                        ${isCurrentUser ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'}
                        ${player.sitting_out ? 'opacity-50' : ''}
                      `}>
                      {/* Left: Position, Name, Badges */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                          ${isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                        `}>
                          {player.position}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold truncate ${isCurrentUser ? 'text-primary' : 'text-foreground'}`}>
                              {player.profiles?.username || (player.is_bot ? `Bot ${player.position}` : `Player ${player.position}`)}
                            </span>
                            {isDealing && <Badge className="text-[9px] px-1 py-0 bg-poker-gold text-black h-4">D</Badge>}
                            {hasBuck && gameType === 'holm-game' && <Badge className="text-[9px] px-1 py-0 bg-amber-600 text-white h-4">Buck</Badge>}
                            {player.is_bot && <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Bot</Badge>}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {player.sitting_out && <span className="text-[10px] text-muted-foreground">Sitting out</span>}
                            {player.current_decision && <span className={`text-[10px] font-medium ${player.current_decision === 'stay' ? 'text-green-500' : 'text-red-400'}`}>
                                {player.current_decision === 'stay' ? '✓ Stayed' : '✗ Folded'}
                              </span>}
                          </div>
                        </div>
                      </div>
                      
                      {/* Right: Chips and Legs */}
                      <div className="flex items-center gap-3">
                        {/* Leg indicator for 3-5-7 - use overlapping L circles */}
                        {gameType !== 'holm-game' && player.legs > 0 && <div className="flex">
                            {Array.from({
                    length: Math.min(player.legs, legsToWin)
                  }).map((_, i) => <div key={i} className="w-5 h-5 rounded-full bg-white border border-slate-400 flex items-center justify-center shadow-sm" style={{
                    marginLeft: i > 0 ? '-6px' : '0',
                    zIndex: Math.min(player.legs, legsToWin) - i
                  }}>
                                <span className="text-slate-800 font-bold text-[10px]">L</span>
                              </div>)}
                          </div>}
                        
                        {/* Chip stack */}
                        <div className={`
                          text-right min-w-[50px] font-bold text-sm
                          ${player.chips < 0 ? 'text-destructive' : 'text-poker-gold'}
                        `}>
                          ${Math.round(player.chips)}
                        </div>
                      </div>
                    </div>;
          })}
            </div>
            
            {/* Game info footer */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {gameType !== 'holm-game' && <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Legs to Win:</span>
                      <span className="font-medium text-foreground">{legsToWin}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leg Value:</span>
                      <span className="font-medium text-foreground">${legValue}</span>
                    </div>
                  </>}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pot Max:</span>
                  <span className="font-medium text-foreground">{potMaxEnabled ? `$${potMaxValue}` : 'Off'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Round:</span>
                  <span className="font-medium text-foreground">{currentRound}</span>
                </div>
              </div>
            </div>
          </div>}
        
        {/* Expanded view - show cards large */}
        {isCardSectionExpanded && currentPlayer && <div className="px-2 flex flex-col">
            {/* Progress bar timer - shows when it's player's turn */}
            {isPlayerTurn && roundStatus === 'betting' && !hasDecided && timeLeft !== null && timeLeft > 0 && maxTime && (
              <div key={`timer-${currentRound}-${currentTurnPosition}`} className="mb-2 px-2">
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden border border-border">
                  <div 
                    className={`h-full transition-[width] duration-1000 ease-linear ${
                      timeLeft <= 3 ? 'bg-red-500' : 
                      timeLeft <= 5 ? 'bg-yellow-500' : 
                      'bg-green-500'
                    }`}
                    style={{ width: `${Math.max(0, (timeLeft / maxTime) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            
            {/* Action buttons - ABOVE cards */}
            {canDecide && <div className="flex gap-2 justify-center mb-1">
                <Button variant="destructive" size="default" onClick={onFold} className="flex-1 max-w-[120px] text-sm font-bold h-9">
                  {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                </Button>
                <Button size="default" onClick={onStay} className="flex-1 max-w-[120px] bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-sm font-bold h-9">
                  Stay
                </Button>
              </div>}
            
            {/* Rejoin Next Hand button for sitting out players */}
            {currentPlayer.sitting_out && !currentPlayer.waiting && (
              <div className="flex justify-center mb-2 px-4">
                <RejoinNextHandButton playerId={currentPlayer.id} />
              </div>
            )}
            
            {/* Decision feedback - above cards */}
            {hasDecided && <div className="flex justify-center mb-1">
                <Badge className={`text-sm px-3 py-0.5 ${(pendingDecision || currentPlayer.current_decision) === 'stay' ? 'bg-green-500 text-white' : 'bg-destructive text-destructive-foreground'}`}>
                  ✓ {(pendingDecision || currentPlayer.current_decision) === 'stay' ? 'STAYED' : 'FOLDED'}
                </Badge>
              </div>}
            
            {/* Cards display - moved up, less padding */}
            {/* Dim current player's cards if they lost (winner exists and it's not them) */}
            <div className="flex items-start justify-center">
              {currentPlayerCards.length > 0 ? <div className={`transform scale-[2.2] origin-top ${isPlayerTurn && roundStatus === 'betting' && !hasDecided && !isPaused && timeLeft !== null && timeLeft <= 3 ? 'animate-rapid-flash' : ''} ${isShowingAnnouncement && winnerPlayerId && !isCurrentPlayerWinner && currentPlayer?.current_decision === 'stay' ? 'opacity-40 grayscale-[30%]' : ''}`}>
                  <PlayerHand 
                    cards={currentPlayerCards} 
                    isHidden={false} 
                    highlightedIndices={isCurrentPlayerWinner ? winningCardHighlights.playerIndices : []}
                    kickerIndices={isCurrentPlayerWinner ? winningCardHighlights.kickerPlayerIndices : []}
                    hasHighlights={isCurrentPlayerWinner && winningCardHighlights.hasHighlights}
                    gameType={gameType}
                    currentRound={currentRound}
                  />
                </div> : <div className="text-sm text-muted-foreground">Waiting for cards...</div>}
            </div>
            
            {/* Player info and chat - below cards */}
            <div className="flex flex-col gap-2 mt-16">
              {/* Name, chips, and hand eval in a row */}
              <div className="flex items-center justify-center gap-3">
                <p className="text-sm font-semibold text-foreground">
                  {currentPlayer.profiles?.username || 'You'}
                  {currentPlayer.sitting_out && !currentPlayer.waiting ? <span className="ml-1 text-destructive font-bold">(sitting out)</span> : currentPlayer.waiting ? <span className="ml-1 text-yellow-500">(waiting)</span> : <span className="ml-1 text-green-500">(active)</span>}
                </p>
                <span className={`text-lg font-bold ${currentPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                  ${currentPlayer.chips.toLocaleString()}
                </span>
                {/* Hand evaluation for Holm only when Chucky is active */}
                {currentPlayerCards.length > 0 && gameType === 'holm-game' && chuckyActive && <Badge className="bg-poker-gold/20 text-poker-gold border-poker-gold/40 text-xs px-2 py-0.5">
                    {formatHandRank(evaluateHand(currentPlayerCards, false).rank)}
                  </Badge>}
              </div>
              
              {/* Chat panel - always visible */}
              {onSendChat && (
                <div className="w-full">
                  <MobileChatPanel
                    messages={allMessages}
                    onSend={onSendChat}
                    isSending={isChatSending}
                  />
                </div>
              )}
            </div>
          </div>}
        
        {/* No player state - only for observers */}
        {isCardSectionExpanded && !currentPlayer && <div className="px-4 pb-4">
            {/* Header with gear for observers */}
            <div className="flex items-center justify-between mb-3">
              {onLeaveGameNow && (
                <PlayerOptionsMenu
                  isSittingOut={false}
                  isObserver={true}
                  waiting={false}
                  autoAnte={false}
                  sitOutNextHand={false}
                  standUpNextHand={false}
                  onAutoAnteChange={() => {}}
                  onSitOutNextHandChange={() => {}}
                  onStandUpNextHandChange={() => {}}
                  onStandUpNow={() => {}}
                  onLeaveGameNow={onLeaveGameNow}
                  variant="mobile"
                />
              )}
            </div>
            
            <p className="text-muted-foreground text-sm text-center mb-3">
              You are observing this game
            </p>
            
            {/* Chat panel for observers - always visible */}
            {onSendChat && (
              <MobileChatPanel
                messages={allMessages}
                onSend={onSendChat}
                isSending={isChatSending}
              />
            )}
          </div>}
      </div>
    </div>;
};