import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { advanceCribbagePostgame } from './cribbageAuthority';
const identity = { gameId: 'game', roundId: 'round', dealerGameId: 'dealer-game', handNumber: 2 };
beforeEach(() => rpc.mockReset());
it.each(['advanced', 'already_advanced', 'stale_identity'])('consumes %s using only exact settlement identity', async outcome => {
  rpc.mockResolvedValue({ data: { outcome, status: 'waiting' }, error: null });
  await expect(advanceCribbagePostgame(identity)).resolves.toMatchObject({ outcome, status: 'waiting' });
  expect(rpc).toHaveBeenCalledWith('cribbage_advance_postgame', { _game_id: 'game', _round_id: 'round', _dealer_game_id: 'dealer-game', _hand_number: 2 });
});
it('propagates a failed handoff and rejects an empty response', async () => {
  const failure = { message: 'identity mismatch' };
  rpc.mockResolvedValueOnce({ data: null, error: failure }).mockResolvedValueOnce({ data: null, error: null });
  await expect(advanceCribbagePostgame(identity)).rejects.toBe(failure);
  await expect(advanceCribbagePostgame(identity)).rejects.toThrow('no authoritative disposition');
});
it('routes Cribbage before the legacy client mutations and preserves table admission', () => {
  const source = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('const handleGameOverComplete ='));
  const begin = callback.indexOf("if (game?.game_type === 'cribbage')");
  const end = callback.indexOf('// Holm terminal settlement', begin);
  const branch = callback.slice(begin, end);
  expect(begin).toBeGreaterThan(0);
  expect(callback.slice(0, callback.indexOf('// Dealer confirms to skip countdown'))).not.toContain('Single-executor');
  expect(branch).toContain('await advanceCribbagePostgame(');
  expect(branch).toContain('await fetchGameData()');
  expect(branch).not.toMatch(/\.update\(|\.delete\(|navigate\(|evaluatePlayerStatesEndOfGame|sanitizePlayerAutomationStateForSession/);
});
