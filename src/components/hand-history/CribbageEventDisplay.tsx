import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { MiniCardRow, MiniPlayingCard } from "./MiniPlayingCard";
import type { CribbageEventRecord, CardData } from "./types";
import { truncateCribbageEventsAtWin } from "./cribbageHistoryUtils";

interface PlayerHandData {
  playerId: string;
  username: string;
  cards: CardData[];
}

interface CribbageEventDisplayProps {
  events: CribbageEventRecord[];
  playerNames: Map<string, string>;
  playerHands?: PlayerHandData[];
  pointsToWin?: number;
}

// Format event type to human-readable label
function getEventLabel(eventType: string): string {
  switch (eventType) {
    case "pegging": return "Play";
    case "go": return "Go";
    case "his_heels": return "Heels";
    case "hand_scoring": return "Hand";
    case "crib_scoring": return "Crib";
    case "cut_card": return "Cut";
    default: return eventType;
  }
}

// Format subtype for better display (e.g., "three_of_a_kind+31" -> "3 of a kind + 31")
function formatSubtype(subtype: string | null): string {
  if (!subtype) return "";

  // Normalize separators first so we can match variants consistently.
  const normalized = subtype
    .replace(/\+/g, " + ")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return normalized
    .replace(/\bthree of a kind\b/g, "trips")
    .replace(/\b3 of a kind\b/g, "trips")
    .replace(/\bfour of a kind\b/g, "quads")
    .replace(/\b4 of a kind\b/g, "quads")
    .replace(/\brun (\d+)\b/g, "run $1")
    .replace(/\brun of (\d+)\b/g, "run $1");
}

// Format scores for display
function formatScores(scoresAfter: Record<string, number>, playerNames: Map<string, string>): string {
  const entries = Object.entries(scoresAfter);
  if (entries.length === 0) return "";
  
  return entries
    .map(([playerId, score]) => {
      const name = playerNames.get(playerId) || "?";
      // Use first 3 characters of name
      const shortName = name.length > 3 ? name.slice(0, 3) : name;
      return `${shortName}: ${score}`;
    })
    .join(" | ");
}

function peggingCardValue(card: CardData | null | undefined): number {
  if (!card) return 0;
  const r = String(card.rank ?? "").toUpperCase();
  if (r === "A") return 1;
  if (r === "K" || r === "Q" || r === "J") return 10;
  const n = Number.parseInt(r, 10);
  if (Number.isFinite(n)) return Math.min(Math.max(n, 0), 10);
  return 0;
}

/**
 * Some historical logs store the 31-play as running_count=0 (post-reset)
 * and omit "+31" from event_subtype (e.g. subtype="three_of_a_kind", points=8).
 * Infer whether the play hit exactly 31 from the previous pegging count + card value.
 */
function inferHit31(allEvents: CribbageEventRecord[], currentEventIndex: number): boolean {
  const ev = allEvents[currentEventIndex];
  if (!ev || ev.event_type !== "pegging") return false;

  if (ev.event_subtype?.includes("31")) return true;
  const storedCount = ev.running_count ?? 0;
  if (storedCount === 31) return true;

  const cardVal = peggingCardValue(ev.card_played ?? undefined);
  if (cardVal <= 0) return false;

  // If count reset to 0, check the nearest previous pegging count.
  if (storedCount === 0) {
    let prevPeg: CribbageEventRecord | null = null;
    for (let i = currentEventIndex - 1; i >= 0; i--) {
      if (allEvents[i].event_type === "pegging") {
        prevPeg = allEvents[i];
        break;
      }
    }
    if (!prevPeg) return false;

    const prevCount = prevPeg.running_count ?? 0;
    return prevCount > 0 && prevCount + cardVal === 31;
  }

  return false;
}

/**
 * Detect where the current sequence starts based on count resets.
 * When running_count drops (e.g., 31 -> reset), we know a new sequence started.
 */
function getSequenceStartIndex(events: CribbageEventRecord[], currentIndex: number): number {
  // Look backward to find where the sequence started
  // A sequence reset happens when running_count is low after being high
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevEvent = events[i];
    const currentEvent = events[currentIndex];
    
    // Only check pegging events
    if (prevEvent.event_type !== "pegging" || currentEvent.event_type !== "pegging") continue;
    
    const prevCount = prevEvent.running_count ?? 0;
    const currCount = currentEvent.running_count ?? 0;
    
    // If current count is less than previous + reasonable card value, a reset happened
    // A reset means this is the start of a new sequence
    if (currCount < prevCount && currCount <= 10) {
      return currentIndex; // This is the first card of the new sequence
    }
  }
  
  // Find the first pegging event in this group
  for (let i = 0; i <= currentIndex; i++) {
    if (events[i].event_type === "pegging") {
      return i;
    }
  }
  
  return 0;
}

