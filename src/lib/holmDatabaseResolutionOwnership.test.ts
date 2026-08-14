import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '20260814020000_holm_database_resolution_hardening.sql'),
  'utf8',
);
const serverReleaseMigration = readFileSync(
  join(root, 'supabase', 'migrations', '20260814130000_holm_server_owned_presentation_release.sql'),
  'utf8',
);
const acknowledgedReleaseMigration = readFileSync(
  join(root, 'supabase', 'migrations', '20260814190000_holm_acknowledged_presentation_release.sql'),
  'utf8',
);
const gameSource = readFileSync(join(root, 'src', 'pages', 'Game.tsx'), 'utf8');
const holmLogicSource = readFileSync(join(root, 'src', 'lib', 'holmGameLogic.ts'), 'utf8');
const mobileTableSource = readFileSync(join(root, 'src', 'components', 'MobileGameTable.tsx'), 'utf8');
const dealOrchestratorSource = readFileSync(join(root, 'src', 'components', 'HolmDealOrchestrator.tsx'), 'utf8');

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

  it('leaves browser code as an exact resolver requester, never a continuation owner', () => {
    expect(holmLogicSource).toContain("rpc('resolve_holm_showdown'");
    const holmTimerSection = gameSource.slice(
      gameSource.indexOf('// Holm never advances through this generic timer.'),
      gameSource.indexOf('// Wait 4 seconds to show every non-Holm result'),
    );
    expect(holmTimerSection).toContain('return;');
    expect(holmTimerSection).not.toContain('proceedToNextHolmRound');
    expect(gameSource).not.toContain('activatePreparedHolmRound(');
    expect(gameSource).not.toContain('prepareNextHolmRound(');
    expect(gameSource).toContain('acknowledgePreparedHolmHandDealt(');
    expect(mobileTableSource).toContain('onHolmContinuationPresentationComplete?.(completion);');
    expect(mobileTableSource).toContain('onPresentationComplete={onHolmDealPresentationComplete}');
    expect(mobileTableSource).toContain("stage: 'zero-transfer'");
    expect(mobileTableSource).toContain('captureHolmAdmittedTransferPresentation(');
    expect(mobileTableSource).toContain("admittedPresentation?.stage === 'pussy-tax'");
    expect(mobileTableSource).toContain("pussyTaxPresentationReady: lastRoundResult === 'Pussy Tax!'");
    expect(mobileTableSource).not.toContain("pussyTaxPresentationReady: !!anteAnimationTriggerId");
    expect(mobileTableSource).toContain('requestAnimationFrame');
  });

  it('activates normally from exact human deal acknowledgements and retains only a configurable recovery lease', () => {
    expect(serverReleaseMigration).toContain("clock_timestamp() + interval '9 seconds'");
    expect(acknowledgedReleaseMigration).toContain('CREATE TABLE IF NOT EXISTS private.holm_hand_presentation_ack_requirements');
    expect(acknowledgedReleaseMigration).toContain('holm_presentation_ack_fallback_seconds');
    expect(acknowledgedReleaseMigration).not.toContain("interval '9 seconds'");
    expect(acknowledgedReleaseMigration).toContain('CREATE OR REPLACE FUNCTION public.acknowledge_holm_prepared_hand_dealt');
    expect(acknowledgedReleaseMigration).toContain("'acknowledged-waiting'");
    expect(acknowledgedReleaseMigration).toContain("'acknowledged-paused'");
    expect(acknowledgedReleaseMigration).toContain("p_release_mode = 'acknowledged'");
    expect(acknowledgedReleaseMigration).toContain('CREATE OR REPLACE FUNCTION private.release_due_holm_presentations()');
    expect(acknowledgedReleaseMigration).toMatch(/cron\.schedule\(\r?\n\s*'release-due-holm-presentations-1s'/);
    expect(acknowledgedReleaseMigration).toContain("activate_prepared_holm_hand:server_only");
    expect(acknowledgedReleaseMigration).toContain('GRANT EXECUTE ON FUNCTION public.acknowledge_holm_prepared_hand_dealt');
    expect(acknowledgedReleaseMigration).toContain("'dealerGameId', v_game.current_game_uuid");
    expect(acknowledgedReleaseMigration).toContain("'handContextId', v_round_id::text");
  });

  it('fires an exact live Buck event only at accepted hands-wave transport start', () => {
    expect(mobileTableSource).toContain("holmEntryMode !== 'live-transition'");
    expect(mobileTableSource).toContain('ev.dealerGameId !== holmDealerGameId');
    expect(mobileTableSource).toContain('ev.handContextId !== presentationRoundId');
    expect(mobileTableSource).toContain('BUCKS_OVERLAY_SHOWN_AT_HANDS_WAVE_START');
    expect(mobileTableSource).not.toContain('BUCKS_PENDING_AWAITING_TEARDOWN');
    expect(dealOrchestratorSource).toContain('onHandsWaveStarted?.(handContextId);');
    expect(dealOrchestratorSource.indexOf('onHandsWaveStarted?.(handContextId);'))
      .toBeLessThan(dealOrchestratorSource.indexOf('deal.beginDeal(intents.length);'));
  });

  it('acknowledges prepared H2 only from the canonical deal-ready boundary', () => {
    const phaseHost = dealOrchestratorSource.slice(
      dealOrchestratorSource.indexOf('export function HolmDealPhaseHost'),
      dealOrchestratorSource.indexOf('export function useHolmSettledIds'),
    );
    expect(phaseHost).toContain('if (!deal.dealSettled) return;');
    expect(phaseHost).toContain('if (!deal.readyReleased) return;');
    expect(phaseHost).toContain("if (deal.phase !== 'READY') return;");
    expect(phaseHost).toContain('onPresentationComplete?.(handContextId);');
    expect(phaseHost.indexOf('deal.enterGameplay();'))
      .toBeLessThan(phaseHost.indexOf('onPresentationComplete?.(handContextId);'));
    expect(gameSource).toContain('holmLocallyPreparedSuccessorRef.current');
    expect(gameSource).toContain('holmPresentedDecisionTimer?.remainingSeconds');
    expect(gameSource).toContain(
      'isSameHolmPresentationHand(currentDecisionTimerPresentation, holmPresentationIdentity)',
    );
    expect(gameSource).toContain('holmDecisionPresentationReady');
  });
});
