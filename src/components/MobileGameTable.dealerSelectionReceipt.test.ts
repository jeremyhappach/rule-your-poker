import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'MobileGameTable.tsx'), 'utf8');

describe('session dealer-draw DOM receipt', () => {
  it('acknowledges a wave only after every expected card is mounted', () => {
    expect(source).toContain(
      "container.querySelectorAll('[data-dsel-card=\"1\"]').length === cardCount",
    );
    expect(source).not.toContain(
      "container.querySelector('[data-dsel-card=\"1\"]') !== null",
    );
  });
});
