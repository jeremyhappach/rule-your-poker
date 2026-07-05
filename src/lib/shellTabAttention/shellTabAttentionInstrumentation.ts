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
const activeChatOperationSnapshots = new Map<string, ShellTabAttentionSnapshot[]>();
const activeChatOperationRoles = new Map<string, 'sender' | 'peer'>();
const activeChatOperationBaselineWritten = new Set<string>();
const activeChatOperationTerminalWritten = new Set<string>();

// Monotonic sequence for any forced/baseline/terminal/render-commit event so
// downstream TXT rendering can order events even when timestamps collide.
let monotonicSequence = 0;
export function nextInstrumentationSequence(): number {
  monotonicSequence += 1;
  return monotonicSequence;
}

interface ShellTabAttentionContextPatch {
  gameId?: string | null;
  sessionId?: string | null;
  dealerGameId?: string | null;
  gameType?: string | null;
  route?: string | null;
  shellPhase?: string | null;
  activeGameComponent?: string | null;
  waitingTableComponent?: string | null;
}

let shellTabAttentionContext: ShellTabAttentionContextPatch = {};

export function setShellTabAttentionContext(patch: ShellTabAttentionContextPatch): void {
  shellTabAttentionContext = { ...shellTabAttentionContext, ...patch };
}

export function getShellTabAttentionContext(): ShellTabAttentionContextPatch {
  return shellTabAttentionContext;
}

/** Stable signature for de-dupe. */
function signatureOf(s: ShellTabAttentionSnapshot): string {
  return JSON.stringify(s);
}

/**
 * Forced snapshot write — bypasses signature de-dupe. Used for
 * operation-open baselines (sender + peer) and terminal snapshots.
 * Emits the SHELL_TAB_ATTENTION_SNAPSHOT event with an explicit
 * reason string so the finalizer can identify baseline / terminal /
 * intermediate snapshots.
 */
export function writeForcedShellTabAttentionSnapshot(
  reason: string,
  correlationId: string | null,
  extra: Record<string, unknown> = {},
): ShellTabAttentionSnapshot | null {
  const snapshot = lastSnapshot;
  if (!snapshot) return null;
  const sequence = nextInstrumentationSequence();
  if (correlationId) {
    const list = activeChatOperationSnapshots.get(correlationId) ?? [];
    list.push(snapshot);
    activeChatOperationSnapshots.set(correlationId, list.slice(-24));
  } else {
    for (const cid of activeChatOperations) {
      const list = activeChatOperationSnapshots.get(cid) ?? [];
      list.push(snapshot);
      activeChatOperationSnapshots.set(cid, list.slice(-24));
    }
  }
  recordRuntimeEvent({
    event_family: 'shell_tab_attention',
    event_name: 'SHELL_TAB_ATTENTION_SNAPSHOT',
    severity: 'info',
    correlation_id: correlationId ?? undefined,
    game_id: snapshot.gameId ?? undefined,
    session_id: snapshot.sessionId ?? undefined,
    dealer_game_id: snapshot.dealerGameId ?? undefined,
    route: snapshot.route,
    active_tab: snapshot.activeTab,
    game_status: snapshot.shellPhase ?? undefined,
    game_type: snapshot.gameType ?? undefined,
    payload: { reason, forced: true, sequence, correlationId, snapshot, ...extra },
  });
  // Persist onto durable server chat operation record too so the exported
  // TXT can identify baseline/terminal snapshots explicitly.
  if (correlationId) {
    void import('@/lib/chatOperations/serverChatOperation').then(
      ({ appendChatSenderMilestone, appendChatPeerMilestone }) => {
        const role = activeChatOperationRoles.get(correlationId);
        const metadata = { reason, forced: true, sequence, snapshot, ...extra };
        if (role === 'peer') {
          void appendChatPeerMilestone(correlationId, reason, metadata, null, [snapshot]);
        } else {
          void appendChatSenderMilestone(correlationId, reason, metadata);
        }
      },
    );
  }
  return snapshot;
}

