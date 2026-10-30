import { expect, it } from 'vitest';
import { isThreeFiveSevenFinancialDealReady as ready } from './financialDealBarrier';
const tax = { roundId: 'r1', transferCursor: 8 };
const ante = { roundId: 'r2', transferCursor: 9 };
it.each(['unknown', 'queued', 'running', 'reconciling'] as const)('holds peer successor for unfinished %s tax and reante', state => {
  expect(ready('r2', tax, state, null, 'unknown')).toBe(false);
  expect(ready('r3', null, 'unknown', ante, state)).toBe(false);
  expect(ready('r2', tax, 'settled', ante, state)).toBe(false);
});
it('does not let a settled ante consume an unfinished tax receipt', () => {
  expect(ready('r2', tax, 'running', ante, 'settled')).toBe(false);
  expect(ready('r2', tax, 'settled', ante, 'settled')).toBe(true);
});
it('preserves current result, zero-charge and historical reconciliation', () => {
  expect(ready('r1', tax, 'running', null, 'unknown')).toBe(true);
  expect(ready('r2', tax, 'reconciled', ante, 'reconciled')).toBe(true);
  expect(ready('r2', { ...tax, transferCursor: null }, 'unknown', null, 'unknown')).toBe(true);
});
