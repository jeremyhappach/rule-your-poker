import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AccountTransaction {
  id: string;
  profile_id: string;
  date: string;
  transaction_type: string;
  amount: string;
  notes: string | null;
  created_at: string;
  source_game_id: string | null;
  actor_id: string | null;
  reversal_of: string | null;
  reversed: boolean;
}
type Cursor = { date: string; id: string };
type Statement = {
  balance: string;
  transactions: AccountTransaction[];
  has_more: boolean;
  next_cursor: Cursor | null;
};

export const usePlayerBalance = (profileId: string | undefined) => {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const fetchTransactions = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    setStatement(null);
    setLoadedProfile(profileId);
    if (!profileId) { setLoading(false); return; }
    try {
      const { data, error: failure } = await supabase.rpc("account_statement" as any, {
        p_profile_id: profileId, p_limit: 50,
      } as any);
      if (failure) throw failure;
      if (generation.current === request) setStatement(data as unknown as Statement);
    } catch {
      if (generation.current === request) setError("Unable to load this account. Please retry.");
    } finally {
      if (generation.current === request) { setLoading(false); setLoadingMore(false); }
    }
  }, [profileId]);

  useEffect(() => {
    void fetchTransactions();
    return () => { generation.current++; };
  }, [fetchTransactions]);

  const loadMore = useCallback(async () => {
    if (!profileId || !statement?.has_more || !statement.next_cursor || loadingMore) return;
    const request = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const { data, error: failure } = await supabase.rpc("account_statement" as any, {
        p_profile_id: profileId, p_limit: 50,
        p_before_date: statement.next_cursor.date, p_before_id: statement.next_cursor.id,
      } as any);
      if (failure) throw failure;
      if (generation.current !== request) return;
      const next = data as unknown as Statement;
      setStatement(previous => ({
        ...next,
        transactions: [...new Map([...(previous?.transactions ?? []), ...next.transactions].map(row => [row.id, row])).values()],
      }));
    } catch {
      if (generation.current === request) setError("Unable to load more transactions. Please retry.");
    } finally {
      if (generation.current === request) setLoadingMore(false);
    }
  }, [profileId, statement, loadingMore]);

  const current = loadedProfile === profileId ? statement : null;
  return {
    balance: error ? null : current?.balance ?? null,
    transactions: current?.transactions ?? [], loading, loadingMore, error,
    hasMore: current?.has_more ?? false, loadMore, refetch: fetchTransactions,
  };
};

export type AccountBalance = {
  id: string; username: string; balance: string; lastTransactionDate: string | null;
};

export const useAllPlayerBalances = () => {
  const [players, setPlayers] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const fetchAllBalances = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: failure } = await supabase.rpc("admin_account_balances" as any);
      if (failure) throw failure;
      if (request === generation.current) setPlayers(data as unknown as AccountBalance[]);
    } catch {
      if (request === generation.current) { setPlayers([]); setError("Unable to load account balances. Please retry."); }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchAllBalances();
    return () => { generation.current++; };
  }, [fetchAllBalances]);
  return { players, loading, error, refetch: fetchAllBalances };
};

export async function reverseAccountEntry(requestId: string, entryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reverse_account_entry" as any, {
    p_request_id: requestId, p_entry_id: entryId, p_reason: reason,
  } as any);
  if (error) throw error;
}
