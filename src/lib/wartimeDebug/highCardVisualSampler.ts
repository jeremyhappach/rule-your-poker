/**
 * High-Card Visual Sampler — rAF-driven DOM/CSS/overlay introspection
 * scoped to the active high-card window. Emits visual snapshots only on
 * signature change so the trace is not flooded.
 *
 * Lives outside of React. start/stop from the high-card hook lifecycle.
 *
 * Captures:
 *   - DOM card count / keys / rects / computed styles (display, visibility,
 *     opacity, transform, zIndex, pointerEvents)
 *   - container rect + computed styles
 *   - parent chain visibility / opacity walk
 *   - elementFromPoint at card centers (covering element detection)
 *   - visible-surface stack discovered via [data-wartime-surface] attrs
 *
 * Goal: prove whether the visual layer flickered (DOM mutation, CSS hide,
 * overlay cover, parent collapse) when hook state did not.
 */

import { recordWartime } from './core';

export interface HighCardSamplerStart {
  gameId: string;
  componentKey: string;
  renderPath: string;
  selectedCardsSource: string;
  surfaceInstanceId: string;
  getHookState: () => {
    hookCardsLength: number;
    hookCardIds: string[];
    expectedCardIds: string[];
    gameStatus: string | null;
    winnerPosition: number | null;
    isComplete: boolean;
  };
}

interface Active extends HighCardSamplerStart {
  rafId: number | null;
  lastSignature: string | null;
  startedAtMs: number;
  emitCount: number;
}

const _active = new Map<string, Active>();

function _safeStyle(el: Element | null): Record<string, string> | null {
  if (!el || typeof window === 'undefined') return null;
  try {
    const cs = window.getComputedStyle(el as HTMLElement);
    return {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      transform: cs.transform,
      zIndex: cs.zIndex,
      pointerEvents: cs.pointerEvents,
      overflow: cs.overflow,
      clipPath: cs.clipPath,
    };
  } catch {
    return null;
  }
}

function _rect(el: Element | null) {
  if (!el) return null;
  try {
    const r = (el as HTMLElement).getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx: Math.round(r.x + r.width / 2),
      cy: Math.round(r.y + r.height / 2),
    };
  } catch {
    return null;
  }
}

function _describe(el: Element | null): string | null {
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
  const wartime = el.getAttribute('data-wartime-surface') ?? el.getAttribute('data-wartime-high-card') ?? null;
  const w = wartime ? `[wartime=${wartime}]` : '';
  return `${tag}${id}${cls ? '.' + cls : ''}${w}`;
}

function _parentChain(el: Element | null, depth = 6) {
  const chain: Array<{ desc: string | null; style: Record<string, string> | null; rect: ReturnType<typeof _rect> }> = [];
  let cur: Element | null = el?.parentElement ?? null;
  while (cur && chain.length < depth) {
    chain.push({ desc: _describe(cur), style: _safeStyle(cur), rect: _rect(cur) });
    cur = cur.parentElement;
  }
  return chain;
}

function _visibleSurfaceStack(): string[] {
  if (typeof document === 'undefined') return [];
  try {
    return Array.from(document.querySelectorAll('[data-wartime-surface]'))
      .map((n) => n.getAttribute('data-wartime-surface'))
      .filter((s): s is string => !!s);
  } catch {
    return [];
  }
}

function _coveringElement(cx: number, cy: number, expected: Element | null) {
  if (typeof document === 'undefined') return null;
  try {
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return null;
    if (expected && (hit === expected || expected.contains(hit) || hit.contains(expected))) {
      return { desc: _describe(hit), isExpected: true };
    }
    return { desc: _describe(hit), isExpected: false, style: _safeStyle(hit), rect: _rect(hit) };
  } catch {
    return null;
  }
}

