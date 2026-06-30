import type { GinRummyState } from '@/lib/ginRummyTypes';

export type GinPileTracePile = 'stock' | 'discard' | 'unknown' | null;

export interface GinPileTraceContextSnapshot {
  handContextId: string | null;
  phase: string | null;
  turnPhase: string | null;
  actionCount: number | null;
  isMyTurn: boolean | null;
  isPlayable: boolean | null;
  dealPhase: string | null;
  dealSettled: boolean | null;
  readyReleased: boolean | null;
  stockClickable: boolean | null;
  discardClickable: boolean | null;
  canDraw: boolean | null;
  canTakeFirstDraw: boolean | null;
  discardRevealed: boolean | null;
  stockRevealed: boolean | null;
}

export interface GinPileElementDescriptor {
  tag: string | null;
  id: string | null;
  className: string | null;
  dataAttributes: Record<string, string>;
  attributes: Record<string, string>;
}

export interface GinPileButtonDiagnostics {
  present: boolean;
  disabledAttribute: boolean | null;
  ariaDisabled: string | null;
  computedPointerEvents: string | null;
  computedZIndex: string | null;
  boundingRect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  } | null;
  elementFromPointAtCenter: GinPileElementDescriptor | null;
}

export interface GinPileTraceEvent extends GinPileTraceContextSnapshot {
  seq: number;
  timestamp: string;
  tMs: number;
  eventName: string;
  pile: GinPileTracePile;
  layer: string | null;
  domEventType: string | null;
  handlerName: string | null;
  handlerSelected: string | null;
  handlerInvoked: boolean | null;
  actionName: string | null;
  guardName: string | null;
  guardValues: Record<string, unknown> | null;
  target: GinPileElementDescriptor | null;
  currentTarget: GinPileElementDescriptor | null;
  defaultPrevented: boolean | null;
  propagationStopped: boolean | null;
  buttonDiagnostics: GinPileButtonDiagnostics | null;
  visibleChildDiagnostics: GinPileButtonDiagnostics | null;
  result: Record<string, unknown> | null;
  error: string | null;
  source: string | null;
}

export type GinPileTraceInput = Partial<Omit<GinPileTraceEvent, 'seq' | 'timestamp' | 'tMs'>>;

const MAX_EVENTS = 200;
const listeners = new Set<() => void>();
const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
let seq = 0;
let buffer: GinPileTraceEvent[] = [];
let snapshot: GinPileTraceEvent[] = [];

const DEFAULT_CONTEXT: GinPileTraceContextSnapshot = {
  handContextId: null,
  phase: null,
  turnPhase: null,
  actionCount: null,
  isMyTurn: null,
  isPlayable: null,
  dealPhase: null,
  dealSettled: null,
  readyReleased: null,
  stockClickable: null,
  discardClickable: null,
  canDraw: null,
  canTakeFirstDraw: null,
  discardRevealed: null,
  stockRevealed: null,
};

let latestContext: GinPileTraceContextSnapshot = { ...DEFAULT_CONTEXT };

const DEFAULT_EVENT: Omit<GinPileTraceEvent, 'seq' | 'timestamp' | 'tMs'> = {
  ...DEFAULT_CONTEXT,
  eventName: 'UNKNOWN',
  pile: null,
  layer: null,
  domEventType: null,
  handlerName: null,
  handlerSelected: null,
  handlerInvoked: null,
  actionName: null,
  guardName: null,
  guardValues: null,
  target: null,
  currentTarget: null,
  defaultPrevented: null,
  propagationStopped: null,
  buttonDiagnostics: null,
  visibleChildDiagnostics: null,
  result: null,
  error: null,
  source: null,
};

function notify() {
  snapshot = buffer.slice();
  for (const listener of listeners) {
    try { listener(); } catch { /* debug surface must never affect gameplay */ }
  }
}

export function recordGinPileTrace(eventName: string, input: GinPileTraceInput = {}): void {
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  buffer.push({
    ...DEFAULT_EVENT,
    ...input,
    eventName,
    seq: ++seq,
    timestamp: new Date().toISOString(),
    tMs: Math.round(now - t0),
  });
  while (buffer.length > MAX_EVENTS) buffer.shift();
  notify();
}

