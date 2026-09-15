/** Observation only. No card values, gameplay writes, polling or React state. */
export interface CardVisibilityContract {
  gameId: string; dealerGameId: string | null; roundId: string | null;
  handNumber: number; roundNumber: number; handContextId: string;
  runtimeHandContextId: string | null; viewerId: string; playerId?: string | null;
  gameType: 'holm-game' | '3-5-7'; phase: string; active: boolean;
  selfExpected: number; communityExpected: number; communityFaces: number;
  selfDataCount: number; communityDataCount: number;
  settledCount: number; pendingIntents: number; paused: boolean; canAct: boolean;
}
export interface CardVisibilitySample {
  at: number; reason: string; contract: CardVisibilityContract;
  self: { nodes: number; visible: number; faces: number; blocked: string[] };
  community: { nodes: number; visible: number; faces: number; blocked: string[] };
  failures: string[];
}
type Boundary = { gameId: string; at: number; kind: 'fetch-start' | 'fetch-finish'; sequence: number; roundId: string | null; outcome: string; durationMs: number };
let boundaries: Boundary[] = [];
export function recordCardVisibilityBoundary(event: Omit<Boundary, 'at'>) {
  boundaries = [...boundaries, { ...event, at: Date.now() }].slice(-24);
}
export function getCardVisibilityBoundaries(gameId: string) { return boundaries.filter(b => b.gameId === gameId); }
const CARD = '[data-playing-card-face], [data-canonical-card-back]';
const SELF = '[data-holm-active-hand-region], [data-357-active-hand-region]';
const COMMUNITY = '[data-holm-canonical-community-row]';
export const CARD_VISIBILITY_INTERVAL_MS = 250;

