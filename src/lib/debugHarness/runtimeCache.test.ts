import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { resolveActiveHarnessId } from './runtimeCache';

describe('resolveActiveHarnessId', () => {
  it('allows a configured harness only after the cache is ready and the master gate is on', () => {
    expect(resolveActiveHarnessId('force_player_beats_chucky', true, true)).toBe(
      'force_player_beats_chucky',
    );
  });

  it('fails closed when Harnesses Mode is disabled even if a profile remains configured', () => {
    expect(resolveActiveHarnessId('force_player_beats_chucky', true, false)).toBe('none');
  });

  it('fails closed before the authoritative settings have loaded', () => {
    expect(resolveActiveHarnessId('force_player_beats_chucky', false, true)).toBe('none');
  });
});