/** Public: force sender/peer terminal snapshot for a given correlation id. */
export function writeChatOperationTerminalSnapshot(
  correlationId: string,
  terminalReason: string,
  terminalStatus: string,
): void {
  if (!activeChatOperations.has(correlationId)) return;
  if (activeChatOperationTerminalWritten.has(correlationId)) return;
  activeChatOperationTerminalWritten.add(correlationId);
  const role = activeChatOperationRoles.get(correlationId);
  const reason =
    role === 'peer' ? 'PEER_OPERATION_TERMINAL_SNAPSHOT' : 'CHAT_OPERATION_TERMINAL_SNAPSHOT';
  writeForcedShellTabAttentionSnapshot(reason, correlationId, {
    terminalReason,
    terminalStatus,
    role: role ?? 'sender',
  });
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
  for (const cid of activeChatOperations) {
    const list = activeChatOperationSnapshots.get(cid) ?? [];
    list.push(snapshot);
    activeChatOperationSnapshots.set(cid, list.slice(-20));
  }

  recordRuntimeEvent({
    event_family: 'shell_tab_attention',
    event_name: 'SHELL_TAB_ATTENTION_SNAPSHOT',
    severity: 'info',
    game_id: snapshot.gameId ?? undefined,
    session_id: snapshot.sessionId ?? undefined,
    dealer_game_id: snapshot.dealerGameId ?? undefined,
    route: snapshot.route,
    active_tab: snapshot.activeTab,
    game_status: snapshot.shellPhase ?? undefined,
    game_type: snapshot.gameType ?? undefined,
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
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
      recordWaitingTableViolation('CHAT_AND_CARDS_ATTENTION_COLLISION', {
        sourceFile: 'shellTabAttentionInstrumentation.ts',
        sourceFunction: 'evaluateInvariants',
        resolvedValues: {
          chatTabFill: s.chatTabFill,
          cardsTabFill: s.cardsTabFill,
          chatGlyphPulse: s.chatGlyphPulse,
          cardsGlyphPulse: s.cardsGlyphPulse,
        },
        renderContinuation: 'render',
      });
    });
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
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
      recordWaitingTableViolation('SHELL_TABBAR_REMOUNT_DURING_CHAT_OPERATION', {
        sourceFile: 'shellTabAttentionInstrumentation.ts',
        sourceFunction: 'evaluateInvariants',
        inputValues: { prevRenderKey: prev.tabBarRenderKey, nextRenderKey: s.tabBarRenderKey },
        resolvedValues: { activeChatOperations: Array.from(activeChatOperations) },
        remountRequested: true,
        renderContinuation: 'render',
      });
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
      void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
        recordWaitingTableViolation('TAB_COLOR_STATE_CHANGED_DURING_CHAT_OPERATION', {
          sourceFile: 'shellTabAttentionInstrumentation.ts',
          sourceFunction: 'evaluateInvariants',
          inputValues: Object.fromEntries(diffs.map((f) => [f, prev[f]])),
          resolvedValues: Object.fromEntries(diffs.map((f) => [f, s[f]])),
          renderContinuation: 'render',
        });
      });
    }
  }

  // WAITING_TABLE_GAME_CONTROLLER_MISSING (derived: waiting table wants game logic but controller absent)
  if (s.waitingTableComponent && !s.gameControllerPresent && (s.localTurnEligible || s.currentTurnPlayerId)) {
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
      recordWaitingTableViolation('WAITING_TABLE_GAME_CONTROLLER_MISSING', {
        sourceFile: 'shellTabAttentionInstrumentation.ts',
        sourceFunction: 'evaluateInvariants',
        inputValues: { waitingTableComponent: s.waitingTableComponent },
        resolvedValues: {
          gameControllerPresent: s.gameControllerPresent,
          localTurnEligible: s.localTurnEligible,
          currentTurnPlayerId: s.currentTurnPlayerId,
        },
        renderContinuation: 'render',
      });
    });
  }

  // WAITING_TABLE_CURRENT_TURN_MISSING (derived: local turn eligible but no turn player id)
  if (s.waitingTableComponent && s.localTurnEligible && !s.currentTurnPlayerId) {
    void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
      recordWaitingTableViolation('WAITING_TABLE_CURRENT_TURN_MISSING', {
        sourceFile: 'shellTabAttentionInstrumentation.ts',
        sourceFunction: 'evaluateInvariants',
        resolvedValues: {
          localTurnEligible: s.localTurnEligible,
          currentTurnPlayerId: s.currentTurnPlayerId,
        },
        renderContinuation: 'render',
      });
    });
  }

  // WAITING_TABLE_CARDS_TAB_GAME_LOGIC_ENTERED / CHAT_TAB_GAME_LOGIC_ENTERED
  // Fire on active-tab transitions while waiting-table is mounted.
  if (s.waitingTableComponent && prev && prev.activeTab !== s.activeTab) {
    const eventName: 'WAITING_TABLE_CARDS_TAB_GAME_LOGIC_ENTERED' | 'WAITING_TABLE_CHAT_TAB_GAME_LOGIC_ENTERED' | null =
      s.activeTab === 'cards' ? 'WAITING_TABLE_CARDS_TAB_GAME_LOGIC_ENTERED'
      : s.activeTab === 'chat' ? 'WAITING_TABLE_CHAT_TAB_GAME_LOGIC_ENTERED'
      : null;
    if (eventName) {
      void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ recordWaitingTableViolation }) => {
        recordWaitingTableViolation(eventName, {
          sourceFile: 'shellTabAttentionInstrumentation.ts',
          sourceFunction: 'evaluateInvariants',
          inputValues: { prevActiveTab: prev.activeTab },
          resolvedValues: {
            activeTab: s.activeTab,
            gameControllerPresent: s.gameControllerPresent,
            waitingTableComponent: s.waitingTableComponent,
          },
          renderContinuation: 'render',
        });
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
  activeChatOperationRoles.set(correlationId, 'sender');
  activeChatOperationSnapshots.set(correlationId, lastSnapshot ? [lastSnapshot] : []);
  activeChatOperationBaselineWritten.delete(correlationId);
  activeChatOperationTerminalWritten.delete(correlationId);
  void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ registerActiveChatOperationForViolations }) => {
    registerActiveChatOperationForViolations(correlationId);
  });
  const openedSequence = nextInstrumentationSequence();
  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'CHAT_OPERATION_OPENED',
    severity: 'info',
    correlation_id: correlationId,
    payload: { sequence: openedSequence, snapshot: lastSnapshot, ...(extra ?? {}) },
  });
  // Forced sender baseline — bypasses signature de-dupe so the operation
  // always begins with a captured visual/context snapshot even when no
  // subsequent state change occurs.
  if (!activeChatOperationBaselineWritten.has(correlationId)) {
    activeChatOperationBaselineWritten.add(correlationId);
    writeForcedShellTabAttentionSnapshot('CHAT_OPERATION_BASELINE', correlationId, {
      openedSequence,
    });
  }
}

