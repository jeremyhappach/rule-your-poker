/**
 * ThreeFiveSevenLayoutSnapPill — WARTIME diagnostic pill.
 *
 * Temporary, manual-only. On tap it reads current DOM/window state,
 * combines with a caller-provided React-state snapshot, and persists
 * a single `357.manual_layout_snapshot` event via `persistSyncDebugEvent`.
 *
 * Strict behavior:
 *   - Fixed to bottom-LEFT corner. Escapes HUD/flex/grid.
 *   - Does not focus/blur, dispatch events, mutate classes, or add
 *     children inside the active pane.
 *   - Reads only. No timers/polling. No lifecycle listeners.
 *
 * Payload values are all plain primitives / plain objects — verified
 * with `JSON.stringify` before persistence. Persistence subscription
 * uses the new `onResult` callback on persistSyncDebugEvent, and the
 * pill flashes "SAVED" only after the DB write resolves cleanly.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { buildIdentityEnvelope, BUILD_IDENTITY } from '@/lib/buildIdentity';
import {
  getFetchTraceStatus,
  getFetchTraceFailureReason,
  subscribeFetchTraceStatus,
  FETCH_INSTRUMENTATION_VERSION,
  type FetchTraceStatus,
} from '@/lib/fetchTraceStatus';
import { useBuildFreshnessStatus } from '@/components/StalePublicationWarning';


type PlainRect = {
  x: number | null; y: number | null; width: number | null; height: number | null;
  top: number | null; right: number | null; bottom: number | null; left: number | null;
};

const NULL_RECT: PlainRect = {
  x: null, y: null, width: null, height: null,
  top: null, right: null, bottom: null, left: null,
};

const STYLE_KEYS = [
  'display', 'visibility', 'opacity', 'overflow', 'overflowX', 'overflowY',
  'position', 'transform', 'translate', 'clipPath', 'contain',
  'contentVisibility', 'pointerEvents', 'zIndex', 'flexGrow', 'flexShrink',
  'minHeight', 'height', 'maxHeight', 'marginTop', 'marginBottom',
] as const;
type StyleKey = typeof STYLE_KEYS[number];
type PlainStyle = Record<StyleKey, string | null>;

const NULL_STYLE: PlainStyle = STYLE_KEYS.reduce((acc, k) => {
  acc[k] = null;
  return acc;
}, {} as PlainStyle);

export interface ThreeFiveSevenReactStateSnapshot {
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  roundNumber: number | null;
  handNumber: number | null;
  canDecide?: boolean;
  renderedLowerZoneOwner?: string | null;
  hasDecided?: boolean;
  allDecisionsIn?: boolean;
  threeFiveSevenDecisionBoundaryOpen?: boolean;
  currentPlayerId?: string | null;
  currentPlayerStatus?: string | null;
  currentPlayerDecision?: string | null;
  currentPlayerDecisionLocked?: boolean | null;
  currentPlayerCardsCount?: number;
  activeTab?: string | null;
  isWaitingPhase?: boolean;
  isDealerConfigPhase?: boolean;
  gameStatus?: string | null;
  gameType?: string | null;
}

export interface ThreeFiveSevenLayoutSnapPillProps {
  enabled: boolean;
  getReactState: () => ThreeFiveSevenReactStateSnapshot;
}

function readRect(el: Element | null): PlainRect {
  if (!el) return { ...NULL_RECT };
  const r = el.getBoundingClientRect();
  return {
    x: r.x, y: r.y, width: r.width, height: r.height,
    top: r.top, right: r.right, bottom: r.bottom, left: r.left,
  };
}

function readStyle(el: Element | null): PlainStyle {
  if (!el) return { ...NULL_STYLE };
  const cs = window.getComputedStyle(el as HTMLElement);
  const out = { ...NULL_STYLE };
  for (const k of STYLE_KEYS) {
    const v = (cs as unknown as Record<string, string>)[k];
    out[k] = (typeof v === 'string' && v.length > 0) ? v : null;
  }
  return out;
}

function findFirstCard(handRegion: Element | null): Element | null {
  if (!handRegion) return null;
  return (
    handRegion.querySelector('[data-card-anchor]') ||
    handRegion.querySelector('[data-playing-card]') ||
    handRegion.querySelector('img,svg,button,div')
  );
}

function findStayButton(): HTMLElement | null {
  return (
    (document.querySelector('[data-357-stay-button]') as HTMLElement | null) ||
    (document.querySelector('[data-action="stay"]') as HTMLElement | null) ||
    findButtonByText(['STAY', 'Stay'])
  );
}
function findDropButton(): HTMLElement | null {
  return (
    (document.querySelector('[data-357-drop-button]') as HTMLElement | null) ||
    (document.querySelector('[data-action="drop"]') as HTMLElement | null) ||
    findButtonByText(['DROP', 'Drop', 'FOLD', 'Fold'])
  );
}
function findButtonByText(texts: string[]): HTMLElement | null {
  const zone = document.querySelector('[data-active-hand-lower-zone]');
  if (!zone) return null;
  const btns = zone.querySelectorAll('button');
  for (const b of Array.from(btns)) {
    const t = (b.textContent || '').trim();
    if (texts.some((needle) => t === needle || t.toUpperCase() === needle.toUpperCase())) {
      return b as HTMLElement;
    }
  }
  return null;
}

function toNumOrNull(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ancestorChain(fromEl: Element | null, stopEl: Element | null, maxDepth = 12): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (!fromEl) return out;
  let el: Element | null = fromEl;
  let i = 0;
  while (el && i < maxDepth) {
    const rect = readRect(el);
    const cs = readStyle(el);
    const dataset = (el as HTMLElement).dataset || {};
    out.push({
      index: i,
      tag: el.tagName.toLowerCase(),
      id: (el as HTMLElement).id || null,
      className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : null,
      dataHudRow: (dataset as Record<string, string>)['hudRow'] ?? null,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      rectHeight: rect.height,
      display: cs.display,
      overflow: cs.overflow,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      position: cs.position,
      transform: cs.transform,
      contain: cs.contain,
      contentVisibility: cs.contentVisibility,
      flexGrow: cs.flexGrow,
      flexShrink: cs.flexShrink,
      minHeight: cs.minHeight,
      height: cs.height,
      maxHeight: cs.maxHeight,
    });
    if (stopEl && el === stopEl) break;
    el = el.parentElement;
    i += 1;
  }
  return out;
}

export function ThreeFiveSevenLayoutSnapPill({ enabled, getReactState }: ThreeFiveSevenLayoutSnapPillProps) {
  const seqRef = useRef(0);
  const busyRef = useRef(false);
  const [flash, setFlash] = useState<string>('');

  const onTap = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      const rs = getReactState();

      // ── Selector map (verified against source) ────────────
      const SELECTORS = {
        canonicalShell: '[data-canonical-felt-surface], [data-persistent-table-shell]',
        hudRow4: '[data-hud-row="4"]',
        activePane: '[data-active-pane], [data-357-active-hand-region]',
        handRegion: '[data-357-active-hand-region]',
        firstCard: '[data-card-anchor], [data-playing-card]',
        lowerZone: '[data-active-hand-lower-zone]',
        stayButton: '[data-357-stay-button] | [data-action="stay"] | text=STAY',
        dropButton: '[data-357-drop-button] | [data-action="drop"] | text=DROP',
        identityRow: '[data-hud-row="5"], [data-hud-identity-row]',
      } as const;

      // ── Resolve elements ──────────────────────────────────
      const shell = document.querySelector('[data-canonical-felt-surface]')
        || document.querySelector('[data-persistent-table-shell]');
      const hudRow4 = document.querySelector('[data-hud-row="4"]');
      const handRegion = document.querySelector('[data-357-active-hand-region]');
      const activePane = (document.querySelector('[data-active-pane]')
        || handRegion?.closest('[data-hud-row="4"]')
        || handRegion) as Element | null;
      const handContainer = (handRegion?.querySelector('.transform') || handRegion?.firstElementChild || null) as Element | null;
      const firstCard = findFirstCard(handRegion);
      const lowerZone = document.querySelector('[data-active-hand-lower-zone]');
      const stayBtn = findStayButton();
      const dropBtn = findDropButton();
      const identityRow = document.querySelector('[data-hud-row="5"]')
        || document.querySelector('[data-hud-identity-row]');

      const unresolvedSelectors: string[] = [];
      if (!shell) unresolvedSelectors.push('canonicalShell');
      if (!hudRow4) unresolvedSelectors.push('hudRow4');
      if (!activePane) unresolvedSelectors.push('activePane');
      if (!handRegion) unresolvedSelectors.push('handRegion');
      if (!handContainer) unresolvedSelectors.push('handContainer');
      if (!firstCard) unresolvedSelectors.push('firstCard');
      if (!lowerZone) unresolvedSelectors.push('lowerZone');
      if (!stayBtn) unresolvedSelectors.push('stayButton');
      if (!dropBtn) unresolvedSelectors.push('dropButton');
      if (!identityRow) unresolvedSelectors.push('identityRow');

      // ── Hit test ──────────────────────────────────────────
      const stayRect = readRect(stayBtn);
      const lowerRect = readRect(lowerZone);
      const center =
        (stayRect.left != null && stayRect.width != null)
          ? { x: stayRect.left + stayRect.width / 2, y: (stayRect.top ?? 0) + (stayRect.height ?? 0) / 2 }
          : (lowerRect.left != null && lowerRect.width != null)
            ? { x: lowerRect.left + lowerRect.width / 2, y: (lowerRect.top ?? 0) + (lowerRect.height ?? 0) / 2 }
            : null;

      let hit: Element | null = null;
      if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
        try { hit = document.elementFromPoint(center.x, center.y); } catch { /* noop */ }
      }
      const hitTest = {
        x: center?.x ?? null,
        y: center?.y ?? null,
        elementTag: hit ? hit.tagName.toLowerCase() : null,
        elementId: hit ? ((hit as HTMLElement).id || null) : null,
        elementClassName: hit ? (typeof (hit as HTMLElement).className === 'string' ? (hit as HTMLElement).className : null) : null,
        elementTestId: hit ? ((hit as HTMLElement).dataset?.['testid'] || null) : null,
        hitIsStayButton: !!(hit && stayBtn && (hit === stayBtn || stayBtn.contains(hit))),
      };

      // ── Viewport ──────────────────────────────────────────
      const vv = window.visualViewport;
      const viewport = {
        windowInnerWidth: window.innerWidth,
        windowInnerHeight: window.innerHeight,
        documentClientWidth: document.documentElement.clientWidth,
        documentClientHeight: document.documentElement.clientHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        visualViewportWidth: vv?.width ?? null,
        visualViewportHeight: vv?.height ?? null,
        visualViewportOffsetTop: vv?.offsetTop ?? null,
        visualViewportPageTop: vv?.pageTop ?? null,
        visualViewportScale: vv?.scale ?? null,
        windowScrollX: window.scrollX,
        windowScrollY: window.scrollY,
        screenWidth: window.screen?.width ?? null,
        screenHeight: window.screen?.height ?? null,
        devicePixelRatio: window.devicePixelRatio ?? null,
      };

      // ── React state (nested) ──────────────────────────────
      let renderedLowerZoneOwner: string | null = rs.renderedLowerZoneOwner ?? null;
      if (renderedLowerZoneOwner == null && lowerZone) {
        renderedLowerZoneOwner = lowerZone.getAttribute('data-lower-zone-owner')
          || lowerZone.getAttribute('data-owner')
          || null;
      }
      const reactState = {
        canDecide: rs.canDecide ?? null,
        renderedLowerZoneOwner,
        hasDecided: rs.hasDecided ?? null,
        allDecisionsIn: rs.allDecisionsIn ?? null,
        threeFiveSevenDecisionBoundaryOpen: rs.threeFiveSevenDecisionBoundaryOpen ?? null,
        currentPlayerId: rs.currentPlayerId ?? null,
        currentPlayerStatus: rs.currentPlayerStatus ?? null,
        currentPlayerDecision: rs.currentPlayerDecision ?? null,
        currentPlayerDecisionLocked: rs.currentPlayerDecisionLocked ?? null,
        currentPlayerCardsCount: rs.currentPlayerCardsCount ?? null,
        activeTab: rs.activeTab ?? null,
        isWaitingPhase: rs.isWaitingPhase ?? null,
        isDealerConfigPhase: rs.isDealerConfigPhase ?? null,
        currentPlayerHandReserveClass: handRegion?.getAttribute('data-357-snap-reserve-class') ?? null,
        handScaleNum: toNumOrNull(handRegion?.getAttribute('data-357-snap-hand-scale') ?? null),
        handReserveNum: toNumOrNull(handRegion?.getAttribute('data-357-snap-hand-reserve') ?? null),
        handAvailableHeightPx357: toNumOrNull(handRegion?.getAttribute('data-357-snap-hand-avail-h') ?? null),
      };

      // ── Rects (nested) ────────────────────────────────────
      const rects = {
        canonicalShell: readRect(shell),
        hudRow4: readRect(hudRow4),
        activePane: readRect(activePane),
        handRegion: readRect(handRegion),
        handContainer: readRect(handContainer),
        firstCard: readRect(firstCard),
        lowerZone: readRect(lowerZone),
        stayButton: readRect(stayBtn),
        dropButton: readRect(dropBtn),
        identityRow: readRect(identityRow),
      };

      // ── Computed styles (nested) ──────────────────────────
      const computedStyles = {
        activePane: readStyle(activePane),
        handRegion: readStyle(handRegion),
        lowerZone: readStyle(lowerZone),
        stayButton: readStyle(stayBtn),
        dropButton: readStyle(dropBtn),
      };

      // ── Ancestor chain ────────────────────────────────────
      const chain = ancestorChain(lowerZone, shell, 12);

      const be = buildIdentityEnvelope();

      const payload = {
        // Correlation
        snapshotVersion: 2,
        snapshotSeq: seq,
        capturedAt: new Date().toISOString(),
        gameId: rs.gameId,
        clientBuildId: be.buildSha,
        buildTimestamp: be.buildTimestamp,
        deploymentId: be.deploymentId,
        bundleFilename: be.bundleFilename,
        dealerGameId: rs.dealerGameId,
        roundId: rs.roundId,
        roundNumber: rs.roundNumber,
        handNumber: rs.handNumber,
        documentVisibilityState: document.visibilityState,
        documentHasFocus: (() => { try { return document.hasFocus(); } catch { return null; } })(),
        gameStatus: rs.gameStatus ?? null,
        gameType: rs.gameType ?? null,
        selectorMap: SELECTORS,
        unresolvedSelectors,
        reactState,
        viewport,
        rects,
        computedStyles,
        hitTest,
        ancestorChain: chain,
      };

      // Serialization gate
      let bytes = 0;
      try {
        bytes = JSON.stringify(payload).length;
      } catch (e) {
        console.warn('[357.manual_layout_snapshot] serialization failed', e);
        setFlash('SNAP FAILED');
        window.setTimeout(() => setFlash(''), 2000);
        busyRef.current = false;
        return;
      }

      setFlash(`SNAP ${seq}…`);

      persistSyncDebugEvent({
        gameId: rs.gameId ?? 'unknown',
        gameType: '3-5-7',
        handNumber: rs.handNumber ?? 0,
        roundId: rs.roundId ?? null,
        eventType: 'invariant',
        severity: 'info',
        eventName: '357.manual_layout_snapshot',
        payload: { ...payload, serializedBytes: bytes },
        dedupKey: `357.manual_layout_snapshot:${rs.gameId ?? 'x'}:${seq}:${Date.now()}`,
        onResult: (ok, reason) => {
          if (ok) {
            setFlash(`SNAP ${seq} SAVED (${bytes}b)`);
            window.setTimeout(() => setFlash(''), 2500);
          } else {
            console.warn('[357.manual_layout_snapshot] persist failed', reason);
            setFlash(`SNAP FAILED${reason ? ` (${reason})` : ''}`);
            window.setTimeout(() => setFlash(''), 2500);
          }
          busyRef.current = false;
        },
      });
    } catch (e) {
      console.warn('[357.manual_layout_snapshot] failed', e);
      setFlash('SNAP FAILED');
      window.setTimeout(() => setFlash(''), 2000);
      busyRef.current = false;
    }
  }, [getReactState]);

  // Subscribe to fetch-trace instrumentation status so the pill can
  // visibly prove whether the deployed bundle contains — and has
  // successfully persisted — the 357.fetch.* code path.
  const [traceStatus, setTraceStatus] = useState<FetchTraceStatus>(getFetchTraceStatus());
  const [traceFailReason, setTraceFailReason] = useState<string | null>(getFetchTraceFailureReason());
  useEffect(() => {
    return subscribeFetchTraceStatus(() => {
      setTraceStatus(getFetchTraceStatus());
      setTraceFailReason(getFetchTraceFailureReason());
    });
  }, []);

  if (!enabled) return null;

  const buildShort = BUILD_IDENTITY.buildShaShort || BUILD_IDENTITY.buildSha.slice(0, 12) || 'unknown';
  const traceLabel =
    traceStatus === 'ready' ? 'FETCH TRACE READY'
    : traceStatus === 'failed' ? `FETCH TRACE FAILED${traceFailReason ? ` (${traceFailReason})` : ''}`
    : `FETCH TRACE ${FETCH_INSTRUMENTATION_VERSION}`;
  const traceColor =
    traceStatus === 'ready' ? '#7ee787'
    : traceStatus === 'failed' ? '#ffb454'
    : '#e6d3a3';

  return (
    <div
      data-pill="357-manual-layout-snap-wrap"
      style={{
        position: 'fixed',
        left: 'calc(env(safe-area-inset-left, 0px) + 8px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        zIndex: 2147483000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        pointerEvents: 'none',
      }}
    >
      <div
        data-pill="357-build-identity"
        style={{
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.7)',
          border: '1px solid #444',
          borderRadius: 3,
          color: '#cfe2ff',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
        }}
      >
        BUILD {buildShort}
      </div>
      <div
        data-pill="357-fetch-trace-status"
        data-fetch-trace-status={traceStatus}
        style={{
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.7)',
          border: `1px solid ${traceColor}`,
          borderRadius: 3,
          color: traceColor,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.5,
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
        }}
      >
        {traceLabel}
      </div>
      <button
        type="button"
        onClick={onTap}
        data-pill="357-manual-layout-snap"
        aria-label="Capture 3-5-7 layout snapshot"
        style={{
          padding: '4px 8px',
          background: '#5a1e1e',
          border: '1px solid #ff6a6a',
          borderRadius: 4,
          color: '#fff',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          fontWeight: 700,
          boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
          pointerEvents: 'auto',
          letterSpacing: 0.5,
          maxWidth: '60vw',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {flash || 'SNAP 357'}
      </button>
    </div>
  );
}

