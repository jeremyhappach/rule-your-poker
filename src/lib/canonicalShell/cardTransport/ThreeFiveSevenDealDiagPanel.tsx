/**
 * ThreeFiveSevenDealDiagPanel — canonical staged-deal diagnostics pill.
 *
 * Gated by the `threeFiveSevenDealDiag` debug pill toggle. Pure
 * derived view over existing stores — does NOT depend on bespoke
 * instrumentation in game code:
 *
 *   - getDealDbg()            → DealRuntime phase + per-recipient ownership
 *   - getCardTransportDbg()   → per-intent card lifecycle (mount/visible/
 *                               settle/ownershipClaim/destroyed)
 *   - DOM probes              → playerHand mounted, fanLayoutInitialized
 *
 * Sections:
 *
 *   1. SELF HAND OWNERSHIP   (live)
 *   2. ROUND TRANSITION      (ring buffer, last 50 hand/wave changes)
 *   3. TIMER OWNERSHIP       (derived from deal phase; red on violation)
 *   4. CARD-0 TIMELINE       (r1 self card-0 lifecycle wall-clocks)
 *
 * Pill is canonical and lives forever — same diagnostics will surface
 * Holm staged deals, community reveals, observer joins, refreshes, etc.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  getCardTransportDbg,
  getDealDbg,
  subscribeCardTransportDbg,
  subscribeDealDbg,
  type CardTransportDbgEntry,
  type DealDbgEntry,
} from './cardTransportDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

// ── Ring buffer for round-transition samples ────────────────────────

interface TransitionSample {
  t: number;                     // wall-clock ms
  handContextId: string;
  round: number | null;
  prevHandContextId: string | null;
  prevWaveCount: number;
  authoritativeCount: number;
  cachedCount: number;
  visibleCount: number;
  dealPhase: string;
  baselineApplied: boolean;
  renderGuardPassed: boolean;
  dealRuntimeId: string;
  waveId: string;
  waveMounted: boolean;
  waveUnmounted: boolean;
}

const transitionBuffer: TransitionSample[] = [];
const transitionListeners = new Set<() => void>();
let lastObservedHandCtx: string | null = null;
let lastObservedExpected = 0;

function pushTransitionSample(s: TransitionSample) {
  transitionBuffer.push(s);
  if (transitionBuffer.length > 50) transitionBuffer.shift();
  transitionListeners.forEach((l) => { try { l(); } catch { /* */ } });
}

function subscribeTransitions(l: () => void): () => void {
  transitionListeners.add(l);
  return () => { transitionListeners.delete(l); };
}

function getTransitions(): TransitionSample[] { return transitionBuffer; }

