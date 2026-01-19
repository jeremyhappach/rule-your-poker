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
  // Callback to provide cards for rendering in the game table
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  // Callback for announcement messages
  onAnnouncementUpdate: (message: string | null, isComplete: boolean) => void;
}

export const HighCardDealerSelection = ({ 
  players, 
  onComplete, 
  isHost,
  onCardsUpdate,
  onAnnouncementUpdate
}: HighCardDealerSelectionProps) => {
  const [phase, setPhase] = useState<'announcing' | 'dealing' | 'revealing' | 'tiebreaker' | 'complete'>('announcing');
  const [playerCards, setPlayerCards] = useState<DealerSelectionCard[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  
  const hasInitializedRef = useRef(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  // Filter to only human players who are NOT sitting out (eligible dealers)
  const sortedPlayers = [...players].sort((a, b) => a.position - b.position);
  const eligibleDealers = sortedPlayers.filter(p => !p.is_bot && !p.sitting_out);
  
  // Timing constants (1.5s between cards as requested)
  const ANNOUNCE_DURATION = 2000; // Show "High card wins deal" for 2s
  const DEAL_DELAY = 1500; // 1.5s between each card dealt
  const REVEAL_DELAY = 500; // Small delay after all cards are face-down
  const CARD_FLIP_DELAY = 1500; // 1.5s between each card flip
  const WINNER_ANNOUNCE_DELAY = 2000; // Show winner for 2s before completing
  const TIEBREAKER_DELAY = 2500; // 2.5s pause before tiebreaker round
  
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
    const shuffledDeck = shuffleDeck(createDeck());
    setDeck(shuffledDeck);
    
    // Start the sequence
    runSelectionRound(shuffledDeck, eligibleDealers, 1);
    
    return () => clearTimeouts();
  }, []);
  
  const runSelectionRound = useCallback((currentDeck: Card[], playersInRound: Player[], roundNum: number) => {
    console.log('[HIGH CARD] Round', roundNum, 'with', playersInRound.length, 'players');
    
    if (roundNum === 1) {
      onAnnouncementUpdate('High card wins deal', false);
      setPhase('announcing');
    } else {
      onAnnouncementUpdate(`Tiebreaker round ${roundNum - 1}`, false);
      setPhase('announcing');
    }
    
    // Deal cards after announcement
    addTimeout(() => {
      setPhase('dealing');
      
      // Deal one card to each player with delay
      let deckIndex = 0;
      const newCards: DealerSelectionCard[] = [];
      
      playersInRound.forEach((player, idx) => {
        const card = currentDeck[deckIndex++];
        const playerCard: DealerSelectionCard = {
          playerId: player.id,
          position: player.position,
          card,
          isRevealed: false,
          isWinner: false,
          isDimmed: false,
          roundNumber: roundNum
        };
        newCards.push(playerCard);
        
        // Stagger card dealing
        addTimeout(() => {
          setPlayerCards(prev => {
            // Keep previous round cards, add new one
            const existingForOtherRounds = prev.filter(pc => pc.roundNumber !== roundNum);
            const existingForThisRound = prev.filter(pc => pc.roundNumber === roundNum);
            return [...existingForOtherRounds, ...existingForThisRound, playerCard];
          });
        }, idx * DEAL_DELAY);
      });
      
      // After all cards are dealt, start revealing
      const totalDealTime = (playersInRound.length - 1) * DEAL_DELAY + REVEAL_DELAY;
      addTimeout(() => {
        setPhase('revealing');
        revealCards(newCards, currentDeck.slice(deckIndex), playersInRound, roundNum);
      }, totalDealTime);
      
    }, ANNOUNCE_DURATION);
  }, [addTimeout, getPlayerName, onAnnouncementUpdate]);
  
  const revealCards = useCallback((cards: DealerSelectionCard[], remainingDeck: Card[], playersInRound: Player[], roundNum: number) => {
    // Reveal cards one at a time
    cards.forEach((pc, idx) => {
      addTimeout(() => {
        setPlayerCards(prev => 
          prev.map(p => 
            p.playerId === pc.playerId && p.roundNumber === roundNum
              ? { ...p, isRevealed: true }
              : p
          )
        );
      }, idx * CARD_FLIP_DELAY);
    });
    
    // After all cards revealed, determine winner(s)
    const revealCompleteTime = (cards.length - 1) * CARD_FLIP_DELAY + CARD_FLIP_DELAY;
    addTimeout(() => {
      determineWinner(cards, remainingDeck, playersInRound, roundNum);
    }, revealCompleteTime);
  }, [addTimeout]);
  
  const determineWinner = useCallback((cards: DealerSelectionCard[], remainingDeck: Card[], playersInRound: Player[], roundNum: number) => {
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
        
        // Complete after showing winner
        addTimeout(() => {
          onComplete(winnerPlayer.position);
        }, WINNER_ANNOUNCE_DELAY);
      }
    } else {
      // Tiebreaker needed
      onAnnouncementUpdate('Tie! Drawing again...', false);
      setPhase('tiebreaker');
      
      // Filter to only tied players
      const tiedPlayerIds = winners.map(w => w.playerId);
      const tiedPlayers = playersInRound.filter(p => tiedPlayerIds.includes(p.id));
      
      addTimeout(() => {
        runSelectionRound(remainingDeck, tiedPlayers, roundNum + 1);
      }, TIEBREAKER_DELAY);
    }
  }, [addTimeout, getPlayerName, onComplete, onAnnouncementUpdate, runSelectionRound]);
  
  // This component doesn't render anything - it just manages state
  // The actual rendering happens in MobileGameTable/GameTable via props
  return null;
};
