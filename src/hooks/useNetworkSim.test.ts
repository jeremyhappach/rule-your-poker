import { describe, expect, it } from 'vitest';
import { resolveNetworkSimulation } from '@/lib/networkSimGate';

describe('resolveNetworkSimulation', () => {
  it('admits the configured network profile without a game-harness gate', () => {
    expect(resolveNetworkSimulation('cross_country_chaos', true)).toEqual({
      mode: 'cross_country_chaos',
      loggingEnabled: true,
    });
  });

  it('keeps an explicitly disabled network profile off', () => {
    expect(resolveNetworkSimulation('off', false)).toEqual({
      mode: 'off',
      loggingEnabled: false,
    });
  });
});
