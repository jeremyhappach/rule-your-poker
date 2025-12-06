import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlayerHand } from "./PlayerHand";
import { ChipStack } from "./ChipStack";
import { CommunityCards } from "./CommunityCards";
import { ChuckyHand } from "./ChuckyHand";
import { ChoppedAnimation } from "./ChoppedAnimation";
import { MobilePlayerTimer } from "./MobilePlayerTimer";
import { Card as CardType, evaluateHand, formatHandRank } from "@/lib/cardUtils";
import { useState, useEffect, useRef, useCallback } from "react";
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

  return { onTouchStart, onTouchMove, onTouchEnd };
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
  profiles?: {
    username: string;
  };
}

interface PlayerCards {
  player_id: string;
  cards: CardType[];
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
  onStay: () => void;
  onFold: () => void;
  onSelectSeat?: (position: number) => void;
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
  onStay,
  onFold,
  onSelectSeat,
}: MobileGameTableProps) => {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  
  // Collapsible card section state
  const [isCardSectionExpanded, setIsCardSectionExpanded] = useState(true);
  
  // Swipe gesture handlers
  const swipeHandlers = useSwipeGesture(
    () => setIsCardSectionExpanded(true),  // Swipe up = expand
    () => setIsCardSectionExpanded(false)  // Swipe down = collapse
  );
  
  // Chopped animation state
  const [showChopped, setShowChopped] = useState(false);
  const lastChoppedResultRef = useRef<string | null>(null);
  
  // Find current player and their cards
  const currentPlayer = players.find(p => p.user_id === currentUserId);
  const currentPlayerCards = currentPlayer 
    ? playerCards.find(pc => pc.player_id === currentPlayer.id)?.cards || []
    : [];
  
  // Calculate lose amount
  const loseAmount = potMaxEnabled ? Math.min(pot, potMaxValue) : pot;
  
  // Check if current player can decide
  const hasDecided = currentPlayer?.decision_locked || !!pendingDecision;
  const buckIsAssigned = buckPosition !== null && buckPosition !== undefined;
  const roundIsReady = currentTurnPosition !== null && currentTurnPosition !== undefined;
  const roundIsActive = roundStatus === 'betting' || roundStatus === 'active';
  
  const isPlayerTurn = gameType === 'holm-game' 
    ? (buckIsAssigned && roundIsReady && roundIsActive && currentTurnPosition === currentPlayer?.position && !awaitingNextRound)
    : true;
  
  const canDecide = currentPlayer && 
    !hasDecided && 
    currentPlayer.status === 'active' && 
    !allDecisionsIn && 
    isPlayerTurn && 
    !isPaused &&
    currentPlayerCards.length > 0;

  // Detect Chucky chopped animation
  useEffect(() => {
    if (
      gameType === 'holm-game' && 
      lastRoundResult && 
      lastRoundResult !== lastChoppedResultRef.current &&
      currentUserId
    ) {
      const currentUsername = currentPlayer?.profiles?.username || '';
      if (!currentUsername) return;
      
      const is1v1Loss = lastRoundResult.includes(`Chucky beat ${currentUsername} `);
      const isTieBreakerLoss = lastRoundResult.includes('lose to Chucky') && 
        (lastRoundResult.includes(`${currentUsername} and `) || 
         lastRoundResult.includes(` and ${currentUsername} lose`) ||
         lastRoundResult.includes(`! ${currentUsername} lose`));
      
      if (is1v1Loss || isTieBreakerLoss) {
        lastChoppedResultRef.current = lastRoundResult;
        setShowChopped(true);
      }
    }
  }, [lastRoundResult, gameType, currentPlayer, currentUserId]);

  // Get other players (not current user)
  const otherPlayers = players.filter(p => p.user_id !== currentUserId);
  
  // Get occupied positions for open seats
  const occupiedPositions = new Set(players.map(p => p.position));
  const maxSeats = 7;
  const allPositions = Array.from({ length: maxSeats }, (_, i) => i + 1);
  const openSeats = allPositions.filter(pos => !occupiedPositions.has(pos));
  const canSelectSeat = onSelectSeat && (!currentPlayer || currentPlayer.sitting_out);

  // Render a compact player chip
  const renderPlayerChip = (player: Player, size: 'sm' | 'md' = 'sm') => {
    const isTheirTurn = gameType === 'holm-game' && currentTurnPosition === player.position && !awaitingNextRound;
    const playerDecision = player.current_decision;
    const playerCardsData = playerCards.find(pc => pc.player_id === player.id);
    const cards = playerCardsData?.cards || [];
    const chipSize = size === 'sm' ? 32 : 36;
    const innerSize = size === 'sm' ? 'w-6 h-6 text-[8px]' : 'w-7 h-7 text-[9px]';
    
    return (
      <div key={player.id} className="flex flex-col items-center gap-0.5">
        <MobilePlayerTimer
          timeLeft={timeLeft}
          maxTime={maxTime}
          isActive={isTheirTurn && roundStatus === 'betting'}
          size={chipSize}
        >
          <div className={`
            ${innerSize} rounded-full flex items-center justify-center font-bold
            ${playerDecision === 'fold' ? 'bg-muted text-muted-foreground opacity-50' : 'bg-amber-900 text-amber-100'}
            ${playerDecision === 'stay' ? 'ring-2 ring-green-500' : ''}
            ${player.sitting_out ? 'opacity-40 grayscale' : ''}
          `}>
            {player.profiles?.username?.substring(0, 2).toUpperCase() || 
             (player.is_bot ? '🤖' : `P${player.position}`)}
          </div>
        </MobilePlayerTimer>
        <span className="text-[8px] text-amber-100 truncate max-w-[50px] leading-none">
          {player.profiles?.username || (player.is_bot ? `Bot` : `P${player.position}`)}
        </span>
        <span className={`text-[9px] font-bold leading-none ${player.chips < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
          ${player.chips}
        </span>
        {player.position === dealerPosition && (
          <Badge className="text-[6px] px-0.5 py-0 bg-poker-gold text-black h-3">D</Badge>
        )}
        {/* Mini cards */}
        {cards.length > 0 && (
          <div className="flex gap-px">
            {cards.slice(0, 4).map((_, i) => (
              <div key={i} className="w-2 h-3 bg-gradient-to-br from-blue-800 to-blue-950 rounded-[1px] border border-blue-600/50" />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] overflow-hidden">
      {/* Top bar - Pot info (more compact) */}
      <div className="flex-shrink-0 bg-background/95 backdrop-blur-sm border-b border-border px-2 py-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Pot:</span>
            <span className="text-sm font-bold text-poker-gold">${pot}</span>
          </div>
          {pendingSessionEnd && (
            <Badge variant="destructive" className="text-[8px] px-1 py-0">LAST</Badge>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Lose:</span>
            <span className="text-xs font-semibold text-destructive">${loseAmount}</span>
          </div>
        </div>
      </div>
      
      {/* Main table area - compressed height */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {/* Table felt background - full width, less rounded */}
        <div 
          className="absolute inset-x-0 inset-y-1 mx-1 rounded-[30%] border-2 border-amber-900 shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)'
          }}
        />
        
        {/* Chopped Animation */}
        <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
        
        {/* Community Cards - centered */}
        {gameType === 'holm-game' && communityCards && communityCards.length > 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-75">
            <CommunityCards 
              cards={communityCards} 
              revealed={communityCardsRevealed || 2} 
            />
          </div>
        )}
        
        {/* Chucky's Hand */}
        {gameType === 'holm-game' && chuckyActive && chuckyCards && (
          <div className="absolute top-[62%] left-1/2 transform -translate-x-1/2 z-10 scale-75">
            <ChuckyHand 
              cards={chuckyCards}
              show={true}
              revealed={chuckyCardsRevealed}
            />
          </div>
        )}
        
        {/* Players arranged around table - 7 positions */}
        {/* Top row: 3 players */}
        <div className="absolute top-1 left-0 right-0 flex justify-between px-3">
          <div className="flex-1 flex justify-start">
            {otherPlayers[0] && renderPlayerChip(otherPlayers[0])}
          </div>
          <div className="flex-1 flex justify-center">
            {otherPlayers[1] && renderPlayerChip(otherPlayers[1])}
          </div>
          <div className="flex-1 flex justify-end">
            {otherPlayers[2] && renderPlayerChip(otherPlayers[2])}
          </div>
        </div>
        
        {/* Middle row: 2 players on sides */}
        <div className="absolute top-1/2 -translate-y-1/2 left-1 z-10">
          {otherPlayers[3] && renderPlayerChip(otherPlayers[3])}
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 right-1 z-10">
          {otherPlayers[4] && renderPlayerChip(otherPlayers[4])}
        </div>
        
        {/* Bottom corners: last 2 players (if more than 5 other players) */}
        <div className="absolute bottom-2 left-4">
          {otherPlayers[5] && renderPlayerChip(otherPlayers[5])}
        </div>
        <div className="absolute bottom-2 right-4">
          {otherPlayers[6] && renderPlayerChip(otherPlayers[6])}
        </div>
        
        {/* Open seats for seat selection */}
        {canSelectSeat && openSeats.length > 0 && (
          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1 z-20">
            {openSeats.slice(0, 5).map((pos) => (
              <button
                key={pos}
                onClick={() => onSelectSeat(pos)}
                className="w-7 h-7 rounded-full bg-amber-900/30 border border-dashed border-amber-700/50 flex items-center justify-center text-amber-300/70 text-[8px] hover:bg-amber-900/50 transition-colors"
              >
                {pos}
              </button>
            ))}
          </div>
        )}
        
        {/* Result message overlay */}
        {lastRoundResult && (awaitingNextRound || roundStatus === 'completed' || roundStatus === 'showdown' || allDecisionsIn || chuckyActive) && (
          <div className="absolute inset-x-2 top-1/2 transform -translate-y-1/2 z-20">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-xs text-center animate-pulse">
                {lastRoundResult.split('|||DEBUG:')[0]}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Bottom section - Current player's cards and actions (swipeable) */}
      <div 
        className="flex-shrink-0 bg-gradient-to-t from-background via-background to-background/95 border-t border-border touch-pan-x"
        {...swipeHandlers}
      >
        {/* Swipe indicator bar */}
        <div className="flex justify-center py-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        
        {/* Collapse toggle */}
        <button
          onClick={() => setIsCardSectionExpanded(!isCardSectionExpanded)}
          className="w-full flex items-center justify-center py-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isCardSectionExpanded ? (
            <>
              <ChevronDown className="w-4 h-4 mr-1" />
              <span className="text-[10px]">Collapse</span>
            </>
          ) : (
            <>
              <ChevronUp className="w-4 h-4 mr-1" />
              <span className="text-[10px]">Show Cards</span>
            </>
          )}
        </button>
        
        {/* Collapsed view - show table info */}
        {!isCardSectionExpanded && (
          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {players.slice(0, 6).map((player) => (
                <div key={player.id} className="bg-card rounded p-1.5 border border-border">
                  <p className="text-[10px] font-medium truncate text-foreground">
                    {player.profiles?.username || `P${player.position}`}
                  </p>
                  <p className={`text-xs font-bold ${player.chips < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                    ${player.chips}
                  </p>
                  {gameType !== 'holm-game' && player.legs > 0 && (
                    <div className="flex justify-center gap-0.5 mt-0.5">
                      {Array.from({ length: player.legs }).map((_, i) => (
                        <ChipStack key={i} amount={legValue} size="sm" variant="leg" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Expanded view - show cards large */}
        {isCardSectionExpanded && currentPlayer && (
          <div className="px-4 pb-4">
            {/* Current player info bar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MobilePlayerTimer
                  timeLeft={timeLeft}
                  maxTime={maxTime}
                  isActive={isPlayerTurn && roundStatus === 'betting' && !hasDecided}
                  size={36}
                >
                  <div className="w-7 h-7 rounded-full bg-poker-gold flex items-center justify-center">
                    <span className="text-black text-[10px] font-bold">YOU</span>
                  </div>
                </MobilePlayerTimer>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {currentPlayer.profiles?.username || 'You'}
                  </p>
                  <p className={`text-xs font-bold ${currentPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                    ${currentPlayer.chips.toLocaleString()}
                  </p>
                </div>
              </div>
              
              {/* Hand evaluation */}
              {currentPlayerCards.length > 0 && gameType !== 'holm-game' && !chuckyActive && (
                <Badge className="bg-poker-gold/20 text-poker-gold border-poker-gold/40 text-xs">
                  {formatHandRank(evaluateHand(currentPlayerCards, true).rank)}
                </Badge>
              )}
              
              {/* Legs indicator for 3-5-7 */}
              {gameType !== 'holm-game' && (
                <div className="flex items-center gap-1">
                  {currentPlayer.legs > 0 ? (
                    Array.from({ length: currentPlayer.legs }).map((_, i) => (
                      <ChipStack key={i} amount={legValue} size="sm" variant="leg" />
                    ))
                  ) : (
                    <span className="text-[10px] text-muted-foreground">No legs</span>
                  )}
                </div>
              )}
            </div>
            
            {/* Large cards display */}
            <div className="flex justify-center mb-3">
              {currentPlayerCards.length > 0 ? (
                <PlayerHand 
                  cards={currentPlayerCards} 
                  isHidden={false}
                />
              ) : (
                <div className="text-sm text-muted-foreground py-8">Waiting for cards...</div>
              )}
            </div>
            
            {/* Action buttons */}
            {canDecide && (
              <div className="flex gap-3 justify-center">
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={onFold}
                  className="flex-1 max-w-[140px] text-base font-bold"
                >
                  {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                </Button>
                <Button
                  size="lg"
                  onClick={onStay}
                  className="flex-1 max-w-[140px] bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-base font-bold"
                >
                  Stay
                </Button>
              </div>
            )}
            
            {/* Decision feedback */}
            {hasDecided && (
              <div className="flex justify-center">
                <Badge 
                  className={`text-base px-4 py-1 ${
                    (pendingDecision || currentPlayer.current_decision) === 'stay' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-destructive text-destructive-foreground'
                  }`}
                >
                  ✓ {(pendingDecision || currentPlayer.current_decision) === 'stay' ? 'STAYED' : 'FOLDED'}
                </Badge>
              </div>
            )}
          </div>
        )}
        
        {/* No player state */}
        {isCardSectionExpanded && !currentPlayer && (
          <div className="px-4 pb-4 text-center">
            <p className="text-sm text-muted-foreground">Select a seat to join the game</p>
          </div>
        )}
      </div>
    </div>
  );
};
