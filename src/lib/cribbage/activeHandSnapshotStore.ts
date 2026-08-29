/**
 * Submit-time Cribbage presentation snapshot for visual bug reports.
 *
 * The latest state stays in memory after the Cards subtree unmounts so an
 * unmount/disappearance defect remains reportable. Capture is game-scoped,
 * preventing a stale Cribbage snapshot from attaching to another session.
 */

import {
  captureCribbageForensicTail,
  type CribbageForensicEntry,
} from './forensicTrace';

export interface CribbageActiveHandSnapshotPublished {
  gameId: string;
  dealerGameId: string | null;
  viewerPlayerId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  authoritativeHandCount: number;
  sourceHandCount: number;
  presentationHandCount: number;
  clippedHandCount: number;
  renderedHandCount: number;
  resolverDecision: string | null;
  resolverReason: string | null;
  decisionKind: string | null;
  dealPhase: string | null;
  activeIntentCountForHand: number | null;
  settledCardCountForViewer: number | null;
  cribbagePhase: string | null;
  renderHandKey: string | null;
  currentHandKey: string | null;
  parentSuppressed: boolean;
  activeHandBlocked: boolean;
  roundIdentityMismatch: boolean;
  handIdentityMismatch: boolean;
  emptyStageEarlyReturnActive: boolean;
  dealingPartialRevealActive: boolean;
  interactionsAllowed: boolean;
  isProcessing: boolean;
  selectedCardCount: number;
  expectedDiscardCount: number;
  discardButtonDisabled: boolean;
  haveDiscarded: boolean;
  isMyTurn: boolean;
  canPlayAnyCard: boolean;
  currentCount: number;
  currentTurnPlayerId: string | null;
  peggingBoundaryBlocked: boolean;
  selfPlayUnresolved: boolean;
}

interface ElementDescriptor {
  tag: string;
  id: string | null;
  className: string | null;
  role: string | null;
  authoritativeActionSurface: string | null;
}

interface DiscardControlSnapshot {
  present: boolean;
  disabled: boolean | null;
  ariaDisabled: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  computedStyle: {
    display: string;
    visibility: string;
    pointerEvents: string;
    opacity: string;
    zIndex: string;
  } | null;
  centerPointInsideViewport: boolean;
  topElementAtCenter: ElementDescriptor | null;
  elementStackAtCenter: ElementDescriptor[];
  coveredAtCenter: boolean | null;
}

export interface CribbageActiveHandCapturedSnapshot
  extends CribbageActiveHandSnapshotPublished {
  mountedAtCapture: boolean;
  lastPublishedAt: string;
  unmountedAt: string | null;
  activeHandDomWrapperCount: number;
  activeHandDomCardCount: number;
  unexpectedAuthoritativeCardsButEmptyDom: boolean;
  discardControl: DiscardControlSnapshot;
  forensicTail: CribbageForensicEntry[];
  capturedAt: string;
}

interface StoredSnapshot {
  value: CribbageActiveHandSnapshotPublished;
  mounted: boolean;
  publishedAt: string;
  unmountedAt: string | null;
}

let latest: StoredSnapshot | null = null;

function describeElement(element: Element | null): ElementDescriptor | null {
  if (!element) return null;
  const htmlElement = element as HTMLElement;
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    className: typeof htmlElement.className === 'string'
      ? htmlElement.className.slice(0, 240) || null
      : null,
    role: element.getAttribute('role'),
    authoritativeActionSurface: element.getAttribute('data-authoritative-action-surface'),
  };
}

