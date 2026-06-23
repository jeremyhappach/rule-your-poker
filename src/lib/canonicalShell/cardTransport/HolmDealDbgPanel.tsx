import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';
import {
  getCardTransportDbg,
  subscribeCardTransportDbg,
  type CardTransportDbgEntry,
} from './cardTransportDbg';
import {
  formatHolmDealDbgSnapshot,
  getHolmDealDbgMeta,
  holmDealDbgPublishSnapshot,
  subscribeHolmDealDbg,
  type HolmDealDbgMeta,
  type HolmDealDbgSnapshot,
  type HolmDealViolationDbg,
  type HolmHiddenByReason,
  type HolmRenderedCardDbg,
} from './holmDealDbg';
import {
  getHolmCardTimeline,
  getHolmDealFrames,
  getHolmTimelineViolations,
  holmFramesAppend,
  holmTimelineRecordClaim,
  holmTimelineRecordDomMount,
  holmTimelineRecordVisible,
} from './holmCardTimeline';
import {
  getHolmCardOwnership,
  getHolmOwnershipViolations,
  scanHolmDomOwnership,
} from './holmCardOwnership';
import {
  getHolmSoloOwnership,
  getHolmSoloOwnershipViolations,
} from './holmSoloOwnership';
import {
  getHolmTimelineEvents,
  getHolmWartimeViolations,
  holmWartimeTick,
  subscribeHolmWartime,
} from './holmWartimeForensics';
import {
  buildChuckyFullForensicsText,
  getChuckyFullForensics,
} from './holmChuckyFullForensics';
import {
  buildChuckyRenderStateForensicsText,
  getChuckyRenderStateForensics,
} from './holmChuckyRenderStateForensics';
import {
  buildBucksForensicsText,
  getBucksForensics,
} from '@/lib/canonicalShell/holmBucksOverlayForensics';
import {
  buildHolmSelfTimerForensicsText,
  getHolmTimerEvents as getHolmSelfTimerEvents,
  getHolmTimerViolations as getHolmSelfTimerViolations,
  getHolmTimerOwners as getHolmSelfTimerOwners,
  getHolmTimerSegments as getHolmSelfTimerSegments,
  subscribeHolmSelfTimer,
} from './holmSelfTimerForensics';
import {
  buildHolmHandBoundaryForensicsText,
  getHolmHbEvents,
  getHolmHbViolations,
  getHolmHbSources,
} from './holmHandBoundaryForensics';

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(1) : '—';
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  return String(v);
}

function endpointKind(endpoint: string): 'self' | 'opp' | 'community' | 'chucky' | 'unknown' {
  if (endpoint.startsWith('hand:')) return 'self';
  if (endpoint.startsWith('opp-stack:')) return 'opp';
  if (endpoint.startsWith('community:')) return 'community';
  if (endpoint.startsWith('chucky:')) return 'chucky';
  return 'unknown';
}

function visible(el: HTMLElement | null): boolean {
  if (!el || typeof window === 'undefined') return false;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || '1') > 0 && r.width > 0 && r.height > 0;
}

function rect(el: HTMLElement | null): { x: number; y: number; w: number; h: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
}

function hiddenReason(meta: HolmDealDbgMeta, dispatched: boolean, settled: boolean, domMounted: boolean): HolmHiddenByReason {
  if (domMounted) return settled ? 'none' : dispatched ? 'not_settled' : 'not_claimed';
  if (!meta.beginDealAt) return 'deal_not_started';
  if (!dispatched) return 'wave_not_started';
  if (!settled) return 'not_settled';
  if (meta.phase === 'GAMEPLAY') return 'gameplay_only';
  return 'unknown';
}

function firstById(records: CardTransportDbgEntry[], cardId: string): CardTransportDbgEntry | null {
  return records.find((r) => r.cardId === cardId || r.intentId === cardId) ?? null;
}

