/**
 * holmFullForensics — INSTRUMENTATION ONLY. No fixes, no behavior changes.
 *
 * Central persistent append-only recorder for Holm wartime forensics.
 *
 * Goals (per user spec):
 *   - Persist across route/component/unmount boundaries (module-singleton on window).
 *   - Retain >= 25,000 events with ordinal stability.
 *   - Episode pinning so an active episode's events are never evicted.
 *   - Emit FORENSICS_CAP_REACHED before pinned events would be dropped.
 *   - Two episode types: TIMER_BAR_EPISODE, RUNBACK_HOLM_EPISODE.
 *   - Static coverage map emitted at startup naming every owner inventoried,
 *     including those declared INSTRUMENTATION_PENDING with reason.
 *   - Per-record schema: ordinal, perfMs, dateMs, timelineMs, episodeIds,
 *     identity tuple, owner instance ID, DOM node ID, file/function/line,
 *     stable writerId, source category, prior→next, guard operands.
 *   - DOM/CSS/WAAPI/RAF visual sampler for the ShellTimerRail subtree.
 *   - Bridges to existing forensics files (no duplication).
 *
 * Honest disclosure:
 *   Many writer sites listed in the static inventory are declared
 *   INSTRUMENTATION_PENDING (see COVERAGE map). The export must not be
 *   read as proof of completeness — read the coverage map first.
 */

// ---------- Types ----------
export type FFSourceCategory =
  | 'AUTHORITATIVE_INPUT'
  | 'OPTIMISTIC_INPUT'
  | 'CACHE_INPUT'
  | 'REALTIME_INPUT'
  | 'QUERY_RESULT'
  | 'PARENT_DERIVATION'
  | 'PARENT_RENDER'
  | 'RAIL_RENDER'
  | 'IDENTITY_RESET'
  | 'INSERTION_EFFECT'
  | 'LAYOUT_EFFECT'
  | 'EFFECT'
  | 'RAF_1'
  | 'RAF_2'
  | 'RAF_FRAME'
  | 'TIMEOUT'
  | 'INTERVAL'
  | 'TICK'
  | 'REF_WRITE'
  | 'STATE_SETTER'
  | 'MEMO_RECOMPUTE'
  | 'CALLBACK_RECREATE'
  | 'CSS_CLASS'
  | 'CSS_RULE'
  | 'DOM_MUTATION'
  | 'RESIZE'
  | 'VISIBILITY'
  | 'TRANSITION_EVENT'
  | 'ANIMATION_EVENT'
  | 'REACT_REMOUNT'
  | 'ERROR_BOUNDARY'
  | 'BRIDGE'
  | 'COVERAGE'
  | 'EPISODE'
  | 'TERMINAL'
  | 'UNKNOWN';

export interface FFIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  hci?: string | null;
  generation?: number | null;
  userId?: string | null;
  playerId?: string | null;
  turnId?: string | null;
  ownerInstanceId?: string | null;
  domNodeId?: string | null;
  reactKey?: string | null;
}

export interface FFRecord {
  ordinal: number;
  perfMs: number;
  dateMs: number;
  timelineMs: number | null;
  episodeIds: string[];
  identity: FFIdentity;
  writerId: string;
  source: FFSourceCategory;
  marker: string;
  prior?: unknown;
  next?: unknown;
  guard?: Record<string, unknown>;
  callback?: string | null;
  file?: string | null;
  fn?: string | null;
  line?: number | null;
  stack?: string | null;
  payload?: Record<string, unknown>;
}

