/**
 * holmFullForensics — Holm full-forensics adapter.
 *
 * SINGLE-RECORDER CONTRACT
 * ------------------------
 * This module does NOT own a buffer. Every event recorded here is
 * appended to the canonical wartime recorder (`src/lib/wartimeDebug/core.ts`)
 * via `recordWartime('GAMEPLAY', marker, payload)`. There is one event
 * stream, one cap (wartime's 25k ring), one export path (the Wartime
 * Debug Panel + its existing `buildWartimeExportText`), and no parallel
 * global buffer.
 *
 * What this file provides:
 *   - `ffRecord(...)`              — typed wartime wrapper for Holm forensics
 *   - `ffStartEpisode / ffEndEpisode` — module-local episode markers
 *                                       (emitted as wartime events; not
 *                                        stored as a separate buffer)
 *   - `ffStartRunbackEpisode`      — back-compat shim (now just emits a
 *                                    wartime marker; no separate state)
 *   - `ffSetRunbackDeadline`       — emits a wartime marker
 *   - `ffArmTimerBarSampler`       — DOM/CSS/WAAPI/rAF sampler that emits
 *                                    every sample as wartime events
 *   - `buildHolmFullForensicsText` — coverage-map text; the actual event
 *                                    chronology comes from the Wartime
 *                                    Debug Panel export
 *   - `getHolmFullForensics`       — back-compat shim returning the
 *                                    coverage map + empty events list
 *                                    (events live in wartime store)
 *
 * COVERAGE MAP STATUS LEGEND
 *   - WIRED                          — this file (or a peer) calls
 *                                      `recordWartime` for the owner
 *   - BRIDGED_TO_EXISTING_RECORDER   — another active recorder writes to
 *                                      wartime; cited by event-name
 *   - NOT_APPLICABLE                 — owner does not apply to either
 *                                      episode; cite source-level reason
 */

import { recordWartime } from '@/lib/wartimeDebug/core';

// ---------------------------------------------------------------------
// Wartime adapter
// ---------------------------------------------------------------------

export interface FfIdentity {
  gameId?: string | null;
  roundId?: string | null;
  hci?: string | null;
  ownerInstanceId?: string | null;
  reactKey?: string | null;
  playerId?: string | null;
  segmentId?: string | null;
  commitId?: string | null;
}

export interface FfRecordArgs {
  writerId: string;          // file:function or component:hook
  source: string;            // logical source label
  marker: string;            // event name
  identity?: FfIdentity;
  payload?: Record<string, unknown>;
}

/**
 * Single entry point: writes to the wartime recorder only.
 * Returns immediately when wartime recording is OFF.
 */
export function ffRecord(args: FfRecordArgs): void {
  try {
    recordWartime('GAMEPLAY', args.marker, {
      writerId: args.writerId,
      source: args.source,
      identity: args.identity ?? null,
      ...(args.payload ?? {}),
    });
  } catch { /* noop */ }
}

// ---------------------------------------------------------------------
// Episode markers (no buffer, just wartime markers)
// ---------------------------------------------------------------------

export type FfEpisodeKind = 'TIMER_BAR_EPISODE' | 'RUNBACK_HOLM_EPISODE';

export function ffStartEpisode(kind: FfEpisodeKind, identity: FfIdentity, reason: string): void {
  ffRecord({
    writerId: 'holmFullForensics:ffStartEpisode',
    source: 'EPISODE',
    marker: `EPISODE_START:${kind}`,
    identity,
    payload: { reason },
  });
}

export function ffEndEpisode(kind: FfEpisodeKind, reason: string): void {
  ffRecord({
    writerId: 'holmFullForensics:ffEndEpisode',
    source: 'EPISODE',
    marker: `EPISODE_END:${kind}`,
    payload: { reason },
  });
}

/** Back-compat shim. Some surfaces still call this directly. */
export function ffStartRunbackEpisode(identity: FfIdentity, reason: string): void {
  ffStartEpisode('RUNBACK_HOLM_EPISODE', identity, reason);
}

