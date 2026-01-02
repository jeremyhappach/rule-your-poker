import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAllPlayerBalances } from "@/hooks/usePlayerBalance";
import { useState, useEffect, useMemo } from "react";
import { TransactionHistoryDialog } from "./TransactionHistoryDialog";
import { formatChipValue } from "@/lib/utils";
import { ArrowUpDown } from "lucide-react";

interface AdminPlayerListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortMode = 'username' | 'recent';

export const AdminPlayerListDialog = ({
  open,
  onOpenChange,
}: AdminPlayerListDialogProps) => {
  const { players, loading, refetch } = useAllPlayerBalances();
  const [selectedPlayer, setSelectedPlayer] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('username');

  // Refetch balances when dialog opens
  useEffect(() => {
    if (open && !selectedPlayer) {
      refetch();
    }
  }, [open, selectedPlayer, refetch]);

  const sortedPlayers = useMemo(() => {
    const sorted = [...players];
    if (sortMode === 'username') {
      sorted.sort((a, b) => a.username.localeCompare(b.username));
    } else {
      // Sort by most recent transaction first
      sorted.sort((a, b) => {
        if (!a.lastTransactionDate && !b.lastTransactionDate) return 0;
        if (!a.lastTransactionDate) return 1;
        if (!b.lastTransactionDate) return -1;
        return new Date(b.lastTransactionDate).getTime() - new Date(a.lastTransactionDate).getTime();
      });
    }
    return sorted;
  }, [players, sortMode]);

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

  const toggleSort = () => {
    setSortMode(prev => prev === 'username' ? 'recent' : 'username');
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
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Player Balances</DialogTitle>
              <DialogDescription>
                Tap a player to view their transactions
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSort}
              className="flex items-center gap-1.5 text-xs"
            >
              <ArrowUpDown className="h-3 w-3" />
              {sortMode === 'username' ? 'A-Z' : 'Recent'}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading players...
            </div>
          ) : sortedPlayers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No players found
            </div>
          ) : (
            <div className="space-y-1">
              {sortedPlayers.map((player) => (
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
