// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
import { usePlayerBalance } from './usePlayerBalance';
afterEach(() => { cleanup(); mocks.rpc.mockReset(); });
it('reports failed reads as unavailable and recovers an exact balance', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: 'offline' } }).mockResolvedValueOnce({ data: { balance: '9007199254740993.17', transactions: [], has_more: false, next_cursor: null }, error: null });
  const { result } = renderHook(() => usePlayerBalance('member'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.balance).toBeNull();
  expect(result.current.error).toBeTruthy();
  await act(() => result.current.refetch());
  expect(result.current.balance).toBe('9007199254740993.17');
  expect(result.current.error).toBeNull();
});
it('rejects a previous account response after switching profiles', async () => {
  let finishOld!: (value: unknown) => void;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce({ data: { balance: '2.00', transactions: [], has_more: false, next_cursor: null }, error: null });
  const { result, rerender } = renderHook(({ id }) => usePlayerBalance(id), { initialProps: { id: 'first' } });
  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.balance).toBe('2.00'));
  await act(async () => { finishOld({ data: { balance: '99.00', transactions: [], has_more: false, next_cursor: null }, error: null }); });
  expect(result.current.balance).toBe('2.00');
});
