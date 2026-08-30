// @ts-nocheck

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'GinRummyGameTable.tsx'), 'utf8');
const firstDrawHandlers = source.slice(
  source.indexOf('const handleTakeFirstDraw = async () =>'),
  source.indexOf('const handleLayOff = async', source.indexOf('const handleTakeFirstDraw = async () =>')),
);

describe('Gin first-draw authority', () => {
  it('submits from the installed private projection without a serialized preflight read', () => {
    expect(firstDrawHandlers).not.toContain('fetchFreshState');
    expect(firstDrawHandlers.match(/const current = viewState;/g)?.length).toBe(2);
    expect(firstDrawHandlers).toContain("await updateState(newState, { action: 'take_first_draw' }");
    expect(firstDrawHandlers).toContain("await updateState(newState, { action: 'pass_first_draw' }");
  });
});
