/**
 * PRESESSION_GEOMETRY_COMPARE sampler.
 *
 * Wartime instrumentation that proves geometric equivalence between the
 * shell-owned PreSessionSeatLayer chip cluster and the gameplay-owned
 * projected seat overlay (e.g. CribbageMobileGameTable
 * projectedSeatOverlay[preSession]) during the pre-game flow.
 *
 * Acceptance for ownership suppression: for each (position) the two
 * renderers report identical centerX/centerY and width/height (tolerance
 * <2px). If they diverge, gameplay geometry must be aligned BEFORE the
 * duplicate is suppressed — otherwise suppression introduces a visible
 * chip snap at gameplay start.
 *
 * Owner classification is derived from `ownerLabel`:
 *   - 'Shell:*'    → shellRenderer
 *   - everything else (incl. 'Gameplay:*' / 'Slot:*') → gameplayRenderer
 *
 * Sampling is rAF-debounced; triggered by:
 *   - every CanonicalSeatCluster mount / unmount
 *   - explicit phase change via setPresessionGeometryPhase()
 * Recording only runs while a non-null phase is set, so the buffer stays
 * scoped to the pre-game window the user cares about.
 */

import { recordWartime } from './core';

type OwnerKind = 'shell' | 'gameplay';

let currentPhase: string | null = null;
let rafScheduled = false;

export function setPresessionGeometryPhase(phase: string | null): void {
  if (currentPhase === phase) return;
  currentPhase = phase;
  if (phase) schedulePresessionGeometrySample();
}

export function getPresessionGeometryPhase(): string | null {
  return currentPhase;
}

export function notePresessionGeometryEvent(): void {
  schedulePresessionGeometrySample();
}

function schedulePresessionGeometrySample(): void {
  if (rafScheduled) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!currentPhase) return;
  rafScheduled = true;
  const run = () => {
    rafScheduled = false;
    try {
      samplePresessionGeometryNow();
    } catch {
      // never throw from instrumentation
    }
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

interface RendererSnapshot {
  visible: boolean;
  rect: { x: number; y: number; w: number; h: number } | null;
  centerX: number | null;
  centerY: number | null;
  width: number | null;
  height: number | null;
  ownerLabel: string | null;
  clusterInstanceId: string | null;
}

const EMPTY: RendererSnapshot = {
  visible: false,
  rect: null,
  centerX: null,
  centerY: null,
  width: null,
  height: null,
  ownerLabel: null,
  clusterInstanceId: null,
};

function classify(ownerLabel: string | null | undefined): OwnerKind {
  if (ownerLabel && ownerLabel.startsWith('Shell:')) return 'shell';
  return 'gameplay';
}

function snapshotFromCluster(el: Element): RendererSnapshot {
  const chip = el.querySelector('[data-chip-center]') as HTMLElement | null;
  const target = (chip ?? (el as HTMLElement));
  const rect = target.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  return {
    visible,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    centerX: Math.round(rect.x + rect.width / 2),
    centerY: Math.round(rect.y + rect.height / 2),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    ownerLabel: el.getAttribute('data-owner-label'),
    clusterInstanceId: el.getAttribute('data-cluster-instance'),
  };
}

export function samplePresessionGeometryNow(): void {
  if (!currentPhase) return;
  if (typeof document === 'undefined') return;
  const nodes = Array.from(
    document.querySelectorAll('[data-canonical-seat-cluster][data-seat-position]'),
  );
  if (nodes.length === 0) return;
  // Group by position.
  const byPosition = new Map<number, Element[]>();
  for (const n of nodes) {
    const posAttr = n.getAttribute('data-seat-position');
    if (!posAttr) continue;
    const pos = Number(posAttr);
    if (!Number.isFinite(pos)) continue;
    const arr = byPosition.get(pos) ?? [];
    arr.push(n);
    byPosition.set(pos, arr);
  }
  for (const [position, els] of byPosition) {
    let shell: RendererSnapshot = EMPTY;
    let gameplay: RendererSnapshot = EMPTY;
    let playerId: string | null = null;
    for (const el of els) {
      const owner = el.getAttribute('data-owner-label');
      const pid = el.getAttribute('data-player-id');
      if (pid && !playerId) playerId = pid;
      const snap = snapshotFromCluster(el);
      if (classify(owner) === 'shell') {
        if (!shell.visible || snap.visible) shell = snap;
      } else {
        if (!gameplay.visible || snap.visible) gameplay = snap;
      }
    }
    const dx = shell.centerX != null && gameplay.centerX != null ? gameplay.centerX - shell.centerX : null;
    const dy = shell.centerY != null && gameplay.centerY != null ? gameplay.centerY - shell.centerY : null;
    const dw = shell.width != null && gameplay.width != null ? gameplay.width - shell.width : null;
    const dh = shell.height != null && gameplay.height != null ? gameplay.height - shell.height : null;
    recordWartime('OWNERSHIP', 'PRESESSION_GEOMETRY_COMPARE', {
      phase: currentPhase,
      playerId,
      position,
      shellRenderer: shell,
      gameplayRenderer: gameplay,
      deltaX: dx,
      deltaY: dy,
      deltaWidth: dw,
      deltaHeight: dh,
      withinTolerance:
        dx != null && dy != null && dw != null && dh != null
          ? Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(dw) < 2 && Math.abs(dh) < 2
          : null,
      bothVisible: shell.visible && gameplay.visible,
    });
  }
}
