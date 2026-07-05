/**
 * Shell tab attention instrumentation.
 *
 * Focused, contract-driven persistence for the waiting-table / no-real-game
 * Cards tab + Chat tab attention rendering path.
 *
 * The instrumentation is intentionally narrow:
 *   - one compact SHELL_TAB_ATTENTION_SNAPSHOT emitted whenever the
 *     resolved tab-bar state changes;
 *   - a small set of invariant events emitted ONLY when violated;
 *   - a light chat_send_operation correlation open/finalize pair keyed
 *     on the existing chat correlation id.
 *
 * All events flow through the existing runtime tracer pipeline
 * (recordRuntimeEvent) — no new tables, no new subscriptions.
 */

import { recordRuntimeEvent } from '@/lib/runtimeInstrumentation/runtimeTracer';

export interface ShellTabAttentionSnapshot {
  // Identity / context
  gameId: string | null;
  sessionId: string | null;
  dealerGameId: string | null;
  gameType: string | null;
  route: string;
  shellPhase: string | null;
  activeGameComponent: string | null;
  waitingTableComponent: string | null;
  activeTab: string;

  // Chat state
  canonicalMessageRevision: number | null;
  localUnreadCount: number | null;
  remoteUnreadCount: number | null;
  isChatOpen: boolean;
  chatAttentionState: string | null;
  chatPulseActive: boolean;
  chatPulseDeadline: string | null;
  lastRemoteMessageId: string | null;

  // Cards / gameplay-tab state
  cardsTabKind: string | null;
  cardsIconKind: 'spade' | 'dice' | null;
  cardsTabAttentionState: string | null;
  localTurnEligible: boolean;
  turnAttentionSource: string | null;
  gameControllerPresent: boolean;
  currentTurnPlayerId: string | null;
  gameTypeResolved: string | null;

  // Resolved visual output — chat tab
  chatTabFill: string;
  chatTabOutline: string;
  chatGlyphFill: string;
  chatGlyphOutline: string;
  chatGlyphPulse: boolean;

  // Resolved visual output — cards tab
  cardsTabFill: string;
  cardsTabOutline: string;
  cardsGlyphFill: string;
  cardsGlyphOutline: string;
  cardsGlyphPulse: boolean;

  // Tab-bar host
  tabBarMounted: boolean;
  tabBarRenderKey: string;
  shellTabBarOwner: string | null;
  pointerEventsBlockerPresent: boolean;
  blockerSource: string | null;
}

let lastSignature: string | null = null;
let lastSnapshot: ShellTabAttentionSnapshot | null = null;
const activeChatOperations = new Set<string>();

/** Stable signature for de-dupe. */
function signatureOf(s: ShellTabAttentionSnapshot): string {
  return JSON.stringify(s);
}

/** Public: emit the snapshot if any tracked field changed. */
export function recordShellTabAttentionSnapshot(
  snapshot: ShellTabAttentionSnapshot,
  reason: string,
): void {
  const sig = signatureOf(snapshot);
  if (sig === lastSignature) return;
  const prev = lastSnapshot;
  lastSignature = sig;
  lastSnapshot = snapshot;

  recordRuntimeEvent({
    event_family: 'shell_tab_attention',
    event_name: 'SHELL_TAB_ATTENTION_SNAPSHOT',
    severity: 'info',
    game_id: snapshot.gameId ?? undefined,
    payload: { reason, snapshot },
  });

  evaluateInvariants(snapshot, prev, reason);
  onSnapshotForChatOps(snapshot, prev, reason);
}

/**
 * Explicit invariants — emitted only when true.
 */
