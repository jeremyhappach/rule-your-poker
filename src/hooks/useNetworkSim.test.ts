import { describe, expect, it } from 'vitest';
import { resolveNetworkSimulation } from '@/lib/networkSimGate';

describe('resolveNetworkSimulation', () => {
  it('fails closed while Harnesses Mode is off', () => {
    expect(resolveNetworkSimulation('cross_country_chaos', true, false)).toEqual({
      mode: 'off',
      loggingEnabled: false,
    });
  });

  it('admits the configured profile only while Harnesses Mode is on', () => {
    expect(resolveNetworkSimulation('cross_country_chaos', true, true)).toEqual({
      mode: 'cross_country_chaos',
      loggingEnabled: true,
    });
  });
});
