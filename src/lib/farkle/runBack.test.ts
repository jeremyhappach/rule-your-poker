import { describe, expect, it } from 'vitest';
import { resolveExactRunBackConfig } from '@/lib/dealerGameSetup/runBackConfig';
import { farkleTestState } from './__fixtures__/testState';

describe('Farkle frozen Run Back handoff', () => {
  it('sends the dealer-game identity rather than editable scoring', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const config = farkleTestState().config;
    const request = resolveExactRunBackConfig('farkle', config, id);
    expect(request).toEqual({ ante_amount: config.ante_amount, runBackDealerGameId: id });
    expect(resolveExactRunBackConfig('farkle', request)).toEqual(request);
    expect(request).not.toHaveProperty('rules');
    expect(request).not.toHaveProperty('testConfiguration');
  });
  it('requires an exact snapshot identity and leaves existing game requests unchanged', () => {
    expect(resolveExactRunBackConfig('farkle', farkleTestState().config)).toBeNull();
    expect(resolveExactRunBackConfig('farkle', { ante_amount: 2, runBackDealerGameId: 'alias' })).toBeNull();
    expect(resolveExactRunBackConfig('horses', { ante_amount: 7 }, 'unused')).toEqual({ ante_amount: 7 });
  });
});
