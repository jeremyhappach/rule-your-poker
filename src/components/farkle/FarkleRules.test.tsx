// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FarkleScoringTable, farkleScoringRows } from './FarkleRules';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';

afterEach(cleanup);

describe('Farkle frozen scoring quick reference', () => {
  it('lists each enabled frozen score, formats points, and omits disabled rules', () => {
    const rules = farkleTestState().config.rules;
    rules.singles = { '1': 1234, '5': 0 };
    rules.ofAKind = {
      '3': [1000, 200, 0, 400, 500, 600],
      '4': [12000, 12000, 12000, 12000, 12000, 12000],
      '5': [0, 0, 0, 0, 0, 0],
      '6': [3000, 0, 0, 0, 0, 0],
    };
    rules.straight = 2500;
    rules.threePairs = 0;
    rules.twoTriplets = 5000;
    rules.fourPlusPair = 0;

    const { container } = render(<FarkleScoringTable rules={rules} />);

    expect(screen.getByRole('row', { name: 'Single 1 1,234' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Three 1s 1,000' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Three 4s 400' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Four of a Kind 12,000' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Six 1s 3,000' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Straight 2,500' })).toBeTruthy();
    expect(screen.getByRole('row', { name: 'Two Triplets 5,000' })).toBeTruthy();
    expect(screen.queryByText('Single 5')).toBeNull();
    expect(screen.queryByText('Five of a Kind')).toBeNull();
    expect(screen.queryByText('Three Pairs')).toBeNull();
    expect(screen.queryByText('Four of a Kind + Pair')).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Points' }).className).toContain('text-right');
    expect(screen.getByRole('row', { name: 'Single 1 1,234' }).querySelector('td')?.className).toContain('text-black');
    const leaders = container.querySelectorAll<HTMLElement>('[data-farkle-scoring-leader]');
    expect(leaders).toHaveLength(farkleScoringRows(rules).length);
    expect(leaders[0].className).toContain('border-dotted');
  });

  it('takes rows only from the supplied frozen scoring configuration', () => {
    const first = farkleTestState().config.rules;
    const second = structuredClone(first);
    second.singles['1'] = 777;
    second.straight = 0;

    expect(farkleScoringRows(first).find(row => row.id === 'single-1')?.points).toBe(100);
    expect(farkleScoringRows(second).find(row => row.id === 'single-1')?.points).toBe(777);
    expect(farkleScoringRows(second).find(row => row.id === 'straight')).toBeUndefined();
  });
});
