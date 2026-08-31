import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const normalizeLineEndings = (source: string) => source.replace(/\r\n/g, '\n');

const migration = normalizeLineEndings(readFileSync(resolve(
  'supabase/migrations/20260830213000_cribbage_rule_branch_harness.sql',
), 'utf8'));
const proof = normalizeLineEndings(readFileSync(resolve(
  'supabase/tests/cribbage_rule_branch_harness_proof.sql',
), 'utf8'));
const expansionMigration = normalizeLineEndings(readFileSync(resolve(
  'supabase/migrations/20260830224500_cribbage_combo_and_crib_flush_fixtures.sql',
), 'utf8'));
const expansionProof = normalizeLineEndings(readFileSync(resolve(
  'supabase/tests/cribbage_combo_and_crib_flush_fixtures_proof.sql',
), 'utf8'));
const manifest = normalizeLineEndings(readFileSync(resolve('e2e/branchSmoke/manifest.ts'), 'utf8'));
const driver = normalizeLineEndings(readFileSync(resolve('e2e/branchSmoke/allGames.branchSmoke.spec.ts'), 'utf8'));

describe('Cribbage exact-game rule-branch harness contract', () => {
  it('is admin/member-scoped, expiring, one-shot, two-human, and fake-money only', () => {
    expect(migration).toContain("setting.key = 'cribbage_rule_branch_harness'");
    expect(migration).toContain("v_requests->p_game_id::text");
    expect(migration).toContain("NOT public.has_role(v_user_id, 'admin')");
    expect(migration).toContain('NOT public.user_is_in_game(p_game_id)');
    expect(migration).toContain('coalesce(v_game.real_money, false)');
    expect(migration).toContain('requires_two_active_players');
    expect(migration).toContain('least(900, greatest(60');
    expect(migration).toContain("'consumedAt', clock_timestamp()");
    expect(migration).toContain('FOR UPDATE');
  });

  it('keeps browser access invoker-scoped and the exact profile marker private', () => {
    expect(migration.match(/SECURITY INVOKER/g)).toHaveLength(3);
    expect(migration).toContain('private.consume_cribbage_rule_branch_harness');
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migration).toContain("p_state - 'pendingTerminal' - 'campaignHarnessProfile'");
    expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
  });

  it('preserves the global harness gate and restricts the exact allow-list', () => {
    for (const profile of ['near_double_skunk', 'max_pegging_fan', 'perpetual_heels']) {
      expect(migration).toContain(profile);
      expect(manifest).toContain(`cribbageFixtureProfile: '${profile}'`);
    }
    expect(proof).toContain('global_harness_gate_mutated');
    expect(proof).toContain('global_profile_mutated');
  });

  it('adds deterministic 15/31/run/Go/counting and both crib-flush boundaries', () => {
    for (const profile of [
      'fifteen_run_go_counting',
      'crib_flush_qualifying',
      'crib_flush_nonqualifying',
    ]) {
      expect(expansionMigration).toContain(profile);
      expect(manifest).toContain(`cribbageFixtureProfile: '${profile}'`);
    }
    for (const marker of [
      'pegging_15_31_run_go_reset_wrong',
      'counting_fifteen_flush_nobs_wrong',
      'qualifying_crib_flush_wrong',
      'nonqualifying_crib_flush_wrong',
      'new_profile_not_consumed_once',
    ]) expect(expansionProof).toContain(marker);
    expect(driver).toContain('exerciseCribbageFifteenRunGoSequence');
    expect(driver).toContain("['5', '10', '6', '10', '9', '8', '7', 'J'] as const");
    expect(driver).toContain('[data-cribbage-card-playable="1"]');
    expect(driver).toContain("expect(state?.phase).toBe('counting')");
    expect(driver).toContain("'5', '10', '6', '10', '9', '8', '7', 'J'");
    expect(driver).toContain('[2, 2, 4, 4]');
  });

  it('proves the required failure and lifecycle boundaries before deployment', () => {
    for (const marker of [
      'non_admin_arm_allowed',
      'real_money_arm_allowed',
      'terminal_arm_allowed',
      'invalid_profile_allowed',
      'wrong_game_consumed',
      'private_marker_exposed',
      'duplicate_replay_changed_state',
      'late_replay_not_rejected',
      'continuation_failed',
      'winner_terminal_wrong',
      'tie_or_winner_wrong',
    ]) {
      expect(proof).toContain(marker);
    }
  });

  it('arms, verifies, evidences, and closes the exact production fixture', () => {
    expect(driver).toContain("'arm_cribbage_rule_branch_harness'");
    expect(driver).toContain("'get_cribbage_rule_branch_harness'");
    expect(driver).toContain("'cancel_cribbage_rule_branch_harness'");
    expect(driver).toContain('readCribbageRoundState');
    expect(driver).toContain('campaignHarnessProfile');
    for (const scenario of [
      'cribbage-pegging-counting-branches',
      'cribbage-terminal-target-skunk-branches',
      'cribbage-phase-rejoin-matrix',
    ]) {
      expect(manifest).toContain(`id: '${scenario}'`);
    }
    expect(driver).toContain('createCribbagePhaseRejoinController');
    expect(driver).toContain("['counting', 'cut-to-pegging', 'discard', 'successor-hand']");
  });
});