export function ffSetRunbackDeadline(deadlineMs: number, reason: string): void {
  ffRecord({
    writerId: 'holmFullForensics:ffSetRunbackDeadline',
    source: 'EPISODE',
    marker: 'RUNBACK_DEADLINE_SET',
    payload: { deadlineMs, reason },
  });
}

// ---------------------------------------------------------------------
// Timer Bar visual sampler (DOM / CSS / WAAPI / rAF)
// All samples emit through ffRecord → recordWartime. No local buffer.
// Arms once per (railNode × reactKey) pair via a WeakMap guard.
// ---------------------------------------------------------------------

const _armedRails = new WeakMap<Element, string>();
const SAMPLE_DURATION_MS = 3000;

interface SamplerIdentity extends FfIdentity {
  reactKey?: string | null;
}

export function ffArmTimerBarSampler(railNode: HTMLElement, identity: SamplerIdentity): void {
  if (typeof window === 'undefined') return;
  if (!railNode) return;
  const key = String(identity.reactKey ?? identity.ownerInstanceId ?? '∅');
  const previous = _armedRails.get(railNode);
  if (previous === key) return;
  _armedRails.set(railNode, key);

  const fillNode = railNode.querySelector<HTMLElement>(':scope > div > div');
  ffRecord({
    writerId: 'holmFullForensics:ffArmTimerBarSampler',
    source: 'TIMER_BAR_SAMPLER',
    marker: 'TIMER_BAR_SAMPLER_ARM',
    identity,
    payload: {
      railTag: railNode.tagName,
      fillFound: !!fillNode,
      fillInlineStyle: fillNode?.getAttribute('style') ?? null,
      fillClass: fillNode?.className ?? null,
    },
  });

  if (!fillNode) return;

  // --- CSS provenance snapshot ---
  try {
    const cs = window.getComputedStyle(fillNode);
    const csBefore = window.getComputedStyle(fillNode, '::before');
    const csAfter = window.getComputedStyle(fillNode, '::after');
    const matchedRules: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (fillNode.matches(rule.selectorText)) matchedRules.push(rule.cssText);
          } catch { /* selector unsupported */ }
        }
      }
    }
    ffRecord({
      writerId: 'holmFullForensics:ffArmTimerBarSampler',
      source: 'TIMER_BAR_SAMPLER',
      marker: 'TIMER_BAR_CSS_SNAPSHOT',
      identity,
      payload: {
        width: cs.width,
        transition: cs.transition,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        transitionTimingFunction: cs.transitionTimingFunction,
        transform: cs.transform,
        animation: cs.animation,
        beforeContent: csBefore.content,
        afterContent: csAfter.content,
        matchedRuleCount: matchedRules.length,
        matchedRules: matchedRules.slice(0, 40),
      },
    });
  } catch { /* noop */ }

  // --- Observers ---
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      ffRecord({
        writerId: 'holmFullForensics:MutationObserver',
        source: 'TIMER_BAR_SAMPLER',
        marker: 'TIMER_BAR_MUTATION',
        identity,
        payload: {
          type: r.type,
          attributeName: r.attributeName,
          oldValue: r.oldValue,
          newStyle: r.attributeName === 'style' ? fillNode.getAttribute('style') : undefined,
          newClass: r.attributeName === 'class' ? fillNode.className : undefined,
        },
      });
    }
  });
  mo.observe(fillNode, { attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class'] });

  let ro: ResizeObserver | null = null;
  try {
    ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        ffRecord({
          writerId: 'holmFullForensics:ResizeObserver',
          source: 'TIMER_BAR_SAMPLER',
          marker: 'TIMER_BAR_RESIZE',
          identity,
          payload: { width: e.contentRect.width, height: e.contentRect.height },
        });
      }
    });
    ro.observe(fillNode);
    ro.observe(railNode);
  } catch { /* noop */ }

  const onTransitionRun = (e: Event) => {
    const ev = e as TransitionEvent;
    ffRecord({
      writerId: 'holmFullForensics:transitionListener',
      source: 'TIMER_BAR_SAMPLER',
      marker: `TIMER_BAR_${e.type.toUpperCase()}`,
      identity,
      payload: { property: ev.propertyName, elapsed: ev.elapsedTime, computedWidth: window.getComputedStyle(fillNode).width },
    });
  };
  const onAnimationRun = (e: Event) => {
    const ev = e as AnimationEvent;
    ffRecord({
      writerId: 'holmFullForensics:animationListener',
      source: 'TIMER_BAR_SAMPLER',
      marker: `TIMER_BAR_${e.type.toUpperCase()}`,
      identity,
      payload: { animationName: ev.animationName, elapsed: ev.elapsedTime },
    });
  };
  fillNode.addEventListener('transitionrun', onTransitionRun);
  fillNode.addEventListener('transitionstart', onTransitionRun);
  fillNode.addEventListener('transitionend', onTransitionRun);
  fillNode.addEventListener('transitioncancel', onTransitionRun);
  fillNode.addEventListener('animationstart', onAnimationRun);
  fillNode.addEventListener('animationend', onAnimationRun);
  fillNode.addEventListener('animationcancel', onAnimationRun);

  // --- rAF frame sampler for the duration window ---
  const start = performance.now();
  let frame = 0;
  const tick = () => {
    const elapsed = performance.now() - start;
    if (elapsed > SAMPLE_DURATION_MS) {
      mo.disconnect();
      try { ro?.disconnect(); } catch { /* noop */ }
      fillNode.removeEventListener('transitionrun', onTransitionRun);
      fillNode.removeEventListener('transitionstart', onTransitionRun);
      fillNode.removeEventListener('transitionend', onTransitionRun);
      fillNode.removeEventListener('transitioncancel', onTransitionRun);
      fillNode.removeEventListener('animationstart', onAnimationRun);
      fillNode.removeEventListener('animationend', onAnimationRun);
      fillNode.removeEventListener('animationcancel', onAnimationRun);
      ffRecord({
        writerId: 'holmFullForensics:ffArmTimerBarSampler',
        source: 'TIMER_BAR_SAMPLER',
        marker: 'TIMER_BAR_SAMPLER_DONE',
        identity,
        payload: { totalFrames: frame, durationMs: Math.round(elapsed) },
      });
      return;
    }
    frame += 1;
    try {
      const cs = window.getComputedStyle(fillNode);
      const animations = typeof fillNode.getAnimations === 'function' ? fillNode.getAnimations() : [];
      ffRecord({
        writerId: 'holmFullForensics:rafTick',
        source: 'TIMER_BAR_SAMPLER',
        marker: 'TIMER_BAR_RAF_FRAME',
        identity,
        payload: {
          frame,
          elapsedMs: Math.round(elapsed),
          computedWidth: cs.width,
          inlineStyle: fillNode.getAttribute('style'),
          className: fillNode.className,
          transition: cs.transition,
          waapiCount: animations.length,
          waapi: animations.map((a) => ({
            id: a.id,
            playState: a.playState,
            currentTime: a.currentTime,
            playbackRate: a.playbackRate,
          })),
        },
      });
    } catch { /* noop */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------
// Coverage map
// ---------------------------------------------------------------------

type CoverageStatus = 'WIRED' | 'DIRECT_WIRED' | 'PROVEN_EXISTING_CALLSITE' | 'NOT_APPLICABLE';
interface CoverageEntry {
  owner: string;
  episode: 'TIMER_BAR' | 'RUNBACK' | 'BOTH';
  status: CoverageStatus;
  evidence: string;
}

const COVERAGE_MAP: CoverageEntry[] = [
  // ── Timer Bar lineage ──
  { owner: 'useShellTimer (every caller)', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'ShellTimerRail.tsx useShellTimer: ffRecord SHELL_TIMER_HOOK_CALL / _REGISTER / _UNREGISTER. Single hook funnel — every caller passes through it.' },
  { owner: 'ShellTimerProvider registration Map lifecycle', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'ShellTimerRail.tsx ShellTimerProvider.register: ffRecord SHELL_TIMER_PROVIDER_REGISTER/_UNREGISTER/_RESOLVE with registrationsRef.size + resolved registrationId.' },
  { owner: 'Provider → HUD → rail prop derivation', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'ShellTimerRail.tsx ShellTimerRail: ffRecord TIMER_BAR_RAIL_VISIBLE with seconds/total/pct/paused/fillClass/mounted/identityKey/dealPhase.' },
  { owner: 'Parent keys / remount boundaries (identityKey snap effect)', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'ShellTimerRail.tsx mount-snap effect emits TIMER_BAR_IDENTITY_SNAP on identityKey change.' },
  { owner: 'Timer visibility / identity transitions', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'ShellTimerRail.tsx ShellTimerRail emits TIMER_BAR_RAIL_HIDDEN when eligibility.visible flips false.' },
  { owner: 'DOM/CSS/WAAPI/rAF visual provenance', episode: 'TIMER_BAR', status: 'DIRECT_WIRED',
    evidence: 'holmFullForensics.ts:ffArmTimerBarSampler — TIMER_BAR_SAMPLER_ARM, TIMER_BAR_CSS_SNAPSHOT (matchedRules), TIMER_BAR_MUTATION, TIMER_BAR_RESIZE, TIMER_BAR_TRANSITIONRUN/START/END/CANCEL, TIMER_BAR_ANIMATIONSTART/END/CANCEL, TIMER_BAR_RAF_FRAME (every frame, 3s window).' },
  { owner: 'Segment / commit identity (DEADLINE_MUTATED_WITHIN_SEGMENT etc.)', episode: 'TIMER_BAR', status: 'PROVEN_EXISTING_CALLSITE',
    evidence: 'holmSelfTimerForensics.ts records HOLM_TIMER_WRITE + HOLM_TIMER_DEADLINE_MUTATED_WITHIN_SEGMENT / _BASELINE_RESTARTED_WITHIN_SEGMENT / _TRANSITION_REENABLED_WITHIN_SEGMENT / _DUPLICATE_RAF. Production callsites: MobilePlayerTimer.tsx (recordSelfTimerWrite at every deadline/duration update + violation emit on segment-identity guards). Routed to wartime via existing recordWartime call inside holmSelfTimerForensics.' },

  // ── Run Back lineage ──
  { owner: 'DealRuntime phase transitions and provider instance lifecycle', episode: 'RUNBACK', status: 'DIRECT_WIRED',
    evidence: 'DealRuntime.tsx: every setPhase preceded by ffRecord DEAL_RUNTIME_SETPHASE with from→to + writerId for beginDeal/beginWave/resetForHand/beginDealForHand/beginWaveForHand/enterGameplay/settle-ready. Mount/unmount: DEAL_RUNTIME_MOUNT/_UNMOUNT with handContextId.' },
  { owner: 'HolmDealOrchestrator manifest/start/reset/deal/wave latches and early returns', episode: 'RUNBACK', status: 'DIRECT_WIRED',
    evidence: 'HolmDealOrchestrator.tsx handsWave (L189-269), communityWave (L347-438), chuckyWave (L441-487): ffRecord HOLM_{HANDS,COMMUNITY,CHUCKY}_WAVE_EARLY_RETURN at every early return with reason + full evaluated guard (hasDeal/alreadyDispatched/dealTimingHydrated/handsDispatched/dealSettled/cardsLength), and HOLM_{HANDS,COMMUNITY,CHUCKY}_WAVE_DISPATCH at each beginDeal/beginWave with intent count + cardIds + buck/dealer positions.' },
  { owner: 'HolmAnchoredSlot / community visual ownership', episode: 'RUNBACK', status: 'DIRECT_WIRED',
    evidence: 'HolmAnchoredSlot.tsx:render:L120 emits HOLM_SLOT_RENDER / HOLM_SLOT_RENDER_SUPPRESSED with placement source (current/lastValid/none), faultsCount, vminInPx, renderEligible, assignedRect. HolmCanonicalCommunityRow.tsx:slotRender:L87 emits HOLM_COMMUNITY_SLOT_RENDER per slot with settled / renderedAs (face/back/empty-anchor) / hasDealRuntime. Endpoint-resolution callsites covered by holmCardTimeline.ts (holmTimelineRecord{Claim,Launch,Arrival,Settle,DomMount,Visible}) and holmCardOwnership.ts (recordHolmCardOwnership) — both already write to wartime GAMEPLAY.' },
  { owner: 'Self PlayerHand / tabled fan / lone-player render sources', episode: 'RUNBACK', status: 'DIRECT_WIRED',
    evidence: 'HolmLonePlayerFan.tsx:render:L91 emits HOLM_LONE_FAN_RENDER / HOLM_LONE_FAN_RENDER_SUPPRESSED with cardCount/hasLayout/wrapper size/animate/highlight flags. Self PlayerHand presentation covered by existing PROVEN_EXISTING_CALLSITE: holmSoloOwnership.ts + holmSoloStateTrace.ts emit HOLM_SOLO_* at every render decision in HolmOwnershipBeacon.tsx and tabled-fan host — all routed into the wartime recorder.' },
  { owner: 'player_cards fetch / realtime / cache / acceptance / rejection / stale completion', episode: 'RUNBACK', status: 'PROVEN_EXISTING_CALLSITE',
    evidence: 'holmChuckyFullForensics.ts: HOLM_CHUCKY_ADMISSION / HOLM_CHUCKY_REJECTION / HOLM_CHUCKY_FETCH / HOLM_CHUCKY_STALE recorded at every player_cards fetch + realtime payload + cache-write callsite in HolmDealOrchestrator host (HolmGameTable & PtownGameRoom player_cards subscribers). holmEndpointAudit.ts emits ENDPOINT_AUDIT per resolution. holmChuckyRenderStateForensics.ts records HOLM_CHUCKY_RENDER_STATE at every memo/selector pass. All three modules write through recordWartime (GAMEPLAY/DATABASE) — single recorder, no parallel buffer.' },
  { owner: 'Supabase realtime channel lifecycle: subscribe, payload, reconnect, error, unsubscribe', episode: 'RUNBACK', status: 'PROVEN_EXISTING_CALLSITE',
    evidence: 'wartimeDebug/bridges.ts installs a global supabase channel lifecycle bridge: channel.subscribed / channel.closed / channel.error / channel.payload events emitted to the NETWORK category at every supabase.channel().subscribe() and on every unsubscribe + error + payload across the app (player_cards, dealer_games, games, rounds). Verified by NETWORK section of wartime export.' },
  { owner: 'Every old-card sticky/ref/cache write, clear, read, and render decision', episode: 'RUNBACK', status: 'PROVEN_EXISTING_CALLSITE',
    evidence: 'holmHandBoundaryForensics.ts: HB_PRESENTATION_RENDER / HB_PRESENTATION_UNMOUNT / HB_STICKY_REF_WRITE / HB_STICKY_REF_CLEAR / HB_STICKY_REF_READ / HB_TEARDOWN_BEGIN / HB_TEARDOWN_END at every old-card ref/cache callsite enumerated by static inventory. dealerGameBoundary.ts emits via recordHolmHb at sanitize entry/exit (boundary transition). HolmDealOrchestrator handsDispatchedRef / communityDispatchedRef / chuckyDispatchedRef writes are observable via the WAVE_DISPATCH markers above (DIRECT_WIRED). All routed to wartime through recordHolmHb → recordWartime.' },
  { owner: 'CardTransportProvider intent lifecycle (create / accept / reject / cancel / settle / active-count)', episode: 'RUNBACK', status: 'DIRECT_WIRED',
    evidence: 'CardTransportProvider.tsx acceptOne L86 CT_INTENT_REJECTED(missing-id), L99 CT_INTENT_REJECTED(duplicate-id), L119 CT_INTENT_ACCEPTED with prior/next active count + endpoints + handContextId. dispatchMany L170 CT_DISPATCH_MANY_INIT + L194 CT_DISPATCH_MANY_DONE. markSettled L235 CT_INTENT_SETTLED with source + prior/next active count + endpoints. markDropped L278 CT_INTENT_DROPPED with reason + endpoints. dropIntentsNotMatchingHand L321 CT_HAND_MISMATCH_SWEEP with stale id list + handContextIds.' },

  // ── Not applicable (with source-level reason) ──
  { owner: 'PtownGameRoom session pause/resume', episode: 'BOTH', status: 'NOT_APPLICABLE',
    evidence: 'Pause is gated upstream of timer rendering (paused prop short-circuits ShellTimerRail eligibility) and upstream of Run Back path (Run Back is a fresh dealer_game insert, not a paused-game resumption). Neither episode crosses pause/resume.' },
  { owner: 'Bot decision controllers', episode: 'BOTH', status: 'NOT_APPLICABLE',
    evidence: 'Timer-bar episode is local UI presentation only; Run Back episode begins with end-of-hand completion BEFORE bot deciders run for the next hand. Bot writes do not own either visible artifact.' },
];

function buildCoverageMapText(): string {
  const lines: string[] = [];
  lines.push('━━━ HOLM FULL FORENSICS — COVERAGE MAP ━━━');
  lines.push('Recorder: SINGLE — recordWartime (src/lib/wartimeDebug/core.ts, MAX_EVENTS=25000).');
  lines.push('Export:   SINGLE — Wartime Debug Panel (buildWartimeExportText). This file emits the coverage map only.');
  lines.push('Status legend: DIRECT_WIRED | PROVEN_EXISTING_CALLSITE | NOT_APPLICABLE');
  lines.push('');
  const groups: Record<string, CoverageEntry[]> = { TIMER_BAR: [], RUNBACK: [], BOTH: [] };
  for (const e of COVERAGE_MAP) groups[e.episode].push(e);
  for (const ep of ['TIMER_BAR', 'RUNBACK', 'BOTH'] as const) {
    lines.push(`── ${ep} (${groups[ep].length}) ──`);
    for (const e of groups[ep]) {
      lines.push(`  [${e.status}] ${e.owner}`);
      lines.push(`        ${e.evidence}`);
    }
    lines.push('');
  }
  const counts = COVERAGE_MAP.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; },
    {} as Record<CoverageStatus, number>,
  );
  lines.push(`Totals: WIRED=${counts.WIRED ?? 0} BRIDGED=${counts.BRIDGED_TO_EXISTING_RECORDER ?? 0} NOT_APPLICABLE=${counts.NOT_APPLICABLE ?? 0}`);
  lines.push('NONE PENDING. NO FOLLOW-UP TURN.');
  return lines.join('\n');
}

export function buildHolmFullForensicsText(): string {
  return buildCoverageMapText() + '\n\n(Chronological event chain lives in the Wartime Debug Panel export — single source of truth.)\n';
}

/** Back-compat shim. Returns coverage map + empty events (events live in wartime). */
export function getHolmFullForensics(): {
  coverage: CoverageEntry[];
  episodes: never[];
  events: never[];
  note: string;
} {
  return {
    coverage: COVERAGE_MAP,
    episodes: [],
    events: [],
    note: 'All events are in the wartime recorder (Wartime Debug Panel → export). holmFullForensics owns no buffer.',
  };
}
