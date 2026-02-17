// Gin Rummy Felt Content - Center area of the circular table
// Shows stock pile, discard pile, match scores, and phase indicators

import { Badge } from '@/components/ui/badge';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import { getDiscardTop, stockRemaining } from '@/lib/ginRummyGameLogic';
import { STOCK_EXHAUSTION_THRESHOLD } from '@/lib/ginRummyTypes';

interface GinRummyFeltContentProps {
  ginState: GinRummyState;
  currentPlayerId: string | undefined;
  opponentId: string;
  getPlayerUsername: (playerId: string) => string;
  cardBackColors: { color: string; darkColor: string };
}

const toDisplayCard = (card: GinRummyCard) => ({
  suit: card.suit as any,
  rank: card.rank,
  value: card.value,
});

export const GinRummyFeltContent = ({
  ginState,
  currentPlayerId,
  opponentId,
  getPlayerUsername,
  cardBackColors,
}: GinRummyFeltContentProps) => {
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const stockDanger = stockCount <= STOCK_EXHAUSTION_THRESHOLD + 2;

  return (
    <>
      {/* Match Score - Top center */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-20">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-white border-white/40 text-[9px] bg-black/30 backdrop-blur-sm">
            {ginState.matchScores[currentPlayerId ?? ''] || 0} - {ginState.matchScores[opponentId] || 0}
          </Badge>
          <span className="text-[8px] text-white/50">to {ginState.pointsToWin}</span>
        </div>
      </div>

      {/* Stock & Discard Piles - Center */}
      <div className="absolute top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-4">
        {/* Stock Pile */}
        <div className="flex flex-col items-center gap-0.5">
          <div 
            className={`w-12 h-[68px] rounded-md border flex items-center justify-center shadow-lg ${
              stockDanger ? 'border-red-500/60' : 'border-white/30'
            }`}
            style={{
              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
            }}
          >
            <span className={`text-[10px] font-bold ${stockDanger ? 'text-red-300' : 'text-white/80'}`}>
              {stockCount}
            </span>
          </div>
          <span className={`text-[8px] ${stockDanger ? 'text-red-400/80' : 'text-white/50'}`}>
            {stockDanger ? 'Low!' : 'Stock'}
          </span>
        </div>

        {/* Discard Pile */}
        <div className="flex flex-col items-center gap-0.5">
          {discardTopCard ? (
            <CribbagePlayingCard card={toDisplayCard(discardTopCard)} size="sm" />
          ) : (
            <div className="w-12 h-[68px] rounded-md border border-dashed border-white/20 flex items-center justify-center">
              <span className="text-white/20 text-[8px]">Empty</span>
            </div>
          )}
          <span className="text-[8px] text-white/50">Discard</span>
        </div>
      </div>

      {/* Phase / Turn Indicator - Below piles */}
      <div className="absolute top-[72%] left-1/2 -translate-x-1/2 z-20 w-[80%]">
        {ginState.phase === 'playing' && (
          <p className="text-[10px] text-white/80 text-center">
            {isMyTurn ? (
              <span className="text-poker-gold font-bold animate-pulse">
                {ginState.turnPhase === 'draw' ? 'Draw a card!' : 'Select a card to discard'}
              </span>
            ) : (
              <span>Waiting for {getPlayerUsername(ginState.currentTurnPlayerId)}</span>
            )}
          </p>
        )}

        {/* First Draw - enhanced prompts */}
        {ginState.phase === 'first_draw' && isMyTurn && (
          <div className="text-center">
            <p className="text-[11px] text-poker-gold font-bold animate-pulse">
              {ginState.firstDrawPassed.length === 0
                ? 'Take the upcard or pass?'
                : 'Opponent passed — take or pass?'}
            </p>
            {discardTopCard && (
              <p className="text-[8px] text-white/40 mt-0.5">
                {discardTopCard.rank}{discardTopCard.suit} is face up
              </p>
            )}
          </div>
        )}

        {ginState.phase === 'first_draw' && !isMyTurn && (
          <p className="text-[10px] text-white/60 text-center">
            {getPlayerUsername(ginState.currentTurnPlayerId)} deciding on upcard...
          </p>
        )}

        {ginState.phase === 'knocking' && (
          <p className="text-[10px] text-poker-gold font-bold text-center">
            {getPlayerUsername(
              Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked)?.[0] ?? ''
            )} knocked!
          </p>
        )}

        {ginState.phase === 'laying_off' && (
          <p className="text-[10px] text-amber-300 font-bold text-center">
            Laying off cards...
          </p>
        )}

        {ginState.phase === 'complete' && ginState.knockResult && (
          <p className="text-[10px] text-poker-gold font-bold text-center">
            {getPlayerUsername(ginState.knockResult.winnerId)} wins!
            {ginState.knockResult.isGin && ' GIN! 🎉'}
            {ginState.knockResult.isUndercut && ' Undercut!'}
          </p>
        )}

        {ginState.phase === 'complete' && !ginState.knockResult && (
          <p className="text-[10px] text-red-400 font-bold text-center animate-pulse">
            Void Hand — Stock Exhausted · Re-dealing...
          </p>
        )}
      </div>
    </>
  );
};
