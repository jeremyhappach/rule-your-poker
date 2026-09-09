import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { HUMAN_CHAOS_MANIFEST, THREE_FIVE_SEVEN_PRESENTATION_MANIFEST, CRIBBAGE_PRESENTATION_MANIFEST, YAHTZEE_PRESENTATION_MANIFEST, isHealthyPresentation, validateHumanChaosManifest } from './manifest';

describe('human chaos campaign manifest', () => {
  it('keeps Yahtzee final-score qualification healthy and distinct from End Session', () => {
    expect(YAHTZEE_PRESENTATION_MANIFEST).toHaveLength(1);
    expect(YAHTZEE_PRESENTATION_MANIFEST[0]).toMatchObject({ presentationGame: 'yahtzee', requiredFaults: [], variant: 'unchanged' });
    expect(isHealthyPresentation(YAHTZEE_PRESENTATION_MANIFEST[0])).toBe(true);
  });
  it('keeps the short Cribbage presentation gate distinct from chaos and counting coverage', () => {
    expect(CRIBBAGE_PRESENTATION_MANIFEST).toHaveLength(1);
    expect(CRIBBAGE_PRESENTATION_MANIFEST[0]).toMatchObject({ presentationGame: 'cribbage', requiredFaults: [], variant: 'changed' });
    expect(isHealthyPresentation(CRIBBAGE_PRESENTATION_MANIFEST[0])).toBe(true);
  });
  it('keeps both healthy deciding-leg roles separate from the broad chaos inventory', () => {
    expect(THREE_FIVE_SEVEN_PRESENTATION_MANIFEST.map(row => row.presentationWinner)).toEqual(['host', 'peer']);
    expect(THREE_FIVE_SEVEN_PRESENTATION_MANIFEST.every(row => row.requiredFaults.length === 0)).toBe(true);
  });
  it('locks the complete two-human timeout, rejoin, draw, and transition inventory', () => {
    expect(() => validateHumanChaosManifest()).not.toThrow();
    expect(HUMAN_CHAOS_MANIFEST).toHaveLength(79);
    expect(HUMAN_CHAOS_MANIFEST.filter((scenario) => scenario.family === 'transition')).toHaveLength(56);
  });

  it('samples Yahtzee readiness from the canonical running-timer attribute', () => {
    const deadlineDriver = readFileSync(new URL('./deadlines.humanChaos.spec.ts', import.meta.url), 'utf8');
    const canonicalTimer = readFileSync(
      new URL('../../src/lib/canonicalShell/ShellTimerRail.tsx', import.meta.url),
      'utf8',
    );

    expect(canonicalTimer).toContain('data-forensics-timer-running=');
    expect(deadlineDriver).toContain(
      '[data-canonical-shell-timer-rail][data-forensics-timer-running="1"]',
    );
    expect(deadlineDriver).not.toContain('data-shell-timer-running');
  });
});