export function setLatestGinPileTraceContext(context: GinPileTraceContextSnapshot): void {
  latestContext = { ...context };
}

export function getLatestGinPileTraceContext(): GinPileTraceContextSnapshot {
  return latestContext;
}

export function withLatestGinPileTraceContext(input: GinPileTraceInput = {}): GinPileTraceInput {
  return { ...latestContext, ...input };
}

export function clearGinPileTrace(): void {
  buffer = [];
  notify();
}

export function getGinPileTrace(): GinPileTraceEvent[] {
  return snapshot;
}

export function subscribeGinPileTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function roundRectValue(value: number): number {
  return Math.round(value * 100) / 100;
}

export function describeGinPileElement(target: EventTarget | Element | null | undefined): GinPileElementDescriptor | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  const dataAttributes: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(target.attributes)) {
    if (attr.name.startsWith('data-')) dataAttributes[attr.name] = attr.value;
    if (
      attr.name.startsWith('data-') ||
      attr.name === 'class' ||
      attr.name === 'id' ||
      attr.name === 'type' ||
      attr.name === 'disabled' ||
      attr.name === 'aria-disabled' ||
      attr.name === 'role'
    ) {
      attributes[attr.name] = attr.value;
    }
  }
  return {
    tag: target.tagName?.toLowerCase() ?? null,
    id: target.id || null,
    className: typeof target.className === 'string' ? target.className || null : String(target.className || '') || null,
    dataAttributes,
    attributes,
  };
}

export function getGinPileButtonDiagnostics(element: HTMLElement | null | undefined): GinPileButtonDiagnostics {
  if (!element || typeof window === 'undefined') {
    return {
      present: !!element,
      disabledAttribute: element ? element.hasAttribute('disabled') : null,
      ariaDisabled: element?.getAttribute('aria-disabled') ?? null,
      computedPointerEvents: null,
      computedZIndex: null,
      boundingRect: null,
      elementFromPointAtCenter: null,
    };
  }

  const computed = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const hit = Number.isFinite(centerX) && Number.isFinite(centerY)
    ? document.elementFromPoint(centerX, centerY)
    : null;

  return {
    present: true,
    disabledAttribute: element.hasAttribute('disabled'),
    ariaDisabled: element.getAttribute('aria-disabled'),
    computedPointerEvents: computed.pointerEvents,
    computedZIndex: computed.zIndex,
    boundingRect: {
      x: roundRectValue(rect.x),
      y: roundRectValue(rect.y),
      width: roundRectValue(rect.width),
      height: roundRectValue(rect.height),
      top: roundRectValue(rect.top),
      right: roundRectValue(rect.right),
      bottom: roundRectValue(rect.bottom),
      left: roundRectValue(rect.left),
    },
    elementFromPointAtCenter: describeGinPileElement(hit),
  };
}

export function describeGinPileEvent(event: unknown): Pick<GinPileTraceEvent, 'target' | 'currentTarget' | 'defaultPrevented' | 'propagationStopped' | 'domEventType'> {
  const e = event as {
    type?: string;
    target?: EventTarget | null;
    currentTarget?: EventTarget | null;
    defaultPrevented?: boolean;
    isPropagationStopped?: () => boolean;
    nativeEvent?: { cancelBubble?: boolean };
  } | null;
  const stopped = typeof e?.isPropagationStopped === 'function'
    ? e.isPropagationStopped()
    : Boolean(e?.nativeEvent?.cancelBubble);
  return {
    domEventType: e?.type ?? null,
    target: describeGinPileElement(e?.target),
    currentTarget: describeGinPileElement(e?.currentTarget),
    defaultPrevented: typeof e?.defaultPrevented === 'boolean' ? e.defaultPrevented : null,
    propagationStopped: stopped,
  };
}

export function resolveGinPileFromEvent(event: unknown): GinPileTracePile {
  const e = event as { target?: EventTarget | null } | null;
  if (typeof Element === 'undefined' || !(e?.target instanceof Element)) return 'unknown';
  const pileEl = e.target.closest('[data-gin-pile]');
  const pile = pileEl?.getAttribute('data-gin-pile');
  return pile === 'stock' || pile === 'discard' ? pile : 'unknown';
}

