/**
 * holmPostWinHandoff — derived export view + DOM visual probe for the
 * Holm post-win → neutral-interstitial handoff window.
 *
 * SINGLE-RECORDER CONTRACT
 * ------------------------
 * This module does NOT own a buffer. It only:
 *   1. Adds a DOM-level visual probe (`probeHolmPostWinHandoff`) whose
 *      results are emitted through the existing `ffRecord` → wartime
 *      recorder.
 *   2. Derives a focused, filtered text export from the wartime ring
 *      buffer (`buildHolmPostWinHandoffText`) and triggers a `.txt`
 *      download (`downloadHolmPostWinHandoffTxt`).
 *
 * No second buffer, no second recorder, no new debug pill.
 */

import {
  formatWartimeEventsAsText,
  getWartimeEvents,
  type WartimeEvent,
} from './core';

// ---------------------------------------------------------------------
// Visual probe
// ---------------------------------------------------------------------

export interface HandoffProbeIdentity {
  gameId?: string | null;
  handContextId?: string | null;
}

interface SurfaceSnapshot {
  selector: string;
  found: boolean;
  count: number;
  display: string | null;
  visibility: string | null;
  opacity: string | null;
  rect: { x: number; y: number; w: number; h: number } | null;
  topmostAtCenter: boolean | null;
  topmostTag: string | null;
  topmostMatchesSelf: boolean | null;
}

export interface HandoffProbeResult {
  identity: HandoffProbeIdentity;
  neutral: SurfaceSnapshot;
  oldHolm: {
    activeHand: SurfaceSnapshot;
    loneFan: SurfaceSnapshot;
    chuckyStage: SurfaceSnapshot;
    communityStage: SurfaceSnapshot;
    rabbitLabel: SurfaceSnapshot;
  };
  neutralVisuallyPainted: boolean;
  oldHolmVisuallyExposed: boolean;
  exclusive: boolean;
}

function snapshotSurface(selector: string): SurfaceSnapshot {
  if (typeof document === 'undefined') {
    return {
      selector, found: false, count: 0, display: null, visibility: null,
      opacity: null, rect: null, topmostAtCenter: null, topmostTag: null,
      topmostMatchesSelf: null,
    };
  }
  const nodes = document.querySelectorAll<HTMLElement>(selector);
  if (nodes.length === 0) {
    return {
      selector, found: false, count: 0, display: null, visibility: null,
      opacity: null, rect: null, topmostAtCenter: null, topmostTag: null,
      topmostMatchesSelf: null,
    };
  }
  // Use first node for primary snapshot; aggregate visibility/hit-test
  // across all matched nodes.
  const first = nodes[0];
  const cs = window.getComputedStyle(first);
  const rect = first.getBoundingClientRect();
  let topmostMatchesSelf = false;
  let topmostTag: string | null = null;
  let anyHit = false;
  for (const node of Array.from(nodes)) {
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
    const stack = document.elementsFromPoint(cx, cy);
    if (stack.length === 0) continue;
    const top = stack[0] as HTMLElement;
    if (!topmostTag) topmostTag = top.tagName.toLowerCase();
    if (node === top || node.contains(top) || top.contains(node)) {
      topmostMatchesSelf = true;
      anyHit = true;
      break;
    }
    // Hit-visible if any ancestor of the topmost element is one of our nodes
    if (Array.from(nodes).some((n) => n === top || n.contains(top))) {
      topmostMatchesSelf = true;
      anyHit = true;
      break;
    }
  }
  if (!anyHit) {
    // Mark as not topmost but still record DOM presence.
    topmostMatchesSelf = false;
  }
  return {
    selector,
    found: true,
    count: nodes.length,
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    topmostAtCenter: anyHit,
    topmostTag,
    topmostMatchesSelf,
  };
}

function isVisuallyExposed(s: SurfaceSnapshot): boolean {
  if (!s.found) return false;
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  if (s.opacity != null && parseFloat(s.opacity) <= 0.01) return false;
  if (!s.rect || s.rect.w <= 0 || s.rect.h <= 0) return false;
  // Visually exposed if its center is in the hit-test stack.
  return s.topmostMatchesSelf === true;
}

function isPainted(s: SurfaceSnapshot): boolean {
  return s.found && s.rect != null && s.rect.w > 0 && s.rect.h > 0 &&
    s.display !== 'none' && s.visibility !== 'hidden' &&
    (s.opacity == null || parseFloat(s.opacity) > 0.01);
}

