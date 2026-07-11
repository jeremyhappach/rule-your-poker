/**
 * CribbageWartimeTruthPill
 *
 * Single all-inclusive Cribbage wartime instrumentation pill. Replaces:
 *   - CribbageCountingTruthPill
 *   - CribbagePegTransportPill
 *   - CribbageLayoutStatusPill
 *
 * Collapsed by default. Copy TXT + Export TXT + Clear ledger. Shows
 * live contradiction count. Optional filter (All / Deal / Pegging Row /
 * Counting / Go-31). Export always includes every entry regardless of
 * the current filter.
 *
 * No console logs. No backend writes. No storage. Must not block gameplay.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  attachCribbageWartimeBridges,
  clearCribbageWartime,
  getCribbageWartimeContradictionCount,
  getCribbageWartimeEntries,
  serializeCribbageWartime,
  subscribeCribbageWartime,
  type WartimeGroup,
} from '@/lib/cribbage/cribbageWartimeLedger';

type Filter = 'all' | WartimeGroup;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deal', label: 'Deal' },
  { id: 'pegging', label: 'Pegging Row' },
  { id: 'counting', label: 'Counting' },
  { id: 'boundary', label: 'Go/31' },
  { id: 'identity', label: 'Identity' },
];

export const CribbageWartimeTruthPill = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [, force] = useState(0);

  useEffect(() => {
    attachCribbageWartimeBridges();
    return subscribeCribbageWartime(() => force((n) => n + 1));
  }, []);

  const entries = getCribbageWartimeEntries();
  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.group === filter)),
    [entries, filter],
  );
  const contradictions = getCribbageWartimeContradictionCount();

  const bad = contradictions > 0;
  const label = `Wartime ${entries.length}e / ${contradictions}⚠`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serializeCribbageWartime('all'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  const handleExport = () => {
    try {
      const text = serializeCribbageWartime('all');
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cribbage-wartime-truth-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 6px)',
        right: 6,
        zIndex: 2147483000,
        pointerEvents: 'auto',
        fontSize: 10,
        lineHeight: 1.2,
      }}
    >
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.72)',
            color: bad ? '#f87171' : '#a3e635',
            border: '1px solid rgba(255,255,255,0.25)',
            fontWeight: 600,
          }}
        >
          {label}
        </button>
      ) : (
        <div
          style={{
            width: 360,
            maxHeight: '78vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 8,
            background: 'rgba(0,0,0,0.92)',
            color: '#e5e7eb',
            border: '1px solid rgba(255,255,255,0.28)',
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
              background: 'rgba(0,0,0,0.96)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1, fontWeight: 700, color: bad ? '#f87171' : '#a3e635' }}>
              Cribbage Wartime Truth
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
              onClick={() => { clearCribbageWartime(); }}
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
          <div style={{ display: 'flex', gap: 4, padding: '4px 6px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontSize: 9,
                  background: filter === f.id ? '#2563eb' : '#1f2937',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {f.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', color: '#9ca3af' }}>
              {shown.length}/{entries.length} shown · {contradictions}⚠
            </span>
          </div>
          <div style={{ padding: 6, overflow: 'auto' }}>
            {shown.length === 0 ? (
              <div style={{ color: '#9ca3af' }}>no entries</div>
            ) : (
              shown.slice(-200).map((e) => (
                <div key={e.seq} style={{ marginBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 2 }}>
                  <div style={{ color: e.contradictions.length ? '#fbbf24' : '#a7f3d0' }}>
                    #{e.seq} [{e.group}] {e.kind}
                    {e.eventReason ? ` — ${e.eventReason}` : ''}
                  </div>
                  {e.contradictions.length > 0 && (
                    <div style={{ color: '#f87171' }}>⚠ {e.contradictions.join(', ')}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CribbageWartimeTruthPill;
