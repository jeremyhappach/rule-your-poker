/**
 * Regression test for the observed crash:
 *   `rpc(...).catch is not a function`
 *
 * The Supabase RPC builder is a thenable — it exposes `.then` but not
 * always `.catch`. `fanOut()` and every chat instrumentation callsite
 * must therefore never chain `.catch` / `.finally` directly onto an RPC
 * return value; they must instead `await` it inside a try/catch.
 *
 * This test replaces `supabase.rpc` with a thenable that has `.then`
 * only (no `.catch`, no `.finally`), and proves:
 *   - `recordChatBoundaryEvent()` does not throw;
 *   - a rejecting thenable does not produce an unhandledrejection;
 *   - a thenable whose `.then` handler throws synchronously is swallowed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // Overwritten per-test.
    rpc: vi.fn(),
    auth: { onAuthStateChange: vi.fn() },
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { recordChatBoundaryEvent } from './chatOperationBoundary';
import { registerCurrentSessionChatOperation, clearCurrentSessionChatOperation } from './serverChatOperation';

const OP_ID = 'test-op-thenable-safety';

function registerOp() {
  registerCurrentSessionChatOperation({
    operationId: OP_ID,
    gameId: 'game-x',
    sessionId: 'sess-x',
    route: '/waiting',
    role: 'sender',
  });
}

describe('fanOut: RPC-thenable safety', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: PromiseRejectionEvent | { reason?: unknown }) => {
    unhandled.push((e as PromiseRejectionEvent).reason ?? e);
  };

  beforeEach(() => {
    unhandled.length = 0;
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', onUnhandled as EventListener);
    }
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    clearCurrentSessionChatOperation(OP_ID);
    if (typeof window !== 'undefined') {
      window.removeEventListener('unhandledrejection', onUnhandled as EventListener);
    }
    process.off('unhandledRejection', onUnhandled);
  });

  it('does not throw when RPC returns a thenable WITHOUT `.catch`', async () => {
    registerOp();
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      then: (onFulfilled: (v: unknown) => void) => { onFulfilled({ data: null, error: null }); },
      // NOTE: no `.catch`, no `.finally` — replicates the crash surface.
    }));

    expect(() => recordChatBoundaryEvent('PAGE_HIDE', { persisted: false })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toHaveLength(0);
  });

  it('swallows a rejecting thenable without producing unhandledrejection', async () => {
    registerOp();
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      then: (_ok: unknown, onRej?: (e: unknown) => void) => {
        if (onRej) onRej(new Error('simulated rpc rejection'));
      },
    }));

    expect(() => recordChatBoundaryEvent('BEFORE_UNLOAD', {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toHaveLength(0);
  });

  it('swallows a thenable whose then() throws synchronously', async () => {
    registerOp();
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      then: () => { throw new Error('synchronous then() throw'); },
    }));

    expect(() => recordChatBoundaryEvent('PAGE_HIDE', {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toHaveLength(0);
  });

  it('is a no-op when no operation is registered', () => {
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('rpc should not be called with no registered op');
    });
    expect(() => recordChatBoundaryEvent('PAGE_HIDE', {})).not.toThrow();
  });
});