export const HANDOFF_SELECTORS = {
  neutral: '[data-canonical-shell-neutral]',
  activeHand: '[data-holm-active-hand-region]',
  loneFan: '[data-holm-lone-player-fan]',
  chuckyStage: '[data-card-anchor^="chucky-"]',
  communityStage: '[data-holm-canonical-community-row], [data-card-anchor^="community-"]',
  rabbitLabel: '[data-rabbit-hunt-label]',
} as const;

export function probeHolmPostWinHandoff(
  identity: HandoffProbeIdentity,
): HandoffProbeResult {
  const neutral = snapshotSurface(HANDOFF_SELECTORS.neutral);
  const activeHand = snapshotSurface(HANDOFF_SELECTORS.activeHand);
  const loneFan = snapshotSurface(HANDOFF_SELECTORS.loneFan);
  const chuckyStage = snapshotSurface(HANDOFF_SELECTORS.chuckyStage);
  const communityStage = snapshotSurface(HANDOFF_SELECTORS.communityStage);
  const rabbitLabel = snapshotSurface(HANDOFF_SELECTORS.rabbitLabel);

  const neutralVisuallyPainted = isPainted(neutral);
  const oldHolmVisuallyExposed =
    isVisuallyExposed(activeHand) ||
    isVisuallyExposed(loneFan) ||
    isVisuallyExposed(chuckyStage) ||
    isVisuallyExposed(communityStage) ||
    isVisuallyExposed(rabbitLabel);

  return {
    identity,
    neutral,
    oldHolm: { activeHand, loneFan, chuckyStage, communityStage, rabbitLabel },
    neutralVisuallyPainted,
    oldHolmVisuallyExposed,
    exclusive: neutralVisuallyPainted && !oldHolmVisuallyExposed,
  };
}

// ---------------------------------------------------------------------
// Derived export — filtered slice of the wartime ring
// ---------------------------------------------------------------------

// Anchor markers / event substrings that pin handoff-relevant moments.
const ANCHOR_PATTERNS: RegExp[] = [
  /POST_WIN_INTERVAL_OPEN/,
  /POST_WIN_INTERVAL_CLOSE/,
  /HOLM_TERMINAL_LATCH_ACQUIRED/,
  /HOLM_TERMINAL_LATCH_RELEASED/,
  /HOLM_TERMINAL_LATCH_STATE/,
  /HOLM_TERMINAL_LATCH_CONSUMER_DIFF/,
  /HOLM_POST_WIN_HANDOFF_PROBE/,
  /HOLM_POST_WIN_NEUTRAL_EXCLUSIVE/,
  /slot-entered-neutral/,
  /slot-left-neutral/,
  /NeutralInterstitial/i,
  /PLAYFIELD_SLOT_DESIRED_IDENTITY/,
  /PLAYFIELD_SLOT_MOUNTED_IDENTITY/,
  /HOLM_LONE_FAN_RENDER/,
  /HOLM_SLOT_RENDER/,
  /HOLM_CHUCKY_RENDER_STATE/,
  /HOLM_CHUCKY_ADMISSION/,
  /HOLM_CHUCKY_REJECTION/,
  /HB_PRESENTATION_(RENDER|UNMOUNT)/,
  /rabbit/i,
];

function matchesAnchor(e: WartimeEvent): boolean {
  const hay = `${e.category} ${e.event}`;
  return ANCHOR_PATTERNS.some((re) => re.test(hay));
}

function findWindow(events: WartimeEvent[]): { startIdx: number; endIdx: number } | null {
  // Start: last POST_WIN_INTERVAL_OPEN OR HOLM_TERMINAL_LATCH_ACQUIRED
  // (prefer the latest one so we get the most-recent repro).
  let startIdx = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i].event;
    if (/POST_WIN_INTERVAL_OPEN/.test(ev) || /HOLM_TERMINAL_LATCH_ACQUIRED/.test(ev)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;

  // End: first HOLM_POST_WIN_NEUTRAL_EXCLUSIVE after start; else first
  // HOLM_TERMINAL_LATCH_RELEASED after start; else end of buffer.
  let endIdx = events.length - 1;
  for (let i = startIdx + 1; i < events.length; i += 1) {
    if (/HOLM_POST_WIN_NEUTRAL_EXCLUSIVE/.test(events[i].event)) { endIdx = i; break; }
  }
  if (endIdx === events.length - 1) {
    for (let i = startIdx + 1; i < events.length; i += 1) {
      if (/HOLM_TERMINAL_LATCH_RELEASED/.test(events[i].event)) { endIdx = i; break; }
    }
  }
  return { startIdx, endIdx };
}

