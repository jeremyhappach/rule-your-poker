import { describe, expect, it } from 'vitest';
import { armGinPhaseTrace, formatGinPhaseTraceText, recordGinPhaseTrace } from './ginPhaseTrace';

describe('ginPhaseTrace containment', () => {
  it('exports ordered in-memory events with the required boundary footer', () => {
    armGinPhaseTrace({ sessionKey: 'test-session', identity: { gameId: 'g1' } });
    recordGinPhaseTrace({
      kind: 'tab-request',
      summary: 'request Chat',
      sourceFile: 'test',
      sourceFunction: 'test',
      detail: { requestedTab: 'chat', accepted: true },
    });
    const text = formatGinPhaseTraceText();
    expect(text).toContain('tab-request');
    expect(text).toContain('first tab-blocking boundary');
    expect(text).toContain('NO ROOT CAUSE PROVEN');
  });

  it('formats without invoking browser network or storage primitives', () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (() => {
      fetchCalled = true;
      throw new Error('fetch must not be called');
    }) as typeof fetch;
    try {
      armGinPhaseTrace({ sessionKey: 'test-session-2', identity: { gameId: 'g2' } });
      recordGinPhaseTrace({
        kind: 'authoritative-state-update',
        summary: 'state changed',
        sourceFile: 'test',
        sourceFunction: 'test',
      });
      expect(formatGinPhaseTraceText()).toContain('authoritative-state-update');
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
