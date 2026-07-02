/**
 * Temporary on-screen Holm active-pane geometry pill.
 *
 * Enable with `?holmGeom=1` in the URL, or
 * `localStorage.ptp_holmGeom = '1'`. Also publishes the snapshot on
 * `window.__ptp_holmPaneGeom` for headless export.
 *
 * Surfaces: initial/current pane rect, committed stage bottom, lower-zone
 * reservation, resolved clearance, applied card scale (via
 * policy.cardWidthPctOfPane), action-zone actual top, and phase-lock key.
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import {
  computeStageRectFromPane,
  useActiveHandLayoutPolicy,
} from '@/lib/activeHand/activeHandLayoutSettings';

interface Snap {
  paneTop: number;
  paneBottom: number;
  paneH: number;
  paneW: number;
  stageTop: number;
  stageBottom: number;
  stageH: number;
  resolvedClearancePx: number;
  reservedLowerZonePx: number;
  measuredLowerZonePx: number;
  actionZoneComputedTop: number;
  actionZoneActualTop: number;
  actionZoneH: number;
  delta: number;
  cardWidthPctOfPane: number;
  phaseLockKey: string | null;
  fanCommittedRectH: number;
  fanCommittedRectW: number;
  initialPaneH: number;
}

export function HolmActivePaneGeometryPill() {
  const policy = useActiveHandLayoutPolicy('holm');
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('holmGeom') === '1') return true;
      return window.localStorage?.getItem('ptp_holmGeom') === '1';
    } catch {
      return false;
    }
  });
  const [snap, setSnap] = useState<Snap | null>(null);
  const [initialPaneH, setInitialPaneH] = useState<number | null>(null);

  useLayoutEffect(() => {
    const compute = () => {
      const pane = document.querySelector<HTMLElement>('[data-holm-active-pane-content]');
      if (!pane) return;
      const paneRect = pane.getBoundingClientRect();
      if (paneRect.height <= 0 || paneRect.width <= 0) return;

      if (initialPaneH === null) setInitialPaneH(paneRect.height);

      const action = pane.querySelector<HTMLElement>('[data-active-hand-lower-zone]');
      const actionRect = action?.getBoundingClientRect() ?? null;
      const measuredLowerZoneMinPx = actionRect ? actionRect.height : 0;
      const { stageRect, reservedLowerZonePx, interZoneClearancePx } =
        computeStageRectFromPane(
          { width: paneRect.width, height: paneRect.height },
          policy,
          { measuredLowerZoneMinPx, safeAreaBottomPx: 0 },
        );
      const stageTop = paneRect.top;
      const stageBottom = stageTop + stageRect.height;
      const actionZoneComputedTop = stageBottom + interZoneClearancePx;
      const actionZoneActualTop = actionRect ? actionRect.top : NaN;

      const fan = pane.querySelector<HTMLElement>('[data-measured-active-hand-fan="holm"]');
      const phaseLockKey =
        fan?.getAttribute('data-measured-active-hand-fan-locked') ?? null;
      const portal = pane.querySelector<HTMLElement>('[data-measured-active-hand-fan-portal="holm"]');
      const committedRect = portal?.getBoundingClientRect() ?? null;

      const next: Snap = {
        paneTop: paneRect.top,
        paneBottom: paneRect.bottom,
        paneH: paneRect.height,
        paneW: paneRect.width,
        stageTop,
        stageBottom,
        stageH: stageRect.height,
        resolvedClearancePx: interZoneClearancePx,
        reservedLowerZonePx,
        measuredLowerZonePx: measuredLowerZoneMinPx,
        actionZoneComputedTop,
        actionZoneActualTop,
        actionZoneH: actionRect?.height ?? 0,
        delta: Number.isFinite(actionZoneActualTop)
          ? actionZoneActualTop - actionZoneComputedTop
          : NaN,
        cardWidthPctOfPane: policy.cardWidthPctOfPane,
        phaseLockKey,
        fanCommittedRectH: committedRect?.height ?? 0,
        fanCommittedRectW: committedRect?.width ?? 0,
        initialPaneH: initialPaneH ?? paneRect.height,
      };
      if (typeof window !== 'undefined') {
        (window as any).__ptp_holmPaneGeom = { ...next, policy };
      }
      setSnap(next);
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return;
    const pane = document.querySelector<HTMLElement>('[data-holm-active-pane-content]');
    if (!pane) return;
    const ro = new ResizeObserver(compute);
    ro.observe(pane);
    const action = pane.querySelector<HTMLElement>('[data-active-hand-lower-zone]');
    if (action) ro.observe(action);
    const mo = new MutationObserver(compute);
    mo.observe(pane, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [policy, initialPaneH]);

  // Re-render on window resize to keep snapshot fresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onR = () => setInitialPaneH((v) => v);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);

  if (!enabled || !snap) return null;
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');
  return (
    <div
      data-holm-active-pane-geom-pill=""
      className="pointer-events-none fixed left-1 bottom-1 z-[9999] rounded bg-black/85 px-2 py-1 font-mono text-[10px] leading-tight text-emerald-300 shadow"
      style={{ maxWidth: 260 }}
    >
      <div className="text-emerald-200">holm pane geom</div>
      <div>pane H init/now: {fmt(snap.initialPaneH)} / {fmt(snap.paneH)}</div>
      <div>pane W: {fmt(snap.paneW)}</div>
      <div>stage T/B: {fmt(snap.stageTop)} / {fmt(snap.stageBottom)}</div>
      <div>stage H: {fmt(snap.stageH)}</div>
      <div>clearance: {fmt(snap.resolvedClearancePx)}</div>
      <div>LZ reserved / measured: {fmt(snap.reservedLowerZonePx)} / {fmt(snap.measuredLowerZonePx)}</div>
      <div>action ⌐ top calc/actual: {fmt(snap.actionZoneComputedTop)} / {fmt(snap.actionZoneActualTop)}</div>
      <div className={Math.abs(snap.delta) < 2 ? 'text-emerald-300' : 'text-amber-300'}>
        Δ: {fmt(snap.delta)}px
      </div>
      <div>card % pane: {fmt(snap.cardWidthPctOfPane)}</div>
      <div>fan committed W×H: {fmt(snap.fanCommittedRectW)}×{fmt(snap.fanCommittedRectH)}</div>
      <div className="truncate">lockKey: {snap.phaseLockKey ?? '—'}</div>
    </div>
  );
}
