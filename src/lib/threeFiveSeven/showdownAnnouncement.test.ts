import { expect, it } from 'vitest';
import { formatThreeFiveSevenShowdownAnnouncement as format } from './showdownAnnouncement';
const result = 'Hap won showdown|||WINNER:uuid|||LOSERS:other|||AMOUNT:3|||HANDNAME:a pair';
it.each([1, 2])('conceals strength in secret round %s for all viewers', round => {
  expect(format(result, true, round)).toBe('Hap wins (secret reveal)');
  expect(format('Hap wins with a pair', true, round)).toBe('Hap wins (secret reveal)');
});
it('preserves public round three and no-reveal policy', () => {
  expect(format(result, true, 3)).toBe('Hap won with a pair');
  expect(format(result, false, 1)).toBe('Hap won (no reveal)');
  expect(format('All players folded', true, 1)).toBe('All players folded');
  expect(format('Hap wins with a pair', true, 3)).toBe('Hap wins with a pair');
  expect(format('Hap wins with a pair', false, 1)).toBe('Hap won (no reveal)');
});
