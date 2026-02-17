// Gin Rummy Knock Result Display - Shows melds and deadwood for both players during knocking/scoring/complete phases

import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { cn } from '@/lib/utils';

interface GinRummyKnockDisplayProps {
  ginState: GinRummyState;
  getPlayerUsername: (playerId: string) => string;
  currentPlayerId: string | undefined;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

const MeldGroup = ({ meld, label }: { meld: Meld; label?: string }) => (
  <div className="flex flex-col items-center gap-0.5">
    {label && <span className="text-[7px] text-white/50 uppercase">{label}</span>}
    <div className="flex -space-x-2">
      {meld.cards.map((card, i) => (
        <div key={`${card.rank}-${card.suit}-${i}`} className="scale-[0.7]">
          <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
        </div>
      ))}
    </div>
  </div>
);

const DeadwoodGroup = ({ cards }: { cards: GinRummyCard[] }) => {
  if (cards.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[7px] text-red-400/80 uppercase">Deadwood</span>
      <div className="flex -space-x-2">
        {cards.map((card, i) => (
          <div key={`dw-${card.rank}-${card.suit}-${i}`} className="scale-[0.7] opacity-70">
            <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const GinRummyKnockDisplay = ({
  ginState,
  getPlayerUsername,
  currentPlayerId,
}: GinRummyKnockDisplayProps) => {
  const knockerId = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  if (!knockerId) return null;

  const opponentId = knockerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;
  const knockerState = ginState.playerStates[knockerId];
  const opponentState = ginState.playerStates[opponentId];

  const isComplete = ginState.phase === 'complete';
  const result = ginState.knockResult;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-end justify-end pb-[2%] pointer-events-none">
      <div className="bg-black/80 backdrop-blur-md rounded-xl p-2 max-w-[94%] mx-auto border border-white/20 shadow-2xl pointer-events-auto">
        {/* Result header */}
        {result && (
          <div className="text-center mb-1">
            <p className={cn(
              "text-[10px] font-bold",
              result.isGin ? "text-green-400" : result.isUndercut ? "text-amber-400" : "text-poker-gold"
            )}>
              {result.isGin && '🎉 GIN! '}
              {result.isUndercut && '🔄 UNDERCUT! '}
              {!result.isGin && !result.isUndercut && 'Knock — '}
              {getPlayerUsername(result.winnerId)} wins +{result.pointsAwarded} pts
            </p>
          </div>
        )}

        {/* Knocker label above cards */}
        <p className="text-[8px] text-white/70 text-center mb-0.5">
          {getPlayerUsername(knockerId)} {knockerState.hasGin ? 'Gin' : `Knocked (${knockerState.deadwoodValue} dw)`}
        </p>

        {/* Knocker melds + deadwood — cards only, bigger */}
        <div className="flex items-center gap-2 flex-wrap justify-center mb-1">
          {knockerState.melds.map((meld, i) => (
            <div key={`k-meld-${i}`} className="flex -space-x-4">
              {meld.cards.map((card, j) => (
                <div key={`${card.rank}-${card.suit}-${j}`} className="scale-[0.85]">
                  <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                </div>
              ))}
            </div>
          ))}
          {knockerState.deadwood.length > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-[7px] text-red-400/80">DW</span>
              <div className="flex -space-x-4">
                {knockerState.deadwood.map((card, i) => (
                  <div key={`dw-${card.rank}-${card.suit}-${i}`} className="scale-[0.85] opacity-70">
                    <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Opponent's hand - only show when scoring/complete */}
        {(ginState.phase === 'scoring' || isComplete) && opponentState.melds.length > 0 && (
          <div className="border-t border-white/10 pt-1">
            <p className="text-[8px] text-white/70 text-center mb-0.5">
              {getPlayerUsername(opponentId)} ({opponentState.deadwoodValue} dw)
              {opponentState.laidOffCards.length > 0 && ` +${opponentState.laidOffCards.length} laid off`}
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {opponentState.melds.map((meld, i) => (
                <div key={`o-meld-${i}`} className="flex -space-x-4">
                  {meld.cards.map((card, j) => (
                    <div key={`${card.rank}-${card.suit}-${j}`} className="scale-[0.85]">
                      <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                    </div>
                  ))}
                </div>
              ))}
              {opponentState.deadwood.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <span className="text-[7px] text-red-400/80">DW</span>
                  <div className="flex -space-x-4">
                    {opponentState.deadwood.map((card, i) => (
                      <div key={`odw-${card.rank}-${card.suit}-${i}`} className="scale-[0.85] opacity-70">
                        <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Match score */}
        {isComplete && (
          <div className="mt-1 pt-1 border-t border-white/10 text-center">
            <p className="text-[8px] text-white/50">
              Match: {getPlayerUsername(knockerId)} {ginState.matchScores[knockerId] || 0} — {ginState.matchScores[opponentId] || 0} {getPlayerUsername(opponentId)}
              <span className="text-white/30"> (to {ginState.pointsToWin})</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
