import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260827140000_yahtzee_real_money_timeout_pause.sql'),
  'utf8',
);

describe('Yahtzee real-money timeout migration', () => {
  it('routes real-money expiry through an exact-identity pause owner', () => {
    expect(migration).toContain('private.pause_due_real_money_yahtzee_turn');
    expect(migration).toContain("coalesce(game_row.real_money,false) AS real_money");
    expect(migration).toContain('IF v_candidate.real_money THEN');
    expect(migration).toContain("'reason','real_money_yahtzee_timeout'");
    expect(migration).toContain('v_sequence IS DISTINCT FROM p_expected_action_sequence');
    expect(migration).toContain("v_round.decision_deadline IS DISTINCT FROM v_deadline");
  });

  it('resets a full authoritative turn before invoking the canonical pause owner', () => {
    const reset = migration.indexOf('v_reset_deadline:=private.yahtzee_turn_deadline');
    const update = migration.indexOf('SET yahtzee_state=v_state,decision_deadline=v_reset_deadline', reset);
    const pause = migration.indexOf('v_pause:=public.set_game_paused(v_game.id,true);', update);

    expect(reset).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(reset);
    expect(pause).toBeGreaterThan(update);
  });

  it('preserves fake-money automatic recovery and leaves no public helper grant', () => {
    expect(migration).toContain("CASE WHEN v_candidate.is_bot THEN 'auto' ELSE 'deadline_auto' END");
    expect(migration).toContain('TO service_role;');
    expect(migration).not.toContain('TO authenticated, service_role;');
  });
});
