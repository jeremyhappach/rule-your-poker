import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowLeft, Trash2 } from "lucide-react";
import { usePlayerBalance, deleteTransaction } from "@/hooks/usePlayerBalance";
import { useState } from "react";
import { AddTransactionDialog } from "./AddTransactionDialog";
import { formatChipValue } from "@/lib/utils";
import { toast } from "sonner";

interface TransactionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  playerName: string;
  isAdmin: boolean;
  onBack?: () => void;
}

export const TransactionHistoryDialog = ({
  open,
  onOpenChange,
  profileId,
  playerName,
  isAdmin,
  onBack,
}: TransactionHistoryDialogProps) => {
  const { balance, transactions, loading, refetch } = usePlayerBalance(profileId);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleTransactionAdded = () => {
    refetch();
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    setDeletingId(transactionId);
    const success = await deleteTransaction(transactionId);
    if (success) {
      toast.success("Transaction deleted");
      refetch();
    } else {
      toast.error("Failed to delete transaction");
    }
    setDeletingId(null);
  };

  const getTransactionBadgeColor = (type: string) => {
    switch (type) {
      case 'Deposit':
        return 'bg-green-600/80 text-white border-0';
      case 'Payout':
        return 'bg-red-600/80 text-white border-0';
      case 'SessionResult':
        return 'bg-blue-600/80 text-white border-0';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={onBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="flex-1">
                <DialogTitle>{playerName}</DialogTitle>
                <DialogDescription>Transaction History</DialogDescription>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => setShowAddTransaction(true)}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Current Balance */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <span className="text-sm text-muted-foreground">Current Balance</span>
            <span
              className={`text-2xl font-bold ${
                balance >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              ${formatChipValue(balance)}
            </span>
          </div>

          {/* Transactions List */}
          <ScrollArea className="max-h-[350px] pr-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading transactions...
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No transactions yet
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background border"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge className={getTransactionBadgeColor(txn.transaction_type)}>
                          {txn.transaction_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(txn.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      {txn.notes && (
                        <p className="text-xs text-muted-foreground truncate">
                          {txn.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <span
                        className={`font-bold ${
                          Number(txn.amount) >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {Number(txn.amount) >= 0 ? '+' : ''}${formatChipValue(Number(txn.amount))}
                      </span>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteTransaction(txn.id)}
                          disabled={deletingId === txn.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AddTransactionDialog
        open={showAddTransaction}
        onOpenChange={setShowAddTransaction}
        playerId={profileId}
        playerName={playerName}
        onTransactionAdded={handleTransactionAdded}
      />
    </>
  );
};
