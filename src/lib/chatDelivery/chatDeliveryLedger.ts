type ChatLifecyclePhase =
  | 'send-intent'
  | 'optimistic-merged'
  | 'insert-success'
  | 'insert-error'
  | 'realtime-subscribe-start'
  | 'realtime-subscribe-status'
  | 'realtime-unsubscribe'
  | 'realtime-insert-received'
  | 'realtime-payload-admitted'
  | 'store-message-merged'
  | 'hydration-start'
  | 'hydration-merge'
  | 'optimistic-reconciliation'
  | 'canonical-projection-updated'
  | 'identity-change'
  | 'consumer-mounted'
  | 'consumer-unmounted'
  | 'selector-recomputed'
  | 'react-render-observed'
  | 'chat-panel-open'
  | 'chat-panel-closed'
  | 'chat-message-mounted'
  | 'unread-evaluation-start'
  | 'unread-eligibility-resolved'
  | 'indicator-requested'
  | 'indicator-mounted'
  | 'indicator-suppressed'
  | 'indicator-cleared'
  | 'read-cursor-advanced'
  | 'realtime-eligible-observed'
  | 'console-chat-indicator';

export type ChatDeliveryViolation =
  | 'CHAT_MESSAGE_WRITE_NOT_CONFIRMED'
  | 'CHAT_REALTIME_DELIVERED_BUT_NOT_ADMITTED'
  | 'CHAT_ADMITTED_BUT_NOT_RENDERED'
  | 'CHAT_RENDERED_BUT_UNREAD_NOT_SET'
  | 'CHAT_UNREAD_SET_BUT_INDICATOR_NOT_MOUNTED'
  | 'CHAT_INDICATOR_CLEARED_WITHOUT_READ'
  | 'CHAT_SESSION_OR_GAME_FILTER_MISMATCH'
  | 'CHAT_REALTIME_SUBSCRIPTION_NOT_READY'
  | 'CHAT_REMOTE_MESSAGE_NEVER_EVALUATED_FOR_UNREAD'
  | 'CHAT_STORE_MESSAGE_EXCLUDED_FROM_PLAYER_LIST'
  | 'CHAT_MESSAGE_CLASSIFIED_AS_DEALER_OR_SYSTEM_UNEXPECTEDLY'
  | 'CHAT_STORE_RENDER_COUNT_MISMATCH'
  | 'CHAT_CANONICAL_PROJECTION_UPDATED_CONSUMER_STALE'
  | 'CHAT_PANEL_SELECTOR_EXCLUDES_REMOTE_MESSAGE'
  | 'CHAT_UNREAD_SELECTOR_NEVER_RECEIVES_REMOTE_MESSAGE'
  | 'CHAT_SELECTOR_BOUND_TO_STALE_GAME_OR_DEALER_ID'
  | 'CHAT_CONSUMER_NOT_SUBSCRIBED_TO_CANONICAL_STORE'
  | 'CHAT_CANONICAL_STORE_REPLACED_OR_WIPED';

export type ChatDeliveryConsumer =
  | 'canonical-store'
  | 'MobileChatPanel'
  | 'player-list-selector'
  | 'dealer-system-selector'
  | 'unread-selector'
  | 'indicator-selector'
  | 'Game.tsx'
  | 'MobileGameTable';

type ChatLikeMessage = {
  id: string;
  game_id?: string;
  user_id?: string | null;
  message?: string | null;
  image_url?: string | null;
  username?: string | null;
  created_at?: string | null;
};

type ChatEvent = {
  seq: number;
  ts: number;
  iso: string;
  clientInstanceId: string;
  phase: ChatLifecyclePhase;
  messageId?: string | null;
  gameId?: string | null;
  dealerGameId?: string | null;
  consumer?: ChatDeliveryConsumer;
  payload?: Record<string, unknown>;
};

type ChatViolationRecord = {
  seq: number;
  ts: number;
  iso: string;
  clientInstanceId: string;
  violation: ChatDeliveryViolation;
  messageId?: string | null;
  gameId?: string | null;
  consumer?: ChatDeliveryConsumer;
  payload?: Record<string, unknown>;
};

