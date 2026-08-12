import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const holmLogicSource = readFileSync(
  new URL('./holmGameLogic.ts', import.meta.url),
  'utf8',
);
const holmRoundUtilsSource = readFileSync(
  new URL('./holmRoundUtils.ts', import.meta.url),
  'utf8',
);

describe('Holm authority source guards', () => {
  it('contains no browser turn or successor-hand writer', () => {
    expect(holmLogicSource).not.toContain('moveToNextHolmPlayerTurn');
    expect(holmLogicSource).not.toContain('startHolmRound');
    expect(holmLogicSource).toContain("supabase.rpc('proceed_to_next_holm_hand'");
  });

  it('cannot fail open into completion or continuation', () => {
    expect(holmLogicSource).not.toMatch(
      /\.update\(\{\s*status:\s*['"]completed['"]/,
    );
    expect(holmLogicSource).not.toContain('awaiting_next_round: true');
    expect(holmLogicSource).not.toMatch(/Error.*advanc/i);
  });

  it('keeps presentation recovery out of gameplay timer state', () => {
    expect(holmLogicSource).toContain('presentation_fallback_at');
    const deadlineAssignments = [
      ...holmLogicSource.matchAll(/decision_deadline:[ \t]*([^\r\n,}]+)/g),
    ].map(match => match[1].trim());
    expect(deadlineAssignments.length).toBeGreaterThan(0);
    expect(deadlineAssignments.every(value => value === 'null')).toBe(true);
    expect(holmRoundUtilsSource).not.toContain('.update(');
  });
});
