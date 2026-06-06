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

  const container =
    typeof document !== 'undefined'
      ? document.querySelector(`[data-wartime-high-card-container="${gameId}"]`)
      : null;

  const cardNodes = container
    ? Array.from(container.querySelectorAll('[data-wartime-high-card]'))
    : [];

  const domCardKeys = cardNodes.map((n) => n.getAttribute('data-card-key') ?? '?');
  const domCardIds = cardNodes.map((n) => n.getAttribute('data-card-id') ?? '?');
  const domCardRects = cardNodes.map((n) => _rect(n));
  const domCardStyles = cardNodes.map((n) => _safeStyle(n));
  const coverings = cardNodes.map((n) => {
    const r = _rect(n);
    if (!r) return null;
    return _coveringElement(r.cx, r.cy, n);
  });

  const containerRect = _rect(container);
  const containerStyle = _safeStyle(container);
  const parentChain = _parentChain(container);
  const visibleSurfaces = _visibleSurfaceStack();

  // Signature combines structural + style fingerprints. Visual-only changes
  // (e.g. opacity flicker) will alter this signature and trigger an emit
  // even when hook card state is stable.
  const signature = JSON.stringify({
    domCount: cardNodes.length,
    domCardKeys,
    domCardStyles,
    domCardRects,
    containerStyle,
    containerRectPresent: !!containerRect,
    coverings: coverings.map((c) => (c ? `${c.desc}|${(c as any).isExpected ? 1 : 0}` : 'none')),
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
      domCardCount: cardNodes.length,
      domCardKeys,
      domCardIds,
      domCardRects,
      domCardComputedStyle: domCardStyles,
      coveringElementAtCardCenter: coverings,
      cardContainerPresent: !!container,
      cardContainerRect: containerRect,
      cardContainerComputedStyle: containerStyle,
      parentChain,
      visibleSurfaceStack: visibleSurfaces,
      emitCount: a.emitCount,
      sampledAtMs: Math.round(performance.now() - a.startedAtMs),
    });
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
