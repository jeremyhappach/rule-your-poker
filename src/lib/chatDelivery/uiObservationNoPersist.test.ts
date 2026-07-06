// @vitest-environment jsdom
/**
 * Regression gate for the CHAT-ISO-B5A postmortem rule:
 *
 *   UI observation must NEVER synchronously persist the delivery ledger.
 *
 * The following functions are UI-observation entry points reachable from
 * MobileChatPanel render effects, mount/unmount, message DOM mount, and
 * selector recomputes. None of them may:
 *   - call `localStorage.setItem`
 *   - dispatch the `chat-delivery-ledger-updated` CustomEvent
 *   - schedule network work
 *
 *   • recordConsumerSubscription
 *   • recordSelectorProof
 *   • recordChatDeliveryViolation
 *   • recordChatDeliveryEvent for UI-observation phases:
 *       chat-panel-open, chat-panel-closed, chat-message-mounted,
 *       consumer-mounted, consumer-unmounted, selector-recomputed,
 *       react-render-observed, console-chat-indicator, indicator-*,
 *       unread-*, chat-attention-*, turn-attention-evaluated
 *
 * Durable persistence is reserved for actual chat delivery state:
 *   send-intent, optimistic-merged, insert-success, insert-error,
 *   realtime-subscribe-*, realtime-insert-received,
 *   realtime-payload-admitted, store-message-merged, hydration-*,
 *   optimistic-reconciliation, canonical-projection-updated,
 *   identity-change, realtime-eligible-observed, read-cursor-advanced.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordChatDeliveryEvent,
  recordChatDeliveryViolation,
  recordConsumerSubscription,
  recordSelectorProof,
  recordCanonicalProjection,
} from './chatDeliveryLedger';

describe('UI observation ledger writes never persist synchronously', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setItemSpy = vi.spyOn(window.localStorage.__proto__, 'setItem');
    dispatchSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    dispatchSpy.mockRestore();
  });

  it('recordConsumerSubscription mount+unmount does not touch localStorage or dispatch', () => {
    recordConsumerSubscription({ consumer: 'MobileChatPanel', mounted: true });
    recordConsumerSubscription({ consumer: 'MobileChatPanel', mounted: false });
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2')).toHaveLength(0);
    expect(
      dispatchSpy.mock.calls.filter(
        ([evt]) => (evt as Event)?.type === 'chat-delivery-ledger-updated',
      ),
    ).toHaveLength(0);
  });

  it('recordChatDeliveryViolation never persists', () => {
    recordChatDeliveryViolation({
      violation: 'CHAT_STORE_RENDER_COUNT_MISMATCH',
      consumer: 'MobileChatPanel',
      payload: { storeCount: 3, renderedCount: 2 },
    });
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2')).toHaveLength(0);
    expect(
      dispatchSpy.mock.calls.filter(
        ([evt]) => (evt as Event)?.type === 'chat-delivery-ledger-updated',
      ),
    ).toHaveLength(0);
  });

  it('recordSelectorProof (selector-recomputed) never persists', () => {
    recordSelectorProof({
      consumer: 'MobileChatPanel',
      selectorName: 'test.selector',
      sourceCollection: [{ id: 'a' }, { id: 'b' }],
      returnedCollection: [{ id: 'a' }, { id: 'b' }],
    });
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2')).toHaveLength(0);
    expect(
      dispatchSpy.mock.calls.filter(
        ([evt]) => (evt as Event)?.type === 'chat-delivery-ledger-updated',
      ),
    ).toHaveLength(0);
  });

  it.each([
    'chat-panel-open',
    'chat-panel-closed',
    'chat-message-mounted',
    'consumer-mounted',
    'consumer-unmounted',
    'selector-recomputed',
    'react-render-observed',
    'indicator-mounted',
    'indicator-cleared',
    'unread-evaluation-start',
    'chat-attention-transition',
  ] as const)('recordChatDeliveryEvent(%s) never persists', (phase) => {
    recordChatDeliveryEvent({
      phase,
      consumer: 'MobileChatPanel',
      payload: { note: 'ui-observation' },
    });
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2')).toHaveLength(0);
    expect(
      dispatchSpy.mock.calls.filter(
        ([evt]) => (evt as Event)?.type === 'chat-delivery-ledger-updated',
      ),
    ).toHaveLength(0);
  });

  it('simulated MobileChatPanel: 1,000 render/mount/selector cycles produce zero storage writes', () => {
    for (let i = 0; i < 1000; i++) {
      recordConsumerSubscription({ consumer: 'MobileChatPanel', mounted: true });
      recordChatDeliveryEvent({
        phase: 'chat-panel-open',
        consumer: 'MobileChatPanel',
        payload: { i },
      });
      recordSelectorProof({
        consumer: 'MobileChatPanel',
        selectorName: 'combined-render-list',
        sourceCollection: [{ id: `m-${i}` }],
        returnedIds: [`m-${i}`],
      });
      recordChatDeliveryEvent({
        phase: 'chat-message-mounted',
        messageId: `m-${i}`,
        consumer: 'MobileChatPanel',
      });
      recordChatDeliveryViolation({
        violation: 'CHAT_STORE_RENDER_COUNT_MISMATCH',
        consumer: 'MobileChatPanel',
        payload: { i },
      });
      recordChatDeliveryEvent({
        phase: 'chat-panel-closed',
        consumer: 'MobileChatPanel',
      });
      recordConsumerSubscription({ consumer: 'MobileChatPanel', mounted: false });
    }
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2')).toHaveLength(0);
    const ledgerDispatches = dispatchSpy.mock.calls.filter(
      ([evt]) => (evt as Event)?.type === 'chat-delivery-ledger-updated',
    );
    expect(ledgerDispatches).toHaveLength(0);
  });

  it('durable delivery-state writes (canonical-projection-updated) still persist', () => {
    recordCanonicalProjection({
      source: 'realtime-merge',
      messages: [{ id: 'm1', user_id: 'other', game_id: 'g1' }],
      gameId: 'g1',
      currentUserId: 'me',
    });
    expect(setItemSpy.mock.calls.filter(([k]) => k === 'CHAT_DELIVERY_LEDGER_V2').length).toBeGreaterThan(0);
  });
});
