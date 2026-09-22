import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { farkleProductionSetup } from './dealerDefaults';

describe('production Farkle setup boundary', () => {
  it('sends only dealer choices, without client scoring or TEST ONLY configuration', () => {
    expect(farkleProductionSetup('1', '10000', 'equal_turns')).toEqual({ ante_amount: 1, targetScore: 10000, endgame: 'equal_turns' });
  });
  it.each([['', '10000'], ['-1', '10000'], ['1.5', '10000'], ['1', '0'], ['1', 'NaN']])('rejects invalid stake/target %s/%s', (stake, target) => {
    expect(() => farkleProductionSetup(stake, target, 'equal_turns')).toThrow();
  });
});