export interface FFEpisode {
  id: string;
  kind: 'TIMER_BAR_EPISODE' | 'RUNBACK_HOLM_EPISODE';
  startedAtPerfMs: number;
  startedAtDateMs: number;
  endedAtPerfMs: number | null;
  identity: FFIdentity;
  reason: string;
  derivedStallDeadlineMs?: number | null;
  derivedStallInputs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

// ---------- Persistent global store ----------
interface FFGlobal {
  records: FFRecord[];
  episodes: FFEpisode[];
  pinnedRecordOrdinals: Set<number>;
  ordinal: number;
  cap: number;
  capReachedEmitted: boolean;
  coverageEmitted: boolean;
  installed: boolean;
}

declare global {
  interface Window {
    __holmFullForensics?: FFGlobal;
  }
}

function _g(): FFGlobal {
  if (typeof window === 'undefined') {
    // SSR safety; return an isolated instance.
    return {
      records: [],
      episodes: [],
      pinnedRecordOrdinals: new Set(),
      ordinal: 0,
      cap: 25000,
      capReachedEmitted: false,
      coverageEmitted: false,
      installed: false,
    };
  }
  if (!window.__holmFullForensics) {
    window.__holmFullForensics = {
      records: [],
      episodes: [],
      pinnedRecordOrdinals: new Set(),
      ordinal: 0,
      cap: 25000,
      capReachedEmitted: false,
      coverageEmitted: false,
      installed: false,
    };
  }
  return window.__holmFullForensics;
}

function _now(): { perfMs: number; dateMs: number; timelineMs: number | null } {
  const perfMs =
    typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const dateMs = Date.now();
  let timelineMs: number | null = null;
  try {
    timelineMs = typeof document !== 'undefined' && (document as any).timeline?.currentTime != null
      ? Number((document as any).timeline.currentTime)
      : null;
  } catch { /* noop */ }
  return { perfMs, dateMs, timelineMs };
}

function _stack(skip = 2): string | null {
  try {
    const e = new Error();
    const lines = (e.stack ?? '').split('\n').slice(skip);
    return lines.join('\n');
  } catch { return null; }
}

// ---------- Public API ----------
export function ffRecord(input: {
  writerId: string;
  source: FFSourceCategory;
  marker: string;
  identity?: FFIdentity;
  prior?: unknown;
  next?: unknown;
  guard?: Record<string, unknown>;
  callback?: string | null;
  file?: string | null;
  fn?: string | null;
  line?: number | null;
  payload?: Record<string, unknown>;
  episodeIds?: string[];
  captureStack?: boolean;
}): FFRecord {
  const g = _g();
  const { perfMs, dateMs, timelineMs } = _now();
  const ordinal = ++g.ordinal;
  const episodeIds = input.episodeIds ?? g.episodes.filter((e) => e.endedAtPerfMs == null).map((e) => e.id);
  const rec: FFRecord = {
    ordinal,
    perfMs,
    dateMs,
    timelineMs,
    episodeIds,
    identity: input.identity ?? {},
    writerId: input.writerId,
    source: input.source,
    marker: input.marker,
    prior: input.prior,
    next: input.next,
    guard: input.guard,
    callback: input.callback ?? null,
    file: input.file ?? null,
    fn: input.fn ?? null,
    line: input.line ?? null,
    stack: input.captureStack ? _stack(3) : null,
    payload: input.payload,
  };
  g.records.push(rec);
  // Pin any record belonging to an active episode.
  if (episodeIds.length > 0) g.pinnedRecordOrdinals.add(ordinal);

  // Cap enforcement: oldest-unpinned eviction; emit FORENSICS_CAP_REACHED
  // once if pinned records would otherwise be dropped.
  if (g.records.length > g.cap) {
    // Try to evict unpinned from the front.
    let evicted = 0;
    while (g.records.length > g.cap && evicted < g.records.length) {
      const head = g.records[0];
      if (g.pinnedRecordOrdinals.has(head.ordinal)) break;
      g.records.shift();
      evicted++;
    }
    if (g.records.length > g.cap && !g.capReachedEmitted) {
      g.capReachedEmitted = true;
      const { perfMs: p2, dateMs: d2, timelineMs: t2 } = _now();
      g.records.push({
        ordinal: ++g.ordinal,
        perfMs: p2,
        dateMs: d2,
        timelineMs: t2,
        episodeIds: [],
        identity: {},
        writerId: 'holmFullForensics:cap',
        source: 'TERMINAL',
        marker: 'FORENSICS_CAP_REACHED',
        payload: { cap: g.cap, retained: g.records.length, pinned: g.pinnedRecordOrdinals.size },
      });
    }
  }
  return rec;
}

export function ffStartEpisode(input: {
  kind: 'TIMER_BAR_EPISODE' | 'RUNBACK_HOLM_EPISODE';
  identity: FFIdentity;
  reason: string;
  derivedStallDeadlineMs?: number | null;
  derivedStallInputs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}): FFEpisode {
  const g = _g();
  const { perfMs, dateMs } = _now();
  const id = `${input.kind}#${g.episodes.length + 1}#${Math.floor(perfMs)}`;
  const ep: FFEpisode = {
    id,
    kind: input.kind,
    startedAtPerfMs: perfMs,
    startedAtDateMs: dateMs,
    endedAtPerfMs: null,
    identity: input.identity,
    reason: input.reason,
    derivedStallDeadlineMs: input.derivedStallDeadlineMs ?? null,
    derivedStallInputs: input.derivedStallInputs,
    meta: input.meta,
  };
  g.episodes.push(ep);
  ffRecord({
    writerId: 'holmFullForensics:episode',
    source: 'EPISODE',
    marker: `${input.kind}_START`,
    identity: input.identity,
    payload: { episodeId: id, reason: input.reason, derivedStallDeadlineMs: ep.derivedStallDeadlineMs ?? null, derivedStallInputs: input.derivedStallInputs, meta: input.meta },
    episodeIds: [id],
  });
  return ep;
}

export function ffEndEpisode(episodeId: string, reason: string, payload?: Record<string, unknown>): void {
  const g = _g();
  const ep = g.episodes.find((e) => e.id === episodeId);
  if (!ep || ep.endedAtPerfMs != null) return;
  const { perfMs } = _now();
  ep.endedAtPerfMs = perfMs;
  ffRecord({
    writerId: 'holmFullForensics:episode',
    source: 'EPISODE',
    marker: `${ep.kind}_END`,
    identity: ep.identity,
    payload: { episodeId, reason, durationMs: Math.round(perfMs - ep.startedAtPerfMs), ...payload },
    episodeIds: [episodeId],
  });
}

export function ffActiveEpisodes(kind?: FFEpisode['kind']): FFEpisode[] {
  return _g().episodes.filter((e) => e.endedAtPerfMs == null && (!kind || e.kind === kind));
}

// ---------- Static coverage map ----------
// Each entry: file, owner, role (writer/reader/guard/visual), wired (true means
// directly recorded by this recorder OR bridged from an existing forensics file).
interface FFCoverageEntry {
  file: string;
  owner: string;
  role: 'writer' | 'reader' | 'guard' | 'visual' | 'cache' | 'realtime' | 'runtime';
  wired: boolean;
  bridge?: string;
  reason?: string; // when wired=false: INSTRUMENTATION_PENDING reason or IRRELEVANT-with-reason
}

const COVERAGE_TIMER_BAR: FFCoverageEntry[] = [
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'ShellTimerRail<rail>', role: 'visual', wired: true },
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'ShellTimerRail<fillDiv>', role: 'visual', wired: true },
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'ShellTimerRail<mountedStateSetter>', role: 'writer', wired: true },
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'ShellTimerRail<identityKeyEffect>', role: 'writer', wired: true },
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'useShellTimer<registerEffect>', role: 'writer', wired: false, reason: 'INSTRUMENTATION_PENDING: every Holm caller wraps useShellTimer; needs caller-side wiring' },
  { file: 'src/lib/canonicalShell/ShellTimerRail.tsx', owner: 'ShellTimerProvider<registrationsMap>', role: 'cache', wired: false, reason: 'INSTRUMENTATION_PENDING: module-singleton Map of all timer registrants' },
  { file: 'src/components/MobilePlayerTimer.tsx', owner: 'MobilePlayerTimer<segment>', role: 'writer', wired: false, bridge: 'holmSelfTimerForensics', reason: 'Bridged via existing holmSelfTimerForensics (segments/events/violations).' },
  { file: 'src/components/MobilePlayerTimer.tsx', owner: 'MobilePlayerTimer<svgRing>', role: 'visual', wired: false, reason: 'IRRELEVANT-for-bar-bug: SVG ring is opponent visual, not horizontal bar.' },
  { file: 'tailwind.config.ts + src/index.css', owner: 'transition-[width] duration-1000 ease-linear (fill className)', role: 'visual', wired: true },
  { file: 'tailwind.config.ts + src/index.css', owner: 'h-3 w-full bg-muted rounded-full overflow-hidden (track className)', role: 'visual', wired: true },
  { file: '<all matching stylesheets>', owner: 'CSS rule provenance for fill subtree', role: 'visual', wired: true },
  { file: 'src/components/MobileGameTable.tsx', owner: 'HUD row 2 slot wrapper', role: 'visual', wired: false, reason: 'INSTRUMENTATION_PENDING: ancestor not yet annotated with stable owner ID' },
];

