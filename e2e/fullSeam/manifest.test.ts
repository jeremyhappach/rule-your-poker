import { describe, expect, it } from 'vitest';
import { BRANCH_SMOKE_MANIFEST } from '../branchSmoke/manifest';
import { HUMAN_CHAOS_MANIFEST } from '../humanChaos/manifest';
import { ALL_REAL_MONEY_GAME_TYPES } from '../../src/lib/realMoneyLivenessContract';
import {
  FULL_SEAM_MANIFEST_VERSION,
  FULL_SEAM_REQUIREMENTS,
  FULL_SEAM_SCENARIOS,
  MISSING_FULL_SEAM_REQUIREMENT_IDS,
  validateFullSeamManifest,
} from './manifest';

describe('full human seam coverage ledger', () => {
  it('contains every declared executable branch, terminal, and lifecycle scenario once', () => {
    expect(FULL_SEAM_MANIFEST_VERSION).toBe(3);
    expect(() => validateFullSeamManifest()).not.toThrow();
    expect(FULL_SEAM_SCENARIOS).toHaveLength(
      BRANCH_SMOKE_MANIFEST.length + HUMAN_CHAOS_MANIFEST.length + ALL_REAL_MONEY_GAME_TYPES.length,
    );
    expect(FULL_SEAM_SCENARIOS.filter((row) => row.source === 'branch-smoke')).toHaveLength(30);
    expect(FULL_SEAM_SCENARIOS.filter((row) => row.source === 'terminal')).toHaveLength(7);
    expect(FULL_SEAM_SCENARIOS.filter((row) => row.source === 'human-chaos')).toHaveLength(79);
  });

  it('locks all 79 rule requirements from the campaign plan without hiding missing drivers', () => {
    expect(FULL_SEAM_REQUIREMENTS).toHaveLength(79);
    expect(MISSING_FULL_SEAM_REQUIREMENT_IDS.length).toBeGreaterThan(0);
    expect(FULL_SEAM_REQUIREMENTS.filter((row) => row.disposition === 'justified-n/a').map((row) => row.id)).toEqual([
      'cribbage.human-timeout-na',
      'gin.human-timeout-na',
    ]);
  });

  it('binds the Cribbage forced tie only to its exact-game one-shot fixture', () => {
    const requirement = FULL_SEAM_REQUIREMENTS.find((row) => row.id === 'cribbage.dealer-draw-normal-and-tie');
    expect(requirement).toMatchObject({
      fixture: 'cribbage-dealer-draw-tie-once',
      disposition: 'executable',
    });
    expect(requirement?.coveredBy).toContain('lifecycle/cribbage-dealer-draw-forced-tie-rejoin');
  });

  it('binds both His Heels terminal dispositions to the exact-game rule fixture', () => {
    const requirement = FULL_SEAM_REQUIREMENTS.find((row) => row.id === 'cribbage.cut-and-his-heels');
    expect(requirement).toMatchObject({
      fixture: 'cribbage-rule-branch-once',
      disposition: 'executable',
    });
    expect(requirement?.coveredBy).toEqual([
      'branch/cribbage-his-heels-nonterminal',
      'branch/cribbage-his-heels-terminal',
    ]);
  });

  it('binds every deterministic Gin outcome to the exact-game one-shot fixture', () => {
    const requirement = FULL_SEAM_REQUIREMENTS.find((row) => row.id === 'gin.knock-layoff-gin-undercut-void');
    expect(requirement).toMatchObject({
      fixture: 'gin-rule-branch-once',
      disposition: 'executable',
    });
    expect(requirement?.coveredBy).toEqual([
      'branch/gin-normal-knock-layoff',
      'branch/gin-gin-outcome',
      'branch/gin-undercut-outcome',
      'branch/gin-stock-two-void',
    ]);
  });

  it('binds the Wave 1 counting-order and phase-rejoin rows without hiding broader gaps', () => {
    expect(FULL_SEAM_REQUIREMENTS.find((row) => row.id === 'cribbage.counting-order')).toMatchObject({
      disposition: 'executable',
      fixture: 'cribbage-rule-branch-once',
      coveredBy: ['branch/cribbage-pegging-counting-branches'],
    });
    expect(FULL_SEAM_REQUIREMENTS.find((row) => row.id === 'cribbage.phase-rejoins')).toMatchObject({
      disposition: 'executable',
      fixture: 'cribbage-rule-branch-once',
      coveredBy: ['branch/cribbage-phase-rejoin-matrix'],
    });
    expect(MISSING_FULL_SEAM_REQUIREMENT_IDS).toEqual(expect.arrayContaining([
      'cribbage.terminal-entry-phases',
      'cribbage.targets-and-skunk',
    ]));
    expect(MISSING_FULL_SEAM_REQUIREMENT_IDS).not.toEqual(expect.arrayContaining([
      'cribbage.pegging-branches',
      'cribbage.counting-categories',
    ]));
  });
});