/**
 * Get only the cards in the current sequence (since last reset).
 * Also returns the actual running count for display (handles 31 stored as 0).
 */
function getSequenceCards(
  allEvents: CribbageEventRecord[],
  currentEventIndex: number
): { cards: CardData[]; displayCount: number } {
  const currentEvent = allEvents[currentEventIndex];
  if (currentEvent.event_type !== "pegging") return { cards: [], displayCount: 0 };
  
  const cards: CardData[] = [];
  const storedCount = currentEvent.running_count ?? 0;
  
  // Check if this event scored a 31 - if so, the stored count might be 0 (post-reset)
  // but we want to display 31 and show the full sequence
  const scored31 = inferHit31(allEvents, currentEventIndex);
  
  // Walk backward to find where this sequence started
  // A sequence starts after a 31 or Go from the previous sequence
  let sequenceStart = currentEventIndex;
  
  for (let i = currentEventIndex - 1; i >= 0; i--) {
    const ev = allEvents[i];
    if (ev.event_type !== "pegging") continue;
    
    // If this previous event scored a 31, it ended the previous sequence
    // So our sequence starts AFTER this event
    if (ev.event_subtype?.includes("31")) {
      break;
    }
    
    // Check if there's a Go between this event and our current event
    // that would indicate a sequence break
    let foundGoInBetween = false;
    for (let j = i + 1; j < currentEventIndex; j++) {
      if (allEvents[j].event_type === "go") {
        foundGoInBetween = true;
        break;
      }
    }
    if (foundGoInBetween) {
      break;
    }
    
    // For normal (non-31) events, check count progression
    if (!scored31) {
      const evCount = ev.running_count ?? 0;
      // If current stored count is less than previous, we crossed a reset
      if (storedCount < evCount) {
        break;
      }
    }
    
    sequenceStart = i;
  }
  
  // Collect all cards from sequenceStart to currentEventIndex (inclusive)
  for (let i = sequenceStart; i <= currentEventIndex; i++) {
    const ev = allEvents[i];
    if (ev.event_type === "pegging" && ev.card_played) {
      cards.push(ev.card_played);
    }
  }
  
  // Calculate actual display count
  let displayCount = storedCount;
  if (scored31 && storedCount === 0) {
    // If we scored 31 but count is stored as 0, display 31
    displayCount = 31;
  }
  
  return { cards, displayCount };
}

interface EventRowProps {
  event: CribbageEventRecord;
  playerNames: Map<string, string>;
  allEvents: CribbageEventRecord[];
  eventIndex: number;
  scoresAfterForRow?: Record<string, number>;
}

function CribbageEventRow({ event, playerNames, allEvents, eventIndex, scoresAfterForRow }: EventRowProps) {
  const username = playerNames.get(event.player_id) || "Unknown";
  const label = getEventLabel(event.event_type);
  const subtype = formatSubtype(event.event_subtype);
  const scoresText = formatScores(scoresAfterForRow ?? event.scores_after, playerNames);
  const hit31 = event.event_type === "pegging" ? inferHit31(allEvents, eventIndex) : false;
  let peggingPointsCause = event.event_type === "pegging" && event.points > 0 ? subtype : "";
  if (event.event_type === "pegging" && event.points > 0 && hit31 && !peggingPointsCause.includes("31")) {
    peggingPointsCause = peggingPointsCause ? `${peggingPointsCause} + 31` : "31";
  }
  
  // Build description based on event type
  let description = "";
  switch (event.event_type) {
    case "pegging":
      // Always show: PlayerName: [Card]
      description = `${username}:`;
      break;
    case "go":
      description = `${username} gets a Go`;
      break;
    case "his_heels":
      description = `${username} - His Heels (Jack cut)`;
      break;
    case "hand_scoring":
    case "crib_scoring":
      description = `${username}: ${subtype || "scoring"}`;
      break;
    case "cut_card":
      description = "Cut card revealed";
      break;
    default:
      description = username;
  }

  // For pegging events, show only cards in current sequence (after reset)
  const showCardsOnTable = event.event_type === "pegging";
  const sequenceData = showCardsOnTable ? getSequenceCards(allEvents, eventIndex) : { cards: [], displayCount: 0 };

  return (
    <div className="rounded bg-muted/20 px-2 py-1.5 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={cn(
            "text-[10px] font-medium w-10 flex-shrink-0",
            event.event_type === "his_heels" ? "text-primary" : "text-muted-foreground"
          )}>
            {label}
          </span>
          <span className="text-xs text-foreground truncate">{description}</span>
          {event.card_played && (
            <MiniPlayingCard card={event.card_played as CardData} className="flex-shrink-0" />
          )}
        </div>
        {event.points > 0 && (
          <span className="text-xs text-primary font-medium flex-shrink-0 ml-2 inline-flex items-center gap-1">
            +{event.points}
            {peggingPointsCause && (
              <span className="text-[10px] text-muted-foreground">
                ({peggingPointsCause})
              </span>
            )}
          </span>
        )}
      </div>
      
      {/* Cards on table (board) - only show current sequence, not all cards */}
      {showCardsOnTable && sequenceData.cards.length > 0 && (
        <div className="pl-12 flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Board:</span>
          <div className="flex gap-0.5">
            {sequenceData.cards.map((card, i) => (
              <MiniPlayingCard key={i} card={card} className="w-4 h-5" />
            ))}
          </div>
          {sequenceData.displayCount > 0 && (
            <span className="text-[10px] text-muted-foreground ml-1">({sequenceData.displayCount})</span>
          )}
        </div>
      )}
      
      {/* Scores after this event */}
      {scoresText && event.points > 0 && (
        <div className="pl-12 text-[10px] text-muted-foreground">
          {scoresText}
        </div>
      )}
    </div>
  );
}