const COVERAGE_RUNBACK: FFCoverageEntry[] = [
  { file: 'src/lib/dealerGameBoundary.ts', owner: 'sanitizePlayersForNewDealerGame', role: 'writer', wired: false, bridge: 'holmHandBoundaryForensics' },
  { file: 'src/lib/canonicalShell/cardTransport/holmHandBoundaryForensics.ts', owner: 'HandBoundaryForensics<presentationSources/runtime/teardown>', role: 'writer', wired: true, bridge: 'holmHandBoundaryForensics' },
  { file: 'src/lib/canonicalShell/cardTransport/DealRuntime.tsx', owner: 'DealRuntime<phase/resetForHand/beginDealForHand/beginWaveForHand>', role: 'runtime', wired: false, reason: 'INSTRUMENTATION_PENDING: writers exist; bridge will record phase transitions only when DealRuntime publishes' },
  { file: 'src/components/HolmDealOrchestrator.tsx', owner: 'HolmDealOrchestrator<manifest/startLatch>', role: 'writer', wired: false, reason: 'INSTRUMENTATION_PENDING' },
  { file: 'src/components/HolmAnchoredSlot.tsx', owner: 'HolmAnchoredSlot<presentation>', role: 'visual', wired: false, reason: 'INSTRUMENTATION_PENDING' },
  { file: 'src/components/HolmCanonicalCommunityRow.tsx', owner: 'community presentation', role: 'visual', wired: false, reason: 'INSTRUMENTATION_PENDING' },
  { file: 'src/components/ChuckyHand.tsx', owner: 'Chucky sticky/stage/cache', role: 'cache', wired: false, bridge: 'holmChuckyFullForensics + holmChuckyRenderStateForensics' },
  { file: 'src/components/HolmLonePlayerFan.tsx', owner: 'lone-player tabled snapshot', role: 'cache', wired: false, bridge: 'holmStageAndPotForensics' },
  { file: 'src/components/PlayerHand.tsx', owner: 'self PlayerHand fan', role: 'visual', wired: false, reason: 'INSTRUMENTATION_PENDING' },
  { file: 'src/integrations/supabase/* (realtime channels for games/rounds/players/player_cards)', owner: 'realtime subscriptions', role: 'realtime', wired: false, reason: 'INSTRUMENTATION_PENDING: per-channel lifecycle not yet recorded centrally' },
  { file: 'src/integrations/supabase/* (queries: games, rounds, player_cards)', owner: 'fetch / query result', role: 'reader', wired: false, reason: 'INSTRUMENTATION_PENDING: bridge needs query-call wrapping' },
];

