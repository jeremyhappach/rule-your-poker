// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { onAuthStateChange: vi.fn() },
  },
}));

vi.mock('@/lib/runtimeInstrumentation/runtimeTracer', () => ({
  getClientInstanceId: vi.fn(() => 'client-test'),
  getTabSessionId: vi.fn(() => 'tab-test'),
  recordRuntimeEvent: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import {
  installChatBoundaryListeners,
  recordChatBoundaryEvent,
} from './chatOperationBoundary';
import {
  CHAT_OPERATION_NETWORK_TELEMETRY_ENABLED,
  awaitPeerOperationVisibility,
  getCurrentSessionChatOperations,
  openServerChatOperation,
  registerCurrentSessionChatOperation,
  unregisterCurrentSessionChatOperation,
} from './serverChatOperation';

describe('retired durable chat-operation telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not install a fetch wrapper or emit boundary RPCs', () => {
    const originalFetch = window.fetch;
    registerCurrentSessionChatOperation({
      operationId: 'chat-retired-boundary',
      gameId: 'game-x',
      sessionId: 'session-x',
      route: '/game/game-x',
      role: 'sender',
    });

    expect(CHAT_OPERATION_NETWORK_TELEMETRY_ENABLED).toBe(false);
    installChatBoundaryListeners();
    recordChatBoundaryEvent('SUPABASE_FETCH_STARTED', { purpose: 'rpc:read_session_frame' });

    expect(window.fetch).toBe(originalFetch);
    expect(supabase.auth.onAuthStateChange).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    unregisterCurrentSessionChatOperation('chat-retired-boundary');
  });

  it('does not open or probe durable operation rows', async () => {
    const opened = await openServerChatOperation({
      operationId: 'chat-retired-open',
      senderUserId: 'user-x',
      gameId: 'game-x',
      sessionId: 'session-x',
      route: '/game/game-x',
      messagePreview: 'hello',
    });
    const visible = await awaitPeerOperationVisibility('chat-retired-open');

    expect(opened).toBe(false);
    expect(visible).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('prunes stale registrations and supports explicit finalization cleanup', () => {
    registerCurrentSessionChatOperation({
      operationId: 'chat-retired-stale',
      gameId: 'game-x',
      sessionId: 'session-x',
      route: '/game/game-x',
      role: 'sender',
      observedAt: new Date(Date.now() - 60_001).toISOString(),
    });
    registerCurrentSessionChatOperation({
      operationId: 'chat-retired-current',
      gameId: 'game-x',
      sessionId: 'session-x',
      route: '/game/game-x',
      role: 'peer',
    });

    const operationIds = getCurrentSessionChatOperations().map((operation) => operation.operationId);
    expect(operationIds).not.toContain('chat-retired-stale');
    expect(operationIds).toContain('chat-retired-current');

    unregisterCurrentSessionChatOperation('chat-retired-current');
    expect(getCurrentSessionChatOperations().map((operation) => operation.operationId))
      .not.toContain('chat-retired-current');
  });
});
