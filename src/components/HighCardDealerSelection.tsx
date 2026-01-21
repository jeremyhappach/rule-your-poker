import { useState, useEffect, useRef, useCallback } from "react";
import { getBotAlias } from "@/lib/botAlias";
import { Card, createDeck, shuffleDeck, RANK_VALUES } from "@/lib/cardUtils";

interface Player {
  id: string;
  user_id: string;
  position: number;
  created_at?: string;
  profiles?: {
    username: string;
  };
  is_bot: boolean;
  sitting_out?: boolean;
}

// Card dealt to a player during dealer selection
export interface DealerSelectionCard {
  playerId: string;
  position: number;
  card: Card;
  isRevealed: boolean;
  isWinner: boolean;
  isDimmed: boolean;
  roundNumber: number; // Which deal round (1 = initial, 2+ = tiebreaker)
}

interface HighCardDealerSelectionProps {
  players: Player[];
  onComplete: (dealerPosition: number) => void;
  isHost: boolean;
  allowBotDealers?: boolean;
  // Callback to provide cards for rendering in the game table
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  // Callback for announcement messages
  onAnnouncementUpdate: (message: string | null, isComplete: boolean) => void;
  // Callback to report the winning position when determined (for spotlight effect)
  onWinnerPositionUpdate?: (position: number | null) => void;
}

export const HighCardDealerSelection = ({ 
  players, 
  onComplete, 
  isHost,
  allowBotDealers = false,
  onCardsUpdate,
  onAnnouncementUpdate,
  onWinnerPositionUpdate
}: HighCardDealerSelectionProps) => {
  const [phase, setPhase] = useState<'announcing' | 'dealing' | 'complete'>('announcing');
  const [playerCards, setPlayerCards] = useState<DealerSelectionCard[]>([]);
  
  const hasInitializedRef = useRef(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const deckRef = useRef<Card[]>([]);
  
  // Filter to eligible dealers: NOT sitting out, and (not a bot OR allowBotDealers)
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  const eligibleDealers = sortedPlayers.filter(p => !p.sitting_out && (!p.is_bot || allowBotDealers));
  
  // Timing constants
  const ANNOUNCE_DURATION = 1500; // Show "High card wins deal" for 1.5s
  const ROUND_PAUSE = 1500; // 1.5s pause after dealing before checking winner/tiebreaker
  const WINNER_ANNOUNCE_DELAY = 2000; // Show winner for 2s before completing
  
  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);
  
  const addTimeout = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const getPlayerName = useCallback((player: Player) => {
    if (player.is_bot) {
      return getBotAlias(sortedPlayers, player.user_id);
    }
    return player.profiles?.username || `Seat ${player.position}`;
  }, [sortedPlayers]);
  
  // Sync cards to parent
  useEffect(() => {
    onCardsUpdate(playerCards);
  }, [playerCards, onCardsUpdate]);
  
  // Run the selection sequence
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // Handle edge cases
    if (eligibleDealers.length === 0) {
      const activePlayers = sortedPlayers.filter(p => !p.sitting_out);
      if (activePlayers.length === 0) {
        onComplete(sortedPlayers[0]?.position || 1);
      } else {
        onComplete(activePlayers[0]?.position || 1);
      }
      return;
    }
    
    // Single eligible dealer: bypass selection
    if (eligibleDealers.length === 1) {
      console.log('[HIGH CARD] Only one eligible dealer, bypassing selection');
      if (isHost) {
        onComplete(eligibleDealers[0].position);
      }
      return;
    }
    
    // Only host runs the actual selection logic
    if (!isHost) {
      // Non-hosts just show the UI - they'll receive updates via the parent syncing state
      return;
    }
    
    console.log('[HIGH CARD] Starting high card dealer selection with', eligibleDealers.length, 'eligible players');
    
    // Initialize deck
    deckRef.current = shuffleDeck(createDeck());
    
    // Start the sequence
    runSelectionRound(eligibleDealers, 1);
    
    return () => clearTimeouts();
  }, []);
  
  const runSelectionRound = useCallback((playersInRound: Player[], roundNum: number) => {
    console.log('[HIGH CARD] Round', roundNum, 'with', playersInRound.length, 'players');
    
    // Clear winner position when starting a new round (including tiebreakers)
    onWinnerPositionUpdate?.(null);
    
    if (roundNum === 1) {
      onAnnouncementUpdate('High card wins deal', false);
    } else {
      onAnnouncementUpdate('Tie! Drawing again...', false);
    }
    setPhase('announcing');
    
    // Deal all cards face-up after brief announcement
    addTimeout(() => {
      setPhase('dealing');
      
      // Deal one card to each player - all at once, all face-up
      const newCards: DealerSelectionCard[] = playersInRound.map((player) => {
        const card = deckRef.current.shift()!;
        return {
          playerId: player.id,
          position: player.position,
          card,
          isRevealed: true, // Always face-up
          isWinner: false,
          isDimmed: false,
          roundNumber: roundNum
        };
      });
      
      // Update cards immediately (all at once)
      setPlayerCards(prev => {
        const existingForOtherRounds = prev.filter(pc => pc.roundNumber !== roundNum);
        return [...existingForOtherRounds, ...newCards];
      });
      
      // After 1.5s pause, check for winner or tiebreaker
      addTimeout(() => {
        determineWinner(newCards, playersInRound, roundNum);
      }, ROUND_PAUSE);
      
    }, ANNOUNCE_DURATION);
  }, [addTimeout, onAnnouncementUpdate]);
  
  const determineWinner = useCallback((cards: DealerSelectionCard[], playersInRound: Player[], roundNum: number) => {
    // Find highest card(s)
    let highestRank = 0;
    let winners: DealerSelectionCard[] = [];
    
    cards.forEach(pc => {
      const rankValue = RANK_VALUES[pc.card.rank];
      if (rankValue > highestRank) {
        highestRank = rankValue;
        winners = [pc];
      } else if (rankValue === highestRank) {
        winners.push(pc);
      }
    });
    
    console.log('[HIGH CARD] Round', roundNum, 'highest rank:', highestRank, 'winners:', winners.length);
    
    // Update card states - highlight winners, dim losers
    setPlayerCards(prev => 
      prev.map(p => {
        if (p.roundNumber !== roundNum) return p;
        const isWinner = winners.some(w => w.playerId === p.playerId);
        return {
          ...p,
          isWinner,
          isDimmed: !isWinner
        };
      })
    );
    
    if (winners.length === 1) {
      // Single winner!
      const winnerPlayer = playersInRound.find(p => p.id === winners[0].playerId);
      if (winnerPlayer) {
        const name = getPlayerName(winnerPlayer);
        onAnnouncementUpdate(`${name} wins the deal!`, true);
        setPhase('complete');
        
        // Report winner position for spotlight effect
        onWinnerPositionUpdate?.(winnerPlayer.position);
        
        // Complete after showing winner
        addTimeout(() => {
          onComplete(winnerPlayer.position);
        }, WINNER_ANNOUNCE_DELAY);
      }
    } else {
      // Tiebreaker needed - run next round after brief pause
      const tiedPlayerIds = winners.map(w => w.playerId);
      const tiedPlayers = playersInRound.filter(p => tiedPlayerIds.includes(p.id));
      
      addTimeout(() => {
        runSelectionRound(tiedPlayers, roundNum + 1);
      }, ROUND_PAUSE);
    }
  }, [addTimeout, getPlayerName, onComplete, onAnnouncementUpdate, runSelectionRound, ROUND_PAUSE]);
  
  // This component doesn't render anything - it just manages state
  // The actual rendering happens in MobileGameTable/GameTable via props
  return null;
};
