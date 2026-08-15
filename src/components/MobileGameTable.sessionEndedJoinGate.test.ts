import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');

describe('MobileGameTable Session Ended join affordance gate', () => {
  it('keeps open-seat selection unavailable throughout Session Ended', () => {
    const gate = source.match(/const canSelectSeat = ([^;]+);/)?.[1] ?? '';

    expect(gate).toContain('onSelectSeat');
    expect(gate).toContain('!currentPlayer');
    expect(gate).toContain('!sessionEndedPhase');
    expect(source).toContain('{canSelectSeat && openSeats.length > 0');
  });
});
