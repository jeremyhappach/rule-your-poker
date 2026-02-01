import { cn, formatChipValue } from "@/lib/utils";
import { HandHistoryEventRow } from "./HandHistoryEventRow";
import { MiniCardRow } from "./MiniPlayingCard";
import { compactHandDescription, compactLegDescription } from "@/lib/handDescriptionUtils";
import type { DealerGameGroup, RoundGroup, GameResultRecord } from "./types";

interface HandAccordionContentProps {
  group: DealerGameGroup;
  currentPlayerId?: string;
  currentUserId?: string;
}

// Format event for display
function formatEventDescription(
  event: GameResultRecord,
  currentPlayerId?: string
): { label: string; description: string; chipChange: number | null } {
  const chipChange = currentPlayerId ? (event.player_chip_changes[currentPlayerId] ?? null) : null;

  if (event.winner_username === "Ante") {
    const compactDesc = compactHandDescription(event.winning_hand_description);
    return { label: "Ante", description: compactDesc || "Ante collected", chipChange };
  }

  if (event.winner_username === "Leg Purchase") {
    const compactDesc = compactLegDescription(event.winning_hand_description);
    return { label: "Leg", description: compactDesc || "Leg purchased", chipChange };
  }

  if (event.winner_username === "Pussy Tax") {
    return { label: "Tax", description: "Pussy Tax", chipChange };
  }

  if (event.winner_username === "Pot Refund") {
    return { label: "Refund", description: "Pot refunded", chipChange };
  }

  if (event.winner_username === "CHOP Ante Correction" || event.winner_username === "Ante Correction") {
    return { label: "Adjust", description: "Ante correction", chipChange };
  }

  // Showdown/Win event
  const desc = compactHandDescription(event.winning_hand_description);
  const winner = event.winner_username || "Unknown";
  const finalDesc = desc ? `${winner}: ${desc}` : winner;

  return { label: "Win", description: finalDesc, chipChange };
}

// Get card count label for 3-5-7 rounds
function getCardCountLabel(roundNumber: number): string {
  switch (roundNumber) {
    case 1:
      return "3 cards";
    case 2:
      return "5 cards";
    case 3:
      return "7 cards";
    default:
      return "";
  }
}

function RoundDisplay({
  round,
  roundIndex,
  totalRounds,
  is357,
  currentPlayerId,
}: {
  round: RoundGroup;
  roundIndex: number;
  totalRounds: number;
  is357: boolean;
  currentPlayerId?: string;
}) {
  const hasCards = round.visiblePlayerCards.length > 0;
  const hasCommunityCards = round.communityCards.length > 0;
  const hasChuckyCards = round.chuckyCards.length > 0;
  const hasEvents = round.events.length > 0;

  // For 3-5-7, show round header
  const showRoundHeader = is357 && totalRounds > 1;

  return (
    <div className="space-y-2">
      {showRoundHeader && (
        <div
          className={cn(
            "flex items-center gap-2 text-[10px] text-muted-foreground font-medium",
            roundIndex > 0 && "mt-3 pt-2 border-t border-border/30"
          )}
        >
          <div className="h-px bg-border flex-1" />
          <span>
            Round {round.roundNumber} ({getCardCountLabel(round.roundNumber)})
          </span>
          <div className="h-px bg-border flex-1" />
        </div>
      )}

      {/* Player cards for this round */}
      {hasCards && (
        <div className="space-y-1">
          {round.visiblePlayerCards.map((pc) => (
            <MiniCardRow
              key={pc.playerId}
              cards={pc.cards}
              label={`${pc.isCurrentPlayer ? "You" : pc.username}:`}
            />
          ))}
        </div>
      )}

      {/* Community cards */}
      {hasCommunityCards && <MiniCardRow cards={round.communityCards} label="Board:" />}

      {/* Chucky cards */}
      {hasChuckyCards && (
        <MiniCardRow cards={round.chuckyCards} label="👿 Chucky:" className="text-destructive" />
      )}

      {/* Dice results */}
      {round.diceResults && round.diceResults.length > 0 && (
        <div className="space-y-1">
          {round.diceResults.map((result) => (
            <div
              key={result.playerId}
              className={cn(
                "flex items-center justify-between rounded px-2 py-1.5",
                result.isWinner ? "bg-primary/20" : "bg-muted/20"
              )}
            >
              <div className="flex items-center gap-2">
                {result.isWinner && <span className="text-xs">🏆</span>}
                <span
                  className={cn(
                    "text-xs",
                    result.isWinner ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {result.username}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {result.dice.map((value, i) => (
                    <span
                      key={i}
                      className="w-5 h-5 text-xs font-mono flex items-center justify-center bg-background border border-border rounded"
                    >
                      {value}
                    </span>
                  ))}
                </div>
                {result.rollCount !== undefined && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {result.rollCount} {result.rollCount === 1 ? "roll" : "rolls"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Events */}
      {hasEvents && (
        <div className="space-y-1">
          {round.events.map((event) => {
            const { label, description, chipChange } = formatEventDescription(event, currentPlayerId);
            return (
              <HandHistoryEventRow
                key={event.id}
                label={label}
                description={description}
                delta={chipChange}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function HandAccordionContent({
  group,
  currentPlayerId,
  currentUserId,
}: HandAccordionContentProps) {
  const is357 = group.gameType === "357" || group.gameType === "3-5-7";
  const isHolm = group.gameType === "holm-game";
  const hasMultipleHands = group.hands.length > 1;

  // For dice games with rollovers, check if we have multiple rounds
  const isDiceWithRollovers =
    group.isDiceGame && group.hands.some((h) => h.rounds.length > 1);

  return (
    <div className="space-y-2 pt-2">
      {/* Metadata */}
      <div className="text-xs text-muted-foreground mb-2">
        {group.totalPot > 0 && `Pot: $${formatChipValue(group.totalPot)} • `}
        {new Date(group.latestTimestamp).toLocaleTimeString()}
      </div>

      {/* Hands */}
      {group.hands.map((hand, handIdx) => (
        <div key={hand.handNumber}>
          {/* Hand separator for multiple hands (Holm with ties, 3-5-7 with legs) */}
          {hasMultipleHands && handIdx > 0 && (
            <div className="flex items-center gap-2 my-3 text-[10px] text-poker-gold font-semibold">
              <div className="h-px bg-poker-gold/30 flex-1" />
              <span>{isHolm ? "🔄 ROLLOVER" : `Hand ${handIdx + 1}`}</span>
              <div className="h-px bg-poker-gold/30 flex-1" />
            </div>
          )}

          {hasMultipleHands && handIdx === 0 && !isDiceWithRollovers && (
            <div className="text-[10px] text-muted-foreground font-medium mb-1">
              Hand 1
            </div>
          )}

          {/* Rounds within this hand */}
          {hand.rounds.map((round, roundIdx) => (
            <div key={round.roundId}>
              {/* Dice rollover separator */}
              {group.isDiceGame && roundIdx > 0 && (
                <div className="flex items-center gap-2 my-2 text-[10px] text-poker-gold font-semibold">
                  <div className="h-px bg-poker-gold/30 flex-1" />
                  <span>🔄 ROLLOVER - ONE TIE ALL TIE</span>
                  <div className="h-px bg-poker-gold/30 flex-1" />
                </div>
              )}

              <RoundDisplay
                round={round}
                roundIndex={roundIdx}
                totalRounds={hand.rounds.length}
                is357={is357}
                currentPlayerId={currentPlayerId}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
