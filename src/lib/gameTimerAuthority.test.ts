import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '20260820180000_canonical_game_timer_ownership.sql'),
  'utf8',
);
const gameSource = readFileSync(join(root, 'src', 'pages', 'Game.tsx'), 'utf8');
const anteSource = readFileSync(join(root, 'src', 'components', 'AnteUpDialog.tsx'), 'utf8');
const enforcerSource = readFileSync(join(root, 'src', 'hooks', 'useDeadlineEnforcer.ts'), 'utf8');

describe('canonical game timer ownership', () => {
  it('admits exact timer identities through the serialized database dispatcher', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS private.game_timer_registry');
    expect(migration).toContain("WHEN 'canonical_timers' THEN");
    expect(migration).toContain("'three_five_seven',\n    'horses_scc'");
    expect(migration).toContain('Future-only cutover admission');
    expect(migration).toContain('game_row.config_deadline>v_cutover');
  });

  it('keeps Gin and Cribbage human choices untimed while preserving presentation leases', () => {
    expect(migration).toContain('Gin and Cribbage human choices remain');
    expect(migration).not.toContain("game_type='gin-rummy' THEN 'holm_decision'");
    expect(migration).not.toContain("game_type='cribbage' THEN 'holm_decision'");
    expect(migration).toContain("WHEN v_game.game_type = 'cribbage' THEN 'cribbage'");
  });

  it('uses authoritative ante, pause, setup, and resume gates in the client', () => {
    expect(anteSource).toContain('submitAnteDecision({');
    expect(anteSource).toContain('new Date(anteDecisionDeadline).getTime() - Date.now()');
    expect(anteSource).not.toContain('timeLeft <= 0 && !hasDecided');
    expect(gameSource).toContain('const hasLiveConfigDeadline =');
    expect(gameSource).toContain('advanceSessionDealerSelection(gameId)');
    expect(gameSource).toContain('await setGamePaused(gameId, newPausedState)');
    expect(gameSource).toContain("navigate('/', { replace: true })");
  });

  it('does not create a client polling enforcement owner', () => {
    expect(enforcerSource).toContain('Deadline progression is owned by PostgreSQL');
    expect(enforcerSource).not.toContain('supabase.functions.invoke');
    expect(enforcerSource).not.toContain('setInterval');
  });
});