export function ffEmitCoverageMap(): void {
  const g = _g();
  if (g.coverageEmitted) return;
  g.coverageEmitted = true;
  ffRecord({
    writerId: 'holmFullForensics:coverage',
    source: 'COVERAGE',
    marker: 'HOLM_FORENSICS_COVERAGE_MAP',
    payload: {
      timerBar: COVERAGE_TIMER_BAR,
      runback: COVERAGE_RUNBACK,
      pendingCount: [...COVERAGE_TIMER_BAR, ...COVERAGE_RUNBACK].filter((e) => !e.wired).length,
      note:
        'Entries with wired=false are NOT recorded by this recorder in this turn. ' +
        'Read this map FIRST before interpreting absence of events as proof.',
    },
  });
}

// ---------- DOM/CSS/WAAPI/RAF sampler for the timer bar ----------
// Arms when the ShellTimerRail subtree mounts. Records:
//   - matched CSS rule provenance for fill subtree
//   - computed styles for visual candidates and ancestors
//   - element.getAnimations({subtree:true})
//   - transitionrun/start/end/cancel, animationstart/iteration/end/cancel
//   - MutationObserver(style/class/attributes/childList)
//   - ResizeObserver
//   - RAF_FRAME for 3 seconds with width px + bounding rects + transform
const VISUAL_PROPS = [
  'width', 'height', 'minWidth', 'maxWidth',
  'flex', 'flexBasis', 'flexGrow', 'flexShrink',
  'transform', 'transformOrigin',
  'opacity', 'visibility', 'display',
  'position', 'zIndex', 'isolation',
  'overflow', 'clipPath', 'mask', 'contain', 'contentVisibility',
  'transitionProperty', 'transitionDuration', 'transitionDelay', 'transitionTimingFunction',
  'animationName', 'animationDuration', 'animationDelay', 'animationTimingFunction', 'animationPlayState',
  'willChange',
] as const;

