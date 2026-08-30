// @ts-nocheck

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, 'Game.tsx'), 'utf8');

describe('Game Gin Realtime read policy', () => {
  const roundsHandlerMarker = source.indexOf("ginTrace('realtime.rounds payload received'");
  const roundUpdateBlock = source.slice(
    source.indexOf("if (payload.eventType === 'UPDATE' && payload.new &&", roundsHandlerMarker),
    source.indexOf('// INSERT: for Gin Rummy', roundsHandlerMarker),
  );

  it('applies a Gin round UPDATE without scheduling the redundant parent snapshot', () => {
    expect(roundUpdateBlock).toContain("gameTypeLiveRef.current === 'gin-rummy'");
    expect(roundUpdateBlock).toContain("ginTrace('rounds.update applied without redundant parent fetch'");
    expect(roundUpdateBlock.indexOf("gameTypeLiveRef.current === 'gin-rummy'"))
      .toBeLessThan(roundUpdateBlock.indexOf('debouncedFetch();'));
    expect(roundUpdateBlock.match(/return;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('retains the parent snapshot for non-Gin state updates', () => {
    expect(roundUpdateBlock).toContain('debouncedFetch();');
  });

  it('reuses the loaded bot-dealer default on routine Realtime snapshots', () => {
    expect(source).toContain("const shouldFetchBotDealerDefault = fetchTrigger !== 'realtime_update'");
    expect(source).toContain('allowBotDealersLoadedRef.current');
    expect(source).toContain('data: { allow_bot_dealers: allowBotDealersRef.current }');
  });

  it('does not poll a healthy games subscription for existence or pause state', () => {
    expect(source).not.toContain('window.setInterval(checkGameExists, 3000)');
    expect(source).not.toContain('setInterval(pollPauseState, 2000)');
  });

  it('short-circuits metadata-only Gin games receipts before generic status handling', () => {
    const guard = source.indexOf('isRoutineGinGamesRealtimeUpdate(newData, previousGinRouting)');
    const genericStatusHandler = source.indexOf("if (newData && 'status' in newData)", guard);
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(genericStatusHandler);
  });
});
