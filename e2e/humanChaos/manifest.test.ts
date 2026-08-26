import { describe, expect, it } from 'vitest';

import { HUMAN_CHAOS_MANIFEST, validateHumanChaosManifest } from './manifest';

describe('human chaos campaign manifest', () => {
  it('locks the complete two-human timeout, rejoin, draw, and transition inventory', () => {
    expect(() => validateHumanChaosManifest()).not.toThrow();
    expect(HUMAN_CHAOS_MANIFEST).toHaveLength(79);
    expect(HUMAN_CHAOS_MANIFEST.filter((scenario) => scenario.family === 'transition')).toHaveLength(56);
  });
});
