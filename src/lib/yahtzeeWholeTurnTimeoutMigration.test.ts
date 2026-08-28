import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260828110000_yahtzee_whole_turn_timeout.sql'),
  'utf8',
);

describe('Yahtzee whole-turn timeout migration', () => {
  it('preserves the server-owned deadline across rolls and holds', () => {
    const roll = migration.indexOf("IF v_action IN ('roll','bot_roll') THEN");
    const rollUpdate = migration.indexOf('UPDATE public.rounds SET yahtzee_state=v_state,decision_deadline=v_deadline', roll);
    const freshDeadline = migration.indexOf('v_deadline:=private.yahtzee_turn_deadline(v_game.id,_player_id);');

    expect(roll).toBeGreaterThan(-1);
    expect(rollUpdate).toBeGreaterThan(roll);
    expect(freshDeadline).toBe(-1);
    expect(migration).toContain("RETURN jsonb_build_object('outcome','rejected','reason','turn_deadline_expired'");
  });

  it('atomically completes fake-money expiry and records the explicit rejoin state', () => {
    expect(migration).toContain('private.complete_due_fake_money_yahtzee_turn');
    expect(migration).toContain('SET auto_fold=true,sit_out_next_hand=true');
    expect(migration).toContain("FOR v_step IN 1..4 LOOP");
    expect(migration).toContain("p_round_id,p_player_id,'deadline_auto',NULL,NULL,NULL,v_sequence");
    expect(migration).toContain("IF coalesce(v_game.real_money,false) THEN");
    expect(migration).toContain('v_result:=private.pause_due_real_money_yahtzee_turn(');
    expect(migration).toContain('v_result:=private.complete_due_fake_money_yahtzee_turn(');
  });

  it('keeps the completion helper service-only', () => {
    expect(migration).toContain("complete_due_fake_money_yahtzee_turn:service_role_required");
    expect(migration).toContain('REVOKE ALL ON FUNCTION private.complete_due_fake_money_yahtzee_turn(uuid,uuid,integer)');
    expect(migration).toContain('TO service_role;');
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION private.complete_due_fake_money_yahtzee_turn(uuid,uuid,integer)\n  TO authenticated');
  });
});
