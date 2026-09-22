// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({
  rpc: vi.fn(), getSession: vi.fn(), unsubscribe: vi.fn(),
  callback: null as null | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: auth.rpc,
  auth: { getSession: auth.getSession, onAuthStateChange: (cb: typeof auth.callback) => {
    auth.callback = cb;
    return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
  } },
} }));
import { useRun21AppTestAccess } from './useRun21AppTestAccess';
const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const project = 'abcdefghijklmnopqrst';
const response = { data: { version: 1, enabled: true, fake_money_only: true, user_id: user, session_id: session, project_ref: project }, error: null };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_RUN21_APP_TEST_ENABLED', 'true');
  vi.stubEnv('VITE_SUPABASE_URL', `https://${project}.supabase.co`);
  vi.stubEnv('VITE_RUN21_TEST_PROJECT_REF', project);
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: user } } } });
  auth.rpc.mockResolvedValue(response);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe('Run21 capability lifetime', () => {
  it('does not query auth or the database while disabled', () => {
    vi.stubEnv('VITE_RUN21_APP_TEST_ENABLED', 'false');
    const { result } = renderHook(() => useRun21AppTestAccess(session));
    expect(result.current).toBe(false);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.rpc).not.toHaveBeenCalled();
  });
  it('denies a missing RPC and unsubscribes on unmount', async () => {
    auth.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const { result, unmount } = renderHook(() => useRun21AppTestAccess(session));
    await waitFor(() => expect(auth.rpc).toHaveBeenCalled());
    expect(result.current).toBe(false);
    unmount(); expect(auth.unsubscribe).toHaveBeenCalledOnce();
  });
  it('rejects a capability response that arrives after sign-out', async () => {
    let resolve!: (value: typeof response) => void;
    auth.rpc.mockReturnValue(new Promise(r => { resolve = r; }));
    const { result } = renderHook(() => useRun21AppTestAccess(session));
    await waitFor(() => expect(auth.rpc).toHaveBeenCalledOnce());
    await act(async () => { auth.callback!('SIGNED_OUT', null); });
    await act(async () => { resolve(response); });
    expect(result.current).toBe(false);
  });
  it('does not carry permission across session identity changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useRun21AppTestAccess(id), { initialProps: { id: session } });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ id: '33333333-3333-4333-8333-333333333333' });
    expect(result.current).toBe(false);
    await waitFor(() => expect(auth.rpc).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(false);
  });
});
