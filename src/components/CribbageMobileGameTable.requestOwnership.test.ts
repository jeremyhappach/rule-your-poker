import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CribbageMobileGameTable.tsx', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe('Cribbage request ownership wiring', () => {
  it('submits play and Go directly through the replay-safe authority path', () => {
    const play = between('const handlePlayCard = useCallback', 'const handleGo = useCallback');
    const go = between('const handleGo = useCallback', '// Keep handleGoRef updated');

    expect(play).not.toContain('fetchCribbageState(');
    expect(go).not.toContain('fetchCribbageState(');
    expect(play).toContain('executeReplaySafeCribbageAction(');
    expect(go).toContain('executeReplaySafeCribbageAction(');
    expect(play).toContain('expectedEventSequence: actionState.pegging.eventSequence');
    expect(go).toContain('expectedEventSequence: actionState.pegging.eventSequence');
  });

  it('keeps request locking independent from card animation settlement', () => {
    const play = between('const handlePlayCard = useCallback', 'const handleGo = useCallback');
    const animation = between('<CribbagePlayCardAnimation', '{/* Wave 5D — PeggingRow Graduation');

    expect(play).toContain('finally {');
    expect(play).toContain('releasePlayWriterLock(lockClaim, lockReleaseReason);');
    expect(animation).not.toContain('releasePlayWriterLock');
    expect(source).toContain(
      'const selfPlayUnresolved = playCardIntent !== null || playWriterPending || goWriterPending;',
    );
  });

  it('routes counting cursor updates through the single-flight queue', () => {
    const counting = between(
      'const countingProgressQueueRef',
      'const handleCountingComplete = useCallback',
    );

    expect(counting).toContain('createCribbageCountingProgressQueue');
    expect(counting).toContain('countingProgressQueueRef.current?.enqueue');
    expect(counting).not.toContain('void supabase.rpc');
  });
});
