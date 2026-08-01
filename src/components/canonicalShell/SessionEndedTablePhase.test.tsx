// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SnapshotRow {
  player_id: string;
  user_id: string | null;
  username: string;
  chips: number;
  is_bot: boolean;
  created_at: string;
}

interface MockQueryResult {
  data: SnapshotRow[];
  error: null;
}

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder;
  eq: (...args: unknown[]) => MockQueryBuilder;
  order: (...args: unknown[]) => Promise<MockQueryResult>;
  then: Promise<MockQueryResult>['then'];
}

const mockState = vi.hoisted(() => ({
  snapshotRows: [] as SnapshotRow[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: (() => {
    const mockChannel: Record<string, unknown> = {};
    mockChannel.on = vi.fn(() => mockChannel);
    mockChannel.subscribe = vi.fn(() => mockChannel);
    return {
      from: vi.fn((table: string) => {
        const result = (): Promise<MockQueryResult> => Promise.resolve({
          data: table === 'session_player_snapshots' ? mockState.snapshotRows : [],
          error: null,
        });
        const builder: MockQueryBuilder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => result()),
          then: (onfulfilled, onrejected) => result().then(onfulfilled, onrejected),
        };
        return builder;
      }),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(() => Promise.resolve()),
    };
  })(),
}));

import { SessionEndedFeltPanel } from './SessionEndedTablePhase';

let container: HTMLDivElement;
let portalHost: HTMLDivElement;
let visualFelt: HTMLDivElement;
let interactionLayer: HTMLDivElement;
let root: Root;

function makeSnapshots(count: number): SnapshotRow[] {
  return Array.from({ length: count }, (_, index) => ({
    player_id: `player-${index + 1}`,
    user_id: index === 0 ? 'hap-user' : null,
    username: index === 0 ? 'Hap' : `Bot ${index}`,
    chips: 100 - index,
    is_bot: index > 0,
    created_at: new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString(),
  }));
}

async function renderPanel(): Promise<void> {
  await act(async () => {
    root.render(
      <SessionEndedFeltPanel
        gameId="game-1"
        currentUserId="hap-user"
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockState.snapshotRows = makeSnapshots(11);
  container = document.createElement('div');
  portalHost = document.createElement('div');
  visualFelt = document.createElement('div');
  interactionLayer = document.createElement('div');
  visualFelt.setAttribute('data-canonical-felt-surface', '');
  interactionLayer.setAttribute('data-canonical-felt-interaction-layer', '');
  interactionLayer.style.pointerEvents = 'none';
  portalHost.append(visualFelt, interactionLayer);
  document.body.append(container, portalHost);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  portalHost.remove();
  vi.clearAllMocks();
});

describe('SessionEndedFeltPanel interaction and scroll ownership', () => {
  it('portals above slot content and keeps exactly one Results scroll owner', async () => {
    await renderPanel();

    const safeRegion = interactionLayer.querySelector<HTMLElement>(
      '[data-session-ended-felt-safe-region]',
    );
    const panel = interactionLayer.querySelector<HTMLElement>(
      '[data-session-ended-panel]',
    );

    expect(safeRegion).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(visualFelt.querySelector('[data-session-ended-felt-panel]')).toBeNull();
    expect(interactionLayer.style.pointerEvents).toBe('none');
    expect(safeRegion!.style.pointerEvents).toBe('none');
    expect(panel!.style.pointerEvents).toBe('auto');

    const scrollOwners = Array.from(
      safeRegion!.querySelectorAll<HTMLElement>('*'),
    ).filter((element) => element.classList.contains('overflow-y-auto'));
    expect(scrollOwners).toEqual([panel]);
    expect(panel!.classList.contains('touch-pan-y')).toBe(true);
    expect(panel!.classList.contains('overscroll-contain')).toBe(true);

    const title = panel!.querySelector('h2')?.parentElement;
    expect(title?.classList.contains('sticky')).toBe(true);
    expect(title?.classList.contains('top-0')).toBe(true);

    const rowsContainer = panel!.querySelector('ul')?.parentElement;
    expect(rowsContainer?.className).not.toContain('overflow');
    expect(panel!.querySelectorAll('li')).toHaveLength(11);
  });

  it('keeps short participant lists intrinsically sized', async () => {
    mockState.snapshotRows = makeSnapshots(2);
    await renderPanel();

    const panel = interactionLayer.querySelector<HTMLElement>(
      '[data-session-ended-panel]',
    );
    expect(panel).not.toBeNull();
    expect(panel!.querySelectorAll('li')).toHaveLength(2);
    expect(panel!.classList.contains('max-h-full')).toBe(true);
    expect(panel!.classList.contains('h-full')).toBe(false);
    expect(panel!.classList.contains('flex-1')).toBe(false);
  });
});
