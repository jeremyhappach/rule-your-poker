// @vitest-environment jsdom
/**
 * Regression gate for CHAT-RENDER-B1.
 *
 * Proves that when the realtime channel delivers a new remote
 * `chat_messages` INSERT, `useGameChat.allMessages` includes the new
 * id on the SAME synchronous tick as the callback — regardless of
 * whether the observer-`profiles` fetch has resolved.
 *
 * Historical defect: `addBubble` was `async` and awaited
 * `getOrFetchObserverUsername` BEFORE `setAllMessages`. If the
 * profiles fetch stalled (DB pressure, RLS, network), the row never
 * entered React state and the DOM did not update until an unrelated
 * composer state change forced a rerender.
 *
 * These tests break if that regression is reintroduced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React, { useEffect } from 'react';

/* ------------------------------------------------------------------ *
 * Mocks
 * ------------------------------------------------------------------ */

// Capture the postgres_changes handler + expose a hanging profiles fetch.
let realtimeHandler: ((payload: { new: unknown }) => void) | null = null;
let profilesResolve: ((v: { data: unknown }) => void) | null = null;

vi.mock('@/integrations/supabase/client', () => {
  const chatMessagesBuilder = () => ({
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    select: () => ({
      eq: () => ({
        order: async () => ({ data: [], error: null }),
        single: async () => ({ data: null, error: null }),
        maybeSingle: () =>
          new Promise((resolve) => {
            // Never resolve unless the test explicitly does so.
            profilesResolve = resolve as (v: { data: unknown }) => void;
          }),
      }),
      in: async () => ({ data: [], error: null }),
      order: async () => ({ data: [], error: null }),
    }),
  });
  const from = vi.fn((_table: string) => chatMessagesBuilder());
  const channel = vi.fn(() => {
    const chan: any = {
      on: (_event: string, _cfg: unknown, cb: (p: { new: unknown }) => void) => {
        realtimeHandler = cb;
        return chan;
      },
      subscribe: (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return chan; },
      unsubscribe: () => {},
      topic: 'x',
    };
    return chan;
  });
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u-viewer' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from,
      channel,
      removeChannel: () => {},
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
  };
});

// Silent telemetry mocks.
vi.mock('@/lib/chatOperations/serverChatOperation', () => ({
  openServerChatOperation: vi.fn(async () => true),
  writeChatOperationSenderHeartbeat: vi.fn(async () => undefined),
  writeChatOperationPeerHeartbeat: vi.fn(async () => undefined),
  appendChatSenderMilestone: vi.fn(async () => undefined),
  appendChatPeerMilestone: vi.fn(async () => undefined),
  awaitPeerOperationVisibility: vi.fn(async () => false),
  createChatOperationId: () => 'chat-test-op-id',
  finalizeServerChatOperation: vi.fn(async () => undefined),
  markChatOperationDeliveryConfirmed: vi.fn(async () => undefined),
  registerCurrentSessionChatOperation: vi.fn(),
  getCurrentSessionChatOperations: () => [],
  subscribeCurrentSessionChatOperations: () => () => {},
}));
vi.mock('@/lib/chatOperations/chatOperationBoundary', () => ({
  recordChatBoundaryEvent: vi.fn(),
  recordChatNavigationInitiated: vi.fn(),
  recordChatAbortInitiated: vi.fn(),
  installChatBoundaryListeners: vi.fn(),
}));
vi.mock('@/lib/shellTabAttention/shellTabAttentionInstrumentation', () => ({
  openChatSendOperation: vi.fn(),
  finalizeChatSendOperation: vi.fn(),
  writeChatOperationTerminalSnapshot: vi.fn(),
  getChatOperationSnapshots: vi.fn(() => ({})),
  beginChatOperationSnapshotCapture: vi.fn(),
  recordWaitingChatTransition: vi.fn(),
}));
vi.mock('@/lib/chatDelivery/chatDeliveryLedger', () => ({
  recordCanonicalProjection: vi.fn(),
  recordChatDeliveryEvent: vi.fn(),
  recordChatDeliveryViolation: vi.fn(),
  recordConsumerSubscription: vi.fn(),
}));
vi.mock('@/lib/sessionLifecycleLedger', () => ({
  recordChatRealtimeCallbackBegin: vi.fn(),
  recordChatRealtimeCallbackEnd: vi.fn(),
  recordSessionLifecycleEvent: vi.fn(),
}));
vi.mock('@/lib/runtimeInstrumentation/runtimeTracer', () => ({
  recordRuntimeEvent: vi.fn(),
  upsertDeliveryTrace: vi.fn(async () => undefined),
  getClientInstanceId: () => 'client-1',
  getTabSessionId: () => 'session-1',
}));

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */
import { useGameChat } from './useGameChat';

let container: HTMLDivElement;
let root: Root;
let latestMessages: Array<{ id: string; username?: string }> = [];

function Harness({ players }: { players: any[] }) {
  const chat = useGameChat('g1', players, 'u-viewer');
  useEffect(() => {
    latestMessages = chat.allMessages;
  });
  return null;
}

async function flush() {
  for (let i = 0; i < 3; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function mount(players: any[] = []) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(Harness, { players })); });
  await flush();
  if (!realtimeHandler) throw new Error('realtime handler not registered');
}

async function unmount() {
  await act(async () => { root.unmount(); });
  container.remove();
}

beforeEach(() => {
  realtimeHandler = null;
  profilesResolve = null;
  latestMessages = [];
});
afterEach(async () => { await unmount().catch(() => {}); });

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('useGameChat realtime → allMessages invalidation (CHAT-RENDER-B1)', () => {
  it('unknown-observer remote INSERT appears in allMessages on the same tick, even while profiles fetch hangs', async () => {
    await mount([]); // no seated players → sender is unknown observer

    const msg = {
      id: 'remote-1',
      user_id: 'u-sender',
      game_id: 'g1',
      message: 'hello from laptop',
      created_at: new Date().toISOString(),
    };

    await act(async () => { realtimeHandler!({ new: msg }); });

    // Profiles fetch is intentionally UNRESOLVED — the row must still
    // be admitted to state.
    expect(profilesResolve).toBeTypeOf('function');
    expect(latestMessages.map((m) => m.id)).toContain('remote-1');
    expect(latestMessages.find((m) => m.id === 'remote-1')?.username).toBe('Unknown');
  });

  it('seated-player remote INSERT appears in allMessages on the same tick', async () => {
    const players = [{ user_id: 'u-sender', profiles: { username: 'Jeremy' }, position: 1 }];
    await mount(players);

    const msg = {
      id: 'remote-2',
      user_id: 'u-sender',
      game_id: 'g1',
      message: 'seated',
      created_at: new Date().toISOString(),
    };

    await act(async () => { realtimeHandler!({ new: msg }); });

    const row = latestMessages.find((m) => m.id === 'remote-2');
    expect(row).toBeDefined();
    expect(row?.username).toBe('Jeremy');
  });

  it('dedupe: same remote id delivered twice produces one row', async () => {
    const players = [{ user_id: 'u-sender', profiles: { username: 'Jeremy' }, position: 1 }];
    await mount(players);

    const msg = {
      id: 'remote-3',
      user_id: 'u-sender',
      game_id: 'g1',
      message: 'once',
      created_at: new Date().toISOString(),
    };

    await act(async () => { realtimeHandler!({ new: msg }); });
    await act(async () => { realtimeHandler!({ new: msg }); });

    expect(latestMessages.filter((m) => m.id === 'remote-3')).toHaveLength(1);
  });
});
