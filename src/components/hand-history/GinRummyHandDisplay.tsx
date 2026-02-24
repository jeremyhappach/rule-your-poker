import { cn } from "@/lib/utils";
import { MiniPlayingCard } from "./MiniPlayingCard";
import type { CardData } from "./types";

interface GinRummyPlayerMelds {
  playerId: string;
  hand: CardData[];
  melds: Array<{ type: string; cards: CardData[] }>;
  deadwood: CardData[];
  deadwoodValue: number;
  hasKnocked: boolean;
  hasGin: boolean;
  laidOffCards: CardData[];
}

interface KnockResultData {
  knockerId: string;
  opponentId: string;
  knockerDeadwood: number;
  opponentDeadwood: number;
  isGin: boolean;
  isUndercut: boolean;
  pointsAwarded: number;
  winnerId: string;
}

interface GinRummyHandDisplayProps {
  playerStates: Record<string, GinRummyPlayerMelds>;
  knockResult: KnockResultData | null;
  playerNames: Map<string, string>;
  currentPlayerId?: string;
}

/** Display both players' hands with melds and deadwood for gin rummy hand history */
export function GinRummyHandDisplay({
  playerStates,
  knockResult,
  playerNames,
  currentPlayerId,
}: GinRummyHandDisplayProps) {
  if (!knockResult) return null;

  const playerIds = [knockResult.knockerId, knockResult.opponentId];

  // Result banner
  const winnerName = playerNames.get(knockResult.winnerId) || "Unknown";
  let resultLabel = "";
  if (knockResult.isGin) {
    resultLabel = `🔥 ${winnerName} — Gin! +${knockResult.pointsAwarded} pts`;
  } else if (knockResult.isUndercut) {
    resultLabel = `⚡ ${winnerName} — Undercut! +${knockResult.pointsAwarded} pts (${knockResult.knockerDeadwood} vs ${knockResult.opponentDeadwood} dw + 25 bonus)`;
  } else {
    resultLabel = `${winnerName} — Knock +${knockResult.pointsAwarded} pts (${knockResult.opponentDeadwood} - ${knockResult.knockerDeadwood} dw)`;
  }

  return (
    <div className="space-y-2">
      {/* Result banner */}
      <div
        className={cn(
          "text-xs font-semibold px-2 py-1.5 rounded text-center",
          knockResult.isGin
            ? "bg-amber-500/20 text-amber-300"
            : knockResult.isUndercut
            ? "bg-blue-500/20 text-blue-300"
            : "bg-primary/20 text-primary"
        )}
      >
        {resultLabel}
      </div>

      {/* Each player's hand */}
      {playerIds.map((playerId) => {
        const ps = playerStates[playerId];
        if (!ps) return null;

        const isKnocker = playerId === knockResult.knockerId;
        const isViewer = playerId === currentPlayerId;
        const name = isViewer ? "You" : (playerNames.get(playerId) || "Unknown");
        const roleTag = isKnocker
          ? ps.hasGin
            ? "Gin"
            : "Knocked"
          : "Opponent";

        return (
          <div
            key={playerId}
            className={cn(
              "rounded px-2 py-1.5 space-y-1",
              playerId === knockResult.winnerId ? "bg-primary/10" : "bg-muted/20"
            )}
          >
            {/* Player name + role */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">{name}</span>
              <span
                className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded font-medium",
                  isKnocker ? "bg-amber-500/30 text-amber-300" : "bg-muted/40 text-muted-foreground"
                )}
              >
                {roleTag}
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {ps.deadwoodValue} dw
              </span>
            </div>

            {/* Melds */}
            {ps.melds && ps.melds.length > 0 && (
              <div className="space-y-0.5">
                {ps.melds.map((meld, mi) => (
                  <div key={mi} className="flex items-center gap-0.5">
                    <span className="text-[9px] text-muted-foreground w-7">
                      {meld.type === "set" ? "Set" : "Run"}
                    </span>
                    <div className="flex gap-0.5">
                      {meld.cards.map((card, ci) => {
                        // Check if this card was laid off by opponent
                        const isLaidOff =
                          !isKnocker &&
                          false; // laid-off cards show on knocker's melds
                        const laidOffOnKnocker =
                          isKnocker &&
                          playerStates[knockResult.opponentId]?.laidOffCards?.some(
                            (lc) => lc.rank === card.rank && lc.suit === card.suit
                          );
                        return (
                          <MiniPlayingCard
                            key={ci}
                            card={card}
                            className={cn(
                              laidOffOnKnocker && "ring-1 ring-blue-400/60"
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Deadwood */}
            {ps.deadwood && ps.deadwood.length > 0 && (
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] text-muted-foreground w-7">DW</span>
                <div className="flex gap-0.5">
                  {ps.deadwood.map((card, ci) => (
                    <MiniPlayingCard
                      key={ci}
                      card={card}
                      className="opacity-60"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
