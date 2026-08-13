import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const tableProps = source.slice(
  source.indexOf('dealerPosition={game.game_type'),
  source.indexOf('chuckyCards={renderRoundContext'),
);

describe('Game Holm Buck ownership wiring', () => {
  it('keeps physical Buck and action-turn props on separate authoritative fields', () => {
    expect(tableProps).toContain(
      'getHolmPhysicalBuckPosition(holmView)',
    );
    expect(tableProps).toContain(
      'currentTurnPosition={renderRoundContext ? (game.game_type === \'holm-game\' ? (holmView?.currentTurnPosition ?? null)',
    );
  });

  it('never falls back from the physical Buck to the current action turn', () => {
    const buckProp = tableProps.match(/buckPosition=\{[^\n]+/)?.[0] ?? '';
    expect(buckProp).toContain('getHolmPhysicalBuckPosition(holmView)');
    expect(buckProp).not.toContain('currentTurnPosition');
  });
});
