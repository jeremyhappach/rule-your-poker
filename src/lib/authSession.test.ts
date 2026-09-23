import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoTrueClient, AuthApiError, AuthSessionMissingError } from '@supabase/auth-js';
import { isConfirmedSessionInvalidation, signOutLocal } from './authSession';

const clients: GoTrueClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.stopAutoRefresh()); });

async function fixture() {
  const key = 'auth-cleanup-proof';
  const memory = new Map<string, string>();
  memory.set(key, JSON.stringify({ access_token: 'offline-test-token', refresh_token: 'offline-test-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: { id: 'account-1' } }));
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  const client = new GoTrueClient({ url: 'https://offline.invalid/auth/v1', storageKey: key,
    autoRefreshToken: false, detectSessionInUrl: false, persistSession: true,
    storage: { getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); }, removeItem: k => { memory.delete(k); } },
    fetch: fetcher,
  });
  clients.push(client);
  await client.initialize();
  const events: string[] = [];
  client.onAuthStateChange(event => { events.push(event); });
  await client.getSession();
  return { client, memory, key, fetcher, events };
}

const missing = () => new Response(JSON.stringify({ code: 'session_not_found', message: 'Session not found' }), {
  status: 403, headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
});

describe('normal logout through the installed Auth SDK', () => {
  it('uses local scope, clears this client, and leaves the other device session intact', async () => {
    const a = await fixture();
    const b = await fixture();
    await signOutLocal(b.client);
    expect(String(b.fetcher.mock.calls[0][0])).toContain('/logout?scope=local');
    expect(b.fetcher).toHaveBeenCalledTimes(1);
    expect(b.memory.has(b.key)).toBe(false);
    expect(b.events).toContain('SIGNED_OUT');
    expect((await a.client.getSession()).data.session?.user.id).toBe('account-1');
    expect(a.fetcher).not.toHaveBeenCalled();
  });

  it('cleans up an already-revoked session via getUser and cannot bounce Auth back to the lobby', async () => {
    const f = await fixture();
    f.fetcher.mockImplementation(async () => missing());
    await signOutLocal(f.client);
    expect(f.fetcher.mock.calls.map(call => new URL(String(call[0])).pathname)).toEqual(['/auth/v1/logout', '/auth/v1/user']);
    expect(f.memory.has(f.key)).toBe(false);
    expect(f.events.filter(event => event === 'SIGNED_OUT')).toHaveLength(1);
    expect((await f.client.getSession()).data.session).toBeNull();
  });

  it('does not clear a session or request getUser on a transient server failure', async () => {
    const f = await fixture();
    f.fetcher.mockImplementation(async () => new Response('unavailable', { status: 503 }));
    await expect(signOutLocal(f.client)).rejects.toMatchObject({ name: 'AuthRetryableFetchError' });
    expect(f.memory.has(f.key)).toBe(true);
    expect(f.events).not.toContain('SIGNED_OUT');
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and surfaces a network failure during missing-session reconciliation', async () => {
    const f = await fixture();
    const invalidated = vi.fn();
    f.fetcher.mockImplementationOnce(async () => missing()).mockImplementation(async () => new Response('unavailable', { status: 503 }));
    await expect(signOutLocal(f.client, invalidated)).rejects.toMatchObject({ name: 'AuthRetryableFetchError' });
    expect(invalidated).toHaveBeenCalledExactlyOnceWith(true);
    expect(f.memory.has(f.key)).toBe(true);
    expect(f.events).not.toContain('SIGNED_OUT');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not erase a usable session that appeared during reconciliation', async () => {
    const invalidated = vi.fn();
    const auth = { signOut: vi.fn().mockResolvedValue({ error: new AuthSessionMissingError() }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'account-2' } }, error: null }), getSession: vi.fn() };
    await expect(signOutLocal(auth, invalidated)).rejects.toThrow('sign-in changed');
    expect(invalidated.mock.calls).toEqual([[true], [false]]);
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it('refuses successful navigation if signOut returned success but a session remains', async () => {
    const auth = { signOut: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'account-1' } } }, error: null }) };
    await expect(signOutLocal(auth)).rejects.toThrow('could not be confirmed');
  });

  it('requires a positive auth error code/type, never a generic 401/403 or matching message', () => {
    expect(isConfirmedSessionInvalidation(new AuthSessionMissingError())).toBe(true);
    expect(isConfirmedSessionInvalidation(new AuthApiError('gone', 403, 'session_not_found'))).toBe(true);
    expect(isConfirmedSessionInvalidation(new AuthApiError('Session not found', 403, undefined))).toBe(false);
    expect(isConfirmedSessionInvalidation(new TypeError('Failed to fetch'))).toBe(false);
  });
});
