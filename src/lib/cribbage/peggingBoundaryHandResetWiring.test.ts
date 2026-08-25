import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../components/CribbageMobileGameTable.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

function authoritativeRoundReset(): string {
  const start = source.indexOf("useLayoutEffect(() => {\n    if (currentRoundId === prevRoundIdRef.current) return;");
  const end = source.indexOf('  }, [currentRoundId, clearBoundaryHoldTimers]);', start);
  if (start < 0 || end < 0) throw new Error('Cribbage authoritative round reset not found');
  return source.slice(start, end);
}

function boundaryHoldArmEffect(): string {
  const start = source.indexOf('  // Arm the hold on 31 / Go / last.');
  const end = source.indexOf('  // Primary release:', start);
  if (start < 0 || end < 0) throw new Error('Cribbage boundary hold arm effect not found');
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

  it('keeps the armed hold timers alive across same-phase lastEvent replacement', () => {
    const arm = boundaryHoldArmEffect();

    expect(source).toContain('const boundaryHoldAnnouncementTimerRef = useRef');
    expect(source).toContain('const boundaryHoldSafetyTimerRef = useRef');
    expect(source).toContain('clearBoundaryHoldTimers();\n  }, [clearBoundaryHoldTimers]);');
    expect(arm).toContain('boundaryHoldAnnouncementTimerRef.current = setTimeout');
    expect(arm).toContain('boundaryHoldSafetyTimerRef.current = setTimeout');
    expect(arm).not.toContain('return () =>');
    expect(arm).toContain('setLastReleasedBoundaryEventId(eventKey);');
  });
});
