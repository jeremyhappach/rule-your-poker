// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentSource = readFileSync(
  join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
  'utf8',
);

function handleKnockSource(): string {
  const start = componentSource.indexOf('const handleKnock = async');
  const end = componentSource.indexOf('const handleTakeFirstDraw = async', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return componentSource.slice(start, end);
}

describe('Gin knock authority', () => {
  it('submits exact knock intents and never writes round JSON directly', () => {
    const source = handleKnockSource();

    expect(source.match(/action: 'knock'/g)).toHaveLength(2);
    expect(source).not.toContain("from('rounds')");
    expect(source).not.toContain('gin_rummy_state');
  });

  it('does not derive scoring in the browser', () => {
    const source = handleKnockSource();

    expect(source).not.toContain('scoreHand(');
    expect(source).toContain("action: 'finalize_scoring'");
  });
});
