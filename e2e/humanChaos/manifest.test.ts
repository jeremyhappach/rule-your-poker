import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { HUMAN_CHAOS_MANIFEST, validateHumanChaosManifest } from './manifest';

describe('human chaos campaign manifest', () => {
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
