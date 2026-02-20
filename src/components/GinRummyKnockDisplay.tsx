// Gin Rummy Knock Result Display
// Shows BOTH players' melds/deadwood centered on the felt during knocking/scoring/complete phases.
// The opponent's cards take the center of the table — organized into melds and deadwood.
// Active player's own cards are shown below, also organized into melds/deadwood.

import type { GinRummyState, GinRummyCard, Meld } from '@/lib/ginRummyTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import { findOptimalMelds } from '@/lib/ginRummyScoring';
import { cn } from '@/lib/utils';

interface GinRummyKnockDisplayProps {
  ginState: GinRummyState;
  getPlayerUsername: (playerId: string) => string;
  currentPlayerId: string | undefined;
  /** Index of the card the current player has selected for lay-off (so meld targets become tappable) */
  layOffSelectedCardIndex?: number | null;
  /** Called when the user taps a meld target during lay-off */
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

/** Render a row of cards from melds and deadwood */
const HandDisplay = ({
  melds,
  deadwood,
  label,
  deadwoodValue,
  laidOffCount,
  isKnocker,
  hasGin,
  compact = false,
  interactiveMelds = false,
  selectedCardForLayOff = false,
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
  compact?: boolean;
  interactiveMelds?: boolean;
  selectedCardForLayOff?: boolean;
  onLayOffToMeld?: (meldIndex: number) => void;
  isProcessing?: boolean;
}) => {
  const sortedDeadwood = [...deadwood].sort(
    (a, b) => (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
  );
  const cardSize = compact ? 'sm' : 'sm';

  return (
    <div className="flex flex-col items-center gap-0.5 w-full">
      {/* Label row */}
      <p className={cn("text-center font-medium drop-shadow", compact ? "text-[8px] text-white/70" : "text-[9px] text-white/80")}>
        {label}
        {isKnocker
          ? (hasGin ? ' — GIN 🎉' : ` — Knocked (${deadwoodValue} dw)`)
          : ` (${deadwoodValue} dw${laidOffCount ? ` +${laidOffCount} laid off` : ''})`}
      </p>

      {/* Melds row */}
      {melds.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 w-full">
          {melds.map((meld, i) => {
            const canTarget = interactiveMelds && selectedCardForLayOff;
            return (
              <button
                key={`meld-${i}`}
                onClick={canTarget && onLayOffToMeld ? () => onLayOffToMeld(i) : undefined}
                disabled={!canTarget || isProcessing}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg p-1 transition-all border",
                  canTarget
                    ? "ring-2 ring-poker-gold/80 border-poker-gold/60 bg-black/40 cursor-pointer active:scale-95 pointer-events-auto"
                    : "border-white/10 bg-transparent"
                )}
              >
                <span className="text-[6px] text-white/40 uppercase tracking-wide">
                  {canTarget ? '← Lay off here' : meld.type === 'run' ? 'Run' : 'Set'}
                </span>
                <div className="flex -space-x-2.5">
                  {meld.cards.map((card, j) => (
                    <CribbagePlayingCard
                      key={`${card.rank}-${card.suit}-${j}`}
                      card={toDisplayCard(card)}
                      size={cardSize}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Deadwood row */}
      {sortedDeadwood.length > 0 && (
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[6px] text-red-400/70 uppercase tracking-wide">Deadwood</span>
          <div className="flex -space-x-2.5">
            {sortedDeadwood.map((card, i) => (
              <div key={`dw-${card.rank}-${card.suit}-${i}`} className="opacity-70">
                <CribbagePlayingCard card={toDisplayCard(card)} size={cardSize} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gin: no deadwood */}
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

  // The "other" player relative to the current viewer is the opponent
  const otherPlayerId = currentPlayerId === knockerId ? opponentId : knockerId;
  const myPlayerId = currentPlayerId === knockerId ? knockerId : opponentId;

  const otherState = ginState.playerStates[otherPlayerId];
  const myState = ginState.playerStates[myPlayerId];

  const isOtherTheKnocker = otherPlayerId === knockerId;
  const isComplete = ginState.phase === 'complete';
  const result = ginState.knockResult;

  // For the viewer's own hand — compute optimal melds live during knocking/laying_off
  // (scored state might not be set yet)
  const myMeldsComputed = myState ? findOptimalMelds(myState.hand) : null;
  const myMelds = myState?.melds.length > 0 ? myState.melds : (myMeldsComputed?.melds ?? []);
  const myDeadwood = myState?.deadwood.length > 0
    ? myState.deadwood
    : (myMeldsComputed?.deadwood ?? myState?.hand ?? []);
  const myDeadwoodValue = myState?.deadwoodValue ?? myMeldsComputed?.deadwoodValue ?? 0;

  // Show opponent's melds only once they're knocked (knocker) or scoring is done (non-knocker)
  const showOtherMelds = isOtherTheKnocker || ginState.phase === 'scoring' || isComplete;
  if (!showOtherMelds) return null;

  // If neither player has cards in melds/deadwood yet, skip
  const hasOtherCards = otherState.melds.length > 0 || otherState.deadwood.length > 0 || otherState.hand.length > 0;
  if (!hasOtherCards) return null;

  // For the non-knocker during laying off, use their current hand for live deadwood
  const otherMelds = otherState.melds;
  const otherDeadwood = otherState.deadwood.length > 0
    ? otherState.deadwood
    : (showOtherMelds && isOtherTheKnocker ? [] : []);
  const otherDeadwoodValue = otherState.deadwoodValue;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none px-2 gap-3">
      {/* ── Opponent cards — centered & dominant ── */}
      <div className="w-full max-w-[280px] flex flex-col items-center gap-1 pointer-events-none">
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

        <HandDisplay
          melds={otherMelds}
          deadwood={otherDeadwood}
          label={getPlayerUsername(otherPlayerId)}
          deadwoodValue={otherDeadwoodValue}
          laidOffCount={otherState.laidOffCards?.length}
          isKnocker={isOtherTheKnocker}
          hasGin={otherState.hasGin}
          interactiveMelds={isOtherTheKnocker && (ginState.phase === 'knocking' || ginState.phase === 'laying_off')}
          selectedCardForLayOff={layOffSelectedCardIndex != null}
          onLayOffToMeld={onLayOffToMeld}
          isProcessing={isProcessing}
        />
      </div>

      {/* ── Divider ── */}
      <div className="w-[70%] h-[1px] bg-white/15" />

      {/* ── My cards — compact below ── */}
      {myState && (myMelds.length > 0 || myDeadwood.length > 0) && (
        <div className="w-full max-w-[280px] flex flex-col items-center gap-1 pointer-events-none">
          <HandDisplay
            melds={myMelds}
            deadwood={myDeadwood}
            label={getPlayerUsername(myPlayerId ?? '')}
            deadwoodValue={myDeadwoodValue}
            laidOffCount={myState.laidOffCards?.length}
            isKnocker={myPlayerId === knockerId}
            hasGin={myState.hasGin}
            compact
          />
        </div>
      )}

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
