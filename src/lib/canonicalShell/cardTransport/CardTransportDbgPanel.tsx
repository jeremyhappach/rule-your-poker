/**
 * CardTransportDbgPanel — collapsible audit pill for canonical card
 * transport. Gated by the 'cardTransportDbg' debug pill toggle.
 *
 * Per intent: identity, endpoints, resolved anchors, rects, geometry
 * deltas, timing wall-clocks (actualStart/Arrival/ownershipClaim/
 * destroyed), portal layer, mount/visible/settled/dropped, and the
 * lifecycle samples (launch / midflight / arrival / destroy) with full
 * computed-style snapshots so motion choppiness is attributable.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearCardTransportDbg,
  formatCardTransportDbgAsText,
  getCardTransportDbg,
  subscribeCardTransportDbg,
  type CardTransportDbgEntry,
} from './cardTransportDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

function statusColor(r: CardTransportDbgEntry): string {
  if (r.droppedReason) return '#ff7777';
  if (r.settled && r.transportDestroyedTime) return '#7CFC00';
  if (r.settled) return '#FFD580';
  if (r.transportMounted) return '#87CEFA';
  return '#aaaaaa';
}

function summarize(r: CardTransportDbgEntry): string {
  const status = r.droppedReason
    ? `DROPPED:${r.droppedReason}`
    : r.transportDestroyedTime ? 'destroyed'
    : r.settled ? 'settled'
    : r.transportMounted ? 'in-flight'
    : 'pending';
  const fromK = r.from?.kind ?? '?';
  const toK = r.to?.kind ?? '?';
  return `${fromK}→${toK} ${r.face ?? ''} [${status}]`;
}

function fmt(n: number | null | undefined, digits = 1): string {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function cardIndex(r: CardTransportDbgEntry): number {
  const m = r.intentId.match(/#card-(\d+)$/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

function latestHand(records: CardTransportDbgEntry[]): CardTransportDbgEntry[] {
  const hand = [...records].reverse().find((r) => r.handContextId)?.handContextId;
  return hand
    ? records.filter((r) => r.handContextId === hand).sort((a, b) => cardIndex(a) - cardIndex(b))
    : [];
}

export function CardTransportDbgPanel() {
  const inTray = useInDebugTray();
  const records = useSyncExternalStore(
    subscribeCardTransportDbg,
    getCardTransportDbg,
    getCardTransportDbg,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const enabled = useDebugPillEnabled('cardTransportDbg');
  if (!enabled) return null;

  const handleCopy = async () => {
    const txt = formatCardTransportDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy card transport log:', txt); } catch { /* */ }
    }
  };

  const newest = [...records].reverse();
  const recent = newest[0];
  const handProof = latestHand(records);
  const proofSettings = handProof[0]?.dealTimingSettings;
  const proofStore = handProof[0]?.dealTimingStoreSnapshot;
  const toggleId = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div
      data-card-transport-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(96vw, 720px)' : 'auto',
        maxWidth: expanded ? undefined : 360,
        background: 'rgba(0,0,0,0.88)',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderBottom: expanded ? '1px solid #333' : 'none' }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700 }}
        >
          {expanded ? '▼' : '▶'} CARD TRANSPORT DBG ({records.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· <span style={{ color: statusColor(recent) }}>{summarize(recent).slice(0, 38)}</span>
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearCardTransportDbg()} title="Clear"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 480, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no card transport intents yet)</div>
          ) : (
            <>
              {handProof.length ? (
                <div style={{ marginBottom: 8, padding: 6, border: '1px solid #555', background: 'rgba(255,255,255,0.05)' }}>
                  <div style={{ fontWeight: 800, color: '#FFD580' }}>DEAL TIMING PROOF · latest hand</div>
                  <div style={{ opacity: 0.9 }}>handCtx={handProof[0].handContextId ?? '∅'} source={handProof[0].timingSource ?? '?'}</div>
                  {(() => {
                    // Wave 2 Gin deal smoke: assert at least one intent
                    // terminated at each canonical anchor for the latest
                    // hand. Derived purely from dispatched intents — no
                    // game-side plumbing. Visible to the user via the
                    // CT DBG pill (no console reliance).
                    const oppCt = handProof.filter(r => r.to?.kind === 'oppStack').length;
                    const selfCt = handProof.filter(r => r.to?.kind === 'hand').length;
                    const stockCt = handProof.filter(r => r.to?.kind === 'stock').length;
                    const discardCt = handProof.filter(r => r.to?.kind === 'discard').length;
                    const discardVisible = handProof.some(r => r.to?.kind === 'discard' && r.face === 'visible');
                    const fmtPF = (b: boolean) => (b ? '✓ PASS' : '✗ FAIL');

                    // 3-5-7 wave smoke — handContextId of the form
                    // `${gameId}#h${epoch}#r${round}` identifies a wave.
                    const handCtx = handProof[0]?.handContextId ?? '';
                    const waveMatch = handCtx.match(/#h\d+#r(\d+)$/);
                    const isThreeFiveSevenWave = !!waveMatch;
                    const waveRound = waveMatch ? Number(waveMatch[1]) : 0;
                    const expectedThisWave = waveRound === 1 ? 3 : (waveRound === 2 || waveRound === 3 ? 2 : 0);
                    const activePlayers = isThreeFiveSevenWave
                      ? new Set(handProof.map(r => r.to?.kind === 'oppStack' ? `opp:${r.to.position}` : (r.to?.kind === 'hand' ? `self:${r.to.playerId}` : ''))).size - (handProof.some(r => !r.to) ? 1 : 0)
                      : 0;
                    const oppIntents = handProof.filter(r => r.to?.kind === 'oppStack');
                    const selfIntents = handProof.filter(r => r.to?.kind === 'hand');
                    const settledOpp = oppIntents.filter(r => r.settled).length;
                    const settledSelf = selfIntents.filter(r => r.settled).length;
                    const expectedTotal = expectedThisWave * activePlayers;
                    const settledTotal = settledOpp + settledSelf;
                    const dispatchedTotal = handProof.length;
                    // starts-left-of-dealer — the first dispatched intent's
                    // recipient seat must be the seat immediately after the
                    // dealer in position order. We infer dealer from the
                    // `from` of any intent (always { kind: seat, position }).
                    let leftOfDealerPass: boolean | null = null;
                    if (isThreeFiveSevenWave && handProof.length > 0) {
                      const fromIntent = handProof[0];
                      const dealerPos = fromIntent.from?.kind === 'seat' ? fromIntent.from.position : null;
                      const firstToPos = fromIntent.to?.kind === 'oppStack'
                        ? fromIntent.to.position
                        : (fromIntent.to?.kind === 'hand' ? null : null);
                      // Determine ring of active seat positions from intents.
                      const ring = Array.from(new Set(handProof
                        .map(r => r.to?.kind === 'oppStack' ? r.to.position : null)
                        .filter((p): p is number => typeof p === 'number')))
                        .sort((a, b) => a - b);
                      if (dealerPos != null && ring.length) {
                        // Left-of-dealer per seatRing convention =
                        // largest occupied position strictly less than
                        // dealer, else wrap to largest occupied.
                        let expectFirst: number | null = null;
                        for (let i = ring.length - 1; i >= 0; i--) {
                          if (ring[i] < dealerPos) { expectFirst = ring[i]; break; }
                        }
                        if (expectFirst === null) expectFirst = ring[ring.length - 1];
                        leftOfDealerPass = firstToPos != null
                          ? (firstToPos === expectFirst)
                          : null;
                      }
                    }

                    return (
                      <div style={{ marginTop: 3, padding: '3px 4px', background: 'rgba(0,0,0,0.4)', borderLeft: '2px solid #FFD580' }}>
                        <div style={{ opacity: 0.95, color: '#FFD580', fontWeight: 700 }}>DEAL SMOKE</div>
                        <div style={{ color: oppCt > 0 ? '#7CFC00' : '#ff7777' }}>opp ({oppCt}) {fmtPF(oppCt > 0)}</div>
                        <div style={{ color: selfCt > 0 ? '#7CFC00' : '#ff7777' }}>self ({selfCt}) {fmtPF(selfCt > 0)}</div>
                        <div style={{ color: stockCt === 1 ? '#7CFC00' : '#ff7777' }}>stock ({stockCt}) {fmtPF(stockCt === 1)}</div>
                        <div style={{ color: discardCt === 1 && discardVisible ? '#7CFC00' : (discardCt === 0 ? '#aaaaaa' : '#ff7777') }}>
                          discard ({discardCt}{discardCt ? `, face=${discardVisible ? 'visible' : 'hidden'}` : ''}) {fmtPF(discardCt === 1 && discardVisible)}
                        </div>
                        {isThreeFiveSevenWave ? (
                          <div style={{ marginTop: 4, paddingTop: 3, borderTop: '1px dashed #555' }}>
                            <div style={{ color: '#87CEFA', fontWeight: 700 }}>357 wave r{waveRound}</div>
                            <div style={{ color: dispatchedTotal === expectedTotal ? '#7CFC00' : '#ff7777' }}>
                              357: r{waveRound}=dispatched {dispatchedTotal}/{expectedTotal} {fmtPF(dispatchedTotal === expectedTotal)}
                            </div>
                            <div style={{ color: settledTotal === expectedTotal ? '#7CFC00' : '#FFD580' }}>
                              357: r{waveRound}=settled {settledTotal}/{expectedTotal} {fmtPF(settledTotal === expectedTotal)}
                            </div>
                            <div style={{ color: leftOfDealerPass === true ? '#7CFC00' : leftOfDealerPass === false ? '#ff7777' : '#aaaaaa' }}>
                              357: starts-left-of-dealer={leftOfDealerPass === null ? 'N/A' : fmtPF(leftOfDealerPass)}
                            </div>
                            <div style={{ color: settledSelf > 0 || selfIntents.length === 0 ? '#7CFC00' : '#FFD580' }}>
                              357: self={settledSelf}/{selfIntents.length} {fmtPF(settledSelf === selfIntents.length)}
                            </div>
                            <div style={{ color: settledOpp === oppIntents.length ? '#7CFC00' : '#FFD580' }}>
                              357: opp={settledOpp}/{oppIntents.length} {fmtPF(settledOpp === oppIntents.length)}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                  <div style={{ opacity: 0.95, color: '#87CEFA' }}>GEOM STORE launchSpacingMs={proofStore?.launchSpacingMs ?? '—'} durationMs={proofStore?.durationMs ?? '—'} ownershipClaimDelayMs={proofStore?.ownershipClaimDelayMs ?? '—'} updatedAt={proofStore?.updatedAt ?? '—'} storeVersion={proofStore?.storeVersion ?? '—'}</div>
                  <div style={{ opacity: 0.9 }}>GEOM DEAL SETTINGS launchSpacingMs={proofSettings?.launchSpacingMs ?? '—'} durationMs={proofSettings?.durationMs ?? '—'} ownershipClaimDelayMs={proofSettings?.ownershipClaimDelayMs ?? '—'}</div>
                  <div style={{ opacity: 0.9 }}>INTENT source={handProof[0].intentTimingSource ?? handProof[0].timingSource ?? '?'} formula={handProof[0].launchDelayFormula ?? '?'} effectiveSpacingMs={proofSettings?.effectiveLaunchSpacingMs ?? '—'} effectiveDurationMs={proofSettings?.effectiveDurationMs ?? '—'}</div>
                  <div style={{ marginTop: 5, display: 'grid', gridTemplateColumns: '38px 60px 60px 64px 54px 54px 54px', gap: 4, alignItems: 'baseline' }}>
                    <b>#</b><b>delay</b><b>store</b><b>actualΔ</b><b>expectΔ</b><b>error</b><b>skew</b>
                    {handProof.map((r) => (
                      <div key={`proof-${r.intentId}`} style={{ display: 'contents', color: Math.abs(r.startDeltaErrorMs ?? 0) > 40 ? '#ff7777' : '#7CFC00' }}>
                        <span>{cardIndex(r)}</span>
                        <span>{fmt(r.launchDelayMs, 0)}</span>
                        <span>{r.dealTimingStoreSnapshot?.launchSpacingMs ?? '—'}</span>
                        <span>{fmt(r.actualStartDeltaFromPreviousMs)}</span>
                        <span>{fmt(r.expectedStartDeltaFromPreviousMs)}</span>
                        <span>{fmt(r.startDeltaErrorMs)}</span>
                        <span>{fmt(r.startSkewMs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {newest.map((r) => {
              const open = openIds.has(r.intentId);
              return (
                <div key={r.intentId} style={{ marginBottom: 6, borderTop: '1px dashed #333', paddingTop: 3 }}>
                  <button type="button" onClick={() => toggleId(r.intentId)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', color: '#fff', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                    <span style={{ color: statusColor(r), fontWeight: 700 }}>{open ? '▼ ' : '▶ '}● </span>
                    <span style={{ opacity: 0.9 }}>{r.intentId}</span>
                    <span style={{ opacity: 0.7 }}> · {summarize(r)}</span>
                  </button>
                  {open ? (
                    <div style={{ paddingLeft: 10, marginTop: 2 }}>
                      <div style={{ opacity: 0.85 }}>cardId={r.cardId} face={r.face} handCtx={r.handContextId ?? '∅'}</div>
                      <div style={{ opacity: 0.85 }}>from={JSON.stringify(r.from)} → to={JSON.stringify(r.to)}</div>
                      <div style={{ opacity: 0.85 }}>resolvedFrom={r.resolvedFromAnchor ?? '?'} resolvedTo={r.resolvedToAnchor ?? '?'}</div>
                      <div style={{ opacity: 0.85 }}>fromRect={JSON.stringify(r.fromAnchorRect)}</div>
                      <div style={{ opacity: 0.85 }}>toRect={JSON.stringify(r.toAnchorRect)}</div>
                      <div style={{ opacity: 0.95, color: '#87CEFA' }}>GEOM STORE launchSpacingMs={r.dealTimingStoreSnapshot?.launchSpacingMs ?? '—'} durationMs={r.dealTimingStoreSnapshot?.durationMs ?? '—'} ownershipClaimDelayMs={r.dealTimingStoreSnapshot?.ownershipClaimDelayMs ?? '—'} updatedAt={r.dealTimingStoreSnapshot?.updatedAt ?? '—'} dbUpdatedAt={r.dealTimingStoreSnapshot?.dbUpdatedAt ?? '—'} storeVersion={r.dealTimingStoreSnapshot?.storeVersion ?? '—'} source={r.dealTimingStoreSnapshot?.source ?? '?'} hydrated={String(r.dealTimingStoreSnapshot?.hydrated ?? false)}</div>
                      <div style={{ opacity: 0.95, color: '#FFD580' }}>GEOM DEAL SETTINGS source={r.timingSource ?? '?'} launchSpacingMs={r.dealTimingSettings?.launchSpacingMs ?? '—'} durationMs={r.dealTimingSettings?.durationMs ?? '—'} ownershipClaimDelayMs={r.dealTimingSettings?.ownershipClaimDelayMs ?? '—'}</div>
                      <div style={{ opacity: 0.95, color: '#FFD580' }}>INTENT source={r.intentTimingSource ?? r.timingSource ?? '?'} formula={r.launchDelayFormula ?? '?'} launchSpacing={r.dealTimingSettings?.effectiveLaunchSpacingMs ?? '—'} duration={r.durationMs ?? '—'} ownershipDelay={r.ownershipClaimDelayMs ?? '—'} expectedStart={fmt(r.expectedStartTime)} expectedArrival={fmt(r.expectedArrivalTime)}</div>
                      <div style={{ opacity: 0.85 }}>dx={r.dx} dy={r.dy} dur={r.durationMs}ms delay={r.launchDelayMs}ms</div>
                      <div style={{ opacity: 0.85 }}>actualStart={r.actualStartTime?.toFixed?.(1)} actualArrival={r.actualArrivalTime?.toFixed?.(1)}</div>
                      <div style={{ opacity: 0.95, color: '#7CFC00' }}>LAUNCH PROOF actualΔ={fmt(r.actualStartDeltaFromPreviousMs)} expectedΔ={fmt(r.expectedStartDeltaFromPreviousMs)} error={fmt(r.startDeltaErrorMs)} startSkew={fmt(r.startSkewMs)} source={r.launchProofSource ?? '?'}</div>
                      <div style={{ opacity: 0.95, color: '#7CFC00' }}>ARRIVAL PROOF actualFlight={fmt(r.actualFlightDurationMs)} arrivalSkew={fmt(r.arrivalSkewMs)} source={r.arrivalProofSource ?? '?'}</div>
                      <div style={{ opacity: 0.85 }}>ownershipClaim={r.ownershipClaimTime?.toFixed?.(1)} destroyed={r.transportDestroyedTime?.toFixed?.(1)}</div>
                      <div style={{ opacity: 0.85 }}>portal={r.portalLayer} mounted={String(r.transportMounted)} visible={String(r.transportVisible)}</div>
                      <div style={{ opacity: 0.85 }}>settled={String(r.settled)} dropped={r.droppedReason ?? '∅'}</div>
                      {(r.samples ?? []).map((s, i) => (
                        <div key={i} style={{ opacity: 0.85, marginTop: 2, borderLeft: '2px solid #444', paddingLeft: 4 }}>
                          <div><b>· {s.phase}</b> @ {s.t.toFixed?.(1)}</div>
                          <div>anim={s.animationName} state={s.animationPlayState} iter={s.animationIterationCount}</div>
                          <div>dur={s.animationDuration} delay={s.animationDelay} ease={s.animationTimingFunction}</div>
                          <div>trans={s.transitionProperty}/{s.transitionDuration}</div>
                          <div>xform={s.transform}</div>
                          <div>rect={JSON.stringify(s.rect)}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
