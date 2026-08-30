import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const normalizeSource = (source: string) => source.replace(/\r\n/g, '\n');

const migration = normalizeSource(readFileSync(resolve(
  'supabase/migrations/20260830193000_cribbage_dealer_draw_tie_harness.sql',
), 'utf8'));
const proof = normalizeSource(readFileSync(resolve(
  'supabase/tests/cribbage_dealer_draw_tie_harness_proof.sql',
), 'utf8'));
const driver = normalizeSource(
  readFileSync(resolve('e2e/humanChaos/dealerDraws.humanChaos.spec.ts'), 'utf8'),
);

describe('Cribbage dealer-draw tie harness contract', () => {
  it('is exact-game, admin/member-scoped, expiring, one-shot, and fake-money only', () => {
    expect(migration).toContain("setting.key = 'cribbage_dealer_draw_tie_harness'");
    expect(migration).toContain("v_requests->p_game_id::text");
    expect(migration).toContain("NOT public.has_role(v_user_id, 'admin')");
    expect(migration).toContain('NOT public.user_is_in_game(p_game_id)');
    expect(migration).toContain('coalesce(v_game.real_money, false)');
    expect(migration).toContain('least(900, greatest(60');
    expect(migration).toContain("'consumedAt', clock_timestamp()");
    expect(migration).toContain('FOR UPDATE');
    expect(migration).not.toContain("setting.key = 'harnesses_mode'");
  });

  it('keeps browser access invoker-scoped and consumption private', () => {
    expect(migration.match(/SECURITY INVOKER/g)).toHaveLength(3);
    expect(migration).toContain('private.consume_cribbage_dealer_draw_tie_harness');
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION private.consume_cribbage_dealer_draw_tie_harness(uuid)',
    );
    expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
  });

  it('proves every required failure boundary before deployment', () => {
    for (const marker of [
      'non_admin_arm_allowed',
      'real_money_arm_allowed',
      'terminal_arm_allowed',
      'wrong_game_consumed',
      'wrong_forced_state',
      'duplicate_changed_state',
      'continuation_failed',
      'late_replay_not_rejected',
      'expired_request_applied',
      'global_harness_gate_mutated',
    ]) {
      expect(proof).toContain(marker);
    }
  });

  it('drives and closes the exact fixture from the selected production scenario', () => {
    expect(driver).not.toContain('Cribbage dealer-draw forced-tie has no account-scoped fixture');
    expect(driver).toContain("'arm_cribbage_dealer_draw_tie_harness'");
    expect(driver).toContain("'get_cribbage_dealer_draw_tie_harness'");
    expect(driver).toContain("'cancel_cribbage_dealer_draw_tie_harness'");
    expect(driver).toContain('{ p_game_id: session.gameId, p_ttl_seconds: 600 }');
  });

  it('waits for durable fixture consumption after the intentionally unawaited ante response', () => {
    expect(driver).toContain('waitForCribbageDealerDrawTieConsumption');
    expect(driver).toContain('await expect.poll(async () => {');
    expect(driver).toContain('timeout: 30_000');
    expect(driver).toContain(".toEqual({ armed: false, consumed: true, error: null })");
    expect(driver.indexOf("await configureDealerGameUnderChaos(session, 'cribbage')"))
      .toBeLessThan(driver.indexOf('await waitForCribbageDealerDrawTieConsumption(session)'));
  });
});