export function beginChatOperationSnapshotCapture(correlationId: string): void {
  const alreadyActive = activeChatOperations.has(correlationId);
  activeChatOperations.add(correlationId);
  activeChatOperationRoles.set(correlationId, 'peer');
  if (!activeChatOperationSnapshots.has(correlationId)) {
    activeChatOperationSnapshots.set(correlationId, lastSnapshot ? [lastSnapshot] : []);
  }
  void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ registerActiveChatOperationForViolations }) => {
    registerActiveChatOperationForViolations(correlationId);
  });
  const observedSequence = nextInstrumentationSequence();
  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'PEER_CHAT_OPERATION_OBSERVED',
    severity: 'info',
    correlation_id: correlationId,
    payload: { sequence: observedSequence, alreadyActive, snapshot: lastSnapshot },
  });
  if (!activeChatOperationBaselineWritten.has(correlationId)) {
    activeChatOperationBaselineWritten.add(correlationId);
    writeForcedShellTabAttentionSnapshot('PEER_OPERATION_BASELINE', correlationId, {
      observedSequence,
    });
  }
}

export function finalizeChatSendOperation(
  correlationId: string,
  outcome: 'success' | 'error' | 'aborted',
  extra?: Record<string, unknown>,
): void {
  if (!activeChatOperations.has(correlationId)) return;
  // Terminal snapshot — bypass signature de-dupe.
  writeChatOperationTerminalSnapshot(
    correlationId,
    (extra?.terminalReason as string) ?? `local-${outcome}`,
    outcome,
  );
  const snapshots = activeChatOperationSnapshots.get(correlationId) ?? [];
  activeChatOperations.delete(correlationId);
  activeChatOperationSnapshots.delete(correlationId);
  activeChatOperationRoles.delete(correlationId);
  activeChatOperationBaselineWritten.delete(correlationId);
  activeChatOperationTerminalWritten.delete(correlationId);
  void import('@/lib/waitingTable/waitingTableInstrumentation').then(({ clearActiveChatOperationForViolations }) => {
    clearActiveChatOperationForViolations(correlationId);
  });
  recordRuntimeEvent({
    event_family: 'chat',
    event_name: 'CHAT_OPERATION_FINALIZED',
    severity: outcome === 'error' ? 'warn' : 'info',
    correlation_id: correlationId,
    payload: {
      outcome,
      sequence: nextInstrumentationSequence(),
      snapshot: lastSnapshot,
      snapshots,
      ...(extra ?? {}),
    },
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
    if (activeChatOperationRoles.get(cid) === 'peer') {
      void import('@/lib/chatOperations/serverChatOperation').then(
        ({ appendChatPeerMilestone }) => {
          void appendChatPeerMilestone(
            cid,
            'SHELL_TAB_ATTENTION_SNAPSHOT',
            { reason: 'resolved-tab-state-changed' },
            null,
            [s],
          );
          // NOTE: Do NOT finalize the durable operation here. The
          // observation-window contract requires the operation to stay
          // open through the full 30 s post-receipt window so any real
          // terminator (sender-lost, navigation, auth, error boundary,
          // etc.) is captured. Tab-attention changes are evidence,
          // not terminal events.
        },
      );
    }
  }
}

export function getLastShellTabAttentionSnapshot(): ShellTabAttentionSnapshot | null {
  return lastSnapshot;
}

export function getChatOperationSnapshots(correlationId: string): ShellTabAttentionSnapshot[] {
  return activeChatOperationSnapshots.get(correlationId) ?? (lastSnapshot ? [lastSnapshot] : []);
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

