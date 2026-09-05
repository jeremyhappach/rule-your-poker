import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { accountDraftKey, loadAccountDraft, saveAccountDraft, type AccountEntryDraft } from "@/lib/accountEntryDraft";

interface AddTransactionDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; playerId: string;
  playerName: string; onTransactionAdded: () => void;
}

export const AddTransactionDialog = ({ open, onOpenChange, playerId, playerName, onTransactionAdded }: AddTransactionDialogProps) => {
  const [transactionType, setTransactionType] = useState<AccountEntryDraft["type"]>("Deposit");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<AccountEntryDraft | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStorageKey(null);
    setPending(null);
    setError(null);
    void (async () => {
      try {
        const { data, error: authError } = await supabase.auth.getSession();
        if (authError || !data.session) throw new Error("Sign in again before adding an entry.");
        const key = accountDraftKey(data.session.user.id, playerId);
        const draft = loadAccountDraft(localStorage, key);
        if (!active) return;
        setPending(draft);
        setTransactionType(draft?.type ?? "Deposit");
        setAmount(draft?.amount ?? "");
        setNotes(draft?.notes ?? "");
        setStorageKey(key);
      } catch {
        if (active) setError("Unable to open the saved entry. Check browser storage and sign in again.");
      }
    })();
    return () => { active = false; };
  }, [open, playerId]);

  const handleSubmit = async () => {
    if (!storageKey || submitting.current) return;
    if (!pending && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !/[1-9]/.test(amount) || amount.length > 32)) {
      setError("Enter a positive amount with no more than two decimal places.");
      return;
    }
    submitting.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const draft = saveAccountDraft(localStorage, storageKey, pending ?? {
        requestId: crypto.randomUUID(), profileId: playerId, type: transactionType, amount, notes: notes.trim(),
      });
      setPending(draft);
      setTransactionType(draft.type);
      setAmount(draft.amount);
      setNotes(draft.notes);
      const { error: failure } = await supabase.rpc("admin_record_account_entry" as any, {
        p_request_id: draft.requestId, p_profile_id: draft.profileId, p_type: draft.type,
        p_amount: draft.amount, p_notes: draft.notes || null,
      } as any);
      if (failure) {
        // Database rejection rolls back. A lost response retains the same request.
        if (failure.code && /^[0-9A-Z]{5}$/.test(failure.code)) {
          localStorage.removeItem(storageKey);
          setPending(null);
        }
        throw failure;
      }
      localStorage.removeItem(storageKey);
      setPending(null);
      onTransactionAdded();
      onOpenChange(false);
    } catch {
      setError("Unable to confirm this entry. Retry to check its result.");
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const locked = isSubmitting || !!pending || !storageKey;
  return (
    <Dialog open={open} onOpenChange={next => { if (!isSubmitting) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add Transaction</DialogTitle><DialogDescription>Add a manual transaction for {playerName}</DialogDescription></DialogHeader>
        <div className="space-y-4 py-4">
          {pending && <p className="text-sm text-muted-foreground">This entry is awaiting confirmation. Retry to check its result.</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="transaction-type">Transaction Type</Label>
            <Select value={transactionType} onValueChange={value => setTransactionType(value as AccountEntryDraft["type"])} disabled={locked}>
              <SelectTrigger id="transaction-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Deposit">Deposit</SelectItem><SelectItem value="Payout">Payout</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} disabled={locked} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" placeholder="Add a note..." value={notes} maxLength={2000} disabled={locked} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting || !amount || !storageKey}>{isSubmitting ? "Checking..." : pending ? "Retry entry" : "Add Transaction"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
