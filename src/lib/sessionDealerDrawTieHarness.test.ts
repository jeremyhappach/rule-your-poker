import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260824165309_session_dealer_draw_tie_harness.sql',
  ),
  'utf8',
);

const securityMigration = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'supabase',
    'migrations',
    '20260824170500_session_dealer_draw_harness_invoker_security.sql',
  ),
  'utf8',
);

const adminUi = readFileSync(
  join(__dirname, '..', 'components', 'GameDefaultsConfig.tsx'),
  'utf8',
);

describe('one-shot session dealer-draw tie harness', () => {
  it('is admin-only, host-scoped, expiring, and atomically consumed', () => {
    expect(migration).toContain("public.has_role(v_user_id, 'admin')");
    expect(migration).toContain("nullif(v_harness_value->>'armedBy', '')::uuid = v_game.current_host");
    expect(migration).toContain('v_harness_expires_at > clock_timestamp()');
    expect(migration).toContain("WHERE setting.key = 'session_dealer_draw_tie_harness'\n   FOR UPDATE");
    expect(migration).toContain("'consumedGameId', p_game_id");
    expect(securityMigration.match(/SECURITY INVOKER/g)).toHaveLength(3);
  });

  it('forces a real two-wave draw without enabling persistent game harnesses', () => {
    expect(migration).toContain("UNION ALL SELECT 2, 'A', '♥'");
    expect(migration).toContain("UNION ALL SELECT cardinality(v_remaining) + 1, 'K', '♠'");
    expect(migration).toContain("UNION ALL SELECT cardinality(v_remaining) + 2, 'Q', '♠'");
    expect(migration).not.toContain("key = 'harnesses_mode'");
  });

  it('exposes an explicit arm/cancel control with its one-shot scope visible', () => {
    expect(adminUi).toContain('Force My Next Dealer Draw to Tie');
    expect(adminUi).toContain('Cancel Forced Tie');
    expect(adminUi).toContain('consumed after one draw');
  });
});
