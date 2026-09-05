import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowLeft } from "lucide-react";
import { usePlayerBalance, reverseAccountEntry, type AccountTransaction } from "@/hooks/usePlayerBalance";
import { useEffect, useRef, useState } from "react";
import { AddTransactionDialog } from "./AddTransactionDialog";
import { accountAmountIsNegative, formatAccountAmount } from "@/lib/accountMoney";

interface TransactionHistoryDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; profileId: string;
  playerName: string; isAdmin: boolean; onBack?: () => void;
}

export const TransactionHistoryDialog = ({ open, onOpenChange, profileId, playerName, isAdmin, onBack }: TransactionHistoryDialogProps) => {
  const { balance, transactions, loading, loadingMore, error, hasMore, loadMore, refetch } = usePlayerBalance(profileId);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [reversal, setReversal] = useState<{ entry: AccountTransaction; requestId: string; submittedReason?: string } | null>(null);
  const [reason, setReason] = useState("");
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const submitting = useRef(false);
  useEffect(() => { setReversal(null); setShowAddTransaction(false); }, [profileId]);
  useEffect(() => { if (open) void refetch(); }, [open, refetch]);

  const handleReverse = async () => {
    if (!reversal || !reason.trim() || submitting.current) return;
    submitting.current = true;
    setReversing(true);
    setReversalError(null);
    const submittedReason = reversal.submittedReason ?? reason.trim();
    setReversal({ ...reversal, submittedReason });
    try {
      await reverseAccountEntry(reversal.requestId, reversal.entry.id, submittedReason);
      setReversal(null);
      await refetch();
    } catch {
      setReversalError("Unable to confirm the reversal. Retry to check its result.");
    } finally { setReversing(false); submitting.current = false; }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              {onBack && <Button variant="ghost" size="sm" aria-label="Back to player balances" className="h-8 w-8 p-0" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>}
              <div className="flex-1"><DialogTitle>{playerName}</DialogTitle><DialogDescription>Transaction History</DialogDescription></div>
            </div>
          </DialogHeader>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Current Balance</span>
              {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowAddTransaction(true)} className="h-7 px-2"><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>}
            </div>
            <span className={`text-2xl font-bold ${balance === null ? 'text-muted-foreground' : accountAmountIsNegative(balance) ? 'text-red-500' : 'text-green-500'}`}>
              {balance === null ? "—" : `$${formatAccountAmount(balance)}`}
            </span>
          </div>
          {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>}
          <ScrollArea className="max-h-[350px] pr-2">
            {loading ? <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
              : transactions.length === 0 && !error ? <div className="text-center py-8 text-muted-foreground">No transactions yet</div>
              : <div className="space-y-2">{transactions.map(txn => (
                <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{txn.transaction_type}</Badge>
                      {txn.reversed && <Badge variant="outline">Reversed</Badge>}
                      <span className="text-xs text-muted-foreground">{format(new Date(txn.date), 'MMM d, yyyy')}</span>
                    </div>
                    {txn.notes && <p className="text-xs text-muted-foreground break-words">{txn.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2 flex-shrink-0">
                    <span className={`font-bold ${accountAmountIsNegative(txn.amount) ? 'text-red-500' : 'text-green-500'}`}>
                      {accountAmountIsNegative(txn.amount) ? '' : '+'}${formatAccountAmount(txn.amount)}
                    </span>
                    {isAdmin && !txn.reversed && txn.transaction_type !== 'Reversal' && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => {
                      setReversal({ entry: txn, requestId: crypto.randomUUID() }); setReason(""); setReversalError(null);
                    }}>Reverse</Button>}
                  </div>
                </div>
              ))}</div>}
            {hasMore && <Button className="w-full mt-3" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading..." : "Load more transactions"}</Button>}
          </ScrollArea>
        </DialogContent>
      </Dialog>
      <AddTransactionDialog open={showAddTransaction} onOpenChange={setShowAddTransaction} playerId={profileId} playerName={playerName} onTransactionAdded={() => void refetch()} />
      <Dialog open={!!reversal} onOpenChange={next => { if (!next && !reversing) setReversal(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse transaction</DialogTitle>
            <DialogDescription>Append a correction for the {reversal?.entry.transaction_type} of ${formatAccountAmount(reversal?.entry.amount ?? null)}. The original entry stays in the history.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="reversal-reason">Reason</Label>
          <Textarea id="reversal-reason" value={reason} maxLength={2000} disabled={reversing || reversal?.submittedReason !== undefined} onChange={e => setReason(e.target.value)} />
          {reversalError && <p role="alert" className="text-sm text-destructive">{reversalError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={reversing} onClick={() => setReversal(null)}>Close</Button>
            <Button disabled={reversing || !reason.trim()} onClick={() => void handleReverse()}>{reversing ? "Checking..." : reversal?.submittedReason ? "Retry reversal" : "Reverse transaction"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
