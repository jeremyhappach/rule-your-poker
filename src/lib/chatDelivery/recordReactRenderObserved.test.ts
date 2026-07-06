// @vitest-environment jsdom
/**
 * Regression gate for `recordReactRenderObserved`.
 *
 * Root cause of the CHAT-ISO-B5A iPhone Chat idle boot loop:
 * MobileChatPanel used a no-dep useEffect that called
 * `recordReactRenderObserved` on every commit. That in turn wrote the
 * growing chat-delivery ledger to `localStorage` synchronously and
 * dispatched a global `CustomEvent` per render. On mobile Safari this
 * stalled the main thread and, under quota pressure, cascaded into
 * shell/auth recovery.
 *
 * PERMANENT RULE: `recordReactRenderObserved` MUST be a hard no-op in
 * production builds. It must not:
 *   - write localStorage
 *   - dispatch window events
 *   - mutate React state, contexts, or subscribed stores
 *   - schedule timers, retries, or network work
 *
 * This test forces 1,000 invocations and asserts zero storage writes,
 * zero event dispatches, and zero timer scheduling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { recordReactRenderObserved } from './chatDeliveryLedger';

describe('recordReactRenderObserved — production no-op contract', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    setIntervalSpy = vi.spyOn(window, 'setInterval');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    dispatchSpy.mockRestore();
    setTimeoutSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });

  it('performs no side effects across 1000 invocations', () => {
    for (let i = 0; i < 1000; i += 1) {
      recordReactRenderObserved({
        consumer: 'MobileChatPanel',
        sourceCollection: [],
        gameId: 'g-1',
        dealerGameId: null,
        payload: { i },
      });
    }

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
