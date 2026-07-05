/**
 * Regression test for the observed crash:
 *   `rpc(...).catch is not a function`
 *
 * Supabase's RPC builder is a thenable — it exposes `.then` but not
 * always `.catch`/`.finally`. `fanOut()` must never chain those
 * directly; it must `await` inside a try/catch. This test replaces
 * `supabase.rpc` with a `.then`-only thenable and proves that
 * `recordChatBoundaryEvent()` is exception-isolated.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { onAuthStateChange: vi.fn() },
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { recordChatBoundaryEvent } from './chatOperationBoundary';
import { registerCurrentSessionChatOperation } from './serverChatOperation';

let opCounter = 0;
function registerOp(): string {
  const id = `chat-thenable-safety-${++opCounter}`;
  registerCurrentSessionChatOperation({
    operationId: id,
    gameId: 'game-x',
    sessionId: 'sess-x',
    route: '/waiting',
    role: 'sender',
  });
  return id;
}

describe('fanOut: RPC-thenable safety', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: Event) => {
    unhandled.push((e as PromiseRejectionEvent).reason ?? e);
  };

  beforeEach(() => {
    unhandled.length = 0;
    window.addEventListener('unhandledrejection', onUnhandled);
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', onUnhandled);
  });

  it('does not throw when RPC returns a thenable WITHOUT `.catch`', async () => {
    registerOp();
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      then: (onFulfilled: (v: unknown) => void) => { onFulfilled({ data: null, error: null }); },
    }));
    expect(() => recordChatBoundaryEvent('PAGE_HIDE', { persisted: false })).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toHaveLength(0);
  });

  it('swallows a rejecting thenable without unhandledrejection', async () => {
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

  it('swallows when supabase.rpc itself throws synchronously', async () => {
    registerOp();
    (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('rpc construction failure');
    });
    expect(() => recordChatBoundaryEvent('PAGE_HIDE', {})).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toHaveLength(0);
  });
});