function evaluateInvariants(
  s: ShellTabAttentionSnapshot,
  prev: ShellTabAttentionSnapshot | null,
  reason: string,
): void {
  const emit = (name: string, extra: Record<string, unknown> = {}) => {
    recordRuntimeEvent({
      event_family: 'shell_tab_attention',
      event_name: name,
      severity: 'warn',
      game_id: s.gameId ?? undefined,
      payload: { reason, snapshot: s, ...extra },
    });
  };

  // WAITING_TABLE_CARDS_TAB_REQUIRES_GAME_CONTEXT
  if (
    s.waitingTableComponent &&
    !s.gameControllerPresent &&
    (s.localTurnEligible ||
      s.cardsTabAttentionState === 'LOCAL_TURN' ||
      s.currentTurnPlayerId !== null)
  ) {
    emit('WAITING_TABLE_CARDS_TAB_REQUIRES_GAME_CONTEXT');
  }

  // WAITING_TABLE_TAB_ATTENTION_INVALID_STATE
  const cardsColored =
    s.cardsGlyphPulse ||
    s.cardsTabFill !== 'none' ||
    s.cardsTabOutline !== 'none' ||
    (s.cardsGlyphFill !== 'none' && s.cardsGlyphFill !== 'currentColor');
  if (cardsColored && s.cardsTabAttentionState === 'NONE') {
    emit('WAITING_TABLE_TAB_ATTENTION_INVALID_STATE', { target: 'cards' });
  }
  const chatColored =
    s.chatGlyphPulse ||
    s.chatTabFill !== 'none' ||
    s.chatTabOutline !== 'none';
  if (chatColored && (!s.chatAttentionState || s.chatAttentionState === 'NONE')) {
    emit('WAITING_TABLE_TAB_ATTENTION_INVALID_STATE', { target: 'chat' });
  }

  // CHAT_AND_CARDS_ATTENTION_COLLISION
  if (
    (s.chatGlyphPulse && s.cardsGlyphPulse) ||
    (s.chatTabFill !== 'none' && s.cardsTabFill !== 'none' &&
      s.chatTabFill === s.cardsTabFill)
  ) {
    emit('CHAT_AND_CARDS_ATTENTION_COLLISION');
  }

  // SHELL_TABBAR_REMOUNT_DURING_CHAT_OPERATION
  if (
    activeChatOperations.size > 0 &&
    prev &&
    prev.tabBarRenderKey !== s.tabBarRenderKey
  ) {
    emit('SHELL_TABBAR_REMOUNT_DURING_CHAT_OPERATION', {
      openChatOperations: Array.from(activeChatOperations),
      prevRenderKey: prev.tabBarRenderKey,
      nextRenderKey: s.tabBarRenderKey,
    });
  }

  // TAB_COLOR_STATE_CHANGED_DURING_CHAT_OPERATION
  if (activeChatOperations.size > 0 && prev) {
    const colorFields: (keyof ShellTabAttentionSnapshot)[] = [
      'chatTabFill', 'chatTabOutline', 'chatGlyphFill', 'chatGlyphOutline', 'chatGlyphPulse',
      'cardsTabFill', 'cardsTabOutline', 'cardsGlyphFill', 'cardsGlyphOutline', 'cardsGlyphPulse',
    ];
    const diffs = colorFields.filter((f) => prev[f] !== s[f]);
    if (diffs.length > 0) {
      emit('TAB_COLOR_STATE_CHANGED_DURING_CHAT_OPERATION', {
        openChatOperations: Array.from(activeChatOperations),
        changedFields: diffs,
      });
    }
  }
}

/**
 * chat_send_operation correlation.
 * The chat send site opens via openChatSendOperation(correlationId) and
 * finalizes via finalizeChatSendOperation(correlationId). All
 * SHELL_TAB_ATTENTION_SNAPSHOT rows emitted between are linked by
 * the correlation id inside their payload.
 */
export function openChatSendOperation(correlationId: string, extra?: Record<string, unknown>): void {
  activeChatOperations.add(correlationId);
  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'CHAT_SEND_OPERATION_OPENED',
    severity: 'info',
    correlation_id: correlationId,
    payload: { snapshot: lastSnapshot, ...(extra ?? {}) },
  });
}

export function finalizeChatSendOperation(
  correlationId: string,
  outcome: 'success' | 'error' | 'aborted',
  extra?: Record<string, unknown>,
): void {
  activeChatOperations.delete(correlationId);
  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'CHAT_SEND_OPERATION_FINALIZED',
    severity: outcome === 'error' ? 'warn' : 'info',
    correlation_id: correlationId,
    payload: { outcome, snapshot: lastSnapshot, ...(extra ?? {}) },
  });
}

function onSnapshotForChatOps(
  s: ShellTabAttentionSnapshot,
  _prev: ShellTabAttentionSnapshot | null,
  _reason: string,
): void {
  if (activeChatOperations.size === 0) return;
  for (const cid of activeChatOperations) {
    recordRuntimeEvent({
      event_family: 'chat',
      event_name: 'CHAT_SEND_OPERATION_TAB_SNAPSHOT',
      severity: 'info',
      correlation_id: cid,
      game_id: s.gameId ?? undefined,
      payload: { snapshot: s },
    });
  }
}

export function getLastShellTabAttentionSnapshot(): ShellTabAttentionSnapshot | null {
  return lastSnapshot;
}

/**
 * Waiting-table transition events. Emitted only at the moment a specific
 * canonical transition happens — never per render.
 */
export type WaitingChatTransitionName =
  | 'WAITING_REMOTE_FIRST_MESSAGE_RECEIVED'
  | 'WAITING_CHAT_SOLID_RED_APPLIED'
  | 'WAITING_CHAT_SOLID_RED_CLEARED'
  | 'WAITING_CHAT_OUTLINE_APPLIED'
  | 'WAITING_CARDS_TAB_RENDER_DURING_CHAT_ATTENTION'
  | 'WAITING_TAB_ATTENTION_COLLISION'
  | 'WAITING_TABBAR_REMOUNT_DURING_CHAT_ATTENTION';

export function recordWaitingChatTransition(
  name: WaitingChatTransitionName,
  extra: Record<string, unknown> = {},
): void {
  recordRuntimeEvent({
    event_family: 'shell_tab_attention',
    event_name: name,
    severity: name === 'WAITING_TAB_ATTENTION_COLLISION' ||
              name === 'WAITING_TABBAR_REMOUNT_DURING_CHAT_ATTENTION'
              ? 'warn'
              : 'info',
    game_id: (lastSnapshot?.gameId ?? undefined) as string | undefined,
    payload: { snapshot: lastSnapshot, ...extra },
  });
}