const CONTEXT_RADIUS = 250;

export interface HandoffExportSlice {
  anchors: WartimeEvent[];
  sliceFromSeq: number | null;
  sliceToSeq: number | null;
  windowStartSeq: number | null;
  windowEndSeq: number | null;
  events: WartimeEvent[];
  totalRetained: number;
}

export function buildHolmPostWinHandoffSlice(
  source: WartimeEvent[] = getWartimeEvents(),
): HandoffExportSlice {
  if (source.length === 0) {
    return {
      anchors: [], sliceFromSeq: null, sliceToSeq: null,
      windowStartSeq: null, windowEndSeq: null, events: [], totalRetained: 0,
    };
  }
  const win = findWindow(source);
  if (!win) {
    return {
      anchors: [], sliceFromSeq: null, sliceToSeq: null,
      windowStartSeq: null, windowEndSeq: null, events: [], totalRetained: source.length,
    };
  }
  // All anchors inside the [startIdx, endIdx] window.
  const anchorIdxs: number[] = [];
  for (let i = win.startIdx; i <= win.endIdx; i += 1) {
    if (matchesAnchor(source[i])) anchorIdxs.push(i);
  }
  // Always include start + end as anchors.
  if (!anchorIdxs.includes(win.startIdx)) anchorIdxs.unshift(win.startIdx);
  if (!anchorIdxs.includes(win.endIdx)) anchorIdxs.push(win.endIdx);

  // ±CONTEXT_RADIUS around each anchor (merged).
  const include = new Set<number>();
  for (const a of anchorIdxs) {
    const lo = Math.max(0, a - CONTEXT_RADIUS);
    const hi = Math.min(source.length - 1, a + CONTEXT_RADIUS);
    for (let i = lo; i <= hi; i += 1) include.add(i);
  }
  // Also include the full window itself.
  for (let i = win.startIdx; i <= win.endIdx; i += 1) include.add(i);

  const idxs = Array.from(include).sort((a, b) => a - b);
  const events = idxs.map((i) => source[i]);
  const anchors = anchorIdxs.map((i) => source[i]);

  return {
    anchors,
    sliceFromSeq: events[0]?.seq ?? null,
    sliceToSeq: events[events.length - 1]?.seq ?? null,
    windowStartSeq: source[win.startIdx]?.seq ?? null,
    windowEndSeq: source[win.endIdx]?.seq ?? null,
    events,
    totalRetained: source.length,
  };
}

export function buildHolmPostWinHandoffText(
  source: WartimeEvent[] = getWartimeEvents(),
): string {
  const slice = buildHolmPostWinHandoffSlice(source);
  const header = [
    '━━━ HOLM POST-WIN HANDOFF (derived from wartime ring) ━━━',
    `exportedAt:        ${new Date().toISOString()}`,
    `totalRetained:     ${slice.totalRetained}`,
    `windowStartSeq:    ${slice.windowStartSeq ?? '—'}`,
    `windowEndSeq:      ${slice.windowEndSeq ?? '—'}`,
    `sliceFromSeq:      ${slice.sliceFromSeq ?? '—'}`,
    `sliceToSeq:        ${slice.sliceToSeq ?? '—'}`,
    `sliceEventCount:   ${slice.events.length}`,
    `anchorCount:       ${slice.anchors.length}`,
    `contextRadius:     ±${CONTEXT_RADIUS} events / anchor`,
    '',
    '— Anchors (chronological) —',
    ...(slice.anchors.length === 0
      ? ['(no anchors — no POST_WIN_INTERVAL_OPEN / HOLM_TERMINAL_LATCH_ACQUIRED in retained buffer)']
      : slice.anchors.map((a) =>
          `  seq=${String(a.seq).padStart(5, '0')} +${String(a.perfMs).padStart(7, ' ')}ms [${a.category}] ${a.event}`,
        )),
    '',
    '— Events —',
  ].join('\n');
  return `${header}\n${formatWartimeEventsAsText(slice.events)}\n`;
}

export function downloadHolmPostWinHandoffTxt(): void {
  if (typeof window === 'undefined') return;
  const text = buildHolmPostWinHandoffText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `holm-post-win-handoff-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