type ProjectionSnapshot = {
  refId: string;
  version: number;
  length: number;
  ids: string[];
  remoteIds: string[];
  gameId: string | null;
  dealerGameId?: string | null;
};

type ChatLedgerState = {
  schemaVersion: 2;
  clientInstanceId: string;
  createdAt: string;
  seq: number;
  events: ChatEvent[];
  violations: ChatViolationRecord[];
  messages: Record<string, { id: string; phases: string[]; lastTs: number; gameId?: string | null }>;
  projection: ProjectionSnapshot | null;
  consumerSubscriptions: Record<string, { mounted: boolean; lastMountTs: number; lastUnmountTs?: number }>;
};

const STORAGE_KEY = 'CHAT_DELIVERY_LEDGER_V2';
const SESSION_ID_KEY = 'CHAT_DELIVERY_CLIENT_INSTANCE_ID';
const MAX_EVENTS = 800;
const MAX_VIOLATIONS = 300;
const MAX_MESSAGES = 160;

let memoryState: ChatLedgerState | null = null;
let seqFallback = 0;
const refIds = new WeakMap<object, string>();
let refSeq = 0;
let projectionVersion = 0;
let consoleTapInstalled = false;

type RemoteExpectation = {
  messageId: string;
  gameId: string | null;
  projectionVersion: number;
  expectedConsumers: Set<ChatDeliveryConsumer>;
  seenConsumers: Set<ChatDeliveryConsumer>;
  timeoutId: number | null;
};

const remoteExpectations = new Map<string, RemoteExpectation>();

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getChatDeliveryClientInstanceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(SESSION_ID_KEY, next);
  return next;
}

function initialState(): ChatLedgerState {
  return {
    schemaVersion: 2,
    clientInstanceId: getChatDeliveryClientInstanceId(),
    createdAt: new Date().toISOString(),
    seq: 0,
    events: [],
    violations: [],
    messages: {},
    projection: null,
    consumerSubscriptions: {},
  };
}

function loadState(): ChatLedgerState {
  if (memoryState) return memoryState;
  if (typeof window === 'undefined') {
    memoryState = initialState();
    return memoryState;
  }
  const parsed = safeParse<ChatLedgerState>(window.localStorage.getItem(STORAGE_KEY));
  memoryState = parsed?.schemaVersion === 2 ? parsed : initialState();
  memoryState.clientInstanceId = getChatDeliveryClientInstanceId();
  return memoryState;
}

function saveState(state: ChatLedgerState) {
  memoryState = state;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('chat-delivery-ledger-updated'));
  } catch {
    // Diagnostics must never affect gameplay.
  }
}

export function getCollectionRefId(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value !== 'object' && typeof value !== 'function') return `${typeof value}:${String(value)}`;
  const obj = value as object;
  let id = refIds.get(obj);
  if (!id) {
    id = `ref#${++refSeq}`;
    refIds.set(obj, id);
  }
  return id;
}

function compactMessage(msg: ChatLikeMessage | null | undefined) {
  if (!msg) return null;
  return {
    id: msg.id,
    game_id: msg.game_id ?? null,
    user_id: msg.user_id ?? null,
    hasText: Boolean(msg.message),
    hasImage: Boolean(msg.image_url),
    username: msg.username ?? null,
    created_at: msg.created_at ?? null,
  };
}

function ids(messages: readonly ChatLikeMessage[] | null | undefined): string[] {
  return (messages ?? []).map((m) => m.id).filter(Boolean);
}

function isDealerOrSystem(message: ChatLikeMessage) {
  return message.id?.startsWith('dealer-') || !message.user_id;
}

function isRemoteHuman(message: ChatLikeMessage, currentUserId?: string | null) {
  if (!message.id || isDealerOrSystem(message)) return false;
  if (!message.user_id) return false;
  return !currentUserId || message.user_id !== currentUserId;
}

