import { describe, expect, it } from 'vitest';
import { observeHost } from './hostSuccession';
describe('host announcement cursor', () => {
  it('does not replay on mount or reconnect', () => {
    expect(observeHost(null, 's', 7, 'human', true).announce).toBe(false);
  });
  it('coalesces departures, ignores regressive frames and emits once at a safe boundary', () => {
    let c = observeHost(null, 's', 0, 'a', false).cursor;
    c = observeHost(c, 's', 1, 'b', false).cursor;
    c = observeHost(c, 's', 2, 'c', false).cursor;
    expect(observeHost(c, 's', 1, 'b', true).announce).toBe(false);
    const next = observeHost(c, 's', 2, 'c', true);
    expect(next.announce).toBe(true);
    expect(observeHost(next.cursor, 's', 2, 'c', true).announce).toBe(false);
  });
  it('handles missing humans, a later successor, and a different session', () => {
    const c = observeHost(null, 's', 1, 'a', true).cursor;
    const vacant = observeHost(c, 's', 2, null, true);
    expect(vacant.announce).toBe(false);
    expect(observeHost(vacant.cursor, 's', 3, 'b', true).announce).toBe(true);
    expect(observeHost(c, 'other', 20, 'b', true).announce).toBe(false);
  });
  it('delivers the same single event independently to two clients', () => {
    for (let i = 0; i < 2; i++) {
      const c = observeHost(null, 's', 1, 'a', true).cursor;
      const next = observeHost(c, 's', 2, 'b', true);
      expect(next.announce).toBe(true);
      expect(observeHost(next.cursor, 's', 2, 'b', true).announce).toBe(false);
    }
  });
});
