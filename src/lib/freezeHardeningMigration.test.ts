import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '20260823010000_freeze_hardening.sql'),
  'utf8',
);
const canonicalTimerRepair = readFileSync(
  join(root, 'supabase', 'migrations', '20260823011000_restore_freeze_hardening_canonical_timers.sql'),
  'utf8',
);
const mobileTable = readFileSync(join(root, 'src', 'components', 'MobileGameTable.tsx'), 'utf8');

describe('freeze hardening migration', () => {
  it('bounds each recovery task while preserving the single dispatcher', () => {
    expect(migration).toContain("SET lock_timeout = '750ms'");
    expect(migration).toContain("WHEN 'canonical_timers' THEN");
    expect(canonicalTimerRepair).toContain("WHEN ''canonical_timers''");
    expect(migration).toContain('private.game_recovery_slow_task_runs');
    expect(migration).toContain("v_task_result->>''outcome'' <> ''completed''");
    expect(migration).not.toContain('cron.schedule(');
  });

  it('grants the existing pause owner only the exact 3-5-7 trigger context', () => {
    const authority = migration.indexOf('set_game_paused:357_authority');
    const roundsUpdate = migration.indexOf('UPDATE public.rounds round_row', authority);

    expect(authority).toBeGreaterThan(-1);
    expect(roundsUpdate).toBeGreaterThan(authority);
    expect(migration).toContain("''app.three_five_seven_authoritative_write'', ''on'', true");
  });

  it('releases Holm from the exact current actor and hard-resets hand caches', () => {
    expect(migration).toContain('private.holm_prepared_hand_actor_acknowledged');
    expect(migration).toContain('current-actor-acknowledgement-pending');
    expect(migration).toContain("WHEN holm_after_tabled_delay_ms = 1500 THEN 500");
    expect(mobileTable).toContain('chuckyNormalRevealBranchLockedRef.current = false');
    expect(mobileTable).toContain('_setCachedChuckyCardsRevealedRaw(0)');
  });

  it('contains no production game identity', () => {
    expect(migration).not.toContain('936370e7-f10b-4528-96b9-b478bbd49ead');
  });
});
