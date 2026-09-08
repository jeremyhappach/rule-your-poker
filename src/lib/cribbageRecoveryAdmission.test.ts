import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => fs.readFileSync(path.resolve('supabase/migrations', name), 'utf8').replace(/\r\n/g, '\n');
const original = read('20260901085259_admit_due_recovery_work.sql');
const candidate = read('20260908152010_narrow_cribbage_recovery_admission.sql');
const branch = (sql: string, name: string) => sql.split(`WHEN '${name}' THEN`)[1].split(/\n    (?:WHEN|ELSE)/)[0];

describe('Cribbage recovery admission ownership', () => {
  it('leaves all seven other admission owners byte-for-byte unchanged', () => {
    for (const task of ['canonical_timers', 'holm', 'gin_rummy', 'yahtzee', 'three_five_seven', 'horses_scc', 'session_abandonment']) {
      expect(branch(candidate, task), task).toBe(branch(original, task));
    }
  });

  it('preserves timer and dealer-selection admission before narrowing private state', () => {
    const oldBranch = branch(original, 'cribbage');
    const newBranch = branch(candidate, 'cribbage');
    const prefix = oldBranch.split('      ) OR EXISTS (')[0];
    expect(newBranch.startsWith(prefix)).toBe(true);
    expect(newBranch).toContain("game_row.status = 'cribbage_dealer_selection'");
    expect(newBranch).toContain("p_now - interval '5 seconds'");
    expect(newBranch).toContain('WITH current_rounds AS MATERIALIZED');
    expect(newBranch).toContain('round_row.dealer_game_id=game_row.current_game_uuid');
    expect(newBranch).toContain('round_row.hand_number=game_row.total_hands');
    expect(newBranch).toContain("CASE authority.state ->> 'phase'");
  });

  it('changes no scheduler, runner, settlement, or browser authority', () => {
    expect(candidate.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(candidate).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM|cron\.schedule)\s/i);
    expect(candidate).toContain('FROM PUBLIC, anon, authenticated');
    expect(candidate).toContain('TO service_role');
    expect(candidate).not.toContain('CREATE INDEX');
  });
});
