// Gin Rummy Knock Result Display
// Shows ONLY the OPPONENT's cards on the felt (melds + deadwood).
// My cards are never shown here — they live in the active player box.

import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { cn } from '@/lib/utils';
import { canLayOff } from '@/lib/ginRummyScoring';

interface GinRummyKnockDisplayProps {
  ginState: GinRummyState;
  getPlayerUsername: (playerId: string) => string;
  currentPlayerId: string | undefined;
  /** Index of card selected for lay-off — makes meld targets tappable */
  layOffSelectedCardIndex?: number | null;
  /** Called when user taps a meld target during lay-off */
  onLayOffToMeld?: (meldIndex: number) => void;
  isProcessing?: boolean;
}

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6,
  '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13,
};

const toDisplayCard = (card: GinRummyCard) => ({
  suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
  rank: card.rank,
  value: card.value,
});

/** Renders the opponent's hand on the felt: melds (tappable for lay-off) + deadwood */
const OpponentHandDisplay = ({
  melds,
  deadwood,
  label,
  deadwoodValue,
  laidOffCount,
  isKnocker,
  hasGin,
  interactiveMelds = false,
  selectedCardForLayOff = false,
  selectedCard = null,
  onLayOffToMeld,
  isProcessing,
}: {
  melds: Meld[];
  deadwood: GinRummyCard[];
  label: string;
  deadwoodValue: number;
  laidOffCount?: number;
  isKnocker: boolean;
  hasGin?: boolean;
  interactiveMelds?: boolean;
  selectedCardForLayOff?: boolean;
  selectedCard?: GinRummyCard | null;
  onLayOffToMeld?: (meldIndex: number) => void;
  isProcessing?: boolean;
}) => {
  const sortedDeadwood = [...deadwood].sort(
    (a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
  );

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      {/* Label */}
      <p className="text-[9px] text-white/80 font-medium drop-shadow text-center">
        {label}
        {isKnocker
          ? (hasGin ? ' — GIN 🎉' : ` — Knocked (${deadwoodValue} dw)`)
          : ` (${deadwoodValue} dw${laidOffCount ? ` +${laidOffCount} laid off` : ''})`}
      </p>

      {/* Melds */}
      {melds.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 w-full">
          {melds.map((meld, i) => {
            // Only allow tapping if a card is selected AND that card can legally lay off on this specific meld
            const isValidTarget = interactiveMelds && selectedCardForLayOff && selectedCard
              ? canLayOff(selectedCard, meld)
              : false;
            return (
              <button
                key={`meld-${i}`}
                onClick={isValidTarget && onLayOffToMeld ? () => onLayOffToMeld(i) : undefined}
                disabled={!isValidTarget || isProcessing}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg p-1 transition-all border",
                  isValidTarget
                    ? "ring-2 ring-poker-gold/80 border-poker-gold/60 bg-black/40 cursor-pointer active:scale-95 pointer-events-auto"
                    : "border-white/10 bg-transparent"
                )}
              >
                <div className="flex -space-x-2.5">
                  {meld.cards.map((card, j) => (
                    <CribbagePlayingCard
                      key={`${card.rank}-${card.suit}-${j}`}
                      card={toDisplayCard(card)}
                      size="sm"
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Deadwood */}
      {sortedDeadwood.length > 0 && (
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex -space-x-2.5">
            {sortedDeadwood.map((card, i) => (
              <div key={`dw-${card.rank}-${card.suit}-${i}`} className="opacity-70">
                <CribbagePlayingCard card={toDisplayCard(card)} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasGin && melds.length > 0 && sortedDeadwood.length === 0 && (
        <p className="text-[7px] text-green-400 font-bold">Perfect hand!</p>
      )}
    </div>
  );
};

export const GinRummyKnockDisplay = ({
  ginState,
  getPlayerUsername,
  currentPlayerId,
  layOffSelectedCardIndex,
  onLayOffToMeld,
  isProcessing,
}: GinRummyKnockDisplayProps) => {
  const knockerId = Object.entries(ginState.playerStates).find(([, ps]) => ps.hasKnocked || ps.hasGin)?.[0];
  if (!knockerId) return null;

  const opponentId = knockerId === ginState.dealerPlayerId ? ginState.nonDealerPlayerId : ginState.dealerPlayerId;

  // From the viewer's perspective: the "other" player is whoever is not me
  const otherPlayerId = currentPlayerId === knockerId ? opponentId : knockerId;

  const otherState = ginState.playerStates[otherPlayerId];
  const isOtherTheKnocker = otherPlayerId === knockerId;
  const isComplete = ginState.phase === 'complete';
  const result = ginState.knockResult;

  // Show opponent's melds only once they've been computed (knocker shows immediately, non-knocker shows during scoring/complete)
  const showOtherMelds = isOtherTheKnocker || ginState.phase === 'scoring' || isComplete;
  if (!showOtherMelds) return null;

  // If opponent has no cards to show yet, skip
  const hasOtherCards = otherState.melds.length > 0 || otherState.deadwood.length > 0 || otherState.hand.length > 0;
  if (!hasOtherCards) return null;

  const otherMelds = otherState.melds;
  const otherDeadwood = otherState.deadwood.length > 0
    ? otherState.deadwood
    : (showOtherMelds && isOtherTheKnocker ? [] : []);
  const otherDeadwoodValue = otherState.deadwoodValue;

  // Lay-off is interactive when the OTHER player is the knocker and I'm laying off onto their melds
  const isLayingOffOntoOther = isOtherTheKnocker && (ginState.phase === 'knocking' || ginState.phase === 'laying_off');

  // Resolve the actual selected card from current player's hand for per-meld validation
  const myPlayerId = currentPlayerId;
  const myState = myPlayerId ? ginState.playerStates[myPlayerId] : null;
  const selectedCard = (isLayingOffOntoOther && layOffSelectedCardIndex != null && myState)
    ? (myState.hand[layOffSelectedCardIndex] ?? null)
    : null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none px-2 gap-2">
      {/* Result header */}
      {result && (
        <p className={cn(
          "text-[11px] font-bold drop-shadow-md text-center",
          result.isGin ? "text-green-400" : result.isUndercut ? "text-amber-400" : "text-poker-gold"
        )}>
          {result.isGin && '🎉 GIN! '}
          {result.isUndercut && '🔄 Undercut! '}
          {!result.isGin && !result.isUndercut && 'Knock — '}
          {getPlayerUsername(result.winnerId)} wins +{result.pointsAwarded} pts
        </p>
      )}

      {/* Opponent's cards — the only cards shown on the felt */}
      <div className="w-full max-w-[280px] flex flex-col items-center gap-1 pointer-events-none">
        <OpponentHandDisplay
          melds={otherMelds}
          deadwood={otherDeadwood}
          label={getPlayerUsername(otherPlayerId)}
          deadwoodValue={otherDeadwoodValue}
          laidOffCount={otherState.laidOffCards?.length}
          isKnocker={isOtherTheKnocker}
          hasGin={otherState.hasGin}
          interactiveMelds={isLayingOffOntoOther}
          selectedCardForLayOff={layOffSelectedCardIndex != null}
          selectedCard={selectedCard}
          onLayOffToMeld={onLayOffToMeld}
          isProcessing={isProcessing}
        />
      </div>

      {/* Match score */}
      {isComplete && (
        <p className="text-[8px] text-white/40 drop-shadow text-center">
          Match: {getPlayerUsername(knockerId)} {ginState.matchScores[knockerId] || 0} — {ginState.matchScores[opponentId] || 0} {getPlayerUsername(opponentId)}
          <span className="text-white/25"> (to {ginState.pointsToWin})</span>
        </p>
      )}
    </div>
  );
};
