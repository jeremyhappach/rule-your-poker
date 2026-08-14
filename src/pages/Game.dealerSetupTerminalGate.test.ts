// @ts-nocheck
// Regression contract: a terminal session may retain the former dealer's
// physical seat, but it must never admit DealerGameSetup on that identity.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gameSource = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');
const setupSource = readFileSync(
  join(__dirname, '..', 'components', 'DealerGameSetup.tsx'),
  'utf8',
);

function sourceSlice(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, end);
}

describe('Dealer setup terminal admission', () => {
  it('does not admit the legacy setup sibling for session_ended', () => {
    const legacyGate = sourceSlice(
      gameSource,
      '!is357WinAnimationActive && !horsesWinPotTriggerId && !_isPokerShellPersistent',
      ')) ? (',
    );

    expect(legacyGate).not.toContain("game.status === 'session_ended'");
    expect(legacyGate).toContain("game.status === 'game_over'");
  });

  it('keeps the persistent poker setup overlay terminal-free', () => {
    const persistentGate = sourceSlice(
      gameSource,
      '{_isPokerShellPersistent &&',
      '<DealerGameSetup',
    );

    expect(persistentGate).not.toContain("game.status === 'session_ended'");
    expect(persistentGate).toContain("game.status === 'game_over'");
  });

  it('does not write a fallback setup deadline after a terminal snapshot', () => {
    const deadlineSync = sourceSlice(
      setupSource,
      'const syncWithServerDeadline = useCallback(async () => {',
      '// Initial sync + resync when app returns to foreground',
    );

    expect(deadlineSync).toContain(".select('status, config_complete, config_deadline')");
    expect(deadlineSync).toContain('deadlineEligibleStatuses.has(gameData.status)');
    expect(deadlineSync).toContain('gameData.config_complete === true');
    expect(deadlineSync).not.toMatch(
      /update\(\{ config_deadline: deadlineIso \}\)[\s\S]*?deadlineEligibleStatuses/,
    );
  });
});
