import { describe, expect, it } from 'vitest';
import { getCribbageHandIdentity } from './handIdentity';

describe('getCribbageHandIdentity', () => {
  it('is stable for the same authoritative round and hand', () => {
    expect(getCribbageHandIdentity('round-a', 6)).toBe('r:round-a|h:6');
    expect(getCribbageHandIdentity('round-a', 6)).toBe('r:round-a|h:6');
  });

  it('rotates only at an authoritative round or hand boundary', () => {
    expect(getCribbageHandIdentity('round-a', 6)).not.toBe(
      getCribbageHandIdentity('round-a', 7),
    );
    expect(getCribbageHandIdentity('round-a', 6)).not.toBe(
      getCribbageHandIdentity('round-b', 6),
    );
  });

  it('rejects incomplete identity', () => {
    expect(getCribbageHandIdentity(null, 6)).toBe('');
    expect(getCribbageHandIdentity('round-a', null)).toBe('');
  });
});