function _readComputed(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = window.getComputedStyle(el);
    for (const p of VISUAL_PROPS) {
      out[p] = (cs as unknown as Record<string, string>)[p] ?? '';
    }
  } catch { /* noop */ }
  return out;
}

function _readPseudo(el: Element, pseudo: '::before' | '::after'): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const cs = window.getComputedStyle(el, pseudo);
    for (const p of VISUAL_PROPS.concat(['content'] as never)) {
      out[p] = (cs as unknown as Record<string, string>)[p as string] ?? '';
    }
  } catch { /* noop */ }
  return out;
}

function _matchedRules(el: Element): Array<Record<string, unknown>> {
  const matched: Array<Record<string, unknown>> = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try { rules = sheet.cssRules; } catch { /* cross-origin */ continue; }
      if (!rules) continue;
      const href = (sheet as CSSStyleSheet).href ?? '<inline>';
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i] as CSSStyleRule;
        if (!r || !r.selectorText) continue;
        try {
          if (el.matches(r.selectorText)) {
            const props: Record<string, string> = {};
            const decl = r.style;
            for (let j = 0; j < decl.length; j++) {
              const name = decl[j];
              if (/width|transform|transition|animation|opacity|display|clip|mask/.test(name)) {
                props[name] = decl.getPropertyValue(name);
              }
            }
            if (Object.keys(props).length > 0) {
              matched.push({ sheet: href, selector: r.selectorText, ruleIndex: i, props });
            }
          }
        } catch { /* invalid selector for this engine */ }
      }
    }
  } catch { /* noop */ }
  return matched;
}

function _waapi(root: Element): Array<Record<string, unknown>> {
  try {
    const anims = (root as Element & { getAnimations?: (opts?: { subtree?: boolean }) => Animation[] })
      .getAnimations?.({ subtree: true }) ?? [];
    return anims.map((a, idx) => ({
      idx,
      id: (a as Animation & { id?: string }).id ?? null,
      playState: a.playState,
      currentTime: a.currentTime,
      pending: a.pending,
      effectTarget: (a.effect as KeyframeEffect | null)?.target?.nodeName ?? null,
      timing: (a.effect as KeyframeEffect | null)?.getTiming?.() ?? null,
    }));
  } catch { return []; }
}

const _armedRails = new WeakSet<Element>();

