import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const controller = readFileSync(join(root, 'src', 'hooks', 'useHorsesMobileController.ts'), 'utf8');
const game = readFileSync(join(root, 'src', 'pages', 'Game.tsx'), 'utf8');
const timerAuthority = readFileSync(
  join(root, 'supabase', 'migrations', '20260820180000_canonical_game_timer_ownership.sql'),
  'utf8',
);
const connectedAuthority = readFileSync(
  join(root, 'supabase', 'migrations', '20260823173530_horses_scc_connected_authority.sql'),
  'utf8',
);

describe('Horses/SCC database authority boundary', () => {
  it('starts the first round and expires human turns in PostgreSQL', () => {
    expect(timerAuthority).toContain('CREATE OR REPLACE FUNCTION private.start_horses_scc_initial_round');
    expect(timerAuthority).toContain("WHEN 'horses_scc_turn' THEN");
    expect(timerAuthority).toContain('private.advance_horses_scc_expired_turn');
    expect(connectedAuthority).toContain('CREATE OR REPLACE FUNCTION public.horses_scc_advance_completed_round');
  });

  it('contains no browser whole-state horses_state update owner', () => {
    expect(controller).not.toContain('updateHorsesState');
    expect(controller).not.toMatch(/\.update\(\{\s*horses_state:/s);
    expect(game).not.toMatch(/\.update\(\{\s*horses_state:/s);
    expect(controller).not.toContain('horses_set_player_state');
    expect(controller).toContain('horses_scc_apply_action');
    expect(controller).not.toMatch(/\b(?:rollDice|rollSCCDice)\(/);
    expect(controller).toContain('horses_advance_turn');
  });

  it('does not let a client timer author timeout or deadline state', () => {
    expect(controller).not.toContain('horses-timeout-mutation-suppressed');
    expect(controller).not.toContain('Player timed out during Horses turn');
    expect(game).not.toContain('Extended turn deadline after opt-back-in');
  });
});