function captureDiscardControl(): DiscardControlSnapshot {
  const absent: DiscardControlSnapshot = {
    present: false,
    disabled: null,
    ariaDisabled: null,
    rect: null,
    computedStyle: null,
    centerPointInsideViewport: false,
    topElementAtCenter: null,
    elementStackAtCenter: [],
    coveredAtCenter: null,
  };
  try {
    if (typeof document === 'undefined' || typeof window === 'undefined') return absent;
    const control = document.querySelector(
      '[data-authoritative-action-surface="cribbage-discard"]',
    ) as HTMLButtonElement | null;
    if (!control) return absent;

    const rect = control.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const centerPointInsideViewport =
      rect.width > 0 &&
      rect.height > 0 &&
      centerX >= 0 &&
      centerY >= 0 &&
      centerX <= window.innerWidth &&
      centerY <= window.innerHeight;
    const stack = centerPointInsideViewport && typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(centerX, centerY).slice(0, 8)
      : [];
    const top = stack[0] ?? null;
    const style = window.getComputedStyle(control);

    return {
      present: true,
      disabled: control.disabled,
      ariaDisabled: control.getAttribute('aria-disabled'),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      computedStyle: {
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        opacity: style.opacity,
        zIndex: style.zIndex,
      },
      centerPointInsideViewport,
      topElementAtCenter: describeElement(top),
      elementStackAtCenter: stack.map(describeElement).filter((item): item is ElementDescriptor => item !== null),
      coveredAtCenter: centerPointInsideViewport
        ? !(top === control || (top !== null && control.contains(top)))
        : null,
    };
  } catch {
    return absent;
  }
}

export function publishCribbageActiveHandSnapshot(
  snapshot: CribbageActiveHandSnapshotPublished,
): void {
  latest = {
    value: snapshot,
    mounted: true,
    publishedAt: new Date().toISOString(),
    unmountedAt: null,
  };
}

export function clearCribbageActiveHandSnapshot(
  gameId?: string,
  dealerGameId?: string | null,
): void {
  if (
    !latest ||
    (gameId && latest.value.gameId !== gameId) ||
    (dealerGameId && latest.value.dealerGameId !== dealerGameId)
  ) return;
  latest = {
    ...latest,
    mounted: false,
    unmountedAt: new Date().toISOString(),
  };
}

export function captureCribbageActiveHandSnapshot(
  expectedGameId: string,
  expectedDealerGameId?: string | null,
): CribbageActiveHandCapturedSnapshot | null {
  if (
    !latest ||
    latest.value.gameId !== expectedGameId ||
    (expectedDealerGameId && latest.value.dealerGameId !== expectedDealerGameId)
  ) return null;

  let activeHandDomWrapperCount = 0;
  let activeHandDomCardCount = 0;
  try {
    if (typeof document !== 'undefined') {
      const stage = document.querySelector('[data-crib-active-hand-stage]');
      activeHandDomWrapperCount = stage?.children.length ?? 0;
      activeHandDomCardCount = document.querySelectorAll(
        '[data-crib-active-hand-stage] [data-cribbage-hand-card-key]',
      ).length;
    }
  } catch {
    activeHandDomWrapperCount = 0;
    activeHandDomCardCount = 0;
  }

  const unexpectedAuthoritativeCardsButEmptyDom =
    latest.value.authoritativeHandCount > 0 &&
    activeHandDomCardCount === 0 &&
    latest.value.dealPhase !== 'PRE_DEAL' &&
    latest.value.dealPhase !== 'DEALING' &&
    !latest.value.activeHandBlocked;

  return {
    ...latest.value,
    mountedAtCapture: latest.mounted,
    lastPublishedAt: latest.publishedAt,
    unmountedAt: latest.unmountedAt,
    activeHandDomWrapperCount,
    activeHandDomCardCount,
    unexpectedAuthoritativeCardsButEmptyDom,
    discardControl: captureDiscardControl(),
    forensicTail: captureCribbageForensicTail(),
    capturedAt: new Date().toISOString(),
  };
}

export function isUnexpectedCribbageRenderSourceMismatch(args: {
  authoritativeCardIds: string[] | null;
  renderedCardIds: string[];
  activeHandBlocked: boolean;
  dealPhase: string | null;
  cribbagePhase: string;
  renderHandKey: string | null;
  currentHandKey: string | null;
}): boolean {
  if (
    !args.authoritativeCardIds ||
    args.activeHandBlocked ||
    args.dealPhase === 'PRE_DEAL' ||
    args.dealPhase === 'DEALING' ||
    (args.cribbagePhase !== 'discarding' && args.cribbagePhase !== 'pegging') ||
    args.renderHandKey !== args.currentHandKey
  ) return false;

  const authoritative = [...args.authoritativeCardIds].sort().join(',');
  const rendered = [...args.renderedCardIds].sort().join(',');
  return authoritative !== rendered;
}
