// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }));
import { AddTransactionDialog } from './AddTransactionDialog';

beforeEach(() => {
  localStorage.clear(); mocks.rpc.mockReset();
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'admin' } } }, error: null });
});
afterEach(cleanup);

it('retries a lost response after remount with the original amount and request ID', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: 'Network response lost', code: '' } }).mockResolvedValueOnce({ error: null });
  const added = vi.fn();
  const props = { open: true, onOpenChange: vi.fn(), playerId: 'member', playerName: 'Member', onTransactionAdded: added };
  const first = render(<AddTransactionDialog {...props} />);
  await waitFor(() => expect((screen.getByLabelText('Amount ($)') as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '12.34' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
  await screen.findByRole('alert');
  const original = mocks.rpc.mock.calls[0][1];
  expect(original.p_amount).toBe('12.34');
  first.unmount();
  render(<AddTransactionDialog {...props} />);
  await screen.findByRole('button', { name: 'Retry entry' });
  expect((screen.getByLabelText('Amount ($)') as HTMLInputElement).value).toBe('12.34');
  expect((screen.getByLabelText('Amount ($)') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry entry' }));
  await waitFor(() => expect(added).toHaveBeenCalledTimes(1));
  expect(mocks.rpc.mock.calls[1][1]).toEqual(original);
  expect(localStorage.length).toBe(0);
});

it('rejects fractional cents before sending a command', async () => {
  render(<AddTransactionDialog open onOpenChange={vi.fn()} playerId="member" playerName="Member" onTransactionAdded={vi.fn()} />);
  await waitFor(() => expect((screen.getByLabelText('Amount ($)') as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText('Amount ($)'), { target: { value: '0.001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add Transaction' }));
  expect(screen.getByRole('alert').textContent).toContain('two decimal places');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