// Group events by hand_number for proper display, ensuring each group is sorted by sequence_number
function groupEventsByHand(events: CribbageEventRecord[]): Map<number, CribbageEventRecord[]> {
  const groups = new Map<number, CribbageEventRecord[]>();
  
  for (const event of events) {
    const handNum = event.hand_number;
    if (!groups.has(handNum)) {
      groups.set(handNum, []);
    }
    groups.get(handNum)!.push(event);
  }
  
  // Sort each group by sequence_number to ensure proper chronological order
  for (const [handNum, handEvents] of groups) {
    handEvents.sort((a, b) => a.sequence_number - b.sequence_number);
  }
  
  return groups;
}

// Separate pegging events from scoring events
function separateEventsByPhase(events: CribbageEventRecord[]): {
  peggingEvents: CribbageEventRecord[];
  scoringEvents: CribbageEventRecord[];
  cutCard: CardData | null;
} {
  const peggingEvents: CribbageEventRecord[] = [];
  const scoringEvents: CribbageEventRecord[] = [];
  let cutCard: CardData | null = null;

  for (const event of events) {
    if (event.event_type === "cut_card") {
      cutCard = event.card_played as CardData;
    } else if (event.event_type === "pegging" || event.event_type === "go") {
      peggingEvents.push(event);
    } else if (event.event_type === "hand_scoring" || event.event_type === "crib_scoring" || event.event_type === "his_heels") {
      scoringEvents.push(event);
    }
  }

  return { peggingEvents, scoringEvents, cutCard };
}

// Extract player hands from pegging events (cards played during pegging = their 4-card hand)
function extractPlayerHands(peggingEvents: CribbageEventRecord[]): Map<string, CardData[]> {
  const handsByPlayer = new Map<string, CardData[]>();
  
  for (const event of peggingEvents) {
    if (event.event_type === "pegging" && event.card_played) {
      if (!handsByPlayer.has(event.player_id)) {
        handsByPlayer.set(event.player_id, []);
      }
      handsByPlayer.get(event.player_id)!.push(event.card_played);
    }
  }
  
  return handsByPlayer;
}

// Group scoring events by player and type (hand vs crib)
function groupScoringByPlayer(
  events: CribbageEventRecord[],
  extractedHands: Map<string, CardData[]>,
  cutCard: CardData | null,
  playerNames: Map<string, string>
): Array<{
  playerId: string;
  username: string;
  hand: CardData[];
  cutCard: CardData | null;
  events: CribbageEventRecord[];
  isCrib: boolean;
}> {
  const result: Array<{
    playerId: string;
    username: string;
    hand: CardData[];
    cutCard: CardData | null;
    events: CribbageEventRecord[];
    isCrib: boolean;
  }> = [];

  // First, get all hand_scoring events grouped by player
  const handScoringByPlayer = new Map<string, CribbageEventRecord[]>();
  const cribScoringEvents: CribbageEventRecord[] = [];

  for (const event of events) {
    if (event.event_type === "hand_scoring" || event.event_type === "his_heels") {
      if (!handScoringByPlayer.has(event.player_id)) {
        handScoringByPlayer.set(event.player_id, []);
      }
      handScoringByPlayer.get(event.player_id)!.push(event);
    } else if (event.event_type === "crib_scoring") {
      cribScoringEvents.push(event);
    }
  }

  // Add player hands with their scoring events
  for (const [playerId, playerEvents] of handScoringByPlayer) {
    const hand = extractedHands.get(playerId) || [];
    const username = playerNames.get(playerId) || "Unknown";
    
    result.push({
      playerId,
      username,
      hand,
      cutCard,
      events: playerEvents,
      isCrib: false,
    });
  }

  // Add crib scoring (dealer's crib)
  if (cribScoringEvents.length > 0) {
    const dealerId = cribScoringEvents[0].player_id;
    const dealerName = playerNames.get(dealerId) || "Dealer";
    
    // Crib cards are in cards_involved for crib_scoring events
    const cribCards = cribScoringEvents[0].cards_involved || [];
    
    result.push({
      playerId: dealerId,
      username: dealerName,
      hand: cribCards, // Show crib cards
      cutCard,
      events: cribScoringEvents,
      isCrib: true,
    });
  }

  return result;
}

