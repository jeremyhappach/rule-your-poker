/**
 * CribbageCountingTruthPill — collapsed/copyable status pill proving
 * announcement vs highlight vs scoring-card-DOM state across a full
 * Cribbage hand+crib counting round.
 *
 * INSTRUMENTATION ONLY. No behavior, backend, storage, or logs.
 *
 * - Mounted only inside CribbageCountingPhase → only visible in Cribbage.
 * - Collapsed by default. Copy + Export TXT buttons.
 * - Samples scoring-card DOM every rAF and appends a `dom_sample` entry
 *   whenever the DOM state changes vs the last sample.
 * - Consumes producer entries from countingTruthLedger.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import {
  countingTruthLedger,
  type CountingTruthEntry,
  type CountingTruthDomCard,
  makeEmptyContradictions,
} from '@/lib/cribbage/countingTruthLedger';

function fmtTs(ts: number): string {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':') + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function serializeEntry(e: CountingTruthEntry): string {
  const lines: string[] = [];
  lines.push(`── ${fmtTs(e.ts)}  [${e.source}]`);
  lines.push(`identity: round=${e.roundId ?? '—'} hand=${e.handNumber ?? '—'} handCtx=${e.handContextId ?? '—'}`);
  lines.push(`scoring: owner=${e.scoringOwnerPlayerId ?? '—'}/${e.scoringOwnerRole ?? '—'} phase=${e.scoringPhase ?? '—'}/${e.scoringSubphase ?? '—'} handKey=${e.scoringHandKey ?? '—'}`);
  lines.push(`step: ${e.scoringStepIndex ?? '—'} totalCombosForOwner=${e.totalCombosForOwner ?? '—'} isFinal=${e.isFinalComboForOwner ?? '—'} nextOwner=${e.nextOwnerPlayerId ?? '—'}`);
  lines.push(`announcement: text=${JSON.stringify(e.announcementText)} cat=${e.announcementCategory ?? '—'} owner=${e.announcementOwnerPlayerId ?? '—'} key=${e.announcementComboKey ?? '—'} vis=${e.announcementVisible} mounted=${e.announcementMounted}`);
  lines.push(`announcement.times: started=${e.announcementStartedAt ?? '—'} hidden=${e.announcementHiddenAt ?? '—'} clearReason=${e.announcementClearReason ?? '—'} staleOwnerMismatch=${e.staleAnnouncementOwnerMismatch} staleComboMismatch=${e.staleAnnouncementComboMismatch}`);
  lines.push(`combo: label=${e.currentComboLabel ?? '—'} pts=${e.currentComboPoints ?? '—'} cards=[${e.currentComboCardIds.join(',')}] hiActive=${e.comboHighlightActive} raiseActive=${e.comboRaiseActive}`);
  lines.push(`combo.times: hiStart=${e.comboHighlightStartedAt ?? '—'} hiEnd=${e.comboHighlightEndedAt ?? '—'} reason=${e.comboTransitionReason ?? '—'} prev=${e.previousComboIndex ?? '—'} next=${e.nextComboIndex ?? '—'}`);
  lines.push(`totalSummary: visible=${e.totalSummaryVisible} owner=${e.totalSummaryOwnerPlayerId ?? '—'} text=${JSON.stringify(e.totalSummaryText)} pts=${e.totalSummaryPoints ?? '—'} mountedAt=${e.totalSummaryMountedAt ?? '—'}`);
  lines.push(`  finalComboVisWhenSummaryMounts=${e.finalComboAnnouncementVisibleWhenSummaryMounts} finalComboVisWhenNextOwnerStarts=${e.finalComboAnnouncementVisibleWhenNextOwnerStarts}`);
  lines.push(`contradictions:`);
  for (const [k, v] of Object.entries(e.contradictions)) {
    if (v) lines.push(`  ${k}: ${v}`);
  }
  lines.push(`domCards (${e.domCards.length}):`);
  for (const c of e.domCards) {
    lines.push(
      `  ${c.cardId} owner=${c.owner ?? '—'}/${c.role} matchOwner=${c.scoringOwnerMatch} comboMember=${c.comboMember} hi=${c.highlighted} dim=${c.dimmed} tr=${c.transform} op=${c.opacity} z=${c.zIndex} rect=${c.rect ? `${Math.round(c.rect.x)},${Math.round(c.rect.y)} ${Math.round(c.rect.w)}x${Math.round(c.rect.h)}` : '—'}`,
    );
  }
  return lines.join('\n');
}

function serializeAll(list: CountingTruthEntry[]): string {
  return list.map(serializeEntry).join('\n\n');
}

function sampleDomCards(): CountingTruthDomCard[] {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(
    document.querySelectorAll('[data-cribbage-scoring-card="true"]'),
  ) as HTMLElement[];
  const out: CountingTruthDomCard[] = [];
  for (const el of nodes) {
    const ds = el.dataset;
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    out.push({
      cardId: ds.cardId ?? '?',
      rank: ds.cardRank ?? '?',
      suit: ds.cardSuit ?? '?',
      owner: ds.cardOwner ?? null,
      role: (ds.cardRole as CountingTruthDomCard['role']) ?? 'unknown',
      scoringOwnerMatch: ds.scoringOwnerMatch === 'true',
      comboMember: ds.comboMember === 'true',
      highlighted: ds.cardHighlighted === 'true',
      dimmed: ds.cardDimmed === 'true',
      transform: cs.transform,
      opacity: cs.opacity,
      zIndex: cs.zIndex,
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      mounted: true,
      dataAttrs: { ...ds } as Record<string, string>,
    });
  }
  return out;
}

function domSignature(cards: CountingTruthDomCard[]): string {
  return cards
    .map((c) => `${c.cardId}:${c.highlighted ? '1' : '0'}:${c.comboMember ? '1' : '0'}:${c.transform}:${c.opacity}`)
    .join('|');
}

export const CribbageCountingTruthPill = () => {
  const entries = useSyncExternalStore(
    countingTruthLedger.subscribe,
    countingTruthLedger.get,
    countingTruthLedger.get,
  );
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastSigRef = useRef<string>('');

  // rAF DOM sampler — appends `dom_sample` entries only on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let raf = 0;
    const tick = () => {
      if (cancelled) return;
      const cards = sampleDomCards();
      const sig = domSignature(cards);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        // Copy identity from latest producer entry when present so DOM
        // samples stay correlatable.
        const latest = countingTruthLedger.get().slice(-1)[0];
        const raisedIds = cards.filter((c) => c.highlighted).map((c) => c.cardId).sort();
        const comboIds = latest?.currentComboCardIds ? [...latest.currentComboCardIds].sort() : [];
        const contradictions = makeEmptyContradictions();
        if (latest?.comboRaiseActive) {
          if (raisedIds.length === 0) contradictions.noRaisedCardsForActiveCombo = true;
          if (
            raisedIds.length !== comboIds.length ||
            raisedIds.some((id, i) => id !== comboIds[i])
          ) {
            contradictions.domRaisedCardsDoNotMatchComboCardIds = true;
          }
        }
        const ownerMismatch = cards.some(
          (c) => c.owner && latest?.scoringOwnerPlayerId && c.owner !== latest.scoringOwnerPlayerId && c.role !== 'cut',
        );
        contradictions.domCardOwnerMismatch = ownerMismatch;
        const idCounts = new Map<string, number>();
        for (const c of cards) idCounts.set(c.cardId, (idCounts.get(c.cardId) ?? 0) + 1);
        contradictions.duplicateScoringCardDomNodes = Array.from(idCounts.values()).some((n) => n > 1);

        countingTruthLedger.record({
          source: 'dom_sample',
          roundId: latest?.roundId ?? null,
          handNumber: latest?.handNumber ?? null,
          handContextId: latest?.handContextId ?? null,
          scoringOwnerPlayerId: latest?.scoringOwnerPlayerId ?? null,
          scoringOwnerRole: latest?.scoringOwnerRole ?? null,
          scoringPhase: latest?.scoringPhase ?? null,
          scoringSubphase: latest?.scoringSubphase ?? null,
          scoringHandKey: latest?.scoringHandKey ?? null,
          scoringStepIndex: latest?.scoringStepIndex ?? null,
          totalCombosForOwner: latest?.totalCombosForOwner ?? null,
          isFinalComboForOwner: latest?.isFinalComboForOwner ?? null,
          nextOwnerPlayerId: latest?.nextOwnerPlayerId ?? null,
          announcementText: latest?.announcementText ?? null,
          announcementCategory: latest?.announcementCategory ?? null,
          announcementOwnerPlayerId: latest?.announcementOwnerPlayerId ?? null,
          announcementComboKey: latest?.announcementComboKey ?? null,
          announcementVisible: latest?.announcementVisible ?? false,
          announcementMounted: latest?.announcementMounted ?? false,
          announcementStartedAt: latest?.announcementStartedAt ?? null,
          announcementHiddenAt: latest?.announcementHiddenAt ?? null,
          announcementClearReason: latest?.announcementClearReason ?? null,
          staleAnnouncementOwnerMismatch: latest?.staleAnnouncementOwnerMismatch ?? false,
          staleAnnouncementComboMismatch: latest?.staleAnnouncementComboMismatch ?? false,
          currentComboLabel: latest?.currentComboLabel ?? null,
          currentComboPoints: latest?.currentComboPoints ?? null,
          currentComboCardIds: latest?.currentComboCardIds ?? [],
          comboHighlightActive: raisedIds.length > 0,
          comboRaiseActive: latest?.comboRaiseActive ?? false,
          comboHighlightStartedAt: latest?.comboHighlightStartedAt ?? null,
          comboHighlightEndedAt: latest?.comboHighlightEndedAt ?? null,
          comboTransitionReason: latest?.comboTransitionReason ?? null,
          previousComboIndex: latest?.previousComboIndex ?? null,
          nextComboIndex: latest?.nextComboIndex ?? null,
          domCards: cards,
          totalSummaryVisible: latest?.totalSummaryVisible ?? false,
          totalSummaryOwnerPlayerId: latest?.totalSummaryOwnerPlayerId ?? null,
          totalSummaryText: latest?.totalSummaryText ?? null,
          totalSummaryPoints: latest?.totalSummaryPoints ?? null,
          totalSummaryMountedAt: latest?.totalSummaryMountedAt ?? null,
          finalComboAnnouncementVisibleWhenSummaryMounts:
            latest?.finalComboAnnouncementVisibleWhenSummaryMounts ?? false,
          finalComboAnnouncementVisibleWhenNextOwnerStarts:
            latest?.finalComboAnnouncementVisibleWhenNextOwnerStarts ?? false,
          contradictions,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const text = useMemo(() => serializeAll(entries), [entries]);

  const contradictionCount = useMemo(() => {
    let n = 0;
    for (const e of entries) {
      for (const v of Object.values(e.contradictions)) if (v) n++;
    }
    return n;
  }, [entries]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  const handleExport = () => {
    try {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cribbage-counting-truth-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div

      style={{
        position: 'fixed',
        bottom: 6,
        left: 6,
        zIndex: 2147483000,
        pointerEvents: 'auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.25,
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.7)',
            color: contradictionCount > 0 ? '#fbbf24' : '#a3e635',
            border: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          Counting truth · {entries.length} · ⚠{contradictionCount}
        </button>
      ) : (
        <div
          style={{
            width: 380,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.92)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 6,
              borderBottom: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.95)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              position: 'sticky',
              top: 0,
            }}
          >
            <span style={{ flex: 1, fontWeight: 600, color: contradictionCount > 0 ? '#fbbf24' : '#a3e635' }}>
              Counting truth · {entries.length} · ⚠{contradictionCount}
            </span>
            <button
              onClick={handleCopy}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#1f2937', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              {copied ? 'copied' : 'Copy'}
            </button>
            <button
              onClick={handleExport}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#065f46', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Export TXT
            </button>
            <button
              onClick={() => countingTruthLedger.clear()}
              style={{ padding: '2px 6px', borderRadius: 4, background: '#7c2d12', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="collapse"
              style={{ padding: '2px 6px', borderRadius: 4, background: '#374151', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}
            >
              −
            </button>
          </div>
          <div style={{ padding: 6, overflow: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text || '(no entries yet)'}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
