import { describe, expect, it } from 'vitest';
import {
  GIN_INITIAL_HAND_NUMBER,
  deriveGinSuccessorHandNumber,
} from './handIdentity';

describe('Gin hand identity', () => {
  it('uses one fixed opening identity', () => {
    expect(GIN_INITIAL_HAND_NUMBER).toBe(1);
  });

  it('gives concurrent callers the same successor identity', () => {
    expect([
      deriveGinSuccessorHandNumber(7),
      deriveGinSuccessorHandNumber(7),
      deriveGinSuccessorHandNumber(7),
    ]).toEqual([8, 8, 8]);
  });

  it('keeps a stale replay pinned to its exact successor', () => {
    expect(deriveGinSuccessorHandNumber(4)).toBe(5);
    expect(deriveGinSuccessorHandNumber(4)).toBe(5);
  });

  it('rejects missing or invalid predecessor identity', () => {
    expect(() => deriveGinSuccessorHandNumber(0)).toThrow('Invalid Gin predecessor hand number');
    expect(() => deriveGinSuccessorHandNumber(Number.NaN)).toThrow('Invalid Gin predecessor hand number');
  });
});
