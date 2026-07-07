import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

  it('contains no network, database, storage, timer, or fetch monkeypatch primitives', () => {
    const source = readFileSync(new URL('./ginPhaseTrace.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bsupabase\b|debug_events|from\(/);
    expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(source).not.toMatch(/setTimeout|setInterval/);
  });
});