function buildSnapshot(meta: HolmDealDbgMeta, records: CardTransportDbgEntry[]): HolmDealDbgSnapshot {
  const handCtx = meta.handContextId;
  const handRecords = handCtx ? records.filter((r) => r.handContextId === handCtx) : [];
  const settledIds = new Set(meta.settledIds);
  const visibilityRows: HolmRenderedCardDbg[] = [];

  const selfNodes = typeof document !== 'undefined'
    ? Array.from(document.querySelectorAll<HTMLElement>('[data-holm-active-hand-region] [data-playing-card-root], [data-holm-active-hand-region] [data-canonical-card-back]'))
    : [];
  const expectedByPlayer = new Map<string, number>();

  for (const expected of meta.expectedCards) {
    const record = firstById(handRecords, expected.cardId);
    const dispatched = !!record;
    const claimed = !!record?.ownershipClaimTime || settledIds.has(expected.cardId);
    const settled = settledIds.has(expected.cardId) || !!record?.settled;
    const kind = endpointKind(expected.endpoint);
    let node: HTMLElement | null = null;
    let renderer = 'unknown';

    if (kind === 'self') {
      const key = expected.playerId ?? 'self';
      const idx = expectedByPlayer.get(key) ?? 0;
      expectedByPlayer.set(key, idx + 1);
      node = selfNodes[idx] ?? null;
      renderer = 'MobileGameTable.activeSelfHand > PlayerHand';
    } else if (kind === 'opp') {
      node = typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(`[data-holm-card-id="${CSS.escape(expected.cardId)}"]`)
        : null;
      renderer = node?.dataset.holmRenderer ?? 'MobileGameTable.holmCanonicalSeat.cardBacks';
    } else if (kind === 'community') {
      node = typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(`[data-holm-card-id="${CSS.escape(expected.cardId)}"]`)
        : null;
      renderer = node?.dataset.holmRenderer ?? 'CommunityCards';
    } else if (kind === 'chucky') {
      node = typeof document !== 'undefined'
        ? document.querySelector<HTMLElement>(`[data-holm-card-id="${CSS.escape(expected.cardId)}"]`)
        : null;
      renderer = node?.dataset.holmRenderer ?? 'MobileGameTable.holmChuckyStage';
    }

    const domMounted = !!node;
    visibilityRows.push({
      cardId: expected.cardId,
      endpoint: expected.endpoint,
      renderer,
      component: node?.dataset.holmComponent ?? null,
      playerId: expected.playerId ?? null,
      seatPosition: expected.seatPosition ?? null,
      domMounted,
      domVisible: visible(node),
      claimed,
      settled,
      hiddenByReason: hiddenReason(meta, dispatched, settled, domMounted),
      rect: rect(node),
    });
  }

  const violations: HolmDealViolationDbg[] = [];
  for (const row of visibilityRows) {
    if (row.domMounted && !row.settled) {
      violations.push({
        type: 'HOLM_CARD_RENDERED_BEFORE_SETTLE',
        cardId: row.cardId,
        endpoint: row.endpoint,
        renderer: row.renderer,
        phase: meta.phase,
        claimed: row.claimed,
        settled: row.settled,
        domMounted: row.domMounted,
        at: performance.now(),
      });
    }
  }
  const actualVisibleCards = visibilityRows.filter((r) => r.domVisible).length;
  const totalSettled = settledIds.size;
  if (meta.phase === 'DEALING' && actualVisibleCards > totalSettled) {
    violations.push({
      type: 'HOLM_ALL_CARDS_VISIBLE_AT_DEAL_START',
      phase: meta.phase,
      actualVisibleCards,
      cardsSettled: totalSettled,
      at: performance.now(),
    });
  }

  const countEndpoint = (prefix: string) => visibilityRows.filter((r) => r.endpoint.startsWith(prefix));
  const self = countEndpoint('hand:');
  const oppRowsBySeat = meta.seatOrder
    .filter((pos) => pos !== null && pos !== undefined)
    .map((pos) => visibilityRows.filter((r) => r.endpoint === `opp-stack:${pos}`));

  return {
    ...meta,
    runtime: {
      handContextId: meta.handContextId,
      gameType: meta.gameType,
      dealRuntimeMounted: meta.dealRuntimeMounted,
      phase: meta.phase,
      dealSettled: meta.dealSettled,
      readyReleased: meta.readyReleased,
      activeIntentCount: meta.activeIntentCount,
      beginDealAt: meta.beginDealAt,
      beginWaveAt: meta.beginWaveAt,
      enterGameplayAt: meta.enterGameplayAt,
    },
    hands: {
      cardsExpected: meta.cardsExpected,
      cardsDispatched: meta.cardsDispatched,
      cardsSettled: meta.cardsSettled,
      buckPosition: meta.buckPosition,
      dealerPosition: meta.dealerPosition,
      seatOrder: meta.seatOrder,
      wave: meta.wave,
      settledSelf: self.filter((r) => r.settled).length,
      settledOpp1: oppRowsBySeat[0]?.filter((r) => r.settled).length ?? 0,
      settledOpp2: oppRowsBySeat[1]?.filter((r) => r.settled).length ?? 0,
      settledOpp3: oppRowsBySeat[2]?.filter((r) => r.settled).length ?? 0,
      actualSelfDomCount: self.filter((r) => r.domMounted).length,
      actualOpp1DomCount: oppRowsBySeat[0]?.filter((r) => r.domMounted).length ?? 0,
      actualOpp2DomCount: oppRowsBySeat[1]?.filter((r) => r.domMounted).length ?? 0,
      actualOpp3DomCount: oppRowsBySeat[2]?.filter((r) => r.domMounted).length ?? 0,
    },
    community: {
      communityExpected: meta.communityExpected,
      communityDispatched: meta.communityDispatched,
      communitySettled: meta.communitySettled,
      settledIds: meta.settledIds.filter((id) => id.includes('#community-')),
      community0Settled: settledIds.has(`${handCtx}#community-0`),
      community1Settled: settledIds.has(`${handCtx}#community-1`),
      community2Settled: settledIds.has(`${handCtx}#community-2`),
      community3Settled: settledIds.has(`${handCtx}#community-3`),
      community0DomMounted: !!document.querySelector(`[data-holm-card-id="${CSS.escape(`${handCtx}#community-0`)}"]`),
      community1DomMounted: !!document.querySelector(`[data-holm-card-id="${CSS.escape(`${handCtx}#community-1`)}"]`),
      community2DomMounted: !!document.querySelector(`[data-holm-card-id="${CSS.escape(`${handCtx}#community-2`)}"]`),
      community3DomMounted: !!document.querySelector(`[data-holm-card-id="${CSS.escape(`${handCtx}#community-3`)}"]`),
    },
    chucky: {
      soloDeclared: meta.soloDeclared,
      chuckyExpected: meta.chuckyExpected,
      chuckyDispatched: meta.chuckyDispatched,
      chuckySettled: meta.chuckySettled,
      ...Object.fromEntries(Array.from({ length: Math.max(meta.chuckyExpected, 0) }, (_, i) => [
        `chucky${i}Mounted`,
        !!document.querySelector(`[data-holm-card-id="${CSS.escape(`${handCtx}#chucky-${i}`)}"]`),
      ])),
    },
    visibility: visibilityRows,
    violations,
  };
}

export function HolmDealDbgPanel() {
  const inTray = useInDebugTray();
  const toggleEnabled = useDebugPillEnabled('holmDealDbg');
  const meta = useSyncExternalStore(subscribeHolmDealDbg, getHolmDealDbgMeta, getHolmDealDbgMeta);
  const records = useSyncExternalStore(subscribeCardTransportDbg, getCardTransportDbg, getCardTransportDbg);
  // WAR-TIME ring buffers — MUST be called unconditionally before any early return
  const wartimeEvents = useSyncExternalStore(subscribeHolmWartime, getHolmTimelineEvents, getHolmTimelineEvents);
  const wartimeViolations = useSyncExternalStore(subscribeHolmWartime, getHolmWartimeViolations, getHolmWartimeViolations);
  const selfTimerEvents = useSyncExternalStore(subscribeHolmSelfTimer, getHolmSelfTimerEvents, getHolmSelfTimerEvents);
  const selfTimerViolations = useSyncExternalStore(subscribeHolmSelfTimer, getHolmSelfTimerViolations, getHolmSelfTimerViolations);
  const selfTimerSegments = useSyncExternalStore(subscribeHolmSelfTimer, getHolmSelfTimerSegments, getHolmSelfTimerSegments);
  const selfTimerOwners = useSyncExternalStore(subscribeHolmSelfTimer, getHolmSelfTimerOwners, getHolmSelfTimerOwners);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sampleTick, tick] = useState(0);
  const enabled = toggleEnabled;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => tick((n) => n + 1), expanded ? 200 : 500);
    return () => window.clearInterval(id);
  }, [enabled, expanded]);

  // ── rAF timeline scanner: claim/mount/visible per card + per-frame snapshot
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const loop = () => {
      const m = getHolmDealDbgMeta();
      const recs = getCardTransportDbg();
      const recById = new Map<string, CardTransportDbgEntry>();
      for (const r of recs) {
        const id = r.cardId ?? r.intentId;
        if (id) recById.set(id, r);
      }
      const now = performance.now();
      const handCtx = m.handContextId;

      // self ordering
      const selfNodes = typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-holm-active-hand-region] [data-playing-card-root], [data-holm-active-hand-region] [data-canonical-card-back]'))
        : [];
      const selfIdxByPlayer = new Map<string, number>();
      let visibleCount = 0;
      let selfDom = 0;
      const oppDom = new Map<number, number>();
      let commDom = 0;
      let chuckyDom = 0;

      for (const exp of m.expectedCards) {
        const rec = recById.get(exp.cardId);
        if (rec?.ownershipClaimTime) holmTimelineRecordClaim(exp.cardId, rec.ownershipClaimTime);
        let node: HTMLElement | null = null;
        if (exp.endpoint.startsWith('hand:')) {
          const key = exp.playerId ?? 'self';
          const idx = selfIdxByPlayer.get(key) ?? 0;
          selfIdxByPlayer.set(key, idx + 1);
          node = selfNodes[idx] ?? null;
          if (node) selfDom++;
        } else {
          node = typeof document !== 'undefined'
            ? document.querySelector<HTMLElement>(`[data-holm-card-id="${CSS.escape(exp.cardId)}"]`)
            : null;
          if (node) {
            if (exp.endpoint.startsWith('opp-stack:')) {
              const pos = Number(exp.endpoint.split(':')[1]);
              oppDom.set(pos, (oppDom.get(pos) ?? 0) + 1);
            } else if (exp.endpoint.startsWith('community:')) commDom++;
            else if (exp.endpoint.startsWith('chucky:')) chuckyDom++;
          }
        }
        if (node) {
          holmTimelineRecordDomMount(exp.cardId, now);
          const cs = window.getComputedStyle(node);
          const r = node.getBoundingClientRect();
          const vis = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || '1') > 0 && r.width > 0 && r.height > 0;
          if (vis) {
            visibleCount++;
            holmTimelineRecordVisible(exp.cardId, now);
          }
        }
      }

      const settledSet = new Set(m.settledIds);
      const cardsSettled = settledSet.size;
      let cardsClaimed = 0;
      for (const exp of m.expectedCards) {
        const rec = recById.get(exp.cardId);
        if (rec?.ownershipClaimTime || settledSet.has(exp.cardId)) cardsClaimed++;
      }

      holmFramesAppend({
        t: now,
        phase: m.phase,
        cardsClaimed,
        cardsSettled,
        actualSelfDomCount: selfDom,
        actualOppDomCounts: Array.from(oppDom.entries()).sort((a, b) => a[0] - b[0]).map(([, n]) => n),
        actualCommunityDomCount: commDom,
        actualChuckyDomCount: chuckyDom,
        visibleDomCards: visibleCount,
      });

      // WAR-TIME forensics tick (community / chucky / ownership +
      // timeline events + violation detection). Pure instrumentation.
      try { holmWartimeTick(); } catch { /* noop */ }

      // keep panel-side meta fresh too
      void handCtx;
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [enabled]);

  const snapshot = useMemo(() => buildSnapshot(meta, records), [meta, records, sampleTick]);
  useEffect(() => {
    if (!enabled) return;
    holmDealDbgPublishSnapshot(snapshot);
  }, [enabled, snapshot]);

  if (!enabled) return null;

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 2px' };
  const k: React.CSSProperties = { color: '#9fb3c8' };
  const v: React.CSSProperties = { color: '#fff', fontVariantNumeric: 'tabular-nums' };
  const ok: React.CSSProperties = { color: '#7CFC00', fontWeight: 700 };
  const bad: React.CSSProperties = { color: '#ff6b6b', fontWeight: 700 };
  const sect: React.CSSProperties = { borderTop: '1px solid #2a2a2a', padding: '6px 6px 4px', marginTop: 4 };
  const title: React.CSSProperties = { color: '#FFD580', fontWeight: 800, marginBottom: 3 };

  const timeline = getHolmCardTimeline();
  const frames = getHolmDealFrames();
  const timelineViolations = getHolmTimelineViolations();
  // WAR-TIME ring buffers were hoisted above the early return to keep hook order stable.
  const wartimeCommunity = (typeof window !== 'undefined' && (window as unknown as { __holmDealDbg?: Record<string, unknown> }).__holmDealDbg?.wartimeCommunity) as Record<string, unknown> | undefined;
  const wartimeChucky = (typeof window !== 'undefined' && (window as unknown as { __holmDealDbg?: Record<string, unknown> }).__holmDealDbg?.wartimeChucky) as Record<string, unknown> | undefined;
  const wartimeOwnership = (typeof window !== 'undefined' && (window as unknown as { __holmDealDbg?: Record<string, unknown> }).__holmDealDbg?.wartimeOwnership) as Record<string, unknown> | undefined;
  const expectedIds = new Set(snapshot.expectedCards.map((c) => c.cardId));
  const transportLifecycle = records.filter((r) =>
    (snapshot.handContextId && r.handContextId === snapshot.handContextId) ||
    (r.cardId != null && expectedIds.has(r.cardId)),
  );
  void sampleTick;

  const copy = async () => {
    const text = formatHolmDealDbgSnapshot(snapshot) +
      '\n\n--- TRANSPORT LIFECYCLE ---\n' + JSON.stringify(transportLifecycle, null, 2) +
      '\n\n--- TIMELINE ---\n' + JSON.stringify(timeline, null, 2) +
      '\n\n--- FRAMES (last ' + frames.length + ') ---\n' + JSON.stringify(frames.slice(-60), null, 2) +
      '\n\n--- TIMELINE VIOLATIONS ---\n' + JSON.stringify(timelineViolations, null, 2) +
      '\n\n--- WARTIME COMMUNITY ---\n' + JSON.stringify(wartimeCommunity, null, 2) +
      '\n\n--- WARTIME CHUCKY ---\n' + JSON.stringify(wartimeChucky, null, 2) +
      '\n\n--- WARTIME OWNERSHIP ---\n' + JSON.stringify(wartimeOwnership, null, 2) +
      '\n\n--- WARTIME TIMELINE EVENTS (' + wartimeEvents.length + ') ---\n' + JSON.stringify(wartimeEvents, null, 2) +
      '\n\n--- WARTIME VIOLATIONS (' + wartimeViolations.length + ') ---\n' + JSON.stringify(wartimeViolations, null, 2) +
      '\n\n--- SELF-TIMER FORENSICS ---\n' + buildHolmSelfTimerForensicsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };

  const totalViol = snapshot.violations.length + timelineViolations.length + wartimeViolations.length + selfTimerViolations.length;
  const compact = `phase=${snapshot.phase} settled=${snapshot.settledIds.length}/${snapshot.expectedCount} dom=${snapshot.visibility.filter((r) => r.domMounted).length} viol=${totalViol} wt=${wartimeEvents.length}/${wartimeViolations.length} st=${selfTimerSegments.length}/${selfTimerViolations.length}`;

  return (
    <div
      data-holm-deal-dbg-panel=""
      style={{
        ...(inTray ? { position: 'relative' as const } : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 680px)' : 'auto',
        maxWidth: expanded ? undefined : 380,
        background: 'rgba(0,0,0,0.92)',
        color: '#fff',
        border: `1px solid ${totalViol ? '#ff6b6b' : '#555'}`,
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.35,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, padding: '3px 6px', borderBottom: expanded ? '1px solid #333' : 'none' }}>
        <button type="button" onClick={() => setExpanded((e) => !e)} style={{ flex: '1 1 100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 800, fontSize: 10 }}>
          {expanded ? '▼' : '▶'} HOLM DBG <span style={totalViol ? bad : v}>· {compact}</span>
        </button>
        {(() => {
          const btn = (bg: string, bd: string): React.CSSProperties => ({ background: bg, color: '#fff', border: `1px solid ${bd}`, borderRadius: 3, padding: '1px 5px', fontFamily: 'inherit', fontSize: 9, fontWeight: 700, cursor: 'pointer', lineHeight: 1.2 });
          return (
            <>
              <button type="button" onClick={copy} title="Copy full Holm deal dbg snapshot" style={{ ...btn('#1e3a5f', '#4a7bb8'), color: copied ? '#7CFC00' : '#fff' }}>{copied ? '✓' : 'CPY'}</button>
              <button
                type="button"
                onClick={async () => {
                  const text = buildChuckyFullForensicsText();
                  try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
                  try { (window as unknown as { __holmChuckyFullForensics?: unknown }).__holmChuckyFullForensics = getChuckyFullForensics(); } catch { /* noop */ }
                }}
                title="Copy CHUCKY forensics"
                style={btn('#5f1e3a', '#b84a7b')}
              >CHK</button>
              <button
                type="button"
                onClick={async () => {
                  const text = buildChuckyRenderStateForensicsText();
                  try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
                  try { (window as unknown as { __holmChuckyRenderStateForensics?: unknown }).__holmChuckyRenderStateForensics = getChuckyRenderStateForensics(); } catch { /* noop */ }
                }}
                title="Copy CHUCKY render-state forensics"
                style={btn('#3a5f1e', '#7bb84a')}
              >RND</button>
              <button
                type="button"
                onClick={async () => {
                  const text = buildBucksForensicsText();
                  try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
                  try { (window as unknown as { __holmBucksForensics?: unknown }).__holmBucksForensics = getBucksForensics(); } catch { /* noop */ }
                }}
                title="Copy BUCKS forensics"
                style={btn('#5f3a1e', '#b87b4a')}
              >BCK</button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const text = buildBucksForensicsText();
                    const blob = new Blob([text], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `bucks-forensics-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch { /* noop */ }
                }}
                title="Download BUCKS forensics as .txt"
                style={btn('#5f3a1e', '#b87b4a')}
              >BCK↓</button>
              <button
                type="button"
                onClick={async () => {
                  const text = buildHolmSelfTimerForensicsText();
                  try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
                  try { (window as unknown as { __holmSelfTimerForensicsExport?: string }).__holmSelfTimerForensicsExport = text; } catch { /* noop */ }
                }}
                title="Copy SELF-TIMER forensics"
                style={btn('#1e5f3a', '#4ab87b')}
              >TMR</button>
              <button
                type="button"
                onClick={async () => {
                  const text = buildHolmHandBoundaryForensicsText();
                  try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
                  try {
                    (window as unknown as { __holmHandBoundaryForensicsExport?: unknown }).__holmHandBoundaryForensicsExport = {
                      text,
                      events: getHolmHbEvents(),
                      violations: getHolmHbViolations(),
                      sources: getHolmHbSources(),
                    };
                  } catch { /* noop */ }
                }}
                title="Copy HAND-BOUNDARY forensics"
                style={btn('#1e1e5f', '#4a4ab8')}
              >HBD</button>
            </>
          );
        })()}
      </div>
      {expanded ? (
        <div style={{ maxHeight: 560, overflow: 'auto', padding: '2px 0 6px' }}>
          <div style={sect}><div style={title}>Runtime</div>{Object.entries(snapshot.runtime).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Hands</div>{Object.entries(snapshot.hands).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Community</div>{Object.entries(snapshot.community).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Chucky</div>{Object.entries(snapshot.chucky).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}>
            <div style={title}>Transport Lifecycle</div>
            {transportLifecycle.length === 0 ? <div style={{ opacity: 0.6 }}>(no Holm transport records yet)</div> : transportLifecycle.map((r) => (
              <div key={r.intentId} style={{ borderTop: '1px dashed #333', padding: '3px 0', color: r.droppedReason ? '#ff6b6b' : '#cfd8e3' }}>
                <div style={{ fontWeight: 700 }}>{r.cardId ?? r.intentId}</div>
                <div>state={r.lifecycleState ?? '—'} source={r.markSettledSource ?? '—'} dropped={r.droppedReason ?? '—'}</div>
                <div>provider={fmt(r.providerReceivedAt)} active={fmt(r.activeIntentVisibleAt)} resolve={fmt(r.endpointResolveAttemptedAt)}#{r.endpointResolveAttemptCount ?? 0} endpointResolved={fmt(r.endpointResolvedAt)}</div>
                <div>fromFound={String(!!r.fromEndpointFound)} toFound={String(!!r.toEndpointFound)} from={r.resolvedFromAnchor ?? '—'} to={r.resolvedToAnchor ?? '—'}</div>
                <div>queued={fmt(r.queuedAt)} launched={fmt(r.launchedAt)} flyingMount={fmt(r.flyingCardMountedAt)} animStart={fmt(r.animationStartAt)} animEnd={fmt(r.animationEndAt)} markSettled={fmt(r.markSettledAt)}</div>
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>Visibility</div>
            {snapshot.visibility.length === 0 ? <div style={{ opacity: 0.6 }}>(no Holm expected cards yet)</div> : snapshot.visibility.map((row) => (
              <div key={row.cardId} style={{ borderTop: '1px dashed #333', padding: '3px 0' }}>
                <div style={{ color: row.domMounted && !row.settled ? '#ff6b6b' : '#87CEFA', fontWeight: 700 }}>{row.cardId} · {row.endpoint}</div>
                <div>claimed={String(row.claimed)} settled={String(row.settled)} domMounted={String(row.domMounted)} hiddenByReason=<span style={row.hiddenByReason === 'none' ? ok : bad}>{row.hiddenByReason}</span></div>
                <div style={{ opacity: 0.82 }}>renderer={row.renderer}</div>
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>Violations</div>
            {snapshot.violations.length === 0 ? <div style={ok}>none</div> : snapshot.violations.map((violation, index) => (
              <pre key={`${violation.type}-${index}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(violation, null, 2)}</pre>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>Timeline (per card)</div>
            {Object.values(timeline).length === 0 ? <div style={{ opacity: 0.6 }}>(empty)</div> : Object.values(timeline).map((e) => {
              const visBeforeSettle = e.firstVisibleAt != null && (e.settleAt == null || e.firstVisibleAt < e.settleAt);
              return (
                <div key={e.cardId} style={{ borderTop: '1px dashed #333', padding: '3px 0', color: visBeforeSettle ? '#ff6b6b' : '#cfd8e3' }}>
                  <div style={{ fontWeight: 700 }}>{e.cardId} · {e.endpoint} · {e.wave}</div>
                  <div>dispatch={fmt(e.dispatchAt)} launch={fmt(e.launchAt)} arrival={fmt(e.arrivalAt)} claim={fmt(e.claimAt)} settle={fmt(e.settleAt)} mount={fmt(e.domMountAt)} visible={fmt(e.firstVisibleAt)}</div>
                </div>
              );
            })}
          </div>
          <div style={sect}>
            <div style={title}>Frames (last {frames.length})</div>
            {frames.slice(-8).map((f, i) => (
              <div key={i} style={rowStyle}><span style={k}>{f.t.toFixed(0)} {f.phase}</span><span style={v}>claim={f.cardsClaimed} settle={f.cardsSettled} vis={f.visibleDomCards} self={f.actualSelfDomCount} opp={`[${f.actualOppDomCounts.join(',')}]`} comm={f.actualCommunityDomCount} chk={f.actualChuckyDomCount}</span></div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>Ownership Registry</div>
            {(() => {
              const reg = getHolmCardOwnership();
              const ids = Object.keys(reg);
              const inv = (typeof window !== 'undefined' && (window as unknown as { __holmTransportInventory?: { active: number; queued: number; launched: number; claimed: number; settled: number } }).__holmTransportInventory) || { active: 0, queued: 0, launched: 0, claimed: 0, settled: 0 };
              const dom = scanHolmDomOwnership();
              const violOwn = getHolmOwnershipViolations();
              return (
                <>
                  <div style={rowStyle}><span style={k}>transport inv</span><span style={v}>active={inv.active} queued={inv.queued} launched={inv.launched} claimed={inv.claimed} settled={inv.settled}</span></div>
                  <div style={rowStyle}><span style={k}>registry cards</span><span style={v}>{ids.length}</span></div>
                  <div style={rowStyle}><span style={k}>dom owners</span><span style={v}>{dom.length}</span></div>
                  {ids.slice(-32).map((cid) => {
                    const live = reg[cid].filter((r) => r.unregisteredAt == null);
                    const domHits = dom.filter((d) => d.cardId === cid);
                    const dup = live.length > 1 || domHits.length > 1;
                    return (
                      <div key={cid} style={{ borderTop: '1px dashed #333', padding: '3px 0', color: dup ? '#ff6b6b' : '#cfd8e3' }}>
                        <div style={{ fontWeight: 700 }}>{cid}</div>
                        <div>live={live.length} dom={domHits.length}</div>
                        {live.map((r) => <div key={r.instanceId} style={{ opacity: 0.85 }}>· {r.renderer} ({r.componentName}) phase={r.phase}</div>)}
                        {domHits.map((d, i) => <div key={`${d.domNodeId}-${i}`} style={{ opacity: 0.7 }}>~ dom: {d.renderer} visible={String(d.visible)}</div>)}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 4 }}><span style={title}>Ownership Violations</span></div>
                  {violOwn.length === 0 ? <div style={ok}>none</div> : violOwn.slice(-20).map((v2, i) => (
                    <pre key={`${v2.type}-${i}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(v2, null, 2)}</pre>
                  ))}
                </>
              );
            })()}
          </div>
          <div style={sect}>
            <div style={title}>SOLO Ownership</div>
            {(() => {
              const roots = getHolmSoloOwnership();
              const vs = getHolmSoloOwnershipViolations();
              const order: Array<'SELF_HAND'|'TABLED_SELF'|'CHUCKY_TABLED'|'COMMUNITY'> = ['SELF_HAND','TABLED_SELF','CHUCKY_TABLED','COMMUNITY'];
              return (
                <>
                  {order.map((r) => {
                    const rec = roots[r];
                    const mounted = !!rec?.mounted;
                    return (
                      <div key={r} style={rowStyle}>
                        <span style={k}>{r}</span>
                        <span style={v}>
                          {mounted ? 'MOUNTED' : 'off'} · solo={String(rec?.soloDeclared ?? false)} · phase={rec?.phase ?? '-'} · cards=[{(rec?.cardIds ?? []).join(',')}]
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 4 }}><span style={title}>SOLO Violations</span></div>
                  {vs.length === 0 ? <div style={ok}>none</div> : vs.slice(-10).map((v2, i) => (
                    <pre key={`${v2.type}-${i}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(v2, null, 2)}</pre>
                  ))}
                </>
              );
            })()}
          </div>
          <div style={sect}>
            <div style={title}>Timeline Violations</div>
            {timelineViolations.length === 0 ? <div style={ok}>none</div> : timelineViolations.slice(-20).map((violation, index) => (
              <pre key={`${violation.type}-${index}`} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(violation, null, 2)}</pre>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>WAR-TIME Community</div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#cfd8e3' }}>{JSON.stringify(wartimeCommunity ?? {}, null, 2)}</pre>
          </div>
          <div style={sect}>
            <div style={title}>WAR-TIME Chucky</div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#cfd8e3' }}>{JSON.stringify(wartimeChucky ?? {}, null, 2)}</pre>
          </div>
          <div style={sect}>
            <div style={title}>WAR-TIME Ownership</div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#cfd8e3' }}>{JSON.stringify(wartimeOwnership ?? {}, null, 2)}</pre>
          </div>
          <div style={sect}>
            <div style={title}>WAR-TIME Timeline ({wartimeEvents.length})</div>
            {wartimeEvents.slice(-40).map((e) => (
              <div key={e.seq} style={rowStyle}>
                <span style={k}>#{e.seq} +{e.t.toFixed(0)} {e.event}</span>
                <span style={v}>{e.payload ? JSON.stringify(e.payload).slice(0, 120) : ''}</span>
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>WAR-TIME Violations ({wartimeViolations.length})</div>
            {wartimeViolations.length === 0 ? <div style={ok}>none</div> : wartimeViolations.slice(-20).map((v2) => (
              <pre key={v2.seq} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(v2, null, 2)}</pre>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>SELF-TIMER Owners ({selfTimerOwners.length})</div>
            {selfTimerOwners.length === 0 ? <div style={{ opacity: 0.6 }}>(none)</div> : selfTimerOwners.map((o) => (
              <div key={o.instanceId} style={rowStyle}>
                <span style={k}>inst{o.instanceId}</span>
                <span style={v}>{o.mounted ? 'MOUNTED' : 'gone'} · seg={o.lastSegmentId ?? '—'} · renders={o.renderCount} · hand={o.handContextId ?? '—'}</span>
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>SELF-TIMER Segments ({selfTimerSegments.length})</div>
            {selfTimerSegments.slice(-12).map((s) => (
              <div key={s.segmentId} style={{ borderTop: '1px dashed #333', padding: '3px 0', color: s.violations.length ? '#ff6b6b' : '#cfd8e3' }}>
                <div style={{ fontWeight: 700 }}>{s.segmentId}</div>
                <div>preCommit={fmt(s.preCommitProgress)} rAF1={fmt(s.firstRafProgress)} rAF2={fmt(s.secondRafProgress)} 250ms={fmt(s.at250msProgress)} last={fmt(s.lastProgress)}</div>
                <div>domVisualRatio(first)={fmt(s.domSvgFirstVisualRatio)} dashoff={fmt(s.domSvgFirstDashoffset)} circ={fmt(s.domSvgFirstCircumference)}</div>
                <div style={{ opacity: 0.8 }}>cssTransition={s.cssTransition ?? '—'}</div>
                <div style={{ opacity: 0.8 }}>className={s.classNameFirstCommit ?? '—'}</div>
                {s.violations.length > 0 && <div style={bad}>violations: {s.violations.join(', ')}</div>}
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>SELF-TIMER Events ({selfTimerEvents.length})</div>
            {selfTimerEvents.slice(-40).map((e) => (
              <div key={e.seq} style={rowStyle}>
                <span style={k}>#{e.seq} +{e.t.toFixed(0)} {e.event}</span>
                <span style={v}>inst{e.instanceId} {e.segmentKind} {JSON.stringify(e.payload).slice(0, 100)}</span>
              </div>
            ))}
          </div>
          <div style={sect}>
            <div style={title}>SELF-TIMER Violations ({selfTimerViolations.length})</div>
            {selfTimerViolations.length === 0 ? <div style={ok}>none</div> : selfTimerViolations.slice(-20).map((v2) => (
              <pre key={v2.seq} style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '4px 0', color: '#ff6b6b' }}>{JSON.stringify(v2, null, 2)}</pre>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}