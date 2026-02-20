// Gin Rummy Felt Content - Center area of the circular table
// Shows stock pile, discard pile, match scores, and phase indicators

import { Badge } from '@/components/ui/badge';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { CribbageTurnSpotlight } from './CribbageTurnSpotlight';
import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { getDiscardTop, stockRemaining } from '@/lib/ginRummyGameLogic';
import { STOCK_EXHAUSTION_THRESHOLD } from '@/lib/ginRummyTypes';
import { cn } from '@/lib/utils';

interface GinRummyFeltContentProps {
  ginState: GinRummyState;
  currentPlayerId: string | undefined;
  opponentId: string;
  getPlayerUsername: (playerId: string) => string;
  cardBackColors: { color: string; darkColor: string };
  onDrawStock?: () => void;
  onDrawDiscard?: () => void;
  isProcessing?: boolean;
  // Lay-off meld targeting
  selectedCardForLayOff?: boolean;
  onLayOffToMeld?: (meldIndex: number) => void;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

const meldLabel = (meld: Meld) => meld.type === 'run' ? 'Run' : 'Set';

export const GinRummyFeltContent = ({
  ginState,
  currentPlayerId,
  opponentId,
  getPlayerUsername,
  cardBackColors,
  onDrawStock,
  onDrawDiscard,
  isProcessing,
  selectedCardForLayOff,
  onLayOffToMeld,
}: GinRummyFeltContentProps) => {
  const discardTopCard = getDiscardTop(ginState);
  const stockCount = stockRemaining(ginState);
  const isMyTurn = ginState.currentTurnPlayerId === currentPlayerId;
  const stockDanger = stockCount <= STOCK_EXHAUSTION_THRESHOLD + 2;
  const canDraw = isMyTurn && ginState.phase === 'playing' && ginState.turnPhase === 'draw' && !isProcessing;

  // Hide stock/discard when the hand is decided — they're no longer relevant
  const hidePiles = ['knocking', 'laying_off', 'scoring', 'complete'].includes(ginState.phase);

  // Knocker's melds for lay-off targeting
  const knockerId = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  const isPlayerLayingOff =
    (ginState.phase === 'knocking' || ginState.phase === 'laying_off') &&
    ginState.currentTurnPlayerId === currentPlayerId &&
    currentPlayerId !== knockerId;
  const knockerMelds: Meld[] = knockerId ? ginState.playerStates[knockerId]?.melds ?? [] : [];
  const showMeldTargets = isPlayerLayingOff && selectedCardForLayOff && knockerMelds.length > 0;

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
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-20">
        <Badge variant="outline" className="text-white border-white/40 text-[11px] bg-black/40 backdrop-blur-sm px-3 py-1">
          {getPlayerUsername(currentPlayerId ?? '')} {ginState.matchScores[currentPlayerId ?? ''] || 0} — {ginState.matchScores[opponentId] || 0} {getPlayerUsername(opponentId)}
        </Badge>
      </div>

      {/* Stock & Discard Piles — hidden after knock/gin */}
      {!hidePiles && (
        <div className="absolute top-[46%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-4">
          {/* Stock Pile */}
          <div className="flex flex-col items-center gap-0.5">
            <button
              onClick={canDraw ? onDrawStock : undefined}
              disabled={!canDraw}
              className={`w-12 h-[68px] rounded-md border flex items-center justify-center shadow-lg transition-all ${
                stockDanger ? 'border-red-500/60' : 'border-white/30'
              } ${canDraw ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
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
                onClick={canDraw ? onDrawDiscard : undefined}
                disabled={!canDraw}
                className={`rounded-md transition-all ${canDraw ? 'ring-2 ring-poker-gold/70 animate-pulse cursor-pointer active:scale-95' : ''}`}
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

      {/* Knocker's melds shown on the felt during lay-off — player taps one to lay off onto it */}
      {isPlayerLayingOff && knockerMelds.length > 0 && (
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-[90%]">
          <p className="text-[9px] text-center mb-1.5">
            {showMeldTargets ? (
              <span className="text-poker-gold font-bold animate-pulse">Tap a meld to lay off onto</span>
            ) : (
              <span className="text-white/60">{getPlayerUsername(knockerId ?? '')}'s melds — select a card first</span>
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {knockerMelds.map((meld, meldIdx) => (
              <button
                key={`meld-target-${meldIdx}`}
                onClick={showMeldTargets && onLayOffToMeld ? () => onLayOffToMeld(meldIdx) : undefined}
                disabled={!showMeldTargets || isProcessing}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-all border",
                  showMeldTargets
                    ? "ring-2 ring-poker-gold/80 border-poker-gold/60 bg-black/40 cursor-pointer active:scale-95"
                    : "border-white/10 bg-black/20 opacity-70"
                )}
              >
                <span className="text-[7px] text-white/60 uppercase tracking-wide">{meldLabel(meld)}</span>
                <div className="flex -space-x-3">
                  {meld.cards.map((card, j) => (
                    <CribbagePlayingCard
                      key={`${card.rank}-${card.suit}-${j}`}
                      card={toDisplayCard(card)}
                      size="sm"
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Phase / Turn Indicator */}
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

        {ginState.phase === 'knocking' && !isPlayerLayingOff && (
          <p className="text-[10px] text-poker-gold font-bold text-center">
            {getPlayerUsername(
              Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked)?.[0] ?? ''
            )} knocked!
          </p>
        )}

        {ginState.phase === 'laying_off' && !isPlayerLayingOff && (
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