function _tick(gameId: string) {
  const a = _active.get(gameId);
  if (!a) return;

  const hook = (() => {
    try { return a.getHookState(); } catch { return null; }
  })();

  // Renderer-instance attribution: enumerate EVERY container that
  // claims to be the high-card surface for this gameId. Previously
  // we used `querySelector` (singular) which silently picked one of
  // potentially-multiple containers (MobileGameTable's
  // session-dealer-selection overlay AND CribbageMobileGameTable's
  // cribbage-dealer-selection overlay both tag themselves with the
  // same `data-wartime-high-card-container=${gameId}`). When the
  // hook fed cards to one renderer but the sampler measured the
  // other, the divergence appeared as hookCardsLength=N /
  // domCardCount=0 with no explanation. Now we sample ALL matching
  // containers and emit a per-container snapshot.
  const containers =
    typeof document !== 'undefined'
      ? Array.from(document.querySelectorAll(`[data-wartime-high-card-container="${gameId}"]`))
      : [];

  // Aggregate DOM info across all containers for the legacy summary
  // fields (kept for backward compatibility with existing exports).
  const allCardNodes = containers.flatMap((c) =>
    Array.from(c.querySelectorAll('[data-wartime-high-card]')),
  );
  const aggregateDomCount = allCardNodes.length;

  // Per-container detail. Each entry is a self-contained snapshot of
  // ONE renderer instance — the active visual renderer can now be
  // identified by its `rendererInstanceId` + `componentName` instead
  // of inferred.
  const perContainer = containers.map((container) => {
    const cardNodes = Array.from(container.querySelectorAll('[data-wartime-high-card]'));
    const domCardKeys = cardNodes.map((n) => n.getAttribute('data-card-key') ?? '?');
    const domCardIds = cardNodes.map((n) => n.getAttribute('data-card-id') ?? '?');
    const domCardRects = cardNodes.map((n) => _rect(n));
    const domCardStyles = cardNodes.map((n) => _safeStyle(n));
    const coverings = cardNodes.map((n) => {
      const r = _rect(n);
      if (!r) return null;
      return _coveringElement(r.cx, r.cy, n);
    });
    return {
      rendererInstanceId:
        container.getAttribute('data-wartime-renderer-instance') ?? null,
      componentName:
        container.getAttribute('data-wartime-component') ?? null,
      renderBranch:
        container.getAttribute('data-wartime-render-branch') ?? null,
      containerRect: _rect(container),
      containerStyle: _safeStyle(container),
      parentChain: _parentChain(container),
      domCardCount: cardNodes.length,
      domCardKeys,
      domCardIds,
      domCardRects,
      domCardStyles,
      coverings,
    };
  });

  const visibleSurfaces = _visibleSurfaceStack();

  // Choose a "primary" container for legacy fields: prefer one that
  // actually has cards in the DOM, else fall back to the first.
  const primary =
    perContainer.find((c) => c.domCardCount > 0) ?? perContainer[0] ?? null;

  const signature = JSON.stringify({
    aggregateDomCount,
    containerCount: containers.length,
    perContainer: perContainer.map((c) => ({
      id: c.rendererInstanceId,
      comp: c.componentName,
      branch: c.renderBranch,
      n: c.domCardCount,
      keys: c.domCardKeys,
      styles: c.domCardStyles,
      rects: c.domCardRects,
      covers: c.coverings.map((cv) => (cv ? `${cv.desc}|${(cv as any).isExpected ? 1 : 0}` : 'none')),
      cstyle: c.containerStyle,
      crect: !!c.containerRect,
    })),
    hookLen: hook?.hookCardsLength ?? -1,
    visibleSurfaces,
  });

  if (signature !== a.lastSignature) {
    a.lastSignature = signature;
    a.emitCount += 1;
    recordWartime('RENDERING', 'high-card.visual.snapshot', {
      gameId,
      surfaceInstanceId: a.surfaceInstanceId,
      componentKey: a.componentKey,
      renderPath: a.renderPath,
      selectedCardsSource: a.selectedCardsSource,
      gameStatus: hook?.gameStatus ?? null,
      hookCardsLength: hook?.hookCardsLength ?? null,
      hookCardIds: hook?.hookCardIds ?? null,
      expectedCardIds: hook?.expectedCardIds ?? null,
      winnerPosition: hook?.winnerPosition ?? null,
      isComplete: hook?.isComplete ?? null,
      // Legacy fields kept for back-compat (primary renderer instance):
      domCardCount: primary?.domCardCount ?? 0,
      domCardKeys: primary?.domCardKeys ?? [],
      domCardIds: primary?.domCardIds ?? [],
      domCardRects: primary?.domCardRects ?? [],
      domCardComputedStyle: primary?.domCardStyles ?? [],
      coveringElementAtCardCenter: primary?.coverings ?? [],
      cardContainerPresent: containers.length > 0,
      cardContainerRect: primary?.containerRect ?? null,
      cardContainerComputedStyle: primary?.containerStyle ?? null,
      parentChain: primary?.parentChain ?? [],
      visibleSurfaceStack: visibleSurfaces,
      // New per-renderer-instance attribution:
      rendererInstanceCount: containers.length,
      activeRendererInstanceId: primary?.rendererInstanceId ?? null,
      activeRendererComponent: primary?.componentName ?? null,
      activeRendererBranch: primary?.renderBranch ?? null,
      aggregateDomCardCount: aggregateDomCount,
      perRendererInstance: perContainer,
      emitCount: a.emitCount,
      sampledAtMs: Math.round(performance.now() - a.startedAtMs),
    });

    // HIGH_CARD_STATE_VISUAL_DIVERGENCE — emit when the AGGREGATE
    // DOM card count diverges from hook card count. Previously this
    // compared hook vs a single (possibly wrong) container, which
    // produced false positives whenever a second renderer instance
    // was also mounted. Aggregate count + per-instance detail closes
    // the renderer-identity gap requested by Wartime.
    if (hook && hook.hookCardsLength !== aggregateDomCount) {
      recordWartime('RENDERING', 'HIGH_CARD_STATE_VISUAL_DIVERGENCE', {
        gameId,
        surfaceInstanceId: a.surfaceInstanceId,
        componentKey: a.componentKey,
        renderPath: a.renderPath,
        hookCardsLength: hook.hookCardsLength,
        hookCardIds: hook.hookCardIds,
        domCardCount: aggregateDomCount,
        domCardKeys: perContainer.flatMap((c) => c.domCardKeys),
        domCardIds: perContainer.flatMap((c) => c.domCardIds),
        rendererInstanceCount: containers.length,
        perRendererInstance: perContainer.map((c) => ({
          rendererInstanceId: c.rendererInstanceId,
          componentName: c.componentName,
          renderBranch: c.renderBranch,
          domCardCount: c.domCardCount,
          domCardIds: c.domCardIds,
        })),
        winnerPosition: hook.winnerPosition,
        isComplete: hook.isComplete,
        gameStatus: hook.gameStatus,
        sampledAtMs: Math.round(performance.now() - a.startedAtMs),
      });
    }
  }

  a.rafId = typeof window !== 'undefined' ? window.requestAnimationFrame(() => _tick(gameId)) : null;
}


