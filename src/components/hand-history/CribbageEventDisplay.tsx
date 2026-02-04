import { cn } from "@/lib/utils";
import { MiniCardRow, MiniPlayingCard } from "./MiniPlayingCard";
import type { CribbageEventRecord, CardData } from "./types";

interface PlayerHandData {
  playerId: string;
  username: string;
  cards: CardData[];
}

interface CribbageEventDisplayProps {
  events: CribbageEventRecord[];
  playerNames: Map<string, string>;
  playerHands?: PlayerHandData[];
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

// Format subtype for better display (e.g., "three_of_a_kind+31" -> "3 of a kind, 31")
function formatSubtype(subtype: string | null): string {
  if (!subtype) return "";
  
  return subtype
    .replace(/three_of_a_kind/g, "3 of a kind")
    .replace(/four_of_a_kind/g, "4 of a kind")
    .replace(/run_(\d+)/g, "run of $1")
    .replace(/run of (\d+)/g, "run of $1")
    .replace(/\+/g, ", ")
    .replace(/_/g, " ");
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
 * Get only the cards in the current sequence (since last reset)
 */
function getSequenceCards(
  allEvents: CribbageEventRecord[],
  currentEventIndex: number
): CardData[] {
  const currentEvent = allEvents[currentEventIndex];
  if (currentEvent.event_type !== "pegging") return [];
  
  const cards: CardData[] = [];
  const currentCount = currentEvent.running_count ?? 0;
  
  // Walk backward to find where this sequence started
  let sequenceStart = currentEventIndex;
  let prevCount = currentCount;
  
  for (let i = currentEventIndex - 1; i >= 0; i--) {
    const ev = allEvents[i];
    if (ev.event_type !== "pegging") continue;
    
    const evCount = ev.running_count ?? 0;
    
    // If count at previous event is higher than current start, we're before a reset
    if (evCount > prevCount || (evCount === 0 && prevCount > 0)) {
      break; // Found the reset point
    }
    
    sequenceStart = i;
    prevCount = evCount;
  }
  
  // Collect all cards from sequenceStart to currentEventIndex (inclusive)
  for (let i = sequenceStart; i <= currentEventIndex; i++) {
    const ev = allEvents[i];
    if (ev.event_type === "pegging" && ev.card_played) {
      cards.push(ev.card_played);
    }
  }
  
  return cards;
}

interface EventRowProps {
  event: CribbageEventRecord;
  playerNames: Map<string, string>;
  allEvents: CribbageEventRecord[];
  eventIndex: number;
}

function CribbageEventRow({ event, playerNames, allEvents, eventIndex }: EventRowProps) {
  const username = playerNames.get(event.player_id) || "Unknown";
  const label = getEventLabel(event.event_type);
  const subtype = formatSubtype(event.event_subtype);
  const scoresText = formatScores(event.scores_after, playerNames);
  
  // Build description based on event type
  let description = "";
  switch (event.event_type) {
    case "pegging":
      description = subtype ? `${username}: ${subtype}` : `${username} plays`;
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
  const sequenceCards = showCardsOnTable ? getSequenceCards(allEvents, eventIndex) : [];

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
          <span className="text-xs text-primary font-medium flex-shrink-0 ml-2">
            +{event.points}
          </span>
        )}
      </div>
      
      {/* Cards on table (board) - only show current sequence, not all cards */}
      {showCardsOnTable && sequenceCards.length > 0 && (
        <div className="pl-12 flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Board:</span>
          <div className="flex gap-0.5">
            {sequenceCards.map((card, i) => (
              <MiniPlayingCard key={i} card={card} className="w-4 h-5" />
            ))}
          </div>
          {event.running_count !== null && (
            <span className="text-[10px] text-muted-foreground ml-1">({event.running_count})</span>
          )}
        </div>
      )}
      
      {/* Scores after this event */}
      {scoresText && (
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

export function CribbageEventDisplay({ events, playerNames, playerHands = [] }: CribbageEventDisplayProps) {
  if (events.length === 0) return null;
  
  const groupedByHand = groupEventsByHand(events);
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
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30">
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
                    
                    {/* Scoring events for this player */}
                    {group.events.map((event) => (
                      <CribbageEventRow 
                        key={event.id} 
                        event={event} 
                        playerNames={playerNames}
                        allEvents={handEvents}
                        eventIndex={handEvents.indexOf(event)}
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
