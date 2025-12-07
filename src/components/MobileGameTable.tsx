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
  waiting?: boolean;
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
  // Game over props
  isGameOver?: boolean;
  isDealer?: boolean;
  onNextGame?: () => void;
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
  isGameOver,
  isDealer,
  onNextGame,
  onStay,
  onFold,
  onSelectSeat,
}: MobileGameTableProps) => {
  const { getTableColors, deckColorMode, getFourColorSuit, getCardBackColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const cardBackColors = getCardBackColors();
  
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

  // Calculate expected card count for 3-5-7 games
  const getExpectedCardCount = (round: number): number => {
    if (gameType === 'holm-game') return 4;
    if (round === 1) return 3;
    if (round === 2) return 5;
    if (round === 3) return 7;
    return 3;
  };
  
  const expectedCardCount = getExpectedCardCount(currentRound);

  // Get player status for display - lime green for active like reference image
  const getPlayerStatusStyle = (player: Player) => {
    if (player.sitting_out && !player.waiting) {
      return ''; // transparent/no coloring for sitting out
    }
    if (player.waiting) {
      return 'bg-yellow-300/40'; // pale yellow for waiting
    }
    return 'bg-lime-400/50'; // light lime green for active (matches reference image)
  };

  // Render player chip - chipstack in center, name below
  const renderPlayerChip = (player: Player) => {
    const isTheirTurn = gameType === 'holm-game' && currentTurnPosition === player.position && !awaitingNextRound;
    const playerDecision = player.current_decision;
    const playerCardsData = playerCards.find(pc => pc.player_id === player.id);
    const cards = playerCardsData?.cards || [];
    
    // Show card backs for active players even if we don't have their cards data
    const isActivePlayer = player.status === 'active' && !player.sitting_out;
    const showCardBacks = isActivePlayer && expectedCardCount > 0 && currentRound > 0;
    const cardCountToShow = cards.length > 0 ? cards.length : expectedCardCount;
    
    // Status background color
    const statusBgClass = getPlayerStatusStyle(player);
    
    return (
      <div key={player.id} className="flex flex-col items-center gap-0.5 bg-black/60 backdrop-blur-sm rounded-lg p-1.5">
        <MobilePlayerTimer
          timeLeft={timeLeft}
          maxTime={maxTime}
          isActive={isTheirTurn && roundStatus === 'betting'}
          size={52}
        >
          <div className={`
            w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 border-amber-700/60
            ${playerDecision === 'fold' ? 'bg-slate-700/80 opacity-50' : 'bg-amber-900'}
            ${playerDecision === 'stay' ? 'ring-2 ring-green-500' : ''}
            ${player.sitting_out ? 'opacity-40 grayscale' : ''}
            ${isTheirTurn ? 'ring-3 ring-yellow-400 animate-pulse' : ''}
            ${statusBgClass}
          `}>
            <span className={`text-sm font-bold leading-none ${player.chips < 0 ? 'text-red-400' : 'text-poker-gold'}`}>
              ${Math.round(player.chips)}
            </span>
          </div>
        </MobilePlayerTimer>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-white truncate max-w-[60px] leading-none font-semibold drop-shadow-md">
            {player.profiles?.username || (player.is_bot ? `Bot` : `P${player.position}`)}
          </span>
          {/* Legs indicator for 3-5-7 games */}
          {gameType !== 'holm-game' && player.legs > 0 && (
            <div className="flex gap-0.5">
              {Array.from({ length: Math.min(player.legs, legsToWin) }, (_, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-poker-gold" />
              ))}
            </div>
          )}
        </div>
        {/* Mini cards indicator - show for active players with expected card count */}
        {showCardBacks && cardCountToShow > 0 && (
          <div className="flex gap-0.5">
            {Array.from({ length: Math.min(cardCountToShow, 7) }, (_, i) => (
              <div 
                key={i} 
                className="w-2 h-3 rounded-[1px] border border-amber-600/50"
                style={{ background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)` }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] overflow-hidden bg-background">
      {/* Status badges moved to bottom section */}
      
      {/* Main table area - USE MORE VERTICAL SPACE */}
      <div className="flex-1 relative overflow-hidden min-h-0" style={{ maxHeight: '55vh' }}>
        {/* Table felt background - wide horizontal ellipse */}
        <div 
          className="absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner"
          style={{
            background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.4)'
          }}
        />
        
        {/* Game name on felt */}
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center">
          <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
            {gameType === 'holm-game' ? 'Holm' : '3-5-7'}
          </span>
          <span className="text-white/40 text-xs font-medium">
            {potMaxEnabled ? `$${potMaxValue} max` : 'No Limit'}
          </span>
          {gameType !== 'holm-game' && (
            <span className="text-white/40 text-xs font-medium">
              {legsToWin} legs to win
            </span>
          )}
        </div>
        
        {/* Chopped Animation */}
        <ChoppedAnimation show={showChopped} onComplete={() => setShowChopped(false)} />
        
        {/* Pot display - above community cards, vertically centered */}
        <div className="absolute top-[35%] left-1/2 transform -translate-x-1/2 -translate-y-full z-20">
          <div className="bg-black/70 backdrop-blur-sm rounded-full px-5 py-1.5 border border-poker-gold/60">
            <span className="text-poker-gold font-bold text-xl">${Math.round(pot)}</span>
          </div>
        </div>
        
        {/* Community Cards - vertically centered */}
        {gameType === 'holm-game' && communityCards && communityCards.length > 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 scale-[1.8]">
            <CommunityCards 
              cards={communityCards} 
              revealed={communityCardsRevealed || 2} 
            />
          </div>
        )}
        
        {/* Chucky's Hand - directly below community cards, no container */}
        {gameType === 'holm-game' && chuckyActive && chuckyCards && chuckyCards.length > 0 && (
          <div className="absolute top-[62%] left-1/2 transform -translate-x-1/2 z-10 flex items-center gap-1.5">
            <span className="text-red-400 text-sm mr-1">👿</span>
            {chuckyCards.map((card, index) => {
              const isRevealed = index < (chuckyCardsRevealed || 0);
              const isFourColor = deckColorMode === 'four_color';
              const fourColorConfig = getFourColorSuit(card.suit);
              
              // Card face styling based on deck mode
              const cardBg = isRevealed 
                ? (isFourColor && fourColorConfig ? fourColorConfig.bg : 'white')
                : undefined;
              const textColor = isRevealed
                ? (isFourColor ? 'text-white' : (card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-slate-900'))
                : '';
              
              return (
                <div key={index} className="w-10 h-14 sm:w-11 sm:h-15">
                  {isRevealed ? (
                    <div 
                      className="w-full h-full rounded-md border-2 border-red-500 flex flex-col items-center justify-center shadow-lg"
                      style={{ backgroundColor: cardBg }}
                    >
                      <span className={`text-xl font-black leading-none ${textColor}`}>
                        {card.rank}
                      </span>
                      {!isFourColor && (
                        <span className={`text-2xl leading-none -mt-0.5 ${textColor}`}>
                          {card.suit}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div 
                      className="w-full h-full rounded-md border-2 border-red-600 flex items-center justify-center shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)` }}
                    >
                      <span className="text-amber-400/50 text-xl">?</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* Players arranged around table edges - 6 positions for other players */}
        {/* Top row: 2 players at top corners */}
        <div className="absolute top-2 left-4 z-10">
          {otherPlayers[0] && renderPlayerChip(otherPlayers[0])}
        </div>
        <div className="absolute top-2 right-4 z-10">
          {otherPlayers[1] && renderPlayerChip(otherPlayers[1])}
        </div>
        
        {/* Middle row: 2 players on sides */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 z-10">
          {otherPlayers[2] && renderPlayerChip(otherPlayers[2])}
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 right-0 z-10">
          {otherPlayers[3] && renderPlayerChip(otherPlayers[3])}
        </div>
        
        {/* Bottom row: 2 players at bottom corners */}
        <div className="absolute bottom-2 left-4 z-10">
          {otherPlayers[4] && renderPlayerChip(otherPlayers[4])}
        </div>
        <div className="absolute bottom-2 right-4 z-10">
          {otherPlayers[5] && renderPlayerChip(otherPlayers[5])}
        </div>
        
        {/* Dealer button on felt - positioned near the dealer's seat */}
        {dealerPosition !== null && dealerPosition !== undefined && (() => {
          // Find dealer player in otherPlayers
          const dealerPlayerIndex = otherPlayers.findIndex(p => p.position === dealerPosition);
          const isCurrentPlayerDealer = currentPlayer?.position === dealerPosition;
          
          // Position the dealer button based on where the dealer is
          let buttonPosition = 'bottom-16 left-1/2 transform -translate-x-1/2'; // default center bottom for current player
          
          if (!isCurrentPlayerDealer && dealerPlayerIndex >= 0) {
            // Position based on other player's location
            if (dealerPlayerIndex <= 2) {
              // Top row
              if (dealerPlayerIndex === 0) buttonPosition = 'top-24 left-8';
              else if (dealerPlayerIndex === 1) buttonPosition = 'top-24 left-1/2 transform -translate-x-1/2';
              else buttonPosition = 'top-24 right-8';
            } else if (dealerPlayerIndex === 3) {
              buttonPosition = 'top-1/2 -translate-y-1/2 left-16';
            } else if (dealerPlayerIndex === 4) {
              buttonPosition = 'top-1/2 -translate-y-1/2 right-16';
            } else if (dealerPlayerIndex === 5) {
              buttonPosition = 'bottom-16 left-8';
            } else if (dealerPlayerIndex === 6) {
              buttonPosition = 'bottom-16 right-8';
            }
          }
          
          return (
            <div className={`absolute ${buttonPosition} z-20`}>
              <div className="w-7 h-7 rounded-full bg-white border-2 border-amber-800 flex items-center justify-center shadow-lg">
                <span className="text-black font-bold text-xs">D</span>
              </div>
            </div>
          );
        })()}
        
        {/* Open seats for seat selection */}
        {canSelectSeat && openSeats.length > 0 && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2 z-20">
            {openSeats.slice(0, 5).map((pos) => (
              <button
                key={pos}
                onClick={() => onSelectSeat(pos)}
                className="w-8 h-8 rounded-full bg-amber-900/40 border-2 border-dashed border-amber-700/60 flex items-center justify-center text-amber-300 text-sm font-bold hover:bg-amber-900/60 transition-colors"
              >
                {pos}
              </button>
            ))}
          </div>
        )}
        
      </div>
      
      {/* Bottom section - Current player's cards and actions (swipeable) */}
      <div 
        className="flex-1 bg-gradient-to-t from-background via-background to-background/95 border-t border-border touch-pan-x overflow-auto"
        {...swipeHandlers}
      >
        {/* Status badges */}
        {(pendingSessionEnd || isPaused) && (
          <div className="px-4 py-1.5">
            <div className="flex items-center justify-center gap-2">
              {pendingSessionEnd && (
                <Badge variant="destructive" className="text-xs px-2 py-0.5">LAST HAND</Badge>
              )}
              {isPaused && (
                <Badge variant="outline" className="text-xs px-2 py-0.5 border-yellow-500 text-yellow-500">⏸ PAUSED</Badge>
              )}
            </div>
          </div>
        )}
        
        {/* Game Over state - result message with Next Game button */}
        {isGameOver && lastRoundResult && (
          <div className="px-4 py-3">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-4 py-3 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-base text-center mb-3">
                {lastRoundResult.split('|||DEBUG:')[0]}
              </p>
              {isDealer && onNextGame ? (
                <Button
                  onClick={onNextGame}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold"
                >
                  Next Game
                </Button>
              ) : (
                <p className="text-slate-700 text-sm text-center">Waiting for dealer to proceed...</p>
              )}
            </div>
          </div>
        )}
        
        {/* Result message - in bottom section (non-game-over) */}
        {!isGameOver && lastRoundResult && (awaitingNextRound || roundStatus === 'completed' || roundStatus === 'showdown' || allDecisionsIn || chuckyActive) && (
          <div className="px-4 py-2">
            <div className="bg-poker-gold/95 backdrop-blur-sm rounded-lg px-3 py-2 shadow-xl border-2 border-amber-900">
              <p className="text-slate-900 font-bold text-sm text-center">
                {lastRoundResult.split('|||DEBUG:')[0]}
              </p>
            </div>
          </div>
        )}
        
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
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronUp className="w-5 h-5" />
          )}
        </button>
        
        {/* Collapsed view - Game Lobby with all players */}
        {!isCardSectionExpanded && (
          <div className="px-3 pb-4 flex-1 overflow-auto">
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
            
            {/* All players list */}
            <div className="space-y-2">
              {players
                .sort((a, b) => a.position - b.position)
                .map((player) => {
                  const isCurrentUser = player.user_id === currentUserId;
                  const isDealing = player.position === dealerPosition;
                  const hasBuck = player.position === buckPosition;
                  
                  return (
                    <div 
                      key={player.id} 
                      className={`
                        flex items-center justify-between p-2.5 rounded-lg border
                        ${isCurrentUser ? 'bg-primary/10 border-primary/30' : 'bg-card border-border'}
                        ${player.sitting_out ? 'opacity-50' : ''}
                      `}
                    >
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
                            {isDealing && (
                              <Badge className="text-[9px] px-1 py-0 bg-poker-gold text-black h-4">D</Badge>
                            )}
                            {hasBuck && gameType === 'holm-game' && (
                              <Badge className="text-[9px] px-1 py-0 bg-amber-600 text-white h-4">Buck</Badge>
                            )}
                            {player.is_bot && (
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">Bot</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {player.sitting_out && (
                              <span className="text-[10px] text-muted-foreground">Sitting out</span>
                            )}
                            {player.current_decision && (
                              <span className={`text-[10px] font-medium ${player.current_decision === 'stay' ? 'text-green-500' : 'text-red-400'}`}>
                                {player.current_decision === 'stay' ? '✓ Stayed' : '✗ Folded'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Right: Chips and Legs */}
                      <div className="flex items-center gap-3">
                        {/* Legs for 3-5-7 */}
                        {gameType !== 'holm-game' && (
                          <div className="flex items-center gap-1">
                            {player.legs > 0 ? (
                              <div className="flex gap-0.5">
                                {Array.from({ length: Math.min(player.legs, legsToWin) }).map((_, i) => (
                                  <div key={i} className="w-3 h-3 rounded-full bg-poker-gold" />
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{player.legs}/{legsToWin}</span>
                            )}
                          </div>
                        )}
                        
                        {/* Chip stack */}
                        <div className={`
                          text-right min-w-[50px] font-bold text-sm
                          ${player.chips < 0 ? 'text-destructive' : 'text-poker-gold'}
                        `}>
                          ${Math.round(player.chips)}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            
            {/* Game info footer */}
            <div className="mt-4 pt-3 border-t border-border">
              <div className="grid grid-cols-2 gap-3 text-xs">
                {gameType !== 'holm-game' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Legs to Win:</span>
                      <span className="font-medium text-foreground">{legsToWin}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leg Value:</span>
                      <span className="font-medium text-foreground">${legValue}</span>
                    </div>
                  </>
                )}
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
          </div>
        )}
        
        {/* Expanded view - show cards large */}
        {isCardSectionExpanded && currentPlayer && (
          <div className="px-2 flex flex-col">
            {/* Action buttons - ABOVE cards */}
            {canDecide && (
              <div className="flex gap-2 justify-center mb-1">
                <Button
                  variant="destructive"
                  size="default"
                  onClick={onFold}
                  className="flex-1 max-w-[120px] text-sm font-bold h-9"
                >
                  {gameType === 'holm-game' ? 'Fold' : 'Drop'}
                </Button>
                <Button
                  size="default"
                  onClick={onStay}
                  className="flex-1 max-w-[120px] bg-poker-chip-green hover:bg-poker-chip-green/80 text-white text-sm font-bold h-9"
                >
                  Stay
                </Button>
              </div>
            )}
            
            {/* Decision feedback - above cards */}
            {hasDecided && (
              <div className="flex justify-center mb-1">
                <Badge 
                  className={`text-sm px-3 py-0.5 ${
                    (pendingDecision || currentPlayer.current_decision) === 'stay' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-destructive text-destructive-foreground'
                  }`}
                >
                  ✓ {(pendingDecision || currentPlayer.current_decision) === 'stay' ? 'STAYED' : 'FOLDED'}
                </Badge>
              </div>
            )}
            
            {/* Cards display - moved up, less padding */}
            <div className="flex items-start justify-center">
              {currentPlayerCards.length > 0 ? (
                <div className="transform scale-[2.2] origin-top">
                  <PlayerHand 
                    cards={currentPlayerCards} 
                    isHidden={false}
                  />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Waiting for cards...</div>
              )}
            </div>
            
            {/* Chipstack and player info - below cards */}
            <div className="flex flex-col items-center gap-2 mt-16">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground leading-tight">
                    {currentPlayer.profiles?.username || 'You'}
                    {/* Status indicator */}
                    {currentPlayer.sitting_out && !currentPlayer.waiting ? (
                      <span className="ml-1 text-destructive font-bold">(sitting out)</span>
                    ) : currentPlayer.waiting ? (
                      <span className="ml-1 text-yellow-500">(waiting)</span>
                    ) : (
                      <span className="ml-1 text-green-500">(active)</span>
                    )}
                  </p>
                  <p className={`text-xl font-bold leading-tight ${currentPlayer.chips < 0 ? 'text-destructive' : 'text-poker-gold'}`}>
                    ${currentPlayer.chips.toLocaleString()}
                  </p>
                </div>
              
                {/* Hand evaluation for 3-5-7 */}
                {currentPlayerCards.length > 0 && gameType !== 'holm-game' && !chuckyActive && (
                  <Badge className="bg-poker-gold/20 text-poker-gold border-poker-gold/40 text-xs px-2 py-0.5">
                    {formatHandRank(evaluateHand(currentPlayerCards, true).rank)}
                  </Badge>
                )}
                
                {/* Legs indicator for 3-5-7 */}
                {gameType !== 'holm-game' && currentPlayer.legs > 0 && (
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: currentPlayer.legs }).map((_, i) => (
                      <ChipStack key={i} amount={legValue} size="sm" variant="leg" />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Timer display when it's player's turn */}
              {isPlayerTurn && roundStatus === 'betting' && !hasDecided && timeLeft !== null && (
                <div className={`text-sm font-bold ${timeLeft <= 3 ? 'text-destructive animate-pulse' : timeLeft <= 5 ? 'text-yellow-500' : 'text-green-500'}`}>
                  On You: {timeLeft}s
                </div>
              )}
            </div>
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
