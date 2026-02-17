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

  // Only show the OTHER player's tabled cards — current player's cards stay in their hand area
  const otherPlayerId = currentPlayerId === knockerId ? opponentId : knockerId;
  const otherState = ginState.playerStates[otherPlayerId];
  const isOtherTheKnocker = otherPlayerId === knockerId;

  const isComplete = ginState.phase === 'complete';
  const result = ginState.knockResult;

  // Don't show opponent's melds until scoring/complete (they haven't been revealed yet)
  const showOtherMelds = isOtherTheKnocker || ginState.phase === 'scoring' || isComplete;
  if (!showOtherMelds || (otherState.melds.length === 0 && otherState.deadwood.length === 0)) return null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-end justify-end pb-[2%] pointer-events-none">
      <div className="max-w-[75%] mx-auto pointer-events-auto">
        {/* Result header */}
        {result && (
          <div className="text-center mb-1">
            <p className={cn(
              "text-[10px] font-bold drop-shadow-md",
              result.isGin ? "text-green-400" : result.isUndercut ? "text-amber-400" : "text-poker-gold"
            )}>
              {result.isGin && '🎉 GIN! '}
              {result.isUndercut && '🔄 UNDERCUT! '}
              {!result.isGin && !result.isUndercut && 'Knock — '}
              {getPlayerUsername(result.winnerId)} wins +{result.pointsAwarded} pts
            </p>
          </div>
        )}

        {/* Other player's label */}
        <p className="text-[8px] text-white/70 text-center mb-0.5 drop-shadow">
          {getPlayerUsername(otherPlayerId)}
          {isOtherTheKnocker
            ? (otherState.hasGin ? ' — Gin' : ` — Knocked (${otherState.deadwoodValue} dw)`)
            : ` (${otherState.deadwoodValue} dw)${otherState.laidOffCards.length > 0 ? ` +${otherState.laidOffCards.length} laid off` : ''}`
          }
        </p>

        {/* Other player's melds + deadwood */}
        <div className="flex items-center gap-1 flex-wrap justify-center mb-1">
          {otherState.melds.map((meld, i) => (
            <div key={`meld-${i}`} className="flex -space-x-3">
              {meld.cards.map((card, j) => (
                <CribbagePlayingCard key={`${card.rank}-${card.suit}-${j}`} card={toDisplayCard(card)} size="sm" />
              ))}
            </div>
          ))}
          {otherState.deadwood.length > 0 && (
            <div className="flex items-center gap-0.5">
              <span className="text-[7px] text-red-400/80">DW</span>
              <div className="flex -space-x-3">
                {otherState.deadwood.map((card, i) => (
                  <div key={`dw-${card.rank}-${card.suit}-${i}`} className="opacity-70">
                    <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Match score */}
        {isComplete && (
          <div className="text-center">
            <p className="text-[8px] text-white/50 drop-shadow">
              Match: {getPlayerUsername(knockerId)} {ginState.matchScores[knockerId] || 0} — {ginState.matchScores[opponentId] || 0} {getPlayerUsername(opponentId)}
              <span className="text-white/30"> (to {ginState.pointsToWin})</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
