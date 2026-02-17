// Gin Rummy Knock Result Display - Shows melds and deadwood for both players during knocking/scoring/complete phases

import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { cn } from '@/lib/utils';

interface GinRummyKnockDisplayProps {
  ginState: GinRummyState;
  getPlayerUsername: (playerId: string) => string;
  currentPlayerId: string | undefined;
}

const toDisplayCard = (card: GinRummyCard) => ({
  suit: card.suit as any,
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
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
      <div className="bg-black/80 backdrop-blur-md rounded-xl p-3 max-w-[90%] border border-white/20 shadow-2xl pointer-events-auto">
        {/* Result header */}
        {result && (
          <div className="text-center mb-2">
            <p className={cn(
              "text-sm font-bold",
              result.isGin ? "text-green-400" : result.isUndercut ? "text-amber-400" : "text-poker-gold"
            )}>
              {result.isGin && '🎉 GIN! '}
              {result.isUndercut && '🔄 UNDERCUT! '}
              {!result.isGin && !result.isUndercut && 'Knock — '}
              {getPlayerUsername(result.winnerId)} wins +{result.pointsAwarded} pts
            </p>
          </div>
        )}

        {/* Knocker's hand */}
        <div className="mb-2">
          <p className="text-[9px] text-white/70 mb-0.5 text-center">
            {getPlayerUsername(knockerId)} {knockerState.hasGin ? '(Gin)' : `(Knocked — ${knockerState.deadwoodValue} dw)`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1">
            {knockerState.melds.map((meld, i) => (
              <MeldGroup key={`k-meld-${i}`} meld={meld} />
            ))}
            <DeadwoodGroup cards={knockerState.deadwood} />
          </div>
        </div>

        {/* Opponent's hand - only show when scoring/complete */}
        {(ginState.phase === 'scoring' || isComplete) && opponentState.melds.length > 0 && (
          <div className="border-t border-white/10 pt-2">
            <p className="text-[9px] text-white/70 mb-0.5 text-center">
              {getPlayerUsername(opponentId)} ({opponentState.deadwoodValue} dw)
              {opponentState.laidOffCards.length > 0 && ` — laid off ${opponentState.laidOffCards.length}`}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1">
              {opponentState.melds.map((meld, i) => (
                <MeldGroup key={`o-meld-${i}`} meld={meld} />
              ))}
              <DeadwoodGroup cards={opponentState.deadwood} />
            </div>
          </div>
        )}

        {/* Match score */}
        {isComplete && (
          <div className="mt-2 pt-1 border-t border-white/10 text-center">
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
