// @ts-nocheck
// Source-level regression contract for the waiting-table player catch-up.
// A player INSERT can occur between the cold snapshot and Realtime reaching
// SUBSCRIBED. The subscription owner must take one authoritative snapshot
// itself; an auth-gated resume listener is not a reliable owner for this gap.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');

describe('Game Realtime player catch-up', () => {
  const subscribedBlock = source.match(
    /if \(status === 'SUBSCRIBED'\) \{[\s\S]*?\n\s*return;\n\s*\}/,
  )?.[0];

  it('takes a full authoritative snapshot when the channel becomes subscribed', () => {
    expect(subscribedBlock, 'SUBSCRIBED status block not found').toBeTruthy();
    expect(subscribedBlock).toContain("fetchGameData('realtime_reconnect')");
  });

  it('keeps reconnect drains while avoiding a second Game resync listener', () => {
    expect(subscribedBlock).toContain("new CustomEvent('app:realtime-reconnect')");

    const resumeEffect = source.slice(
      source.indexOf('// AUTO-RESYNC ON RESUME:'),
      source.indexOf('// NOTE: Duplicate rounds subscription'),
    );
    expect(resumeEffect).not.toContain(
      "window.addEventListener('app:realtime-reconnect'",
    );
  });
});