function touchMessage(state: ChatLedgerState, messageId: string | null | undefined, phase: string, gameId?: string | null) {
  if (!messageId) return;
  const record = state.messages[messageId] ?? { id: messageId, phases: [], lastTs: 0, gameId: gameId ?? null };
  if (!record.phases.includes(phase)) record.phases.push(phase);
  record.lastTs = Date.now();
  record.gameId = gameId ?? record.gameId ?? null;
  state.messages[messageId] = record;
  const entries = Object.entries(state.messages);
  if (entries.length > MAX_MESSAGES) {
    entries
      .sort((a, b) => a[1].lastTs - b[1].lastTs)
      .slice(0, entries.length - MAX_MESSAGES)
      .forEach(([id]) => delete state.messages[id]);
  }
}

export function recordChatDeliveryEvent(input: {
  phase: ChatLifecyclePhase;
  message?: ChatLikeMessage | null;
  messageId?: string | null;
  gameId?: string | null;
  dealerGameId?: string | null;
  consumer?: ChatDeliveryConsumer;
  payload?: Record<string, unknown>;
}) {
  const state = loadState();
  const messageId = input.messageId ?? input.message?.id ?? null;
  const gameId = input.gameId ?? input.message?.game_id ?? null;
  const event: ChatEvent = {
    seq: ++state.seq,
    ts: now(),
    iso: new Date().toISOString(),
    clientInstanceId: state.clientInstanceId,
    phase: input.phase,
    messageId,
    gameId,
    dealerGameId: input.dealerGameId ?? null,
    consumer: input.consumer,
    payload: {
      ...(input.message ? { message: compactMessage(input.message) } : {}),
      ...(input.payload ?? {}),
    },
  };
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  touchMessage(state, messageId, input.phase, gameId);
  saveState(state);
}

export function recordChatDeliveryViolation(input: {
  violation: ChatDeliveryViolation;
  message?: ChatLikeMessage | null;
  messageId?: string | null;
  gameId?: string | null;
  consumer?: ChatDeliveryConsumer;
  payload?: Record<string, unknown>;
}) {
  const state = loadState();
  const messageId = input.messageId ?? input.message?.id ?? null;
  const gameId = input.gameId ?? input.message?.game_id ?? null;
  const dupe = state.violations.some((v) =>
    v.violation === input.violation &&
    v.messageId === messageId &&
    v.consumer === input.consumer &&
    Date.now() - new Date(v.iso).getTime() < 10_000
  );
  if (dupe) return;
  const violation: ChatViolationRecord = {
    seq: ++state.seq,
    ts: now(),
    iso: new Date().toISOString(),
    clientInstanceId: state.clientInstanceId,
    violation: input.violation,
    messageId,
    gameId,
    consumer: input.consumer,
    payload: {
      ...(input.message ? { message: compactMessage(input.message) } : {}),
      ...(input.payload ?? {}),
    },
  };
  state.violations.push(violation);
  if (state.violations.length > MAX_VIOLATIONS) state.violations.splice(0, state.violations.length - MAX_VIOLATIONS);
  saveState(state);
}

