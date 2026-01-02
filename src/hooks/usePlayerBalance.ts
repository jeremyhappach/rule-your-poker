import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Transaction {
  id: string;
  profile_id: string;
  date: string;
  transaction_type: string;
  amount: number;
  notes: string | null;
  created_at: string;
}

export const usePlayerBalance = (profileId: string | undefined) => {
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    if (!profileId) {
      setBalance(0);
      setTransactions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from('player_transactions')
      .select('*')
      .eq('profile_id', profileId)
      .order('date', { ascending: false });

    if (error) {
      console.error('[usePlayerBalance] Error fetching transactions:', error);
      setBalance(0);
      setTransactions([]);
    } else {
      const txns = (data || []) as Transaction[];
      setTransactions(txns);
      // Calculate balance as sum of all amounts
      const total = txns.reduce((sum, t) => sum + Number(t.amount), 0);
      setBalance(total);
    }

    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return { balance, transactions, loading, refetch: fetchTransactions };
};

// Hook to get all active players with balances (for admin view)
export const useAllPlayerBalances = () => {
  const [players, setPlayers] = useState<Array<{
    id: string;
    username: string;
    balance: number;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllBalances = useCallback(async () => {
    setLoading(true);

    // Get all active profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, is_active')
      .eq('is_active', true)
      .not('username', 'like', 'Bot %');

    if (profilesError) {
      console.error('[useAllPlayerBalances] Error fetching profiles:', profilesError);
      setPlayers([]);
      setLoading(false);
      return;
    }

    // Get all transactions
    const { data: transactions, error: txnError } = await supabase
      .from('player_transactions')
      .select('profile_id, amount');

    if (txnError) {
      console.error('[useAllPlayerBalances] Error fetching transactions:', txnError);
      // Still show players with 0 balance
      setPlayers((profiles || []).map(p => ({
        id: p.id,
        username: p.username,
        balance: 0,
      })));
      setLoading(false);
      return;
    }

    // Calculate balance per profile
    const balanceMap = new Map<string, number>();
    (transactions || []).forEach(t => {
      const current = balanceMap.get(t.profile_id) || 0;
      balanceMap.set(t.profile_id, current + Number(t.amount));
    });

    // Combine profiles with balances
    const playersWithBalances = (profiles || []).map(p => ({
      id: p.id,
      username: p.username,
      balance: balanceMap.get(p.id) || 0,
    }));

    // Sort by balance descending
    playersWithBalances.sort((a, b) => b.balance - a.balance);

    setPlayers(playersWithBalances);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return { players, loading, refetch: fetchAllBalances };
};
