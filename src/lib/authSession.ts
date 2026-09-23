import { isAuthError, isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

/** Positive session invalidation only; HTTP/network failures are not sign-out. */
export function isConfirmedSessionInvalidation(error: unknown): boolean {
  return isAuthSessionMissingError(error) || (isAuthError(error) && [
    'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used',
  ].includes(error.code ?? ''));
}

type LogoutAuth = Pick<SupabaseClient['auth'], 'signOut' | 'getUser' | 'getSession'>;

export async function signOutLocal(auth: LogoutAuth, onSessionInvalidated?: (invalidated: boolean) => void): Promise<void> {
  const { error } = await auth.signOut({ scope: 'local' });
  if (error) {
    if (!isConfirmedSessionInvalidation(error)) throw error;
    onSessionInvalidated?.(true);

    // Auth JS 2.84 returns early from signOut on AuthSessionMissingError.
    // Its supported getUser path removes that invalid session and emits
    // SIGNED_OUT. Never edit SDK storage or treat a network error as proof.
    const verified = await auth.getUser();
    if (verified.error && !isConfirmedSessionInvalidation(verified.error)) throw verified.error;
    if (verified.data.user) {
      onSessionInvalidated?.(false);
      throw new Error('Your sign-in changed while logging out. Please try again.');
    }
  }

  const current = await auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) throw new Error('Logout could not be confirmed. Please try again.');
}
