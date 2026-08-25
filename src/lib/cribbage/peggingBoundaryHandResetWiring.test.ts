import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../components/CribbageMobileGameTable.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

function authoritativeRoundReset(): string {
  const start = source.indexOf("useLayoutEffect(() => {\n    if (currentRoundId === prevRoundIdRef.current) return;");
  const end = source.indexOf('  }, [currentRoundId]);', start);
  if (start < 0 || end < 0) throw new Error('Cribbage authoritative round reset not found');
  return source.slice(start, end);
}

describe('Cribbage pegging boundary hand reset wiring', () => {
  it('clears a prior Go/31 hold before a delayed peer can hydrate directly into next-hand pegging', () => {
    const reset = authoritativeRoundReset();

    expect(reset).toContain('setThirtyOneDelayActive(false);');
    expect(reset).toContain('setHeldSequenceSnapshot(null);');
    expect(reset).toContain('setHeldAnnouncementSettledTick(0);');
    expect(reset).toContain('setLastReleasedBoundaryEventId(null);');
    expect(reset).toContain('thirtyOneDelayRef.current = null;');
    expect(reset).toContain('heldAnnouncementSettledRef.current = null;');
    expect(reset).toContain('prevSequenceStartIndexRef.current = 0;');
  });
});
