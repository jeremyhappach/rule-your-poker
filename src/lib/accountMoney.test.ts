import { describe, expect, it } from 'vitest';
import { formatAccountAmount, accountAmountIsNegative } from './accountMoney';
import { accountDraftKey, loadAccountDraft, saveAccountDraft } from './accountEntryDraft';

describe('exact account amounts', () => {
  it('preserves cents beyond JavaScript safe integer precision', () => {
    expect(formatAccountAmount('9007199254740993.17')).toBe('9,007,199,254,740,993.17');
    expect(formatAccountAmount('-00012.3')).toBe('-12.30');
    expect(formatAccountAmount('-0.00')).toBe('0.00');
    expect(formatAccountAmount(null)).toBe('—');
    expect(formatAccountAmount('NaN')).toBe('—');
    expect(accountAmountIsNegative('-0.01')).toBe(true);
    expect(accountAmountIsNegative('-0.00')).toBe(false);
  });
  it('retains the pending request across reload and refuses replacement', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const key = accountDraftKey('admin', 'member');
    const original = { requestId: 'first', profileId: 'member', type: 'Deposit' as const, amount: '12.34', notes: 'cash' };
    saveAccountDraft(storage, key, original);
    expect(loadAccountDraft(storage, key)).toEqual(original);
    expect(saveAccountDraft(storage, key, { ...original, requestId: 'second', amount: '99' })).toEqual(original);
    expect(loadAccountDraft(storage, accountDraftKey('other-admin', 'member'))).toBeNull();
  });
});
