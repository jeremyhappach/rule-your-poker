import { describe, it, expect } from 'vitest';
import {
  authoritativeIdentityEquals,
  isIdentityForward,
  identityKey,
  type AuthoritativeIdentity,
} from './authoritativeIdentity';

const mk = (
  dealerGameId: string | null,
  handNumber: number | null,
  roundId: string | null,
): AuthoritativeIdentity => ({ dealerGameId, handNumber, roundId });

describe('authoritativeIdentityEquals', () => {
  it('treats deeply equal tuples as equal', () => {
    expect(authoritativeIdentityEquals(mk('a', 1, 'r1'), mk('a', 1, 'r1'))).toBe(true);
  });
  it('treats nulls as inequal to a value', () => {
    expect(authoritativeIdentityEquals(null, mk('a', 1, 'r1'))).toBe(false);
    expect(authoritativeIdentityEquals(mk('a', 1, 'r1'), null)).toBe(false);
  });
  it('null === null', () => {
    expect(authoritativeIdentityEquals(null, null)).toBe(true);
  });
});

describe('isIdentityForward', () => {
  it('first identity is forward', () => {
    expect(isIdentityForward(null, mk('a', 1, 'r1'))).toBe(true);
  });
  it('different dealerGameId is forward', () => {
    expect(isIdentityForward(mk('a', 5, 'r5'), mk('b', 1, 'r1'))).toBe(true);
  });
  it('greater handNumber is forward', () => {
    expect(isIdentityForward(mk('a', 1, 'r1'), mk('a', 2, 'r2'))).toBe(true);
  });
  it('lower handNumber is not forward', () => {
    expect(isIdentityForward(mk('a', 2, 'r2'), mk('a', 1, 'r1'))).toBe(false);
  });
  it('same handNumber + new roundId is forward (degenerate)', () => {
    expect(isIdentityForward(mk('a', 1, 'r1'), mk('a', 1, 'r2'))).toBe(true);
  });
  it('identical tuple is not forward', () => {
    expect(isIdentityForward(mk('a', 1, 'r1'), mk('a', 1, 'r1'))).toBe(false);
  });
});

describe('identityKey', () => {
  it('serializes identity to stable key', () => {
    expect(identityKey(mk('a', 1, 'r1'))).toBe('a:1:r1');
    expect(identityKey(null)).toBe('');
    expect(identityKey(mk(null, null, null))).toBe('::');
  });
});
