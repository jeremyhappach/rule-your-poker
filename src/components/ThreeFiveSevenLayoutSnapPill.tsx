/**
 * ThreeFiveSevenLayoutSnapPill — WARTIME diagnostic pill.
 *
 * Temporary, manual-only. On tap it reads current DOM/window state,
 * combines with a caller-provided React-state snapshot, and persists
 * a single `357.manual_layout_snapshot` event via `persistSyncDebugEvent`.
 *
 * Strict behavior:
 *   - Fixed to bottom-right corner. Escapes HUD/flex/grid.
 *   - Does not focus/blur, dispatch events, mutate classes, or add
 *     children inside the active pane.
 *   - Reads only. No timers/polling. No lifecycle listeners.
 *
 * Payload values are all plain primitives / plain objects — verified
 * with `JSON.stringify` before persistence.
 */

import { useCallback, useRef, useState } from 'react';
import { persistSyncDebugEvent } from '@/lib/persistSyncDebugEvent';
import { buildIdentityEnvelope } from '@/lib/buildIdentity';

type PlainRect = {
  x: number; y: number; width: number; height: number;
  top: number; right: number; bottom: number; left: number;
} | null;

type PlainStyle = Record<
  | 'display' | 'visibility' | 'opacity' | 'overflow' | 'overflowX' | 'overflowY'
  | 'position' | 'transform' | 'translate' | 'clipPath' | 'contain'
  | 'contentVisibility' | 'pointerEvents' | 'zIndex' | 'flexGrow' | 'flexShrink'
  | 'minHeight' | 'height' | 'maxHeight' | 'marginTop' | 'marginBottom',
  string
> | null;

export interface ThreeFiveSevenReactStateSnapshot {
  // Correlation (required)
  gameId: string | null;
  dealerGameId: string | null;
  roundId: string | null;
  roundNumber: number | null;
  handNumber: number | null;
  // React/game state (optional — provide whatever's reachable from the mount site)
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

const STYLE_KEYS: Array<keyof NonNullable<PlainStyle>> = [
  'display', 'visibility', 'opacity', 'overflow', 'overflowX', 'overflowY',
  'position', 'transform', 'translate', 'clipPath', 'contain',
  'contentVisibility', 'pointerEvents', 'zIndex', 'flexGrow', 'flexShrink',
  'minHeight', 'height', 'maxHeight', 'marginTop', 'marginBottom',
];

function readRect(el: Element | null): PlainRect {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: r.x, y: r.y, width: r.width, height: r.height,
    top: r.top, right: r.right, bottom: r.bottom, left: r.left,
  };
}

function readStyle(el: Element | null): PlainStyle {
  if (!el) return null;
  const cs = window.getComputedStyle(el as HTMLElement);
  const out: Record<string, string> = {};
  for (const k of STYLE_KEYS) {
    // getPropertyValue uses css-case; index also works for camelCase
    out[k] = (cs as unknown as Record<string, string>)[k] ?? '';
  }
  return out as PlainStyle;
}

function firstVisibleCard(handRegion: Element | null): Element | null {
  if (!handRegion) return null;
  // Prefer a canonical card marker; fall back to any child with data-card- or img
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

function ancestorChain(fromEl: Element | null, maxDepth = 12): Array<Record<string, unknown>> {
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
      dataActivePane: (dataset as Record<string, string>)['activePane'] ?? null,
      rectTop: rect?.top ?? null,
      rectBottom: rect?.bottom ?? null,
      rectHeight: rect?.height ?? null,
      display: cs?.display ?? null,
      overflow: cs?.overflow ?? null,
      position: cs?.position ?? null,
      transform: cs?.transform ?? null,
      contain: cs?.contain ?? null,
      contentVisibility: cs?.contentVisibility ?? null,
      flexGrow: cs?.flexGrow ?? null,
      flexShrink: cs?.flexShrink ?? null,
      minHeight: cs?.minHeight ?? null,
      height: cs?.height ?? null,
      maxHeight: cs?.maxHeight ?? null,
    });
    el = el.parentElement;
    i += 1;
  }
  return out;
}