export function CribbageEventDisplay({ events, playerNames, playerHands = [], pointsToWin = 121 }: CribbageEventDisplayProps) {
  // Filter events to only include those up to and including the winning event.
  // Once a player reaches pointsToWin, no further events should be shown.
  const filteredEvents = useMemo(() => {
    return truncateCribbageEventsAtWin(events, pointsToWin);
  }, [events, pointsToWin]);

  // Compute a trustworthy running scoreline from the filtered event stream.
  const computedScoresAfterById = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => {
      if (a.hand_number !== b.hand_number) return a.hand_number - b.hand_number;
      return a.sequence_number - b.sequence_number;
    });

    const playerIds = Array.from(new Set(sorted.map((e) => e.player_id)));
    const running: Record<string, number> = {};
    for (const id of playerIds) running[id] = 0;

    const map = new Map<string, Record<string, number>>();
    for (const ev of sorted) {
      if (ev.points > 0) {
        running[ev.player_id] = (running[ev.player_id] ?? 0) + ev.points;
      }
      map.set(ev.id, { ...running });
    }
    return map;
  }, [filteredEvents]);

  if (filteredEvents.length === 0) return null;
  
  const groupedByHand = groupEventsByHand(filteredEvents);
  const handNumbers = Array.from(groupedByHand.keys()).sort((a, b) => a - b);
  const hasMultipleHands = handNumbers.length > 1;

  return (
    <div className="space-y-3">
      {handNumbers.map((handNum) => {
        const handEvents = groupedByHand.get(handNum)!;
        const { peggingEvents, scoringEvents, cutCard } = separateEventsByPhase(handEvents);
        
        // Extract hands from pegging events
        const extractedHands = extractPlayerHands(peggingEvents);
        
        // Group scoring by player with their hands
        const scoringGroups = groupScoringByPlayer(scoringEvents, extractedHands, cutCard, playerNames);
        
        return (
          <div key={handNum}>
            {hasMultipleHands && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium mb-1">
                <div className="h-px bg-border flex-1" />
                <span>Hand {handNum}</span>
                <div className="h-px bg-border flex-1" />
              </div>
            )}
            
            {/* Pegging events */}
            {peggingEvents.length > 0 && (
              <div className="space-y-1 mb-2">
                <div className="text-[10px] text-muted-foreground font-medium">Pegging</div>
                {peggingEvents.map((event, idx) => (
                  <CribbageEventRow 
                    key={event.id} 
                    event={event} 
                    playerNames={playerNames}
                    allEvents={handEvents}
                    eventIndex={handEvents.indexOf(event)}
                    scoresAfterForRow={computedScoresAfterById.get(event.id)}
                  />
                ))}
              </div>
            )}

            {/* Hand Scoring - show each player's hand + cut card, then their scoring */}
            {scoringGroups.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] text-muted-foreground font-medium">Counting</div>
                {scoringGroups.map((group, idx) => (
                  <div key={`${group.playerId}-${group.isCrib ? 'crib' : 'hand'}`} className="space-y-1">
                    {/* Player's hand + cut card */}
                    {(() => {
                      const totalPoints = group.events.reduce((sum, e) => sum + (e.points ?? 0), 0);
                      return (
                        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-foreground">
                              {group.isCrib ? `${group.username}'s Crib` : group.username}:
                            </span>
                            {group.hand.length > 0 && (
                              <div className="flex gap-0.5">
                                {group.hand.map((card, i) => (
                                  <MiniPlayingCard key={i} card={card} />
                                ))}
                              </div>
                            )}
                            {group.cutCard && (
                              <>
                                <span className="text-muted-foreground">+</span>
                                <MiniPlayingCard card={group.cutCard} className="border-2 border-primary/50" />
                              </>
                            )}
                          </div>

                          {totalPoints > 0 && (
                            <span className="text-xs text-primary font-medium tabular-nums flex-shrink-0">
                              +{totalPoints}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    
                    {/* Scoring events for this player */}
                    {group.events.map((event) => (
                      <CribbageEventRow 
                        key={event.id} 
                        event={event} 
                        playerNames={playerNames}
                        allEvents={handEvents}
                        eventIndex={handEvents.indexOf(event)}
                        scoresAfterForRow={computedScoresAfterById.get(event.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
