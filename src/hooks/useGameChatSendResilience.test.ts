// @vitest-environment jsdom
/**
 * Regression gate for `useGameChat.sendMessage`.
 *
 * Proves that `chat_messages.insert` is attempted exactly once and its
 * normal result controls the composer failure signal, regardless of
 * telemetry-side failures:
 *
 *   - openServerChatOperation rejects
 *   - sender-heartbeat rejects
 *   - recordChatBoundaryEvent throws synchronously
 *   - openChatSendOperation throws synchronously
 *   - boundary fan-out RPC returns a thenable with no `.catch`
 *   - telemetry-ready resolves false
 *
 * And that ONLY a real `chat_messages.insert` error triggers the
 * composer error path (`finalizeChatSendOperation('error', ...)`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React, { useEffect } from 'react';

/* ------------------------------------------------------------------ *
 * Mocks
 * ------------------------------------------------------------------ */

// ---- Supabase client -----------------------------------------------
const insertMock = vi.fn(async () => ({
  data: { id: 'auth-1', game_id: 'g1', user_id: 'u1', message: 'hi', created_at: 'now' },
  error: null,
}));
let insertShouldError = false;
let insertShouldThrow = false;
insertMock.mockImplementation(async () => {
  if (insertShouldThrow) throw new Error('insert-threw');
  if (insertShouldError) return { data: null, error: { message: 'insert-failed' } };
  return {
    data: { id: 'auth-1', game_id: 'g1', user_id: 'u1', message: 'hi', created_at: 'now' },
    error: null,
  };
});

vi.mock('@/integrations/supabase/client', () => {
  const eqBuilder = () => ({
    order: async () => ({ data: [], error: null }),
    single: async () => ({ data: null, error: null }),
    eq: () => eqBuilder(),
  });
  const chatMessagesBuilder = () => ({
    insert: () => ({
      select: () => ({ single: () => insertMock() }),
    }),
    select: () => ({
      eq: () => eqBuilder(),
      in: async () => ({ data: [], error: null }),
      order: async () => ({ data: [], error: null }),
    }),
  });
  const from = vi.fn((_table: string) => chatMessagesBuilder());
  const channel = vi.fn(() => {
    const chan: any = {
      on: () => chan,
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
      removeChannel: () => {},
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
      rpc: vi.fn(async () => ({ data: null, error: null })),
    },
  };
});

// ---- serverChatOperation (all telemetry writes) --------------------
const openServer = vi.fn(async () => true);
const senderHeartbeat = vi.fn(async () => undefined);
const appendSenderMilestone = vi.fn(async () => undefined);
const markDeliveryConfirmed = vi.fn(async () => undefined);
const finalizeServer = vi.fn(async () => undefined);
const registerCurrent = vi.fn(() => {});

vi.mock('@/lib/chatOperations/serverChatOperation', () => ({
  openServerChatOperation: (...a: unknown[]) => (openServer as (...x: unknown[]) => unknown)(...a),
  writeChatOperationSenderHeartbeat: (...a: unknown[]) => (senderHeartbeat as (...x: unknown[]) => unknown)(...a),
  writeChatOperationPeerHeartbeat: vi.fn(async () => undefined),
  appendChatSenderMilestone: (...a: unknown[]) => (appendSenderMilestone as (...x: unknown[]) => unknown)(...a),
  appendChatPeerMilestone: vi.fn(async () => undefined),
  awaitPeerOperationVisibility: vi.fn(async () => undefined),
  createChatOperationId: () => 'chat-test-op-id',
  finalizeServerChatOperation: (...a: unknown[]) => (finalizeServer as (...x: unknown[]) => unknown)(...a),
  markChatOperationDeliveryConfirmed: (...a: unknown[]) => (markDeliveryConfirmed as (...x: unknown[]) => unknown)(...a),
  registerCurrentSessionChatOperation: (...a: unknown[]) => (registerCurrent as (...x: unknown[]) => unknown)(...a),
  getCurrentSessionChatOperations: () => [],
  subscribeCurrentSessionChatOperations: () => () => {},
}));

// ---- Boundary event recorder --------------------------------------
const recordBoundary = vi.fn(() => {});
vi.mock('@/lib/chatOperations/chatOperationBoundary', () => ({
  recordChatBoundaryEvent: (...a: unknown[]) => (recordBoundary as (...x: unknown[]) => unknown)(...a),
  recordChatNavigationInitiated: vi.fn(),
  recordChatAbortInitiated: vi.fn(),
  installChatBoundaryListeners: vi.fn(),
}));

// ---- Shell-tab attention (imported both statically AND dynamically)
const openSendOp = vi.fn(() => {});
const finalizeSendOp = vi.fn(() => {});
const writeTerminalSnapshot = vi.fn(() => {});
const getSnapshots = vi.fn(() => ({}));
const beginCapture = vi.fn(() => {});

vi.mock('@/lib/shellTabAttention/shellTabAttentionInstrumentation', () => ({
  openChatSendOperation: (...a: unknown[]) => (openSendOp as (...x: unknown[]) => unknown)(...a),
  finalizeChatSendOperation: (...a: unknown[]) => (finalizeSendOp as (...x: unknown[]) => unknown)(...a),
  writeChatOperationTerminalSnapshot: (...a: unknown[]) => (writeTerminalSnapshot as (...x: unknown[]) => unknown)(...a),
  getChatOperationSnapshots: (...a: unknown[]) => (getSnapshots as (...x: unknown[]) => unknown)(...a),
  beginChatOperationSnapshotCapture: (...a: unknown[]) => (beginCapture as (...x: unknown[]) => unknown)(...a),
  recordWaitingChatTransition: vi.fn(),
}));

// ---- Other ledgers / tracers (silent no-ops) -----------------------
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
let captured: ((m: string) => Promise<void>) | null = null;

function Harness() {
  const chat = useGameChat('g1', [], 'u1');
  useEffect(() => {
    captured = chat.sendMessage as unknown as (m: string) => Promise<void>;
  }, [chat.sendMessage]);
  return null;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(Harness)); });
  await flush();
  if (!captured) throw new Error('sendMessage not captured');
}

