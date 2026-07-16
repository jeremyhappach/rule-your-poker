/**
 * WartimeAdminGateMount — closes the Wartime Debug admin gate for
 * non-administrators.
 *
 * Wartime instrumentation is admin-only. This mount:
 *   1. Watches Supabase auth state.
 *   2. Resolves the signed-in user's admin flag from `user_roles`.
 *   3. Opens the Wartime admin gate ONLY when an authenticated admin is
 *      present; closes it (and stops any in-progress recording) otherwise.
 *
 * The persisted `ptp_wartime_debug_enabled` localStorage flag is left
 * intact so an admin's prior selection survives sign-out/sign-in.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { setWartimeAdminGate } from './core';

export function WartimeAdminGateMount(): null {
  useEffect(() => {
    let cancelled = false;

    const resolve = async (userId: string | undefined) => {
      if (!userId) {
        if (!cancelled) setWartimeAdminGate(false);
        return;
      }
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (cancelled) return;
      setWartimeAdminGate(!error && !!data);
    };

    // Start locked-off; only an authenticated admin can open the gate.
    setWartimeAdminGate(false);

    void supabase.auth.getSession().then(({ data }) => {
      void resolve(data.session?.user?.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void resolve(session?.user?.id);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      setWartimeAdminGate(false);
    };
  }, []);

  return null;
}
