// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/auth-js';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({
  getSession: vi.fn(), refreshSession: vi.fn(), navigate: vi.fn(),
  listeners: new Set<(event: AuthChangeEvent, session: Session | null) => void>(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {
  getSession: state.getSession, refreshSession: state.refreshSession,
  onAuthStateChange: (listener: (event: AuthChangeEvent, session: Session | null) => void) => {
    state.listeners.add(listener);
    return { data: { subscription: { unsubscribe: () => state.listeners.delete(listener) } } };
  },
} } }));
vi.mock('@/lib/persistSyncDebugEvent', () => ({ persistSyncDebugEvent: vi.fn() }));
vi.mock('@/lib/authEjectionLedger', () => ({ noteAuthRedirectAttempt: vi.fn(), recordAuthStateChange: vi.fn(), recordRouteRedirect: vi.fn() }));
vi.mock('@/lib/sessionRecoveryLease', () => ({ getActiveRecoveryLease: () => ({ gameId: 'table-1' }) }));
vi.mock('@/lib/runtimeInstrumentation/runtimeTracer', () => ({ recordActiveSessionMarker: vi.fn(), recordAppRouteRedirect: vi.fn() }));
vi.mock('@/lib/authInvalidationCause', () => ({ peekIntentionalSignOut: () => null, recordAuthSessionInvalidationCause: vi.fn(), installAuthStorageWatcher: vi.fn() }));
vi.mock('@/lib/chatOperations/chatOperationBoundary', () => ({ recordChatBoundaryEvent: vi.fn() }));
import { useAuthGuard } from './useAuthGuard';

const session = { access_token: 'test', refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'account-1' } } as Session;
const response = (value: Session | null = session, error: unknown = null) => ({ data: { session: value }, error });
const emit = async (event: AuthChangeEvent, value: Session | null) => {
  await act(async () => { state.listeners.forEach(listener => listener(event, value)); });
};
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  vi.useRealTimers(); state.listeners.clear(); vi.clearAllMocks();
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/game/table-1');
  localStorage.setItem('sb-test-auth-token', JSON.stringify(session));
  state.getSession.mockReset().mockResolvedValue(response());
  state.refreshSession.mockReset().mockResolvedValue(response());
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('auth guard action admission and recovery', () => {
  it('invalidates SIGNED_OUT despite an unexpired JWT and a table recovery lease', async () => {
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await act(async () => {});
    await emit('SIGNED_OUT', null);
    expect(result.current).toMatchObject({ user: null, isReady: false, authRecovering: false, authInvalidated: true });
    expect(state.navigate).toHaveBeenCalledWith('/auth');
    expect(state.refreshSession).not.toHaveBeenCalled();
  });

  it('retains table continuity through transient null and recovers on the existing recheck', async () => {
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await act(async () => {});
    vi.useFakeTimers();
    await emit('TOKEN_REFRESHED', null);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(result.current.user?.id).toBe('account-1');
    expect(result.current.authInvalidated).toBe(false);
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it.each([new AuthRetryableFetchError('offline', 0), new AuthRetryableFetchError('unavailable', 503)])('does not invalidate on a transient initial session error (%s)', async error => {
    state.getSession.mockResolvedValue(response(null, error));
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await waitFor(() => expect(result.current.authRecovering).toBe(true));
    expect(result.current.user?.id).toBe('account-1');
    expect(result.current.authInvalidated).toBe(false);
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it('confirmed missing-session recovery cannot be overridden by a lease', async () => {
    state.getSession.mockResolvedValue(response(null));
    state.refreshSession.mockResolvedValue(response(null, new AuthSessionMissingError()));
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await waitFor(() => expect(result.current.authInvalidated).toBe(true));
    expect(result.current.user).toBeNull();
    expect(state.navigate).toHaveBeenCalledWith('/auth');
  });

  it('retains recoverable identity when the existing recovery request meets a network failure', async () => {
    state.getSession.mockResolvedValue(response(null));
    state.refreshSession.mockResolvedValue(response(null, new AuthRetryableFetchError('offline', 0)));
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await waitFor(() => expect(state.refreshSession).toHaveBeenCalledOnce());
    expect(result.current.authRecovering).toBe(true);
    expect(result.current.authInvalidated).toBe(false);
    expect(result.current.user?.id).toBe('account-1');
    expect(state.navigate).not.toHaveBeenCalled();
    await emit('TOKEN_REFRESHED', session);
    expect(result.current.authRecovering).toBe(false);
  });

  it('rejects a stale initial session completion after SIGNED_OUT', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    state.getSession.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await emit('SIGNED_OUT', null);
    await act(async () => { pending.resolve(response()); });
    expect(result.current.user).toBeNull();
    expect(result.current.authInvalidated).toBe(true);
  });

  it('rejects a stale recovery result after a newer confirmed sign-out', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    state.getSession.mockResolvedValue(response(null)); state.refreshSession.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await waitFor(() => expect(state.refreshSession).toHaveBeenCalledOnce());
    await emit('SIGNED_OUT', null);
    await act(async () => { pending.resolve(response()); });
    expect(result.current.user).toBeNull();
    expect(result.current.authInvalidated).toBe(true);
  });

  it('unsubscribes and cancels the transient recheck on unmount', async () => {
    const { unmount } = renderHook(() => useAuthGuard({ pageLabel: 'Game' }));
    await act(async () => {}); vi.useFakeTimers();
    await emit('TOKEN_REFRESHED', null);
    const calls = state.getSession.mock.calls.length;
    unmount(); await vi.advanceTimersByTimeAsync(1500);
    expect(state.listeners.size).toBe(0);
    expect(state.getSession).toHaveBeenCalledTimes(calls);
  });
});