export function ThreeFiveSevenLayoutSnapPill({ enabled, getReactState }: ThreeFiveSevenLayoutSnapPillProps) {
  const seqRef = useRef(0);
  const [flash, setFlash] = useState<string>('');

  const onTap = useCallback(() => {
    try {
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      const rs = getReactState();

      // Elements
      const shell = document.querySelector('[data-canonical-felt-surface]')
        || document.querySelector('[data-persistent-table-shell]');
      const hudRow4 = document.querySelector('[data-hud-row="4"]')
        || document.querySelector('[data-hud-grid-row="4"]');
      const activePane = document.querySelector('[data-active-pane]')
        || document.querySelector('[data-357-active-hand-region]')?.closest('[data-hud-row="4"]')
        || null;
      const handRegion = document.querySelector('[data-357-active-hand-region]');
      const handContainer = handRegion?.querySelector('.transform') || handRegion?.firstElementChild || null;
      const firstCard = firstVisibleCard(handRegion);
      const lowerZone = document.querySelector('[data-active-hand-lower-zone]');
      const stayBtn = findStayButton();
      const dropBtn = findDropButton();
      const identityRow = document.querySelector('[data-hud-row="5"]')
        || document.querySelector('[data-hud-identity-row]');

      const stayRect = readRect(stayBtn);
      const lowerRect = readRect(lowerZone);
      const hitCenter = stayRect
        ? { x: stayRect.left + stayRect.width / 2, y: stayRect.top + stayRect.height / 2 }
        : lowerRect
          ? { x: lowerRect.left + lowerRect.width / 2, y: lowerRect.top + lowerRect.height / 2 }
          : null;

      let hit: Element | null = null;
      if (hitCenter && Number.isFinite(hitCenter.x) && Number.isFinite(hitCenter.y)) {
        try { hit = document.elementFromPoint(hitCenter.x, hitCenter.y); } catch { /* noop */ }
      }
      const hitTag = hit ? hit.tagName.toLowerCase() : null;
      const hitTestId = hit ? ((hit as HTMLElement).dataset?.['testid'] || null) : null;
      const hitClassName = hit ? (typeof (hit as HTMLElement).className === 'string' ? (hit as HTMLElement).className : null) : null;
      const hitIsStay = !!(hit && stayBtn && (hit === stayBtn || stayBtn.contains(hit)));

      const vv = window.visualViewport;
      const be = buildIdentityEnvelope();

      const payload: Record<string, unknown> = {
        // Correlation
        snapshotVersion: 1,
        snapshotSeq: seq,
        capturedAt: new Date().toISOString(),
        gameId: rs.gameId,
        dealerGameId: rs.dealerGameId,
        roundId: rs.roundId,
        roundNumber: rs.roundNumber,
        handNumber: rs.handNumber,
        clientBuildId: be.buildSha,
        buildTimestamp: be.buildTimestamp,
        deploymentId: be.deploymentId,
        bundleFilename: be.bundleFilename,
        documentVisibilityState: document.visibilityState,
        documentHasFocus: (() => { try { return document.hasFocus(); } catch { return null; } })(),

        // React/game-state
        canDecide: rs.canDecide,
        renderedLowerZoneOwner: rs.renderedLowerZoneOwner,
        hasDecided: rs.hasDecided,
        allDecisionsIn: rs.allDecisionsIn,
        threeFiveSevenDecisionBoundaryOpen: rs.threeFiveSevenDecisionBoundaryOpen,
        currentPlayerId: rs.currentPlayerId,
        currentPlayerStatus: rs.currentPlayerStatus,
        currentPlayerDecision: rs.currentPlayerDecision,
        currentPlayerDecisionLocked: rs.currentPlayerDecisionLocked,
        currentPlayerCardsCount: rs.currentPlayerCardsCount,
        activeTab: rs.activeTab,
        isWaitingPhase: rs.isWaitingPhase,
        isDealerConfigPhase: rs.isDealerConfigPhase,
        currentPlayerHandReserveClass: rs.currentPlayerHandReserveClass,
        handScaleNum: rs.handScaleNum,
        handReserveNum: rs.handReserveNum,
        handAvailableHeightPx357: rs.handAvailableHeightPx357,

        // DOM existence
        activePaneExists: !!activePane,
        handRegionExists: !!handRegion,
        lowerZoneExists: !!lowerZone,
        stayButtonExists: !!stayBtn,
        dropButtonExists: !!dropBtn,
        identityRowExists: !!identityRow,
        stayButtonConnected: !!(stayBtn && stayBtn.isConnected),
        dropButtonConnected: !!(dropBtn && dropBtn.isConnected),

        // Rects
        rects: {
          canonicalShell: readRect(shell),
          hudRow4: readRect(hudRow4),
          activePane: readRect(activePane),
          handRegion: readRect(handRegion),
          handContainer: readRect(handContainer),
          firstVisibleCard: readRect(firstCard),
          lowerZone: readRect(lowerZone),
          stayButton: readRect(stayBtn),
          dropButton: readRect(dropBtn),
          identityRow: readRect(identityRow),
        },

        // Computed styles
        styles: {
          activePane: readStyle(activePane),
          handRegion: readStyle(handRegion),
          lowerZone: readStyle(lowerZone),
          stayButton: readStyle(stayBtn),
          dropButton: readStyle(dropBtn),
        },

        // Viewport / document
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
        devicePixelRatio: window.devicePixelRatio,

        // Hit-test
        stayCenterX: hitCenter?.x ?? null,
        stayCenterY: hitCenter?.y ?? null,
        elementFromPointTag: hitTag,
        elementFromPointTestId: hitTestId,
        elementFromPointClassName: hitClassName,
        hitIsStayButton: hitIsStay,

        // Ancestor chain: lower zone → up
        ancestorChainFromLowerZone: ancestorChain(lowerZone, 12),
      };

      // Serialization gate
      try { JSON.stringify(payload); } catch (e) {
        console.warn('[357.manual_layout_snapshot] serialization failed', e);
        setFlash('SNAP ERR');
        setTimeout(() => setFlash(''), 1200);
        return;
      }

      try {
        persistSyncDebugEvent({
          gameId: rs.gameId ?? 'unknown',
          gameType: '3-5-7',
          handNumber: rs.handNumber ?? 0,
          roundId: rs.roundId ?? null,
          eventType: 'invariant', // always-persist during wartime
          severity: 'info',
          eventName: '357.manual_layout_snapshot',
          payload,
          dedupKey: `357.manual_layout_snapshot:${rs.gameId ?? 'x'}:${seq}`,
        });
      } catch (e) {
        console.warn('[357.manual_layout_snapshot] persist failed', e);
        setFlash('SNAP ERR');
        setTimeout(() => setFlash(''), 1200);
        return;
      }

      setFlash(`SNAP ${seq} SAVED`);
      setTimeout(() => setFlash(''), 1500);
    } catch (e) {
      console.warn('[357.manual_layout_snapshot] failed', e);
      setFlash('SNAP ERR');
      setTimeout(() => setFlash(''), 1200);
    }
  }, [getReactState]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={onTap}
      data-pill="357-manual-layout-snap"
      aria-label="Capture 3-5-7 layout snapshot"
      style={{
        position: 'fixed',
        right: 'calc(env(safe-area-inset-right, 0px) + 6px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        zIndex: 2147483000,
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
      }}
    >
      {flash || 'SNAP 357'}
    </button>
  );
}