// Global watcher: any DealDbg update on a 357-shaped handContextId
// triggers a snapshot if (a) handContextId changed or (b) expectedCount
// grew (= beginWave fired for next round).
let watcherInstalled = false;
function ensureWatcher() {
  if (watcherInstalled) return;
  watcherInstalled = true;
  subscribeDealDbg(() => {
    const deals = getDealDbg();
    // Find latest 357 hand entry
    const latest = [...deals].reverse().find((d) => /#h\d+#r\d+$/.test(d.handContextId));
    if (!latest) return;
    const ctx = latest.handContextId;
    const round = parseInt(ctx.match(/#r(\d+)$/)?.[1] ?? '0', 10) || null;
    const handChanged = ctx !== lastObservedHandCtx;
    const expectedGrew = latest.expectedCount > lastObservedExpected && !handChanged;
    if (!handChanged && !expectedGrew) return;

    // Pull self ownership row if available
    const selfOwn = latest.ownership
      ? Object.values(latest.ownership).find((o) => o.role === 'self')
      : null;

    const prev = lastObservedHandCtx;
    pushTransitionSample({
      t: performance.now(),
      handContextId: ctx,
      round,
      prevHandContextId: prev,
      prevWaveCount: selfOwn?.prevWaveCount ?? 0,
      authoritativeCount: selfOwn?.authoritativeCount ?? 0,
      cachedCount: selfOwn?.visibleCount ?? 0, // best proxy — cache floor enforced upstream
      visibleCount: selfOwn?.visibleCount ?? 0,
      dealPhase: String(selfOwn?.dealPhase ?? latest.phase),
      baselineApplied: !!selfOwn?.baselineApplied,
      renderGuardPassed: !!selfOwn?.renderGuardPassed,
      dealRuntimeId: ctx.replace(/#r\d+$/, ''),  // hand-level runtime id
      waveId: ctx,
      waveMounted: handChanged || expectedGrew,
      waveUnmounted: handChanged,
    });
    lastObservedHandCtx = ctx;
    lastObservedExpected = latest.expectedCount;
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function fmtMs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${ms.toFixed(1)}ms`;
}

function fmtAbs(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  return `${(ms / 1000).toFixed(2)}s`;
}

function latestHand357(deals: DealDbgEntry[]): DealDbgEntry | null {
  return [...deals].reverse().find((d) => /#h\d+#r\d+$/.test(d.handContextId)) ?? null;
}

function selfHandRecord(deal: DealDbgEntry | null) {
  if (!deal?.ownership) return null;
  return Object.values(deal.ownership).find((o) => o.role === 'self') ?? null;
}

function card0Record(ctRecords: CardTransportDbgEntry[], handCtx: string | null): CardTransportDbgEntry | null {
  if (!handCtx) return null;
  // r1 hand = round 1. We want r1 card-0 for the FIRST round seen with this hand epoch.
  const handEpoch = handCtx.match(/^(.*#h\d+)#r\d+$/)?.[1];
  if (!handEpoch) return null;
  const r1Ctx = `${handEpoch}#r1`;
  return ctRecords.find((r) => r.handContextId === r1Ctx && /#card-0$/.test(r.intentId)) ?? null;
}

interface DerivedTimer {
  phase: string;
  cardsExpected: number;
  cardsSettled: number;
  dealSettled: boolean;
  timerVisibleExpected: boolean;
  timerRunningExpected: boolean;
  timerVisibleActual: boolean;
  timerRunningActual: boolean;
  violation: boolean;
  timerSource: string;
  activePlayerHUDMounted: boolean;
}

function deriveTimer(deal: DealDbgEntry | null): DerivedTimer {
  const phase = String(deal?.phase ?? 'NO_RUNTIME');
  const expectedVisible = phase !== 'DEALING' && phase !== 'PRE_DEAL';
  const expectedRunning = phase === 'GAMEPLAY';
  const actualVisible = !!deal?.timerVisible;
  const actualRunning = !!deal?.timerRunning;
  // DOM probe: shell timer pill / active player HUD presence
  const timerEl =
    typeof document !== 'undefined'
      ? document.querySelector('[data-shell-timer], [data-mobile-player-timer]')
      : null;
  const hudEl =
    typeof document !== 'undefined'
      ? document.querySelector('[data-active-player-hud], [data-357-active-hand-region]')
      : null;
  return {
    phase,
    cardsExpected: deal?.expectedCount ?? 0,
    cardsSettled: deal?.cardsSettled ?? 0,
    dealSettled: !!deal?.dealSettled,
    timerVisibleExpected: expectedVisible,
    timerRunningExpected: expectedRunning,
    timerVisibleActual: actualVisible || !!timerEl,
    timerRunningActual: actualRunning,
    violation: phase === 'DEALING' && (actualRunning || !!timerEl),
    timerSource: deal?.timerVisible !== undefined ? 'DealRuntime' : (timerEl ? 'DOM' : 'none'),
    activePlayerHUDMounted: !!hudEl,
  };
}

// ── Component ────────────────────────────────────────────────────────

export function ThreeFiveSevenDealDiagPanel() {
  const inTray = useInDebugTray();
  const enabled = useDebugPillEnabled('threeFiveSevenDealDiag');

  // Always install the watcher (no-op if already installed). We can't
  // gate it on `enabled` because then the ring buffer would be empty
  // when users toggle the pill on mid-session.
  useEffect(() => { ensureWatcher(); }, []);

  const deals = useSyncExternalStore(subscribeDealDbg, getDealDbg, getDealDbg);
  const cts = useSyncExternalStore(subscribeCardTransportDbg, getCardTransportDbg, getCardTransportDbg);
  const transitions = useSyncExternalStore(subscribeTransitions, getTransitions, getTransitions);

  // Force-refresh DOM probes every 250ms while expanded.
  const [, tick] = useState(0);
  const expandedRef = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (expandedRef.current) tick((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [enabled]);

  const [expanded, setExpanded] = useState(false);
  expandedRef.current = expanded;

  const latest = useMemo(() => latestHand357(deals), [deals]);
  const selfOwn = useMemo(() => selfHandRecord(latest), [latest]);
  const card0 = useMemo(() => card0Record(cts, latest?.handContextId ?? null), [cts, latest?.handContextId]);
  const timer = useMemo(() => deriveTimer(latest), [latest]);

  if (!enabled) return null;

  const round = latest?.handContextId.match(/#r(\d+)$/)?.[1] ?? '—';

  // DOM probes for self hand
  const playerHandEl =
    typeof document !== 'undefined'
      ? document.querySelector('[data-canonical-self-hand-anchor-position="top-of-pane"]')
      : null;
  const playerHandMounted = !!playerHandEl;
  const playerHandKey =
    playerHandEl?.getAttribute('data-card-anchor') ?? '∅';
  const activeHandRegionEl =
    typeof document !== 'undefined'
      ? document.querySelector('[data-357-active-hand-region]')
      : null;
  const fanLayoutInitialized = !!document.querySelector('[data-357-active-hand-region] [data-card-id]');

  // ── PROBE 1 · SELF LANDING ──────────────────────────────────────
  const rectOf = (el: Element | null) => {
    if (!el || typeof (el as HTMLElement).getBoundingClientRect !== 'function') return null;
    const r = (el as HTMLElement).getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(2), h: +r.height.toFixed(2), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) };
  };
  const selfCardEls = activeHandRegionEl
    ? Array.from(activeHandRegionEl.querySelectorAll('[data-card-id]'))
    : [];
  const allCardEls = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll('[data-card-id]'))
    : [];
  const fanRootEl = (selfCardEls[0]?.parentElement as Element | null) ?? activeHandRegionEl;
  const handAnchorRect = rectOf(playerHandEl);
  const playerHandRect = rectOf(activeHandRegionEl);
  const fanRootRect = rectOf(fanRootEl);
  const card0DomEl = selfCardEls[0] ?? null;
  const card0DomRect = rectOf(card0DomEl);
  const distancePx = (handAnchorRect && card0DomRect)
    ? +Math.hypot(card0DomRect.cx - handAnchorRect.cx, card0DomRect.cy - handAnchorRect.cy).toFixed(1)
    : null;
  const actualVisibleCardDOMCount = selfCardEls.length;
  const actualOpponentCardDomCount = allCardEls.length - selfCardEls.length;

  // ── PROBE 3 · TIMER OWNER ───────────────────────────────────────
  const timerRailEl = typeof document !== 'undefined'
    ? document.querySelector('[data-canonical-shell-timer-rail]')
    : null;
  const legacyTimerEls = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll('[data-shell-timer], [data-mobile-player-timer], [data-three-five-seven-timer], [data-legacy-timer]'))
    : [];
  const renderedTimerComponent = timerRailEl
    ? 'ShellTimerRail'
    : legacyTimerEls.length
      ? `legacy(${legacyTimerEls.map((e) => e.getAttribute('data-shell-timer') || e.getAttribute('data-mobile-player-timer') || e.tagName).join(',')})`
      : 'none';
  const usesDealRuntime = latest?.timerVisible !== undefined;
  const is357 = !!latest?.handContextId && /#h\d+#r\d+$/.test(latest.handContextId);

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 2px' };
  const k: React.CSSProperties = { color: '#9fb3c8' };
  const v: React.CSSProperties = { color: '#fff', fontVariantNumeric: 'tabular-nums' };
  const sect: React.CSSProperties = { borderTop: '1px solid #2a2a2a', padding: '6px 6px 4px', marginTop: 4 };
  const sectTitle: React.CSSProperties = { color: '#FFD580', fontWeight: 700, marginBottom: 3 };
  const violation: React.CSSProperties = { color: '#ff6b6b', fontWeight: 700 };
  const ok: React.CSSProperties = { color: '#7CFC00', fontWeight: 700 };

  const baseFlash = selfOwn && selfOwn.visibleCount < selfOwn.prevWaveCount;

  return (
    <div
      data-three-five-seven-deal-diag-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 520px)' : 'auto',
        maxWidth: expanded ? undefined : 360,
        background: 'rgba(0,0,0,0.9)',
        color: '#fff',
        border: '1px solid #555',
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.35,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px' }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700 }}
        >
          {expanded ? '▼' : '▶'} 357 DEAL DIAG
          {!expanded && latest ? (
            <span style={{ fontWeight: 400, opacity: 0.85 }}>
              {' '}· r{round} {timer.phase} vis={selfOwn?.visibleCount ?? '—'}/{selfOwn?.authoritativeCount ?? '—'}
              {timer.violation ? <span style={violation}> ⚠ TIMER</span> : null}
              {baseFlash ? <span style={violation}> ⚠ FLASH</span> : null}
            </span>
          ) : (
            <span style={{ fontWeight: 400, opacity: 0.6 }}> · (no 357 hand yet)</span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const snapshot = {
              capturedAt: new Date().toISOString(),
              latestHand: latest,
              selfOwnership: selfOwn,
              timer,
              card0Timeline: card0,
              domProbes: { playerHandMounted, playerHandKey, fanLayoutInitialized },
              probes: {
                selfLanding: { handAnchorRect, playerHandRect, fanRootRect, card0DomRect, distancePx, actualVisibleCardDOMCount, ownershipClaimTime: card0?.ownershipClaimTime, transportDestroyedTime: card0?.transportDestroyedTime },
                renderedCardCounts: { actualSelfCardDomCount: actualVisibleCardDOMCount, actualOpponentCardDomCount, effectiveCards: selfOwn?.visibleCount, visibleCount: selfOwn?.visibleCount, authoritativeCount: selfOwn?.authoritativeCount },
                timerOwner: { renderedTimerComponent, timerSource: timer.timerSource, usesDealRuntime, phase: timer.phase, is357, legacyTimerCount: legacyTimerEls.length, canonicalRailMounted: !!timerRailEl },
              },
              transitions: [...transitions],
              allDeals: deals,
              cardTransport: cts,
            };
            const text = JSON.stringify(snapshot, null, 2);
            const done = (label: string) => {
              const btn = e.currentTarget as HTMLButtonElement | null;
              if (btn) {
                const orig = btn.textContent;
                btn.textContent = label;
                setTimeout(() => { if (btn) btn.textContent = orig; }, 1200);
              }
            };
            navigator.clipboard?.writeText(text).then(
              () => done('✓'),
              () => {
                try {
                  const ta = document.createElement('textarea');
                  ta.value = text;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                  done('✓');
                } catch { done('✗'); }
              }
            );
          }}
          style={{ background: '#1e3a5f', color: '#fff', border: '1px solid #4a7bb8', borderRadius: 3, padding: '2px 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
          title="Copy full diagnostic snapshot as JSON"
        >
          Copy
        </button>
      </div>

      {expanded ? (
        <div style={{ maxHeight: 520, overflow: 'auto', padding: '2px 0 6px' }}>
          {/* Section 1 — Self Hand Ownership */}
          <div style={sect}>
            <div style={sectTitle}>1 · SELF HAND OWNERSHIP</div>
            <div style={rowStyle}><span style={k}>handContextId</span><span style={v}>{latest?.handContextId ?? '∅'}</span></div>
            <div style={rowStyle}><span style={k}>round</span><span style={v}>{round}</span></div>
            <div style={rowStyle}><span style={k}>phase</span><span style={v}>{timer.phase}</span></div>
            <div style={rowStyle}><span style={k}>authoritativeCards.length</span><span style={v}>{selfOwn?.authoritativeCount ?? '—'}</span></div>
            <div style={rowStyle}><span style={k}>cachedCards.length</span><span style={v}>{selfOwn?.visibleCount ?? '—'}</span></div>
            <div style={rowStyle}><span style={k}>effectiveCards.length</span><span style={v}>{selfOwn?.visibleCount ?? '—'}</span></div>
            <div style={rowStyle}>
              <span style={k}>visibleCards.length</span>
              <span style={baseFlash ? violation : v}>{selfOwn?.visibleCount ?? '—'}{baseFlash ? ' ↓ below prevWave!' : ''}</span>
            </div>
            <div style={rowStyle}><span style={k}>prevWaveCount</span><span style={v}>{selfOwn?.prevWaveCount ?? '—'}</span></div>
            <div style={rowStyle}><span style={k}>baselineApplied</span><span style={selfOwn?.baselineApplied ? ok : v}>{String(selfOwn?.baselineApplied ?? '—')}</span></div>
            <div style={rowStyle}><span style={k}>renderGuardPassed</span><span style={selfOwn?.renderGuardPassed ? ok : v}>{String(selfOwn?.renderGuardPassed ?? '—')}</span></div>
            <div style={rowStyle}><span style={k}>playerHandMounted</span><span style={playerHandMounted ? ok : violation}>{String(playerHandMounted)}</span></div>
            <div style={rowStyle}><span style={k}>playerHandKey</span><span style={v}>{playerHandKey}</span></div>
            <div style={rowStyle}><span style={k}>fanLayoutInitialized</span><span style={v}>{String(fanLayoutInitialized)}</span></div>
            <div style={rowStyle}><span style={k}>ownershipClaimTime(card0)</span><span style={v}>{fmtAbs(card0?.ownershipClaimTime)}</span></div>
            <div style={rowStyle}><span style={k}>transportDestroyedTime(card0)</span><span style={v}>{fmtAbs(card0?.transportDestroyedTime)}</span></div>
          </div>

          {/* Section 2 — Round Transition */}
          <div style={sect}>
            <div style={sectTitle}>2 · ROUND TRANSITION (last {transitions.length}/50)</div>
            {transitions.length === 0 ? (
              <div style={{ opacity: 0.6, padding: '0 6px' }}>(no transitions captured yet — play a 357 hand)</div>
            ) : (
              <div style={{ maxHeight: 180, overflow: 'auto', padding: '0 4px' }}>
                {[...transitions].reverse().map((s, i) => {
                  const prev = transitions[transitions.length - 2 - i] ?? null;
                  const flash = prev && s.visibleCount < prev.visibleCount;
                  return (
                    <div key={`${s.t}-${i}`} style={{ borderBottom: '1px dashed #2a2a2a', padding: '2px 0' }}>
                      <div style={{ color: flash ? '#ff6b6b' : '#87CEFA', fontWeight: 700 }}>
                        +{(s.t).toFixed(0)}ms · r{s.round ?? '?'} · {s.waveMounted ? 'WAVE+' : s.waveUnmounted ? 'WAVE−' : '·'}
                        {flash ? ' ⚠ DROPPED' : ''}
                      </div>
                      <div>prevWave={s.prevWaveCount} auth={s.authoritativeCount} cached={s.cachedCount} <span style={flash ? violation : v}>vis={s.visibleCount}</span> phase={s.dealPhase}</div>
                      <div style={{ opacity: 0.75 }}>baseline={String(s.baselineApplied)} guard={String(s.renderGuardPassed)} runtime={s.dealRuntimeId.slice(-22)} wave={s.waveId.slice(-10)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3 — Timer Ownership */}
          <div style={sect}>
            <div style={sectTitle}>3 · TIMER OWNERSHIP</div>
            <div style={rowStyle}><span style={k}>dealPhase</span><span style={v}>{timer.phase}</span></div>
            <div style={rowStyle}><span style={k}>cardsExpected</span><span style={v}>{timer.cardsExpected}</span></div>
            <div style={rowStyle}><span style={k}>cardsSettled</span><span style={v}>{timer.cardsSettled}</span></div>
            <div style={rowStyle}><span style={k}>dealSettled</span><span style={timer.dealSettled ? ok : v}>{String(timer.dealSettled)}</span></div>
            <div style={rowStyle}><span style={k}>readyEnteredAt</span><span style={v}>{latest?.readyReleased ? fmtAbs(latest.updatedAt) : '—'}</span></div>
            <div style={rowStyle}><span style={k}>gameplayEnteredAt</span><span style={v}>{fmtAbs(latest?.enterGameplayCalledAt)}</span></div>
            <div style={rowStyle}>
              <span style={k}>timerVisible (actual / expected)</span>
              <span style={timer.timerVisibleActual === timer.timerVisibleExpected ? ok : violation}>
                {String(timer.timerVisibleActual)} / {String(timer.timerVisibleExpected)}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={k}>timerRunning (actual / expected)</span>
              <span style={timer.timerRunningActual === timer.timerRunningExpected ? ok : violation}>
                {String(timer.timerRunningActual)} / {String(timer.timerRunningExpected)}
              </span>
            </div>
            <div style={rowStyle}><span style={k}>timerSource</span><span style={v}>{timer.timerSource}</span></div>
            <div style={rowStyle}><span style={k}>activePlayerHUDMounted</span><span style={timer.activePlayerHUDMounted ? ok : v}>{String(timer.activePlayerHUDMounted)}</span></div>
            {timer.violation ? (
              <div style={{ ...violation, padding: '3px 2px' }}>⚠ phase=DEALING but timer is visible/running</div>
            ) : null}
          </div>

          {/* Section 4 — Card 0 Timeline */}
          <div style={sect}>
            <div style={sectTitle}>4 · CARD-0 TIMELINE (r1 self)</div>
            {!card0 ? (
              <div style={{ opacity: 0.6, padding: '0 6px' }}>(no r1 card-0 record yet)</div>
            ) : (
              <>
                <div style={rowStyle}><span style={k}>intentId</span><span style={v}>{card0.intentId.slice(-28)}</span></div>
                <div style={rowStyle}><span style={k}>recipient</span><span style={v}>{card0.to?.kind ?? '?'} {card0.to?.kind === 'hand' ? card0.to.playerId.slice(0, 8) : ''}</span></div>
                <div style={rowStyle}><span style={k}>transport mounted</span><span style={card0.transportMounted ? ok : v}>{String(!!card0.transportMounted)}</span></div>
                <div style={rowStyle}><span style={k}>transport visible</span><span style={card0.transportVisible ? ok : v}>{String(!!card0.transportVisible)}</span></div>
                <div style={rowStyle}><span style={k}>actualStartTime</span><span style={v}>{fmtAbs(card0.actualStartTime)}</span></div>
                <div style={rowStyle}><span style={k}>actualArrivalTime</span><span style={v}>{fmtAbs(card0.actualArrivalTime)}</span></div>
                <div style={rowStyle}><span style={k}>settled</span><span style={card0.settled ? ok : v}>{String(!!card0.settled)}</span></div>
                <div style={rowStyle}><span style={k}>ownershipClaimTime</span><span style={v}>{fmtAbs(card0.ownershipClaimTime)}</span></div>
                <div style={rowStyle}><span style={k}>effectiveCards=1 (since claim)</span><span style={v}>
                  {card0.ownershipClaimTime && selfOwn ? (selfOwn.visibleCount >= 1 ? '✓' : '✗ NOT VISIBLE') : '—'}
                </span></div>
                <div style={rowStyle}><span style={k}>PlayerHand mounted</span><span style={playerHandMounted ? ok : violation}>{String(playerHandMounted)}</span></div>
                <div style={rowStyle}><span style={k}>transportDestroyedTime</span><span style={v}>{fmtAbs(card0.transportDestroyedTime)}</span></div>
                <div style={rowStyle}><span style={k}>destroyed before PlayerHand?</span>
                  <span style={card0.transportDestroyedTime && !playerHandMounted ? violation : ok}>
                    {card0.transportDestroyedTime ? (playerHandMounted ? 'no (good)' : 'YES (gap)') : '—'}
                  </span>
                </div>
                <div style={rowStyle}><span style={k}>droppedReason</span><span style={card0.droppedReason ? violation : v}>{card0.droppedReason ?? '∅'}</span></div>
                {/* Inline mini-timeline */}
                <div style={{ marginTop: 4, padding: '3px 4px', background: 'rgba(255,255,255,0.04)', borderLeft: '2px solid #87CEFA' }}>
                  {[
                    ['mounted',       card0.updatedAt && card0.transportMounted ? card0.updatedAt - (card0.actualStartTime ?? card0.updatedAt) : null],
                    ['actualStart',   card0.actualStartTime ?? null],
                    ['actualArrival', card0.actualArrivalTime ?? null],
                    ['ownershipClaim',card0.ownershipClaimTime ?? null],
                    ['destroyed',     card0.transportDestroyedTime ?? null],
                  ].map(([label, t]) => (
                    <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={k}>{String(label)}</span>
                      <span style={v}>{typeof t === 'number' ? fmtAbs(t as number) : '—'}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