function visible(node: Element, styles: Map<Element, CSSStyleDeclaration>, rects: Map<Element, DOMRect>): string | null {
  const bounds = (el: Element) => {
    let r = rects.get(el); if (!r) { r = el.getBoundingClientRect(); rects.set(el, r); } return r;
  };
  const rect = bounds(node);
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
  let parent: Element | null = node;
  for (let depth = 0; parent && depth < 32; depth++, parent = parent.parentElement) {
    let style = styles.get(parent);
    if (!style) { style = getComputedStyle(parent); styles.set(parent, style); }
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return `hidden-ancestor:${depth}`;
    if (parent !== node && /(hidden|clip|scroll|auto)/.test(style.overflowX + style.overflowY)) {
      const clip = bounds(parent);
      if (/(hidden|clip|scroll|auto)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/(hidden|clip|scroll|auto)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
  }
  return right - left > 1 && bottom - top > 1 ? null : 'zero-area-or-clipped';
}

export function sampleCardVisibility(root: HTMLElement, contract: CardVisibilityContract, reason: string): CardVisibilitySample {
  const styles = new Map<Element, CSSStyleDeclaration>();
  const rects = new Map<Element, DOMRect>();
  const scan = (selector: string, expected: number) => {
    const out = { nodes: 0, visible: 0, faces: 0, blocked: [] as string[] };
    if (!expected) return out;
    const area = root.querySelector(selector);
    if (!area) { out.blocked.push('surface-absent'); return out; }
    for (const node of Array.from(area.querySelectorAll(CARD)).slice(0, 16)) {
      out.nodes++;
      const blocked = visible(node, styles, rects);
      if (blocked) out.blocked.push(blocked);
      else { out.visible++; if (node.matches('[data-playing-card-face]')) out.faces++; }
    }
    return out;
  };
  const self = scan(SELF, contract.selfExpected);
  const community = scan(COMMUNITY, contract.communityExpected);
  const failures: string[] = [];
  if (contract.active) {
    if (contract.runtimeHandContextId !== contract.handContextId) failures.push('runtime-hand-mismatch');
    if (self.visible < contract.selfExpected || self.faces < contract.selfExpected) failures.push('self-cards-missing');
    if (community.visible < contract.communityExpected) failures.push('community-cards-missing');
    // A flip legitimately passes through an edge-on frame. Its completion is another observation boundary.
    if (!root.querySelector('[data-holm-card-flipping="1"]') && community.faces < contract.communityFaces) failures.push('community-faces-missing');
  }
  return { at: Date.now(), reason, contract: { ...contract }, self, community, failures };
}

export function observeCardVisibility(root: HTMLElement, read: () => CardVisibilityContract,
  incident: (failure: CardVisibilitySample, preceding: CardVisibilitySample[]) => void,
  measured?: (duration: number) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastAt = 0, candidate = '', lastScope = '', reason = 'mount', stopped = false;
  let candidateSample: CardVisibilitySample | null = null;
  let history: CardVisibilitySample[] = [];
  const reported = new Set<string>();
  const relevant = `${SELF}, ${COMMUNITY}`;
  const watched = new Set<Element>();
  const resize = new ResizeObserver(() => schedule('resize'));
  const ancestors = new MutationObserver(() => schedule('ancestor-style'));
  const cardStyles = new MutationObserver(() => schedule('card-style'));
  function bindGeometry() {
    const next = new Set<Element>();
    const areas = Array.from(root.querySelectorAll(relevant));
    for (const area of [root, ...areas]) {
      let node: Element | null = area;
      for (let depth = 0; node && depth < 32; depth++, node = node.parentElement) {
        if (next.has(node)) break;
        next.add(node);
      }
    }
    if (next.size === watched.size && [...next].every(n => watched.has(n))) return;
    resize.disconnect(); ancestors.disconnect(); cardStyles.disconnect(); watched.clear();
    for (const area of areas) cardStyles.observe(area, { attributes: true, subtree: true,
      attributeFilter: ['style', 'class', 'hidden', 'data-holm-card-flipping', 'data-holm-card-presentation'] });
    for (const node of next) {
      watched.add(node); resize.observe(node);
      ancestors.observe(node, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    }
  }
  function check() {
    timer = undefined;
    if (stopped || document.visibilityState !== 'visible') return;
    const contract = read();
    if (!contract.active) { candidate = ''; candidateSample = null; return; }
    const scope = `${contract.gameId}:${contract.handContextId}:${contract.roundNumber}`;
    if (scope !== lastScope) { candidate = ''; candidateSample = null; lastScope = scope; }
    const start = performance.now();
    bindGeometry();
    const sample = sampleCardVisibility(root, contract, reason);
    lastAt = performance.now();
    measured?.(lastAt - start);
    const key = `${scope}:${sample.failures.join(',')}`;
    if (sample.failures.length && key === candidate && !reported.has(key)) {
      reported.add(key);
      if (reported.size > 64) reported.delete(reported.values().next().value!);
      // Copy the first failing sample, not a later recovered screen.
      incident(candidateSample ?? sample, history.slice(-12));
    }
    const changed = !history.length || JSON.stringify(sample.contract) !== JSON.stringify(history.at(-1)!.contract)
      || JSON.stringify([sample.self, sample.community, sample.failures]) !== JSON.stringify([history.at(-1)!.self, history.at(-1)!.community, history.at(-1)!.failures]);
    if (changed) history = [...history, sample].slice(-16);
    if (key !== candidate) candidateSample = sample.failures.length ? sample : null;
    candidate = sample.failures.length ? key : '';
    // One confirmation only; no recurring scan of an unchanged failure.
    if (sample.failures.length && !reported.has(key)) schedule('confirm');
  }
  function schedule(nextReason = 'commit') {
    if (stopped) return;
    reason = nextReason;
    if (timer !== undefined) return;
    timer = setTimeout(check, Math.max(0, CARD_VISIBILITY_INTERVAL_MS - (performance.now() - lastAt)));
  }
  const mutation = new MutationObserver(records => {
    if (records.some(record => {
      const el = record.target instanceof Element ? record.target : record.target.parentElement;
      return el?.closest(relevant) || [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches(relevant) || !!node.querySelector(relevant)));
    })) schedule('card-dom');
  });
  // The shell contains timers/chips/other seats. Their animation attributes are not card evidence.
  mutation.observe(root, { subtree: true, childList: true });
  const lifecycle = () => { candidate = ''; candidateSample = null; schedule('browser-return'); };
  const animation = (event: Event) => { if (event.target instanceof Element && event.target.closest(relevant)) schedule('animation-end'); };
  document.addEventListener('visibilitychange', lifecycle);
  window.addEventListener('pageshow', lifecycle); window.addEventListener('online', lifecycle);
  root.addEventListener('transitionend', animation); root.addEventListener('animationend', animation);
  bindGeometry(); schedule();
  return { update(nextReason = 'commit') {
    // A changed admission invalidates the pending confirmation even if the
    // intermediate Cards-tab/phase state is coalesced out of the next scan.
    candidate = ''; candidateSample = null; schedule(nextReason);
  }, stop() {
    stopped = true; clearTimeout(timer); resize.disconnect(); mutation.disconnect(); ancestors.disconnect(); cardStyles.disconnect();
    document.removeEventListener('visibilitychange', lifecycle);
    window.removeEventListener('pageshow', lifecycle); window.removeEventListener('online', lifecycle);
    root.removeEventListener('transitionend', animation); root.removeEventListener('animationend', animation);
  } };
}