export function ffArmTimerBarSampler(railEl: Element, identity: FFIdentity): void {
  if (typeof window === 'undefined') return;
  if (_armedRails.has(railEl)) return;
  _armedRails.add(railEl);

  const ep = ffStartEpisode({
    kind: 'TIMER_BAR_EPISODE',
    identity,
    reason: 'rail-subtree-armed',
  });

  const fill = railEl.querySelector('div > div') as HTMLElement | null;
  const track = railEl.querySelector('div') as HTMLElement | null;

  // Initial CSS provenance + computed for fill, track, rail.
  for (const [name, el] of [['rail', railEl], ['track', track], ['fill', fill]] as Array<[string, Element | null]>) {
    if (!el) continue;
    ffRecord({
      writerId: `ShellTimerRail:${name}`,
      source: 'CSS_RULE',
      marker: 'TIMER_BAR_CSS_PROVENANCE',
      identity,
      payload: {
        node: name,
        className: (el as HTMLElement).className,
        matchedRules: _matchedRules(el),
        computed: _readComputed(el),
        pseudoBefore: _readPseudo(el, '::before'),
        pseudoAfter: _readPseudo(el, '::after'),
        rect: (el as HTMLElement).getBoundingClientRect?.(),
      },
      episodeIds: [ep.id],
    });
  }

  ffRecord({
    writerId: 'ShellTimerRail:waapi',
    source: 'ANIMATION_EVENT',
    marker: 'TIMER_BAR_WAAPI_INITIAL',
    identity,
    payload: { animations: _waapi(railEl) },
    episodeIds: [ep.id],
  });

  // Event listeners on rail + fill + track.
  const onTransition = (evt: TransitionEvent) => {
    ffRecord({
      writerId: 'ShellTimerRail:transition',
      source: 'TRANSITION_EVENT',
      marker: `TIMER_BAR_${evt.type.toUpperCase()}`,
      identity,
      payload: {
        target: (evt.target as HTMLElement | null)?.className,
        propertyName: evt.propertyName,
        elapsedTime: evt.elapsedTime,
      },
      episodeIds: [ep.id],
    });
  };
  const onAnimation = (evt: AnimationEvent) => {
    ffRecord({
      writerId: 'ShellTimerRail:animation',
      source: 'ANIMATION_EVENT',
      marker: `TIMER_BAR_${evt.type.toUpperCase()}`,
      identity,
      payload: {
        target: (evt.target as HTMLElement | null)?.className,
        animationName: evt.animationName,
        elapsedTime: evt.elapsedTime,
      },
      episodeIds: [ep.id],
    });
  };
  for (const ty of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'] as const) {
    railEl.addEventListener(ty, onTransition as EventListener, true);
  }
  for (const ty of ['animationstart', 'animationiteration', 'animationend', 'animationcancel'] as const) {
    railEl.addEventListener(ty, onAnimation as EventListener, true);
  }

  // MutationObserver: class/style/attribute/childList on rail subtree.
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      ffRecord({
        writerId: 'ShellTimerRail:mutation',
        source: 'DOM_MUTATION',
        marker: 'TIMER_BAR_MUTATION',
        identity,
        payload: {
          type: r.type,
          target: (r.target as HTMLElement | null)?.className ?? (r.target as Node)?.nodeName,
          attributeName: r.attributeName ?? null,
          oldValue: r.oldValue ?? null,
          newValue: r.attributeName ? (r.target as HTMLElement | null)?.getAttribute(r.attributeName) ?? null : null,
          addedNodes: r.addedNodes.length,
          removedNodes: r.removedNodes.length,
        },
        episodeIds: [ep.id],
      });
    }
  });
  mo.observe(railEl, { attributes: true, attributeOldValue: true, childList: true, subtree: true });

  // ResizeObserver.
  let ro: ResizeObserver | null = null;
  try {
    ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        ffRecord({
          writerId: 'ShellTimerRail:resize',
          source: 'RESIZE',
          marker: 'TIMER_BAR_RESIZE',
          identity,
          payload: {
            target: (e.target as HTMLElement).className,
            contentRect: e.contentRect,
          },
          episodeIds: [ep.id],
        });
      }
    });
    ro.observe(railEl);
    if (fill) ro.observe(fill);
  } catch { /* noop */ }

  // RAF_FRAME sampler: 3 seconds of per-frame capture.
  const startPerf = performance.now();
  let rafHandle = 0;
  const sampleFrame = () => {
    const elapsed = performance.now() - startPerf;
    if (elapsed > 3000) {
      // Stop sampler, end episode, cleanup observers.
      for (const ty of ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel'] as const) {
        railEl.removeEventListener(ty, onTransition as EventListener, true);
      }
      for (const ty of ['animationstart', 'animationiteration', 'animationend', 'animationcancel'] as const) {
        railEl.removeEventListener(ty, onAnimation as EventListener, true);
      }
      try { mo.disconnect(); } catch { /* noop */ }
      try { ro?.disconnect(); } catch { /* noop */ }
      ffEndEpisode(ep.id, 'raf-sampler-window-closed');
      return;
    }
    const fillRect = fill?.getBoundingClientRect();
    const trackRect = track?.getBoundingClientRect();
    ffRecord({
      writerId: 'ShellTimerRail:rafFrame',
      source: 'RAF_FRAME',
      marker: 'TIMER_BAR_RAF_FRAME',
      identity,
      payload: {
        elapsedFromArmMs: Math.round(elapsed),
        fillWidthPx: fillRect?.width ?? null,
        trackWidthPx: trackRect?.width ?? null,
        fillPctOfTrack: fillRect && trackRect && trackRect.width > 0
          ? fillRect.width / trackRect.width
          : null,
        fillRect,
        trackRect,
        fillTransform: fill ? window.getComputedStyle(fill).transform : null,
        fillTransition: fill ? window.getComputedStyle(fill).transitionProperty + ' ' + window.getComputedStyle(fill).transitionDuration : null,
        fillClass: fill?.className,
        connected: railEl.isConnected,
      },
      episodeIds: [ep.id],
    });
    rafHandle = requestAnimationFrame(sampleFrame);
  };
  rafHandle = requestAnimationFrame(sampleFrame);

  // Watchdog to clean up if rail unmounts before the 3s window.
  const watchdog = window.setInterval(() => {
    if (!railEl.isConnected) {
      try { cancelAnimationFrame(rafHandle); } catch { /* noop */ }
      try { mo.disconnect(); } catch { /* noop */ }
      try { ro?.disconnect(); } catch { /* noop */ }
      window.clearInterval(watchdog);
      ffRecord({
        writerId: 'ShellTimerRail:unmount',
        source: 'REACT_REMOUNT',
        marker: 'TIMER_BAR_RAIL_DISCONNECTED',
        identity,
        episodeIds: [ep.id],
      });
      ffEndEpisode(ep.id, 'rail-disconnected');
    }
  }, 250);
}

