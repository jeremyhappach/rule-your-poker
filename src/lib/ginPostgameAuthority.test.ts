import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
import { advanceGinPostgame } from './ginRummyRoundLogic';
const identity = { gameId: 'game', roundId: 'round', dealerGameId: 'dealer-game', handNumber: 3 };
beforeEach(() => rpc.mockReset());
it.each(['advanced', 'already_advanced', 'stale_identity'])('consumes %s using only exact settlement identity', async outcome => {
  rpc.mockResolvedValue({ data: { outcome, status: 'waiting' }, error: null });
  await expect(advanceGinPostgame(identity)).resolves.toMatchObject({ outcome, status: 'waiting' });
  expect(rpc).toHaveBeenCalledWith('gin_rummy_advance_postgame', { _game_id: 'game', _round_id: 'round', _dealer_game_id: 'dealer-game', _hand_number: 3 });
});
it('propagates a failed handoff and rejects an empty response', async () => {
  const failure = { message: 'identity mismatch' };
  rpc.mockResolvedValueOnce({ data: null, error: failure }).mockResolvedValueOnce({ data: null, error: null });
  await expect(advanceGinPostgame(identity)).rejects.toBe(failure);
  await expect(advanceGinPostgame(identity)).rejects.toThrow('no authoritative disposition');
});
it('keeps all seven completion paths free of generic client mutation and navigation', () => {
  const source = readFileSync(new URL('../pages/Game.tsx', import.meta.url), 'utf8');
  const callback = source.slice(source.indexOf('const handleGameOverComplete ='), source.indexOf('// Dealer confirms to skip countdown'));
  expect(callback).toContain('await advanceGinPostgame(');
  expect(callback).toContain('await advanceCribbagePostgame(');
  expect(callback).toContain('await advanceHolmPostgame(');
  expect(callback).toContain('await advanceHorsesSccPostgame(');
  expect(callback).toContain('await advanceYahtzeePostgame(');
  expect(callback).toContain("'three_five_seven_advance_postgame'");
  expect(callback).not.toMatch(/\.(update|delete|insert|upsert)\(|navigate\(|evaluatePlayerStatesEndOfGame|sanitizePlayerAutomationStateForSession|Single-executor/);
});
