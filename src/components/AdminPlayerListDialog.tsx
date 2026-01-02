import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAllPlayerBalances } from "@/hooks/usePlayerBalance";
import { useState } from "react";
import { TransactionHistoryDialog } from "./TransactionHistoryDialog";
import { formatChipValue } from "@/lib/utils";

interface AdminPlayerListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AdminPlayerListDialog = ({
  open,
  onOpenChange,
}: AdminPlayerListDialogProps) => {
  const { players, loading, refetch } = useAllPlayerBalances();
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: string;
    username: string;
  } | null>(null);

  const handlePlayerClick = (player: { id: string; username: string }) => {
    setSelectedPlayer(player);
  };

  const handleBackToList = () => {
    setSelectedPlayer(null);
    refetch(); // Refresh balances when coming back
  };

  const handleCloseAll = (openState: boolean) => {
    if (!openState) {
      setSelectedPlayer(null);
    }
    onOpenChange(openState);
  };

  // If a player is selected, show their transaction history
  if (selectedPlayer) {
    return (
      <TransactionHistoryDialog
        open={open}
        onOpenChange={handleCloseAll}
        profileId={selectedPlayer.id}
        playerName={selectedPlayer.username}
        isAdmin={true}
        onBack={handleBackToList}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleCloseAll}>
      <DialogContent className="sm:max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Player Balances</DialogTitle>
          <DialogDescription>
            Tap a player to view their transactions
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading players...
            </div>
          ) : players.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No players found
            </div>
          ) : (
            <div className="space-y-1">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => handlePlayerClick(player)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-background border hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="font-medium text-foreground truncate">
                    {player.username}
                  </span>
                  <span
                    className={`font-bold ml-2 flex-shrink-0 ${
                      player.balance >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    ${formatChipValue(player.balance)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