export function recordConsumerSubscription(input: {
  consumer: ChatDeliveryConsumer;
  mounted: boolean;
  gameId?: string | null;
  dealerGameId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const state = loadState();
  const existing = state.consumerSubscriptions[input.consumer] ?? { mounted: false, lastMountTs: 0 };
  if (input.mounted) {
    existing.mounted = true;
    existing.lastMountTs = Date.now();
  } else {
    existing.mounted = false;
    existing.lastUnmountTs = Date.now();
  }
  state.consumerSubscriptions[input.consumer] = existing;
  saveState(state);
  recordChatDeliveryEvent({
    phase: input.mounted ? 'consumer-mounted' : 'consumer-unmounted',
    consumer: input.consumer,
    gameId: input.gameId,
    dealerGameId: input.dealerGameId,
    payload: input.payload,
  });
}

export function recordCanonicalProjection(input: {
  source: 'hydration-merge' | 'realtime-merge' | 'optimistic-reconciliation' | 'optimistic-merged' | 'identity-change' | 'players-patch';
  messages: readonly ChatLikeMessage[];
  gameId?: string | null;
  dealerGameId?: string | null;
  currentUserId?: string | null;
  incomingIds?: string[];
  prevIds?: string[];
  payload?: Record<string, unknown>;
}) {
  const refId = getCollectionRefId(input.messages);
  const messageIds = ids(input.messages);
  const remoteIds = (input.messages ?? [])
    .filter((m) => isRemoteHuman(m, input.currentUserId))
    .map((m) => m.id);
  const state = loadState();
  const previous = state.projection;
  const replacedOrWiped = Boolean(
    previous &&
    previous.length > 0 &&
    input.messages.length === 0 &&
    input.source !== 'identity-change'
  );
  const refChangedWithoutVersionSource = Boolean(
    previous && previous.refId !== refId && input.messages.length < previous.length && input.source !== 'identity-change'
  );
  projectionVersion += 1;
  state.projection = {
    refId,
    version: projectionVersion,
    length: input.messages.length,
    ids: messageIds,
    remoteIds,
    gameId: input.gameId ?? null,
    dealerGameId: input.dealerGameId ?? null,
  };
  saveState(state);

  const phase: ChatLifecyclePhase = input.source === 'hydration-merge'
    ? 'hydration-merge'
    : input.source === 'optimistic-reconciliation'
      ? 'optimistic-reconciliation'
      : input.source === 'identity-change'
        ? 'identity-change'
        : input.source === 'optimistic-merged'
          ? 'optimistic-merged'
          : 'store-message-merged';

  recordChatDeliveryEvent({
    phase,
    gameId: input.gameId,
    dealerGameId: input.dealerGameId,
    consumer: 'canonical-store',
    payload: {
      source: input.source,
      refId,
      version: projectionVersion,
      length: input.messages.length,
      ids: messageIds,
      remoteIds,
      incomingIds: input.incomingIds ?? [],
      prevIds: input.prevIds ?? [],
      previous,
      ...(input.payload ?? {}),
    },
  });
  recordChatDeliveryEvent({
    phase: 'canonical-projection-updated',
    gameId: input.gameId,
    dealerGameId: input.dealerGameId,
    consumer: 'canonical-store',
    payload: { refId, version: projectionVersion, length: input.messages.length, ids: messageIds, remoteIds, source: input.source },
  });

  if (replacedOrWiped || refChangedWithoutVersionSource) {
    recordChatDeliveryViolation({
      violation: 'CHAT_CANONICAL_STORE_REPLACED_OR_WIPED',
      gameId: input.gameId,
      consumer: 'canonical-store',
      payload: { previous, next: state.projection, source: input.source },
    });
  }

  remoteIds.forEach((messageId) => {
    armRemoteConsumerExpectations({ messageId, gameId: input.gameId ?? null, projectionVersion, source: input.source });
  });
}

function armRemoteConsumerExpectations(input: { messageId: string; gameId: string | null; projectionVersion: number; source: string }) {
  const expectedConsumers: ChatDeliveryConsumer[] = [
    'player-list-selector',
    'unread-selector',
    'indicator-selector',
    'Game.tsx',
    'MobileGameTable',
  ];
  const existing = remoteExpectations.get(input.messageId);
  if (existing?.timeoutId) window.clearTimeout(existing.timeoutId);
  const expectation: RemoteExpectation = {
    messageId: input.messageId,
    gameId: input.gameId,
    projectionVersion: input.projectionVersion,
    expectedConsumers: new Set(expectedConsumers),
    seenConsumers: existing?.seenConsumers ?? new Set(),
    timeoutId: null,
  };
  remoteExpectations.set(input.messageId, expectation);

  if (typeof window !== 'undefined') {
    expectation.timeoutId = window.setTimeout(() => {
      const latest = remoteExpectations.get(input.messageId);
      if (!latest) return;
      const missing = Array.from(latest.expectedConsumers).filter((consumer) => !latest.seenConsumers.has(consumer));
      if (missing.length > 0) {
        recordChatDeliveryViolation({
          violation: 'CHAT_CANONICAL_PROJECTION_UPDATED_CONSUMER_STALE',
          messageId: input.messageId,
          gameId: input.gameId,
          payload: { missing, projectionVersion: input.projectionVersion, source: input.source },
        });
      }
      if (!latest.seenConsumers.has('unread-selector')) {
        recordChatDeliveryViolation({
          violation: 'CHAT_REMOTE_MESSAGE_NEVER_EVALUATED_FOR_UNREAD',
          messageId: input.messageId,
          gameId: input.gameId,
          consumer: 'unread-selector',
          payload: { projectionVersion: input.projectionVersion, source: input.source },
        });
        recordChatDeliveryViolation({
          violation: 'CHAT_UNREAD_SELECTOR_NEVER_RECEIVES_REMOTE_MESSAGE',
          messageId: input.messageId,
          gameId: input.gameId,
          consumer: 'unread-selector',
          payload: { projectionVersion: input.projectionVersion, source: input.source },
        });
      }
    }, 250);
  }
}

export function recordSelectorProof(input: {
  consumer: ChatDeliveryConsumer;
  selectorName: string;
  sourceCollection: readonly ChatLikeMessage[] | null | undefined;
  returnedCollection?: readonly ChatLikeMessage[] | null | undefined;
  returnedIds?: string[];
  gameId?: string | null;
  dealerGameId?: string | null;
  currentUserId?: string | null;
  memoInputs?: Record<string, unknown>;
  dependencyInputs?: Record<string, unknown>;
  outputReasonById?: Record<string, unknown>;
  phase?: ChatLifecyclePhase;
}) {
  const sourceIds = ids(input.sourceCollection ?? []);
  const returnedIds = input.returnedIds ?? ids(input.returnedCollection ?? []);
  const remoteSourceIds = (input.sourceCollection ?? [])
    .filter((m) => isRemoteHuman(m, input.currentUserId))
    .map((m) => m.id);
  const sourceRefId = getCollectionRefId(input.sourceCollection ?? null);
  const returnedRefId = input.returnedCollection ? getCollectionRefId(input.returnedCollection) : 'manual-output';
  const projection = getChatDeliveryLedger().projection;

  recordChatDeliveryEvent({
    phase: input.phase ?? 'selector-recomputed',
    consumer: input.consumer,
    gameId: input.gameId,
    dealerGameId: input.dealerGameId,
    payload: {
      selectorName: input.selectorName,
      recomputeTs: now(),
      sourceRefId,
      returnedRefId,
      sourceProjectionVersion: projection?.version ?? null,
      sourceLength: input.sourceCollection?.length ?? 0,
      returnedLength: returnedIds.length,
      sourceIds,
      returnedIds,
      remoteSourceIds,
      memoInputs: input.memoInputs ?? {},
      dependencyInputs: input.dependencyInputs ?? {},
      outputReasonById: input.outputReasonById ?? {},
    },
  });

  remoteSourceIds.forEach((messageId) => {
    const expectation = remoteExpectations.get(messageId);
    if (expectation) expectation.seenConsumers.add(input.consumer);
  });

  if ((input.consumer === 'player-list-selector' || input.consumer === 'MobileChatPanel') && remoteSourceIds.some((id) => !returnedIds.includes(id))) {
    recordChatDeliveryViolation({
      violation: input.consumer === 'MobileChatPanel'
        ? 'CHAT_PANEL_SELECTOR_EXCLUDES_REMOTE_MESSAGE'
        : 'CHAT_STORE_MESSAGE_EXCLUDED_FROM_PLAYER_LIST',
      gameId: input.gameId,
      consumer: input.consumer,
      payload: { selectorName: input.selectorName, missingRemoteIds: remoteSourceIds.filter((id) => !returnedIds.includes(id)), sourceIds, returnedIds },
    });
  }

  if (input.consumer === 'unread-selector' && remoteSourceIds.length > 0 && !remoteSourceIds.some((id) => returnedIds.includes(id))) {
    recordChatDeliveryViolation({
      violation: 'CHAT_UNREAD_SELECTOR_NEVER_RECEIVES_REMOTE_MESSAGE',
      gameId: input.gameId,
      consumer: input.consumer,
      payload: { selectorName: input.selectorName, remoteSourceIds, returnedIds },
    });
  }

  if (projection?.gameId && input.gameId && projection.gameId !== input.gameId) {
    recordChatDeliveryViolation({
      violation: 'CHAT_SELECTOR_BOUND_TO_STALE_GAME_OR_DEALER_ID',
      gameId: input.gameId,
      consumer: input.consumer,
      payload: { projectionGameId: projection.gameId, selectorGameId: input.gameId, dealerGameId: input.dealerGameId, selectorName: input.selectorName },
    });
  }
}

export function recordReactRenderObserved(input: {
  consumer: ChatDeliveryConsumer;
  sourceCollection?: readonly ChatLikeMessage[] | null;
  gameId?: string | null;
  dealerGameId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const projection = getChatDeliveryLedger().projection;
  recordChatDeliveryEvent({
    phase: 'react-render-observed',
    consumer: input.consumer,
    gameId: input.gameId,
    dealerGameId: input.dealerGameId,
    payload: {
      renderTs: now(),
      sourceRefId: getCollectionRefId(input.sourceCollection ?? null),
      sourceLength: input.sourceCollection?.length ?? 0,
      sourceIds: ids(input.sourceCollection ?? []),
      projectionVersion: projection?.version ?? null,
      projectionRefId: projection?.refId ?? null,
      ...(input.payload ?? {}),
    },
  });
}

export function markUnreadEvaluated(input: {
  message: ChatLikeMessage;
  gameId?: string | null;
  eligible: boolean;
  reason?: string;
  selectorIds?: string[];
  activeTab?: string;
}) {
  recordChatDeliveryEvent({
    phase: 'unread-eligibility-resolved',
    message: input.message,
    gameId: input.gameId,
    consumer: 'unread-selector',
    payload: {
      eligible: input.eligible,
      reason: input.reason ?? null,
      selectorIds: input.selectorIds ?? [],
      activeTab: input.activeTab ?? null,
    },
  });
  const expectation = remoteExpectations.get(input.message.id);
  if (expectation) expectation.seenConsumers.add('unread-selector');
}

export function getChatDeliveryLedger(): ChatLedgerState {
  return loadState();
}

export function exportChatDeliveryLedger(): string {
  return JSON.stringify(loadState(), null, 2);
}

export function clearChatDeliveryLedger() {
  memoryState = initialState();
  projectionVersion = 0;
  remoteExpectations.clear();
  saveState(memoryState);
}

export function installChatDeliveryConsoleTap() {
  if (consoleTapInstalled || typeof window === 'undefined') return;
  consoleTapInstalled = true;
  const originalLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    try {
      const first = args[0];
      if (typeof first === 'string' && (first.startsWith('[chat-indicator]') || first.startsWith('[holm-chat-indicator]'))) {
        recordChatDeliveryEvent({
          phase: 'console-chat-indicator',
          consumer: 'indicator-selector',
          payload: {
            label: first,
            args: args.slice(1).map((arg) => {
              try { return JSON.parse(JSON.stringify(arg)); } catch { return String(arg); }
            }),
          },
        });
      }
    } catch {
      // ignore
    }
    originalLog(...args);
  };
}

export function validateActiveChatConsumers(gameId?: string | null) {
  const state = loadState();
  const required: ChatDeliveryConsumer[] = ['Game.tsx', 'MobileGameTable', 'unread-selector', 'indicator-selector'];
  required.forEach((consumer) => {
    if (!state.consumerSubscriptions[consumer]?.mounted) {
      recordChatDeliveryViolation({
        violation: 'CHAT_CONSUMER_NOT_SUBSCRIBED_TO_CANONICAL_STORE',
        consumer,
        gameId,
        payload: { required, subscriptions: state.consumerSubscriptions },
      });
    }
  });
}
