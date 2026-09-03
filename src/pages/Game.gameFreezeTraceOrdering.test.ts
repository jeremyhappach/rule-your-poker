import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');

describe('Game freeze trace identity ordering', () => {
  it('does not read currentRound before the round identity is initialized', () => {
    const currentRoundDeclaration = source.indexOf('const currentRound =');
    const traceIdentityWrite = source.indexOf('setGameFreezeTraceIdentity({');

    expect(currentRoundDeclaration).toBeGreaterThan(-1);
    expect(traceIdentityWrite).toBeGreaterThan(currentRoundDeclaration);
  });
});
