import { describe, expect, it } from 'vitest';

import { resolveE2eEnvironment } from './env';

const baseEnvironment = {
  PTOWN_E2E_PLAYER1_EMAIL: 'one@example.test',
  PTOWN_E2E_PLAYER1_PASSWORD: 'one-password',
  PTOWN_E2E_PLAYER2_EMAIL: 'two@example.test',
  PTOWN_E2E_PLAYER2_PASSWORD: 'two-password',
  PTOWN_E2E_PLAYER1_CAN_BLAST: '1',
  PTOWN_E2E_ALLOW_FAKE_MONEY_WRITES: '1',
};

describe('resolveE2eEnvironment', () => {
  it('preserves the single-pair environment for serial runs', () => {
    const resolved = resolveE2eEnvironment(baseEnvironment);
    expect(resolved.player1?.email).toBe('one@example.test');
    expect(resolved.player2?.email).toBe('two@example.test');
    expect(resolved.isolation).toEqual({ identitySlot: null, runNamespace: null, required: false });
  });

  it('selects a named isolated identity slot', () => {
    const resolved = resolveE2eEnvironment({
      ...baseEnvironment,
      PTOWN_E2E_IDENTITY_SLOT: 'cribbage',
      PTOWN_E2E_CRIBBAGE_PLAYER1_EMAIL: 'crib-one@example.test',
      PTOWN_E2E_CRIBBAGE_PLAYER1_PASSWORD: 'one-password',
      PTOWN_E2E_CRIBBAGE_PLAYER2_EMAIL: 'crib-two@example.test',
      PTOWN_E2E_CRIBBAGE_PLAYER2_PASSWORD: 'two-password',
      PTOWN_E2E_CRIBBAGE_PLAYER1_CAN_BLAST: '1',
    });
    expect(resolved.player1?.email).toBe('crib-one@example.test');
    expect(resolved.player2?.email).toBe('crib-two@example.test');
    expect(resolved.player1CanBlast).toBe(true);
  });

  it('fails closed when a parallel run omits its slot or namespace', () => {
    expect(() => resolveE2eEnvironment({ ...baseEnvironment, PTOWN_E2E_REQUIRE_ISOLATION: '1' }))
      .toThrow(/IDENTITY_SLOT.*RUN_NAMESPACE/);
  });
});
