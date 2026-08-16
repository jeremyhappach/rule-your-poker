// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentSource = readFileSync(
  join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
  'utf8',
);
const gamePageSource = readFileSync(
  join(process.cwd(), 'src/pages/Game.tsx'),
  'utf8',
);

describe('Gin caller-specific projection admission', () => {
  it('never seeds presentation from the public rounds JSON document', () => {
    expect(componentSource).not.toContain('bootstrapState');
    expect(gamePageSource).not.toContain('bootstrapState=');
    expect(componentSource).toContain(
      'useGameStateSync<GinRummyState | null>(null',
    );
  });

  it('hydrates and reconciles only through the caller-specific state RPC', () => {
    expect(componentSource).toContain(
      'const state = await fetchGinRummyState(roundId)',
    );
    expect(componentSource).toContain(
      ".then((state) => applyState(state, 'realtime-refetch'))",
    );
  });
});
