import { cn, formatChipValue } from "@/lib/utils";
import { HandHistoryEventRow } from "./HandHistoryEventRow";
import { MiniCardRow, MiniPlayingCard } from "./MiniPlayingCard";
import { CribbageEventDisplay } from "./CribbageEventDisplay";
import { compactHandDescription, compactLegDescription } from "@/lib/handDescriptionUtils";
import type { DealerGameGroup, RoundGroup, GameResultRecord, CribbageEventRecord, CardData, HandGroup } from "./types";

interface HandAccordionContentProps {
  group: DealerGameGroup;
  currentPlayerId?: string;
  currentUserId?: string;
  playerNames?: Map<string, string>;
}

// Format event for display
function formatEventDescription(
  event: GameResultRecord,
  currentPlayerId?: string,
  playerNames?: Map<string, string>
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

  // Showdown/Win event - use resolved player name (with bot alias) if available
  const desc = compactHandDescription(event.winning_hand_description);
  const resolvedWinner = event.winner_player_id && playerNames?.has(event.winner_player_id)
    ? playerNames.get(event.winner_player_id)
    : (event.winner_username || "Unknown");
  const finalDesc = desc ? `${resolvedWinner}: ${desc}` : resolvedWinner;

  return { label: "Win", description: finalDesc || "Unknown", chipChange };
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
// Separate ante events from other events for 3-5-7 display
function separateAnteEvents(events: GameResultRecord[]): { anteEvents: GameResultRecord[]; otherEvents: GameResultRecord[] } {
  const anteEvents: GameResultRecord[] = [];
  const otherEvents: GameResultRecord[] = [];
  
  events.forEach(event => {
    if (event.winner_username === "Ante") {
      anteEvents.push(event);
    } else {
      otherEvents.push(event);
    }
  });
  
  return { anteEvents, otherEvents };
}

function RoundDisplay({
  round,
  roundIndex,
  totalRounds,
  is357,
  currentPlayerId,
  playerNames,
  showAnteInRound = true,
}: {
  round: RoundGroup;
  roundIndex: number;
  totalRounds: number;
  is357: boolean;
  currentPlayerId?: string;
  playerNames?: Map<string, string>;
  showAnteInRound?: boolean;
}) {
  const hasCribbageEvents = round.cribbageEvents && round.cribbageEvents.length > 0;
  // For cribbage, don't show player cards separately - they're shown in CribbageEventDisplay counting sections
  const hasCards = !hasCribbageEvents && round.visiblePlayerCards.length > 0;
  const hasCommunityCards = round.communityCards.length > 0;
  const hasChuckyCards = round.chuckyCards.length > 0;
  
  // For 3-5-7, separate ante events (handled at hand level) from round events
  const { anteEvents, otherEvents } = is357 
    ? separateAnteEvents(round.events)
    : { anteEvents: [], otherEvents: round.events };
  
  // In 3-5-7, ante events are shown at hand level, not in round
  const displayEvents = showAnteInRound ? round.events : otherEvents;
  const hasEvents = displayEvents.length > 0;

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

      {/* Player cards for this round - show viewer first, then other players */}
      {hasCards && (
        <div className="space-y-1">
          {/* First, show viewer's cards */}
          {round.visiblePlayerCards
            .filter(pc => pc.isCurrentPlayer)
            .map((pc) => (
              <MiniCardRow
                key={pc.playerId}
                cards={pc.cards}
                label="You:"
              />
            ))}
          {/* Then show other players' revealed cards */}
          {round.visiblePlayerCards
            .filter(pc => !pc.isCurrentPlayer)
            .map((pc) => (
              <MiniCardRow
                key={pc.playerId}
                cards={pc.cards}
                label={`${pc.username}:`}
              />
            ))}
        </div>
      )}
      
      {/* Player decisions (stay/fold) - public info for all viewers */}
      {round.playerDecisions && round.playerDecisions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {round.playerDecisions.map((decision) => {
            const playerName = playerNames?.get(decision.playerId) || "Unknown";
            const isStay = decision.actionType === "stay";
            return (
              <span
                key={decision.playerId}
                className={cn(
                  "px-1.5 py-0.5 rounded",
                  isStay 
                    ? "bg-primary/20 text-primary" 
                    : "bg-destructive/20 text-destructive"
                )}
              >
                {playerName}: {isStay ? "✓ Stayed" : "✗ Folded"}
              </span>
            );
          })}
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

      {/* Cribbage events - use dedicated display component with player hands */}
      {hasCribbageEvents && playerNames && (
        <CribbageEventDisplay 
          events={round.cribbageEvents!} 
          playerNames={playerNames}
          playerHands={round.visiblePlayerCards.map(pc => ({
            playerId: pc.playerId,
            username: pc.username,
            cards: pc.cards,
          }))}
          pointsToWin={round.cribbagePointsToWin}
        />
      )}

      {/* Events (excluding ante for 3-5-7, which is shown at hand level) */}
      {hasEvents && (
        <div className="space-y-1">
          {displayEvents.map((event) => {
            const { label, description, chipChange } = formatEventDescription(event, currentPlayerId, playerNames);
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
  playerNames,
}: HandAccordionContentProps) {
  const is357 = group.gameType === "357" || group.gameType === "3-5-7";
  const isHolm = group.gameType === "holm-game";
  const isCribbage = group.gameType === "cribbage";
  const hasMultipleHands = group.hands.length > 1;

  // For dice games with rollovers, check if we have multiple rounds
  const isDiceWithRollovers =
    group.isDiceGame && group.hands.some((h) => h.rounds.length > 1);

  // For Cribbage, collect ALL events from all hands/rounds and render once
  // CribbageEventDisplay handles hand separation internally via hand_number
  if (isCribbage && playerNames) {
    const allCribbageEvents: CribbageEventRecord[] = [];
    let pointsToWin = 121;
    
    for (const hand of group.hands) {
      for (const round of hand.rounds) {
        if (round.cribbageEvents && round.cribbageEvents.length > 0) {
          allCribbageEvents.push(...round.cribbageEvents);
          if (round.cribbagePointsToWin) {
            pointsToWin = round.cribbagePointsToWin;
          }
        }
      }
    }

    if (allCribbageEvents.length > 0) {
      return (
        <div className="space-y-2 pt-2">
          <CribbageEventDisplay
            events={allCribbageEvents}
            playerNames={playerNames}
            pointsToWin={pointsToWin}
          />
        </div>
      );
    }
    
    // No cribbage events - show empty state
    return (
      <div className="space-y-2 pt-2">
        <div className="text-xs text-muted-foreground">No events recorded</div>
      </div>
    );
  }

  // For 3-5-7, collect all ante events from first round of each hand to show at hand level
  const getAnteEventsForHand = (hand: HandGroup): GameResultRecord[] => {
    if (!is357) return [];
    // Ante events are stored in round 1
    const round1 = hand.rounds.find(r => r.roundNumber === 1);
    if (!round1) return [];
    return round1.events.filter(e => e.winner_username === "Ante");
  };

  return (
    <div className="space-y-2 pt-2">
      {/* Metadata */}
      {group.gameType !== "cribbage" && (
        <div className="text-xs text-muted-foreground mb-2">
          {group.totalPot > 0 && `Pot: $${formatChipValue(group.totalPot)} • `}
          {new Date(group.latestTimestamp).toLocaleTimeString()}
        </div>
      )}

      {/* Hands */}
      {group.hands.map((hand, handIdx) => {
        const anteEvents = getAnteEventsForHand(hand);
        
        return (
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

            {/* For 3-5-7: Show ante at hand level, right after hand header */}
            {is357 && anteEvents.length > 0 && (
              <div className="space-y-1 mb-2">
                {anteEvents.map((event) => {
                  const { label, description, chipChange } = formatEventDescription(event, currentPlayerId, playerNames);
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
                  playerNames={playerNames}
                  showAnteInRound={!is357}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
