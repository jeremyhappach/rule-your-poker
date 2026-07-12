/**
 * HudStackTraceProbe — narrow instrumentation probe mounted inside
 * ShellHudGrid, at the actual DOM owner of the HUD stack.
 *
 * Responsibilities (measurement-only):
 *   1. Receives a ref to the shell HUD-grid element (the authoritative
 *      HUD stack DOM owner: `[data-canonical-shell-hud-grid]`).
 *   2. On mount, on every render, on ResizeObserver notifications for
 *      the grid and its ancestors, and on every observed lifecycle
 *      transition (game type / game status / dealer-game / round /
 *      viewport / safe-area / HUD-policy CSS custom properties), it
 *      schedules a measurement inside `useLayoutEffect` +
 *      `requestAnimationFrame` — no state change, no reflow forced
 *      outside of read.
 *   3. Emits into hudStackTrace.ts if armed.
 *
 * Zero behavior contract:
 *   - Renders nothing (returns null).
 *   - Never mutates any style, class, ref target, or attribute.
 *   - Never sets React state that anything else reads.
 *
 * Ancestor chain walked (labelled by data-attribute):
 *   [data-canonical-shell-hud-grid]           HUD stack owner
 *   parent element of HUD grid                (active-player pane / game surface HUD host)
 *   [data-canonical-shell-slot-content]       gameplay slot content
 *   [data-canonical-shell-children]           children flex column
 *   [data-canonical-shell-column]             viewport grid
 *   [data-canonical-shell-root]               root mobile table container
 *   documentElement                            (viewport-safe-frame reference)
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { getLifecycleContext } from './lifecycleDebug';
import {
  isHudStackTraceArmed,
  recordHudStackEvent,
  setHudStackTraceAvailable,
} from './hudStackTrace';

const HUD_POLICY_VARS = [
  '--shell-hud-h',
  '--shell-hud-h-base',
  '--shell-play-h',
  '--shell-play-h-base',
  '--shell-felt-h',
  '--shell-flex-h',
  '--shell-header-h',
  '--hud-h-announcement',
  '--hud-h-timer',
  '--hud-h-tabs',
  '--hud-h-pane',
  '--hud-h-identity',
  '--hud-r-announcement',
  '--hud-r-timer',
  '--hud-r-tabs',
  '--hud-r-pane',
  '--hud-r-identity',
  '--play-safe-area-total',
  '--play-top-safe-area',
  '--hud-scale',
] as const;

const ANCESTOR_ATTRS: Array<{ attr: string; label: string }> = [
  { attr: 'data-canonical-shell-hud-grid', label: 'hud-grid' },
  { attr: 'data-canonical-shell-slot-content', label: 'shell-slot-content' },
  { attr: 'data-canonical-shell-children', label: 'shell-children' },
  { attr: 'data-canonical-shell-column', label: 'shell-column' },
  { attr: 'data-canonical-shell-root', label: 'shell-root' },
];

function rect(el: Element | null) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: Math.round(r.top * 100) / 100,
    bottom: Math.round(r.bottom * 100) / 100,
    left: Math.round(r.left * 100) / 100,
    right: Math.round(r.right * 100) / 100,
    width: Math.round(r.width * 100) / 100,
    height: Math.round(r.height * 100) / 100,
  };
}

function computed(el: Element | null, keys: readonly string[]): Record<string, string> {
  if (!(el instanceof HTMLElement) || typeof window === 'undefined') return {};
  const cs = window.getComputedStyle(el);
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = cs.getPropertyValue(k);
  return out;
}

const LAYOUT_KEYS = [
  'position', 'top', 'bottom', 'left', 'right', 'inset',
  'transform', 'translate',
  'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom',
  'height', 'minHeight', 'maxHeight',
  'display', 'alignItems', 'justifyContent', 'overflow', 'boxSizing',
  'flex', 'flexDirection', 'gridTemplateRows',
] as const;

function readPolicy(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const cs = window.getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const v of HUD_POLICY_VARS) {
    const val = cs.getPropertyValue(v).trim();
    if (val) out[v] = val;
  }
  return out;
}

function readSafeArea(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const cs = window.getComputedStyle(document.documentElement);
  return {
    'env-top': cs.getPropertyValue('--safe-area-inset-top').trim(),
    'env-bottom': cs.getPropertyValue('--safe-area-inset-bottom').trim(),
    'env-left': cs.getPropertyValue('--safe-area-inset-left').trim(),
    'env-right': cs.getPropertyValue('--safe-area-inset-right').trim(),
    'play-top-safe-area': cs.getPropertyValue('--play-top-safe-area').trim(),
    'play-safe-area-total': cs.getPropertyValue('--play-safe-area-total').trim(),
  };
}

interface AncestorSample {
  label: string;
  rect: ReturnType<typeof rect>;
  style: Record<string, string>;
}

function collectAncestorChain(gridEl: Element | null): AncestorSample[] {
  const chain: AncestorSample[] = [];
  if (!gridEl) return chain;
  // Start with the grid itself, then walk parentElements upward
  // capturing every labelled ancestor and the direct parent of the
  // grid (which is game-surface owned).
  chain.push({
    label: 'hud-grid',
    rect: rect(gridEl),
    style: computed(gridEl, [...LAYOUT_KEYS, '--shell-hud-h', '--shell-play-h']),
  });
  const parent = gridEl.parentElement;
  if (parent) {
    chain.push({
      label: 'hud-grid-parent',
      rect: rect(parent),
      style: computed(parent, LAYOUT_KEYS),
    });
  }
  let cur: Element | null = gridEl.parentElement;
  const wanted = new Set(ANCESTOR_ATTRS.slice(1).map(a => a.attr));
  while (cur) {
    for (const { attr, label } of ANCESTOR_ATTRS.slice(1)) {
      if (wanted.has(attr) && cur.hasAttribute(attr)) {
        chain.push({
          label,
          rect: rect(cur),
          style: computed(cur, LAYOUT_KEYS),
        });
        wanted.delete(attr);
      }
    }
    if (wanted.size === 0) break;
    cur = cur.parentElement;
  }
  return chain;
}

function contextSignature(): string {
  const c = getLifecycleContext();
  return [c.gameType, c.gameStatus, c.dealerGameId, c.roundId, c.feltOwnership, c.turnOwnerPlayerId].map(v => v ?? '∅').join('|');
}

function stable(o: unknown): string {
  try { return JSON.stringify(o); } catch { return String(o); }
}

export interface HudStackTraceProbeProps {
  gridRef: RefObject<HTMLElement>;
}

export function HudStackTraceProbe({ gridRef }: HudStackTraceProbeProps) {
  // Availability signal (drives the pill's visibility).
  useEffect(() => {
    setHudStackTraceAvailable(true);
    return () => setHudStackTraceAvailable(false);
  }, []);

  const prevRectRef = useRef<Record<string, ReturnType<typeof rect>>>({});
  const prevPolicyRef = useRef<string>('');
  const prevBranchRef = useRef<string>('');
  const prevCtxRef = useRef<string>('');

  const sample = (reason: string) => {
    if (!isHudStackTraceArmed()) return;
    const el = gridRef.current;
    const chain = collectAncestorChain(el);
    const ctx = getLifecycleContext();
    const policy = readPolicy();
    const safe = readSafeArea();
    const viewport = typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
      : null;

    // Render branch — coarse identity of who owns the HUD-grid parent.
    const parent = el?.parentElement ?? null;
    const branch = parent
      ? (parent.getAttribute('data-canonical-active-player-pane')
        ?? parent.getAttribute('data-canonical-shell-hud-host')
        ?? parent.className?.slice(0, 80)
        ?? parent.tagName)
      : 'no-parent';

    recordHudStackEvent('hudstack_measurement', {
      chain,
      policy,
      safeArea: safe,
      viewport,
      lifecycle: {
        gameType: ctx.gameType,
        gameStatus: ctx.gameStatus,
        dealerGameId: ctx.dealerGameId,
        roundId: ctx.roundId,
        feltOwnership: ctx.feltOwnership,
        currentGameUuid: ctx.currentGameUuid,
        turnOwnerPlayerId: ctx.turnOwnerPlayerId,
        shellRoute: ctx.shellRoute,
        clientRole: ctx.clientRole,
      },
      renderBranch: branch,
    }, reason);

    // Diffs
    const policySig = stable(policy);
    const branchSig = String(branch);
    const ctxSig = contextSignature();

    // Rect diffs per labelled ancestor
    const nextRects: Record<string, ReturnType<typeof rect>> = {};
    for (const c of chain) nextRects[c.label] = c.rect;
    const prev = prevRectRef.current;

    for (const label of Object.keys(nextRects)) {
      const nr = nextRects[label];
      const pr = prev[label];
      if (nr && pr && (Math.abs(nr.top - pr.top) >= 0.5 || Math.abs(nr.height - pr.height) >= 0.5)) {
        const evt = label === 'hud-grid' ? 'hudstack_rect_changed' : 'hudstack_ancestor_rect_changed';
        recordHudStackEvent(evt, {
          label,
          prev: pr,
          next: nr,
          deltaY: Math.round((nr.top - pr.top) * 100) / 100,
          deltaH: Math.round((nr.height - pr.height) * 100) / 100,
          transitionCtxPrev: prevCtxRef.current,
          transitionCtxNext: ctxSig,
        }, reason);
        // Contradiction check — HUD grid moved but no policy/branch/viewport change
        if (
          label === 'hud-grid'
          && policySig === prevPolicyRef.current
          && branchSig === prevBranchRef.current
          && Math.abs(nr.top - pr.top) >= 1
        ) {
          recordHudStackEvent('hudstack_moved_without_policy_change', {
            prevTop: pr.top,
            nextTop: nr.top,
            deltaY: Math.round((nr.top - pr.top) * 100) / 100,
            policy,
            branch,
            lifecyclePrev: prevCtxRef.current,
            lifecycleNext: ctxSig,
          }, reason);
        }
      }
    }
    prevRectRef.current = nextRects;

    if (policySig !== prevPolicyRef.current) {
      recordHudStackEvent('hudstack_policy_changed', {
        prev: prevPolicyRef.current ? JSON.parse(prevPolicyRef.current) : null,
        next: policy,
      }, reason);
      prevPolicyRef.current = policySig;
    }
    if (branchSig !== prevBranchRef.current) {
      recordHudStackEvent('hudstack_render_branch_changed', {
        prev: prevBranchRef.current || null,
        next: branchSig,
      }, reason);
      prevBranchRef.current = branchSig;
    }
    prevCtxRef.current = ctxSig;
  };

  // Sample on every commit — one rAF after layout — for lifecycle sync.
  useLayoutEffect(() => {
    let raf = 0;
    if (typeof requestAnimationFrame !== 'undefined') {
      raf = requestAnimationFrame(() => sample('commit'));
    } else {
      sample('commit');
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  });

  // ResizeObserver — grid + its immediate parent + shell-root.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = gridRef.current;
    if (!el) return;
    const targets: Element[] = [el];
    if (el.parentElement) targets.push(el.parentElement);
    const shellRoot = document.querySelector('[data-canonical-shell-root]');
    if (shellRoot) targets.push(shellRoot);
    const ro = new ResizeObserver(() => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => sample('resize'));
      } else {
        sample('resize');
      }
    });
    for (const t of targets) ro.observe(t);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridRef]);

  // Window resize / orientation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => sample('viewport'));
      } else {
        sample('viewport');
      }
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default HudStackTraceProbe;
