// Gin Rummy Felt Content - Center area of the circular table
// Shows stock pile, discard pile, match scores, and phase indicators

import { Badge } from '@/components/ui/badge';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageTurnSpotlight } from './CribbageTurnSpotlight';
import type { GinRummyState, GinRummyCard } from '@/lib/ginRummyTypes';
import { getDiscardTop, stockRemaining } from '@/lib/ginRummyGameLogic';
import { STOCK_EXHAUSTION_THRESHOLD } from '@/lib/ginRummyTypes';

interface GinRummyFeltContentProps {
  ginState: GinRummyState;
  currentPlayerId: string | undefined;
  opponentId: string;
  getPlayerUsername: (playerId: string) => string;
  cardBackColors: { color: string; darkColor: string };
  onDrawStock?: () => void;
  onDrawDiscard?: () => void;
  isProcessing?: boolean;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

export const GinRummyFeltContent = ({
  ginState,
  currentPlayerId,
  opponentId,
  getPlayerUsername,
  cardBackColors,
  onDrawStock,
  onDrawDiscard,
  isProcessing,
}: GinRummyFeltContentProps) => {
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const stockDanger = stockCount <= STOCK_EXHAUSTION_THRESHOLD + 2;
  const canDraw = isMyTurn && ginState.phase === 'playing' && ginState.turnPhase === 'draw' && !isProcessing;
  const canTakeFirstDraw = isMyTurn && ginState.phase === 'first_draw' && !isProcessing;
  const discardClickable = canDraw || canTakeFirstDraw;
  const stockClickable = canDraw;

  // Hide stock/discard when the hand is decided — they're no longer relevant
  const hidePiles = ['knocking', 'laying_off', 'scoring', 'complete'].includes(ginState.phase);

  return (
    <>
      {/* Turn Spotlight */}
      <CribbageTurnSpotlight
        currentTurnPlayerId={ginState.currentTurnPlayerId}
        currentPlayerId={currentPlayerId ?? ''}
        isVisible={ginState.phase === 'playing' || ginState.phase === 'first_draw'}
        totalPlayers={2}
        opponentIds={[opponentId]}
      />

      {/* Match Score - Top center */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-20 w-[75%]">
        <Badge variant="outline" className="text-white border-white/40 text-[11px] bg-black/40 backdrop-blur-sm px-3 py-1 w-full flex justify-center whitespace-nowrap">
          {getPlayerUsername(currentPlayerId ?? '')} {ginState.matchScores[currentPlayerId ?? ''] || 0} — {ginState.matchScores[opponentId] || 0} {getPlayerUsername(opponentId)}
        </Badge>
      </div>

      {/* Stock & Discard Piles — hidden after knock/gin */}
      {!hidePiles && (
        <div className="absolute top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-4">
          {/* Stock Pile */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={stockClickable ? onDrawStock : undefined}
              disabled={!stockClickable}
              className={`w-12 h-[68px] rounded-md border flex items-center justify-center shadow-lg transition-all ${
                stockDanger ? 'border-red-500/60' : 'border-white/30'
              } ${stockClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
              style={{
                background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
              }}
            >
              <span className={`text-[10px] font-bold ${stockDanger ? 'text-red-300' : 'text-white/80'}`}>
                {stockCount}
              </span>
            </button>
            <span className={`text-[8px] ${stockDanger ? 'text-red-400/80' : 'text-white/50'}`}>
              {stockDanger ? 'Low!' : 'Stock'}
            </span>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center gap-0.5">
            {discardTopCard ? (
              <button
                onClick={discardClickable ? onDrawDiscard : undefined}
                disabled={!discardClickable}
                className={`rounded-md transition-all ${discardClickable ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
              >
                <CribbagePlayingCard card={toDisplayCard(discardTopCard)} size="lg" />
              </button>
            ) : (
              <div className="w-12 h-[68px] rounded-md border border-dashed border-white/20 flex items-center justify-center">
                <span className="text-white/20 text-[8px]">Empty</span>
              </div>
            )}
            <span className="text-[8px] text-white/50">Discard</span>
          </div>
        </div>
      )}

      {/* Phase / Turn Indicator — only shown during active play, not end-of-hand phases */}
      {!hidePiles && (
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

          {ginState.phase === 'first_draw' && isMyTurn && (
            <div className="text-center">
              <p className="text-[11px] text-poker-gold font-bold animate-pulse">
                {ginState.firstDrawPassed.length === 0
                  ? 'Take the upcard or pass?'
                  : 'Opponent passed — take or pass?'}
              </p>
            </div>
          )}

          {ginState.phase === 'first_draw' && !isMyTurn && (
            <p className="text-[10px] text-white/60 text-center">
              {getPlayerUsername(ginState.currentTurnPlayerId)} deciding on upcard...
            </p>
          )}
        </div>
      )}
    </>
  );
};
