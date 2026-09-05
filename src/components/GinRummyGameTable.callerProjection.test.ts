// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const componentSource = readFileSync(
  join(process.cwd(), 'src/components/GinRummyGameTable.tsx'),
  'utf8',
);
const gamePageSource = readFileSync(
  join(process.cwd(), 'src/pages/Game.tsx'),
  'utf8',
);

describe('Gin caller-specific projection admission', () => {
  it('never seeds presentation from the public rounds JSON document', () => {
    expect(componentSource).not.toContain('bootstrapState');
    expect(gamePageSource).not.toContain('bootstrapState=');
    expect(componentSource).toContain(
      'useGameStateSync<GinRummyState | null>(null',
    );
  });

  it('hydrates and reconciles only through the caller-specific state RPC', () => {
    expect(componentSource).toContain(
      'const state = await fetchGinRummyState(roundId)',
    );
    expect(componentSource).toContain(
      "exactStateLoader.refresh('realtime-refetch')",
    );
  });

  it('uses one hand-and-action-count identity across optimistic and committed presentation', () => {
    expect(componentSource).toContain(
      'ginPresentationActionKey(viewState, handContextId)',
    );
    expect(componentSource).toContain(
      'ginPresentationActionKey(newState, handContextId)',
    );
    expect(componentSource).not.toMatch(/action\.type[^\n]+action\.timestamp/);
  });

  it('reconciles the real caller card before admitting the committed state', () => {
    const reconcileIndex = componentSource.indexOf(
      'reconcileCommittedSelfDraw(committedState)',
    );
    const admitIndex = componentSource.indexOf(
      'ginSync.receiveAuthoritativeUpdate(committedState)',
    );
    expect(reconcileIndex).toBeGreaterThan(-1);
    expect(admitIndex).toBeGreaterThan(reconcileIndex);
    expect(componentSource).toContain('isGinMaskedCard(action.card)');
  });

  it('derives the current player before the reconciliation hook evaluates its dependencies', () => {
    const currentPlayerIdIndex = componentSource.indexOf(
      'const currentPlayerId = currentPlayer?.id',
    );
    const reconcileHookIndex = componentSource.indexOf(
      'const reconcileCommittedSelfDraw = useCallback',
    );

    expect(currentPlayerIdIndex).toBeGreaterThan(-1);
    expect(reconcileHookIndex).toBeGreaterThan(currentPlayerIdIndex);
  });

  it('requires both draw receipts and clears their holds at a hand identity boundary', () => {
    expect(componentSource).toContain("'animation-settled'");
    expect(componentSource).toContain("'authoritative-card-ready'");
    expect(componentSource).toContain(
      'setSelfDrawIntents(prev => Object.keys(prev).length === 0 ? prev : {});',
    );
    expect(componentSource).toContain('}, [handContextId]);');
  });
});