// ---------- Run Back episode helpers ----------
export function ffStartRunbackEpisode(identity: FFIdentity, reason: string): FFEpisode {
  // Derived stall deadline: caller may pass canonical transport timing via reason payload.
  return ffStartEpisode({
    kind: 'RUNBACK_HOLM_EPISODE',
    identity,
    reason,
    derivedStallDeadlineMs: null,
    derivedStallInputs: { note: 'HOLM_RUNBACK_NO_STALL_DEADLINE_CONTRACT — no canonical schedule input provided at start; supply via ffSetRunbackDeadline.' },
  });
}

export function ffSetRunbackDeadline(episodeId: string, deadlineMs: number, inputs: Record<string, unknown>): void {
  const ep = _g().episodes.find((e) => e.id === episodeId);
  if (!ep) return;
  ep.derivedStallDeadlineMs = deadlineMs;
  ep.derivedStallInputs = inputs;
  ffRecord({
    writerId: 'holmFullForensics:episode',
    source: 'EPISODE',
    marker: 'RUNBACK_HOLM_DEADLINE_SET',
    identity: ep.identity,
    payload: { episodeId, deadlineMs, inputs },
    episodeIds: [episodeId],
  });
}

// ---------- Export ----------
export interface FFExport {
  exportedAtIso: string;
  totals: { records: number; episodes: number; pinned: number; cap: number; capReached: boolean };
  coverage: { timerBar: FFCoverageEntry[]; runback: FFCoverageEntry[] };
  episodes: FFEpisode[];
  records: FFRecord[];
}

export function getHolmFullForensics(): FFExport {
  const g = _g();
  return {
    exportedAtIso: new Date().toISOString(),
    totals: {
      records: g.records.length,
      episodes: g.episodes.length,
      pinned: g.pinnedRecordOrdinals.size,
      cap: g.cap,
      capReached: g.capReachedEmitted,
    },
    coverage: { timerBar: COVERAGE_TIMER_BAR, runback: COVERAGE_RUNBACK },
    episodes: g.episodes.slice(),
    records: g.records.slice(),
  };
}

export function buildHolmFullForensicsText(): string {
  const data = getHolmFullForensics();
  const header = [
    '# HOLM FULL FORENSICS EXPORT',
    JSON.stringify({ exportedAtIso: data.exportedAtIso, totals: data.totals }, null, 2),
    '# --- COVERAGE MAP (read first) ---',
    JSON.stringify(data.coverage, null, 2),
    '# --- EPISODES ---',
    JSON.stringify(data.episodes, null, 2),
    '# --- RECORDS ---',
  ].join('\n');
  const recs = data.records.map((r) => {
    let body: string;
    try { body = JSON.stringify(r); } catch { body = '[unserializable record]'; }
    return body;
  }).join('\n');
  return `${header}\n${recs}\n`;
}

// ---------- Install + auto-emit coverage map ----------
export function ffInstall(): void {
  const g = _g();
  if (g.installed) return;
  g.installed = true;
  ffEmitCoverageMap();
}

if (typeof window !== 'undefined') {
  // Auto-install on import.
  try { ffInstall(); } catch { /* noop */ }
}
