import { useState, useEffect, useRef, useCallback } from "react";
import { getBotAlias } from "@/lib/botAlias";
import { Card, createDeck, shuffleDeck, RANK_VALUES } from "@/lib/cardUtils";
import { supabase } from "@/integrations/supabase/client";

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

// State stored in database for sync
export interface DealerSelectionState {
  cards: DealerSelectionCard[];
  announcement: string | null;
  isComplete: boolean;
  winnerPosition: number | null;
}

interface HighCardDealerSelectionProps {
  gameId: string;
  players: Player[];
  onComplete: (dealerPosition: number) => void;
  isHost: boolean;
  allowBotDealers?: boolean;
  // DB-synced state from parent (received via realtime)
  syncedState: DealerSelectionState | null;
  // Callback to provide cards for rendering in the game table
  onCardsUpdate: (cards: DealerSelectionCard[]) => void;
  // Callback for announcement messages
  onAnnouncementUpdate: (message: string | null, isComplete: boolean) => void;
  // Callback to report the winning position when determined (for spotlight effect)
  onWinnerPositionUpdate?: (position: number | null) => void;
}

export const HighCardDealerSelection = ({ 
  gameId,
  players, 
  onComplete, 
  isHost,
  allowBotDealers = false,
  syncedState,
  onCardsUpdate,
  onAnnouncementUpdate,
  onWinnerPositionUpdate
}: HighCardDealerSelectionProps) => {
  const hasInitializedRef = useRef(false);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const deckRef = useRef<Card[]>([]);
  const hasCompletedRef = useRef(false);
  
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
  
  // Write state to database (host only)
  const syncToDatabase = useCallback(async (state: DealerSelectionState) => {
    if (!isHost) return;
    
    try {
      const { error } = await supabase
        .from('games')
        .update({ dealer_selection_state: state as any })
        .eq('id', gameId);
      
      if (error) {
        console.error('[HIGH CARD] Failed to sync state to DB:', error);
      }
    } catch (err) {
      console.error('[HIGH CARD] Error syncing to DB:', err);
    }
  }, [isHost, gameId]);
  
  // NON-HOST: React to synced state from database
  useEffect(() => {
    if (isHost) return; // Host drives state, doesn't react to it
    if (!syncedState) return;
    
    // Update local UI via callbacks
    onCardsUpdate(syncedState.cards);
    onAnnouncementUpdate(syncedState.announcement, syncedState.isComplete);
    onWinnerPositionUpdate?.(syncedState.winnerPosition);
    
    // If selection is complete and we have a winner, trigger onComplete
    if (syncedState.isComplete && syncedState.winnerPosition !== null && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      // Small delay to let UI render the winner state
      setTimeout(() => {
        onComplete(syncedState.winnerPosition!);
      }, WINNER_ANNOUNCE_DELAY);
    }
  }, [isHost, syncedState, onCardsUpdate, onAnnouncementUpdate, onWinnerPositionUpdate, onComplete]);
  
  // HOST: Run the selection sequence and sync to DB
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
      // Non-hosts receive state via syncedState prop (realtime)
      return;
    }
    
    console.log('[HIGH CARD] Starting high card dealer selection with', eligibleDealers.length, 'eligible players');
    
    // Initialize deck
    deckRef.current = shuffleDeck(createDeck());
    
    // Start the sequence
    runSelectionRound(eligibleDealers, 1, []);
    
    return () => clearTimeouts();
  }, []);
  
  const runSelectionRound = useCallback((playersInRound: Player[], roundNum: number, existingCards: DealerSelectionCard[]) => {
    console.log('[HIGH CARD] Round', roundNum, 'with', playersInRound.length, 'players');
    
    // Clear winner position when starting a new round (including tiebreakers)
    onWinnerPositionUpdate?.(null);
    
    const announcement = roundNum === 1 ? 'High card wins deal' : 'Tie! Drawing again...';
    onAnnouncementUpdate(announcement, false);
    
    // Sync announcement state to DB
    syncToDatabase({
      cards: existingCards,
      announcement,
      isComplete: false,
      winnerPosition: null
    });
    
    // Deal all cards face-up after brief announcement
    addTimeout(() => {
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
      
      // Combine with existing cards from other rounds
      const allCards = [...existingCards.filter(c => c.roundNumber !== roundNum), ...newCards];
      
      // Update local UI
      onCardsUpdate(allCards);
      
      // Sync to DB for other players
      syncToDatabase({
        cards: allCards,
        announcement,
        isComplete: false,
        winnerPosition: null
      });
      
      // After 1.5s pause, check for winner or tiebreaker
      addTimeout(() => {
        determineWinner(newCards, allCards, playersInRound, roundNum);
      }, ROUND_PAUSE);
      
    }, ANNOUNCE_DURATION);
  }, [addTimeout, onAnnouncementUpdate, onCardsUpdate, syncToDatabase, onWinnerPositionUpdate]);
  
  const determineWinner = useCallback((roundCards: DealerSelectionCard[], allCards: DealerSelectionCard[], playersInRound: Player[], roundNum: number) => {
    // Find highest card(s)
    let highestRank = 0;
    let winners: DealerSelectionCard[] = [];
    
    roundCards.forEach(pc => {
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
    const updatedCards = allCards.map(p => {
      if (p.roundNumber !== roundNum) return p;
      const isWinner = winners.some(w => w.playerId === p.playerId);
      return {
        ...p,
        isWinner,
        isDimmed: !isWinner
      };
    });
    
    onCardsUpdate(updatedCards);
    
    if (winners.length === 1) {
      // Single winner!
      const winnerPlayer = playersInRound.find(p => p.id === winners[0].playerId);
      if (winnerPlayer) {
        const name = getPlayerName(winnerPlayer);
        const winAnnouncement = `${name} wins the deal!`;
        
        onAnnouncementUpdate(winAnnouncement, true);
        onWinnerPositionUpdate?.(winnerPlayer.position);
        
        // Sync final state to DB
        syncToDatabase({
          cards: updatedCards,
          announcement: winAnnouncement,
          isComplete: true,
          winnerPosition: winnerPlayer.position
        });
        
        hasCompletedRef.current = true;
        
        // Complete after showing winner
        addTimeout(() => {
          onComplete(winnerPlayer.position);
        }, WINNER_ANNOUNCE_DELAY);
      }
    } else {
      // Sync current state before tiebreaker
      syncToDatabase({
        cards: updatedCards,
        announcement: 'Tie! Drawing again...',
        isComplete: false,
        winnerPosition: null
      });
      
      // Tiebreaker needed - run next round after brief pause
      const tiedPlayerIds = winners.map(w => w.playerId);
      const tiedPlayers = playersInRound.filter(p => tiedPlayerIds.includes(p.id));
      
      addTimeout(() => {
        runSelectionRound(tiedPlayers, roundNum + 1, updatedCards);
      }, ROUND_PAUSE);
    }
  }, [addTimeout, getPlayerName, onComplete, onAnnouncementUpdate, onCardsUpdate, onWinnerPositionUpdate, syncToDatabase, runSelectionRound]);
  
  // This component doesn't render anything - it just manages state
  // The actual rendering happens in MobileGameTable/GameTable via props
  return null;
};
