import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion } from "@/components/ui/accordion";
import { Clock } from "lucide-react";
import { useHandHistoryData } from "./hand-history/useHandHistoryData";
import { DealerGameAccordion } from "./hand-history/DealerGameAccordion";

interface HandHistoryProps {
  gameId: string;
  currentUserId?: string;
  currentPlayerId?: string;
  currentPlayerChips?: number;
  gameType?: string | null;
  currentRound?: number | null;
}

export const HandHistory = ({
  gameId,
  currentUserId,
  currentPlayerId,
  currentPlayerChips,
  gameType,
  currentRound,
}: HandHistoryProps) => {
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  const { dealerGameGroups, loading } = useHandHistoryData({
    gameId,
    currentUserId,
    currentPlayerId,
    currentRound,
  });

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-4 h-4 mr-2 animate-spin" />
        Loading history...
      </div>
    );
  }

  // Empty state
  if (dealerGameGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="w-8 h-8 mb-2 opacity-50" />
        <p>No hands yet</p>
        <p className="text-xs mt-1">Hand history will appear here</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[400px] overflow-x-hidden">
      <div className="space-y-2 p-2">
        <Accordion
          type="single"
          collapsible
          value={expandedGame ?? undefined}
          onValueChange={(value) => setExpandedGame(value)}
        >
          {dealerGameGroups.map((group) => (
            <DealerGameAccordion
              key={group.dealerGameId}
              group={group}
              currentPlayerId={currentPlayerId}
              currentUserId={currentUserId}
            />
          ))}
        </Accordion>
      </div>
    </ScrollArea>
  );
};