async function unmount() {
  await act(async () => { root.unmount(); });
  container.remove();
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

const errorFinalizeCalls = () =>
  (finalizeSendOp.mock.calls as unknown[][]).filter((c) => c[1] === 'error');

beforeEach(() => {
  insertShouldError = false;
  insertShouldThrow = false;
  insertMock.mockClear();
  openServer.mockReset().mockImplementation(async () => true);
  senderHeartbeat.mockReset().mockImplementation(async () => undefined);
  appendSenderMilestone.mockReset().mockImplementation(async () => undefined);
  markDeliveryConfirmed.mockReset().mockImplementation(async () => undefined);
  finalizeServer.mockReset().mockImplementation(async () => undefined);
  registerCurrent.mockReset();
  recordBoundary.mockReset().mockImplementation(() => {});
  openSendOp.mockReset().mockImplementation(() => {});
  finalizeSendOp.mockReset();
  writeTerminalSnapshot.mockReset();
  getSnapshots.mockReset().mockReturnValue({});
});

afterEach(async () => {
  await unmount().catch(() => {});
  captured = null;
});

describe('useGameChat.sendMessage — telemetry-failure resilience', () => {
  it('openServerChatOperation rejects → insert still called once, no composer error', async () => {
    openServer.mockImplementationOnce(async () => { throw new Error('durable-open-failed'); });
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
  });

  it('sender-heartbeat rejects → insert still called once, no composer error', async () => {
    senderHeartbeat.mockImplementation(async () => { throw new Error('hb-rejected'); });
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
  });

  it('recordChatBoundaryEvent throws synchronously → insert still called once, no composer error', async () => {
    recordBoundary.mockImplementation(() => { throw new Error('boundary-sync-throw'); });
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
  });

  it('openChatSendOperation throws synchronously → insert still called once, no composer error', async () => {
    openSendOp.mockImplementation(() => { throw new Error('snapshot-open-throw'); });
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
  });

  it('boundary fan-out RPC thenable without .catch → insert still called once, no composer error', async () => {
    // Simulate: recordBoundary succeeds but downstream RPC returns a
    // bare thenable (no .catch). The recorder is exception-isolated so
    // the send path must be unaffected.
    recordBoundary.mockImplementation(() => {
      const thenable = { then: (ok: (v: unknown) => void) => ok(undefined) } as any;
      // caller does not chain — mimicking fanOut's isolated dispatch
      void thenable;
    });
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
  });

  it('telemetryReady resolves false → insert still called once, no composer error', async () => {
    openServer.mockImplementation(async () => false);
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls()).toHaveLength(0);
    // With telemetry unavailable, no operation-scoped writes should run:
    expect(senderHeartbeat).not.toHaveBeenCalled();
    expect(appendSenderMilestone).not.toHaveBeenCalled();
    expect(markDeliveryConfirmed).not.toHaveBeenCalled();
    expect(finalizeServer).not.toHaveBeenCalled();
  });

  it('ONLY a real chat_messages.insert error surfaces as composer error', async () => {
    insertShouldThrow = true;
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(errorFinalizeCalls().length).toBeGreaterThanOrEqual(1);
  });

  it('chat_messages.insert returning { error } does NOT surface as composer error (business insert-error is a separate, handled path)', async () => {
    insertShouldError = true;
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();
    expect(insertMock).toHaveBeenCalledTimes(1);
    // The outer catch is only for thrown exceptions; a returned {error}
    // is handled inline and does NOT trigger finalizeChatSendOperation('error').
    expect(errorFinalizeCalls()).toHaveLength(0);
  });
});
