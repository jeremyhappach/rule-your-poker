// @vitest-environment jsdom
/**
 * Regression gate: `chat_messages.insert` payload must NOT include
 * `chat_operation_id`. Root cause of the delayed-message defect was
 * a FK violation (`chat_messages_chat_operation_id_fkey`, PG 23503):
 * the sender inserted a chat_operation_id before its referenced
 * `chat_send_operations` row existed, causing the insert to fail
 * and the optimistic bubble to disappear.
 *
 * Normal chat delivery must never depend on optional diagnostic /
 * telemetry operation rows. This test proves:
 *   - insert is called exactly once
 *   - payload contains only business fields + client_message_id
 *   - payload has NO chat_operation_id
 *   - insert succeeds even when openServerChatOperation is delayed/failed
 *   - telemetry timing cannot change send outcome
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import React, { useEffect } from 'react';

/* ---- Insert payload capture --------------------------------------- */
const capturedPayloads: any[] = [];
const insertMock = vi.fn(async (payload: any) => {
  capturedPayloads.push(payload);
  return {
    data: {
      id: 'auth-1',
      game_id: payload.game_id,
      user_id: payload.user_id,
      message: payload.message,
      client_message_id: payload.client_message_id,
      created_at: 'now',
    },
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
    insert: (payload: any) => ({
      select: () => ({ single: () => insertMock(payload) }),
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

/* ---- Telemetry stubs (openServerChatOperation delayed / failed) --- */
const openServer = vi.fn(async () => true);
vi.mock('@/lib/chatOperations/serverChatOperation', () => ({
  openServerChatOperation: (...a: unknown[]) => (openServer as any)(...a),
  writeChatOperationSenderHeartbeat: vi.fn(async () => undefined),
  writeChatOperationPeerHeartbeat: vi.fn(async () => undefined),
  appendChatSenderMilestone: vi.fn(async () => undefined),
  appendChatPeerMilestone: vi.fn(async () => undefined),
  awaitPeerOperationVisibility: vi.fn(async () => undefined),
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
  getChatOperationSnapshots: () => ({}),
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

import { useGameChat } from './useGameChat';

let container: HTMLDivElement;
let root: Root;
let captured: ((m: string) => Promise<void>) | null = null;
let capturedMessages: any = null;

function Harness() {
  const chat = useGameChat('g1', [], 'u1');
  useEffect(() => {
    captured = chat.sendMessage as unknown as (m: string) => Promise<void>;
    capturedMessages = chat.allMessages;
  }, [chat.sendMessage, chat.allMessages]);
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

beforeEach(() => {
  capturedPayloads.length = 0;
  insertMock.mockClear();
  openServer.mockReset().mockImplementation(async () => true);
});

afterEach(async () => {
  await unmount().catch(() => {});
  captured = null;
  capturedMessages = null;
});

describe('chat_messages.insert payload — no chat_operation_id dependency', () => {
  it('insert payload omits chat_operation_id and contains only business fields', async () => {
    await mount();
    await act(async () => { await captured!('hello'); });
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(capturedPayloads).toHaveLength(1);
    const payload = capturedPayloads[0];

    // Must NOT carry a FK reference into chat_send_operations.
    expect(payload).not.toHaveProperty('chat_operation_id');

    // Must carry business + correlation fields only.
    expect(payload.game_id).toBe('g1');
    expect(payload.user_id).toBe('u1');
    expect(payload.message).toBe('hello');
    expect(typeof payload.client_message_id).toBe('string');
    expect(payload.client_message_id.length).toBeGreaterThan(0);
  });

  it('insert succeeds when openServerChatOperation is delayed indefinitely (telemetry timing cannot change send outcome)', async () => {
    // Simulate a stuck telemetry-open call — never resolves.
    openServer.mockImplementation(() => new Promise(() => {}));
    await mount();
    await act(async () => { await captured!('test2'); });
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = capturedPayloads[0];
    expect(payload).not.toHaveProperty('chat_operation_id');
    expect(payload.message).toBe('test2');

    // Message remains visible in local view (not rolled back).
    const stillVisible = (capturedMessages ?? []).some(
      (m: any) => m.message === 'test2',
    );
    expect(stillVisible).toBe(true);
  });

  it('insert succeeds when openServerChatOperation rejects (telemetry failure cannot break delivery)', async () => {
    openServer.mockImplementation(async () => { throw new Error('telemetry-open-failed'); });
    await mount();
    await act(async () => { await captured!('test3'); });
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = capturedPayloads[0];
    expect(payload).not.toHaveProperty('chat_operation_id');
    expect(payload.message).toBe('test3');
  });
});