export function buildGinPileContext(args: {
  ginState: GinRummyState | null | undefined;
  currentPlayerId: string | null | undefined;
  handContextId: string | null | undefined;
  isPlayable: boolean | null | undefined;
  dealPhase?: string | null;
  dealSettled?: boolean | null;
  readyReleased?: boolean | null;
  stockClickable?: boolean | null;
  discardClickable?: boolean | null;
  canDraw?: boolean | null;
  canTakeFirstDraw?: boolean | null;
  discardRevealed?: boolean | null;
  stockRevealed?: boolean | null;
}): GinPileTraceContextSnapshot {
  const ginState = args.ginState ?? null;
  return {
    handContextId: args.handContextId ?? null,
    phase: ginState?.phase ?? null,
    turnPhase: ginState?.turnPhase ?? null,
    actionCount: ginState?.actionCount ?? null,
    isMyTurn: ginState && args.currentPlayerId ? ginState.currentTurnPlayerId === args.currentPlayerId : null,
    isPlayable: args.isPlayable ?? null,
    dealPhase: args.dealPhase ?? null,
    dealSettled: args.dealSettled ?? null,
    readyReleased: args.readyReleased ?? null,
    stockClickable: args.stockClickable ?? null,
    discardClickable: args.discardClickable ?? null,
    canDraw: args.canDraw ?? null,
    canTakeFirstDraw: args.canTakeFirstDraw ?? null,
    discardRevealed: args.discardRevealed ?? null,
    stockRevealed: args.stockRevealed ?? null,
  };
}

function compact(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function formatGinPileTraceAsText(snapshotOverride = buffer): string {
  const lines = ['# GIN PILE TRACE (oldest first)'];
  for (const e of snapshotOverride) {
    lines.push([
      `#${e.seq}`,
      `+${e.tMs}ms`,
      e.timestamp,
      e.eventName,
      `pile=${compact(e.pile)}`,
      `layer=${compact(e.layer)}`,
      `domEventType=${compact(e.domEventType)}`,
      `handContextId=${compact(e.handContextId)}`,
      `phase=${compact(e.phase)}`,
      `turnPhase=${compact(e.turnPhase)}`,
      `actionCount=${compact(e.actionCount)}`,
      `isMyTurn=${compact(e.isMyTurn)}`,
      `isPlayable=${compact(e.isPlayable)}`,
      `deal.phase=${compact(e.dealPhase)}`,
      `dealSettled=${compact(e.dealSettled)}`,
      `readyReleased=${compact(e.readyReleased)}`,
      `stockClickable=${compact(e.stockClickable)}`,
      `discardClickable=${compact(e.discardClickable)}`,
      `canDraw=${compact(e.canDraw)}`,
      `canTakeFirstDraw=${compact(e.canTakeFirstDraw)}`,
      `discardRevealed=${compact(e.discardRevealed)}`,
      `stockRevealed=${compact(e.stockRevealed)}`,
      `handlerName=${compact(e.handlerName)}`,
      `handlerSelected=${compact(e.handlerSelected)}`,
      `handlerInvoked=${compact(e.handlerInvoked)}`,
      `actionName=${compact(e.actionName)}`,
      `guardName=${compact(e.guardName)}`,
      `guardValues=${compact(e.guardValues)}`,
      `target=${compact(e.target)}`,
      `currentTarget=${compact(e.currentTarget)}`,
      `event.defaultPrevented=${compact(e.defaultPrevented)}`,
      `event.propagationStopped=${compact(e.propagationStopped)}`,
      `buttonDiagnostics=${compact(e.buttonDiagnostics)}`,
      `visibleChildDiagnostics=${compact(e.visibleChildDiagnostics)}`,
      `result=${compact(e.result)}`,
      `error=${compact(e.error)}`,
      `source=${compact(e.source)}`,
    ].join(' | '));
  }
  return lines.join('\n');
}

if (typeof window !== 'undefined') {
  (window as any).__ginPileTraceExport = formatGinPileTraceAsText;
  (window as any).__ginPileTraceEvents = getGinPileTrace;
}