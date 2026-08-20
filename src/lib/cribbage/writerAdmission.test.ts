import { describe, expect, it } from 'vitest';
import type { AuthoritativeIdentity } from '@/lib/gameStateSync/authoritativeIdentityPure';
import { evaluateCribbageWriterAdmission } from './writerAdmission';

const identity: AuthoritativeIdentity = {
  dealerGameId: 'dealer-game-1',
  roundId: 'round-1',
  handNumber: 1,
};

function admission(overrides: Partial<Parameters<typeof evaluateCribbageWriterAdmission>[0]> = {}) {
  return evaluateCribbageWriterAdmission({
    action: 'discard',
    authIdentity: identity,
    presentationIdentity: identity,
    writerRoundId: 'round-1',
    writerHandNumber: 1,
    renderHandKey: 'r:round-1:h:1',
    currentHandKey: 'r:round-1:h:1',
    propRoundId: 'round-1',
    propHandNumber: 1,
    frameworkCanInteractNow: true,
    frameworkInteractionsAllowed: true,
    ...overrides,
  });
}

describe('Cribbage writer admission', () => {
  it('admits an aligned opening-hand discard from the synchronous framework owner', () => {
    expect(admission()).toMatchObject({ ok: true, reason: 'aligned' });
  });

  it('does not reject an enabled action because the rendered framework boolean lags', () => {
    expect(admission({ frameworkInteractionsAllowed: false })).toMatchObject({
      ok: true,
      reason: 'aligned',
    });
  });

  it('fails closed when the synchronous framework owner reports a stale or frozen edge', () => {
    expect(admission({ frameworkCanInteractNow: false })).toMatchObject({
      ok: false,
      reason: 'framework-identity-stale-or-frozen',
    });
  });

  it('rejects a stale writer round even when presentation keys look aligned', () => {
    expect(admission({
      authIdentity: { ...identity, roundId: 'round-2', handNumber: 2 },
    })).toMatchObject({
      ok: false,
      reason: 'writer-vs-auth-roundid-mismatch',
    });
  });

  it('rejects presentation authority from a different hand', () => {
    expect(admission({
      presentationIdentity: { ...identity, roundId: 'round-2', handNumber: 2 },
    })).toMatchObject({
      ok: false,
      reason: 'presentation-vs-auth-mismatch',
    });
  });

  it('rejects a render/current hand-key mismatch', () => {
    expect(admission({ renderHandKey: 'r:round-0:h:0' })).toMatchObject({
      ok: false,
      reason: 'local-identity-misaligned',
    });
  });
});
