import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '20260814020000_holm_database_resolution_hardening.sql'),
  'utf8',
);
const gameSource = readFileSync(join(root, 'src', 'pages', 'Game.tsx'), 'utf8');
const holmLogicSource = readFileSync(join(root, 'src', 'lib', 'holmGameLogic.ts'), 'utf8');
const mobileTableSource = readFileSync(join(root, 'src', 'components', 'MobileGameTable.tsx'), 'utf8');

describe('Holm database resolution ownership', () => {
  it('resolves multi-player cards, Chucky, settlement, and successor preparation in PostgreSQL', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.resolve_holm_showdown');
    expect(migration).toContain('public.holm_best_hand_value');
    expect(migration).toContain('public.holm_deterministic_chucky_cards');
    expect(migration).toContain('Every continuing Holm settlement prepares its exact non-actionable');
    expect(migration).toContain('IF p_awaiting_next_round\\n     AND NOT v_end_game THEN');
  });

  it('resolves the last multi-player decision before the action RPC returns and recovers legacy rows service-side', () => {
    expect(migration).toContain('SELECT public.resolve_holm_showdown(p_game_id, v_round.id) INTO v_result;');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.recover_pending_holm_showdowns');
    expect(migration).toContain("RAISE EXCEPTION 'recover_pending_holm_showdowns:service_role_required'");
  });

  it('leaves browser code as an exact resolver/activation requester, never a timer-driven settlement owner', () => {
    expect(holmLogicSource).toContain("rpc('resolve_holm_showdown'");
    const holmTimerSection = gameSource.slice(
      gameSource.indexOf('// Holm never advances through this generic timer.'),
      gameSource.indexOf('// Wait 4 seconds to show every non-Holm result'),
    );
    expect(holmTimerSection).toContain('return;');
    expect(holmTimerSection).not.toContain('proceedToNextHolmRound');
    expect(mobileTableSource).toContain('onHolmContinuationPresentationComplete?.();');
    expect(mobileTableSource).toContain("holmStage === 'pussy-tax'");
    expect(mobileTableSource).toContain('requestAnimationFrame');
  });
});
