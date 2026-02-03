import { cn } from "@/lib/utils";
import { MiniCardRow, MiniPlayingCard } from "./MiniPlayingCard";
import type { CribbageEventRecord, CardData } from "./types";

interface CribbageEventDisplayProps {
  events: CribbageEventRecord[];
  playerNames: Map<string, string>;
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

// Format subtype for better display (e.g., "run_3" -> "run of 3", "15+pair" -> "15, pair")
function formatSubtype(subtype: string | null): string {
  if (!subtype) return "";
  
  return subtype
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

interface EventRowProps {
  event: CribbageEventRecord;
  playerNames: Map<string, string>;
}

function CribbageEventRow({ event, playerNames }: EventRowProps) {
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

  // For pegging events, show the cards on table
  const showCardsOnTable = event.event_type === "pegging" && event.cards_on_table && event.cards_on_table.length > 0;

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
      
      {/* Cards on table (board) after the play */}
      {showCardsOnTable && (
        <div className="pl-12 flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Board:</span>
          <div className="flex gap-0.5">
            {(event.cards_on_table as CardData[]).map((card, i) => (
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

// Group events by hand_number for proper display
function groupEventsByHand(events: CribbageEventRecord[]): Map<number, CribbageEventRecord[]> {
  const groups = new Map<number, CribbageEventRecord[]>();
  
  for (const event of events) {
    const handNum = event.hand_number;
    if (!groups.has(handNum)) {
      groups.set(handNum, []);
    }
    groups.get(handNum)!.push(event);
  }
  
  return groups;
}

export function CribbageEventDisplay({ events, playerNames }: CribbageEventDisplayProps) {
  if (events.length === 0) return null;
  
  const groupedByHand = groupEventsByHand(events);
  const handNumbers = Array.from(groupedByHand.keys()).sort((a, b) => a - b);
  const hasMultipleHands = handNumbers.length > 1;

  return (
    <div className="space-y-2">
      {handNumbers.map((handNum) => {
        const handEvents = groupedByHand.get(handNum)!;
        
        return (
          <div key={handNum}>
            {hasMultipleHands && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium mb-1">
                <div className="h-px bg-border flex-1" />
                <span>Hand {handNum}</span>
                <div className="h-px bg-border flex-1" />
              </div>
            )}
            
            <div className="space-y-1">
              {handEvents.map((event) => (
                <CribbageEventRow 
                  key={event.id} 
                  event={event} 
                  playerNames={playerNames} 
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