export function startHighCardVisualSampler(args: HighCardSamplerStart): void {
  if (typeof window === 'undefined') return;
  // Stop any prior sampler for this gameId before starting.
  stopHighCardVisualSampler(args.gameId);
  const a: Active = {
    ...args,
    rafId: null,
    lastSignature: null,
    startedAtMs: performance.now(),
    emitCount: 0,
  };
  _active.set(args.gameId, a);
  recordWartime('LIFECYCLE', 'high-card.visual.sampler-start', {
    gameId: args.gameId,
    componentKey: args.componentKey,
    renderPath: args.renderPath,
    selectedCardsSource: args.selectedCardsSource,
    surfaceInstanceId: args.surfaceInstanceId,
  });
  a.rafId = window.requestAnimationFrame(() => _tick(args.gameId));
}

export function stopHighCardVisualSampler(gameId: string): void {
  const a = _active.get(gameId);
  if (!a) return;
  if (a.rafId !== null && typeof window !== 'undefined') {
    try { window.cancelAnimationFrame(a.rafId); } catch { /* ignore */ }
  }
  _active.delete(gameId);
  recordWartime('LIFECYCLE', 'high-card.visual.sampler-stop', {
    gameId,
    emitCount: a.emitCount,
    durationMs: Math.round(performance.now() - a.startedAtMs),
  });
}
