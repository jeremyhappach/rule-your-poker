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
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sampleTick, tick] = useState(0);
  const enabled = toggleEnabled || meta.gameType === 'holm-game';

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => tick((n) => n + 1), expanded ? 200 : 500);
    return () => window.clearInterval(id);
  }, [enabled, expanded]);

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

  const copy = async () => {
    const text = formatHolmDealDbgSnapshot(snapshot);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* noop */ }
  };

  const compact = `phase=${snapshot.phase} settled=${snapshot.settledIds.length}/${snapshot.expectedCount} dom=${snapshot.visibility.filter((r) => r.domMounted).length} viol=${snapshot.violations.length}`;

  return (
    <div
      data-holm-deal-dbg-panel=""
      style={{
        ...(inTray ? { position: 'relative' as const } : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 680px)' : 'auto',
        maxWidth: expanded ? undefined : 380,
        background: 'rgba(0,0,0,0.92)',
        color: '#fff',
        border: `1px solid ${snapshot.violations.length ? '#ff6b6b' : '#555'}`,
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.35,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderBottom: expanded ? '1px solid #333' : 'none' }}>
        <button type="button" onClick={() => setExpanded((e) => !e)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 800 }}>
          {expanded ? '▼' : '▶'} HOLM DEAL DBG <span style={snapshot.violations.length ? bad : v}>· {compact}</span>
        </button>
        <button type="button" onClick={copy} style={{ background: '#1e3a5f', color: copied ? '#7CFC00' : '#fff', border: '1px solid #4a7bb8', borderRadius: 3, padding: '2px 8px', fontFamily: 'inherit', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{copied ? '✓' : 'Copy'}</button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 560, overflow: 'auto', padding: '2px 0 6px' }}>
          <div style={sect}><div style={title}>Runtime</div>{Object.entries(snapshot.runtime).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Hands</div>{Object.entries(snapshot.hands).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Community</div>{Object.entries(snapshot.community).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
          <div style={sect}><div style={title}>Chucky</div>{Object.entries(snapshot.chucky).map(([key, value]) => <div key={key} style={rowStyle}><span style={k}>{key}</span><span style={v}>{fmt(value)}</span></div>)}</div>
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
        </div>
      ) : null}
    </div>
  );
}