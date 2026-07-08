// @vitest-environment jsdom
/**
 * Receiver-side realtime miss repair.
 *
 * Discriminator observed: sender saw its own message (optimistic +
 * successful insert); already-open receiver did not see it live;
 * refresh / re-enter loaded it (persistence + initial fetch known-
 * good). The failed boundary is receiver realtime subscription or
 * live append.
 *
 * These tests pin the receiver-side invariants:
 *   1. A remote realtime INSERT for the same gameId is appended to
 *      the canonical `allMessages` projection (live receiver render).
 *   2. A realtime INSERT for a different gameId is ignored.
 *   3. `client_message_id` dedupe does not suppress messages from a
 *      different user (no false-positive optimistic-echo match).
 *   4. On `visibilitychange -> visible` the hook refetches
 *      chat_messages for the current gameId and merges any messages
 *      missed while the WebSocket was suspended (mobile Safari
 *      backgrounded tab). Persistence + fetch cover the gap; merge
 *      is idempotent by id.
 *   5. Changes to `chatIdentity.route` / `chatIdentity.sessionId`
 *      during a live session do NOT tear down the realtime channel
 *      (would open a window in which INSERTs are dropped).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React, { useEffect } from 'react';

type Handler = (payload: any) => void;
let capturedHandler: Handler | null = null;
let channelRemoveCount = 0;
let channelCreateCount = 0;

const fetchedMessagesByGame: Record<string, any[]> = {
  'game-A': [],
};

vi.mock('@/integrations/supabase/client', () => {
  const buildChatMessagesSelect = () => {
    let gameFilter: string | null = null;
    const eqBuilder = () => ({
      order: async () => ({ data: fetchedMessagesByGame[gameFilter ?? ''] ?? [], error: null }),
      single: async () => ({ data: null, error: null }),
      eq: (_c: string, v: string) => { gameFilter = v; return eqBuilder(); },
    });
    return {
      eq: (_c: string, v: string) => { gameFilter = v; return eqBuilder(); },
      in: async () => ({ data: [], error: null }),
      order: async () => ({ data: [], error: null }),
    };
  };
  const profilesSelect = () => ({
    eq: () => ({
      single: async () => ({ data: { username: 'me' }, error: null }),
      maybeSingle: async () => ({ data: { username: 'other' }, error: null }),
    }),
    in: async () => ({ data: [], error: null }),
  });
  const from = vi.fn((table: string) => ({
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    select: () => (table === 'chat_messages' ? buildChatMessagesSelect() : profilesSelect()),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  }));
  const channel = vi.fn(() => {
    channelCreateCount += 1;
    const chan: any = {
      on: (_evt: string, _filter: any, handler: Handler) => { capturedHandler = handler; return chan; },
      subscribe: (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return chan; },
      unsubscribe: () => {},
      topic: 'x',
    };
    return chan;
  });
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from,
      channel,
      removeChannel: () => { channelRemoveCount += 1; },
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
  };
});

// Silence heavy ledger/telemetry side effects; hook keeps working.
vi.mock('@/lib/chatDelivery/chatDeliveryLedger', () => ({
  recordCanonicalProjection: () => {},
  recordChatDeliveryEvent: () => {},
  recordChatDeliveryViolation: () => {},
  recordConsumerSubscription: () => {},
}));
vi.mock('@/lib/sessionLifecycleLedger', () => ({
  recordChatRealtimeCallbackBegin: () => {},
  recordChatRealtimeCallbackEnd: () => {},
  recordSessionLifecycleEvent: () => {},
}));
vi.mock('@/lib/runtimeInstrumentation/runtimeTracer', () => ({
  recordRuntimeEvent: () => {},
  upsertDeliveryTrace: () => Promise.resolve(),
  getClientInstanceId: () => 'ci',
  getTabSessionId: () => 'ts',
}));
vi.mock('@/lib/chatOperations/serverChatOperation', () => ({
  appendChatPeerMilestone: () => Promise.resolve(),
  appendChatSenderMilestone: () => Promise.resolve(),
  awaitPeerOperationVisibility: () => Promise.resolve(false),
  createChatOperationId: () => 'op',
  finalizeServerChatOperation: () => Promise.resolve(),
  markChatOperationDeliveryConfirmed: () => Promise.resolve(),
  openServerChatOperation: () => Promise.resolve(false),
  registerCurrentSessionChatOperation: () => {},
  writeChatOperationPeerHeartbeat: () => Promise.resolve(),
  writeChatOperationSenderHeartbeat: () => Promise.resolve(),
}));
vi.mock('@/lib/chatOperations/chatOperationBoundary', () => ({
  recordChatBoundaryEvent: () => {},
}));
vi.mock('@/lib/shellTabAttention/shellTabAttentionInstrumentation', () => ({
  beginChatOperationSnapshotCapture: () => {},
  getChatOperationSnapshots: () => ({}),
  writeChatOperationTerminalSnapshot: () => {},
  openChatSendOperation: () => {},
  finalizeChatSendOperation: () => {},
  recordWaitingChatTransition: () => {},
}));
vi.mock('@/lib/chatFlightRecorder', () => ({
  emitChatFlightEvent: () => {},
  ensureChatFlightRecorderArmed: () => {},
}));

import { useGameChat } from './useGameChat';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let captured: ReturnType<typeof useGameChat> | null = null;

function Harness({ gameId, identity }: { gameId: string; identity?: any }) {
  const chat = useGameChat(gameId, [], 'u1', identity);
  useEffect(() => { captured = chat; });
  return null;
}

beforeEach(() => {
  capturedHandler = null;
  channelRemoveCount = 0;
  channelCreateCount = 0;
  fetchedMessagesByGame['game-A'] = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null; host = null; captured = null;
});

async function flush() { await act(async () => { await Promise.resolve(); }); }

describe('useGameChat — receiver-side realtime delivery', () => {
  it('appends remote INSERT for same gameId to allMessages', async () => {
    act(() => { root!.render(React.createElement(Harness, { gameId: 'game-A' })); });
    await flush(); await flush();
    expect(typeof capturedHandler).toBe('function');

    act(() => {
      capturedHandler!({
        new: {
          id: 'msg-remote-1',
          game_id: 'game-A',
          user_id: 'other-user',
          message: 'hello',
          created_at: '2026-01-01T00:00:00Z',
          client_message_id: 'cmid-remote-1',
        },
      });
    });
    await flush();

    expect(captured!.allMessages.some((m) => m.id === 'msg-remote-1')).toBe(true);
  });

  it('ignores remote INSERT whose game_id does not match', async () => {
    act(() => { root!.render(React.createElement(Harness, { gameId: 'game-A' })); });
    await flush();
    act(() => {
      capturedHandler!({
        new: {
          id: 'msg-other-game',
          game_id: 'game-B',
          user_id: 'other-user',
          message: 'nope',
          created_at: '2026-01-01T00:00:00Z',
        },
      });
    });
    await flush();
    expect(captured!.allMessages.some((m) => m.id === 'msg-other-game')).toBe(false);
  });

  it('does not suppress a remote message that happens to reuse a client_message_id from another user', async () => {
    act(() => { root!.render(React.createElement(Harness, { gameId: 'game-A' })); });
    await flush();
    act(() => {
      capturedHandler!({
        new: {
          id: 'msg-remote-2',
          game_id: 'game-A',
          user_id: 'other-user',
          message: 'independent send',
          created_at: '2026-01-01T00:00:00Z',
          client_message_id: 'cmid-shared',
        },
      });
    });
    await flush();
    expect(captured!.allMessages.some((m) => m.id === 'msg-remote-2')).toBe(true);
  });

  it('catches up missed messages when the tab becomes visible again', async () => {
    act(() => { root!.render(React.createElement(Harness, { gameId: 'game-A' })); });
    await flush(); await flush();

    // Simulate a message that was persisted while the mobile socket
    // was suspended: it is present in DB fetch but the realtime
    // handler was never invoked for it.
    fetchedMessagesByGame['game-A'] = [{
      id: 'msg-missed-1',
      game_id: 'game-A',
      user_id: 'other-user',
      message: 'missed while backgrounded',
      created_at: '2026-01-01T00:00:00Z',
      client_message_id: null,
    }];

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await flush(); await flush();

    expect(captured!.allMessages.some((m) => m.id === 'msg-missed-1')).toBe(true);
  });

  it('does not resubscribe the realtime channel when only chatIdentity route/sessionId change', async () => {
    let setIdentity: ((v: any) => void) | null = null;
    function Wrap() {
      const [id, set] = React.useState({ route: '/a', sessionId: 's1' });
      setIdentity = set;
      return React.createElement(Harness, { gameId: 'game-A', identity: id });
    }
    act(() => { root!.render(React.createElement(Wrap)); });
    await flush();
    const createsBefore = channelCreateCount;
    const removesBefore = channelRemoveCount;

    act(() => { setIdentity!({ route: '/b', sessionId: 's2' }); });
    await flush();

    expect(channelCreateCount).toBe(createsBefore);
    expect(channelRemoveCount).toBe(removesBefore);
  });
});
