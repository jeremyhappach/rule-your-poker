import { useEffect, useState } from 'react';
import { Download, Trash2, Power } from 'lucide-react';
import {
  armCribbageActiveHand,
  clearCribbageActiveHand,
  exportCribbageActiveHandText,
  getCribbageActiveHandCounts,
  isCribbageActiveHandArmed,
  subscribeCribbageActiveHand,
} from '@/lib/cribbage/activeHandVisibilityLedger';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';

/**
 * Pill for the Cribbage Active-Hand Visibility ledger.
 * Small collapsed pill with expand/collapse + Export TXT + arm/clear
 * per the debug-pill standard. Admin-gated.
 */
export function CribbageActiveHandTracePill() {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);
  const { isAdmin, loading } = useIsAdmin(userId);
  if (loading || !isAdmin) return null;
  return <Inner />;
}

function Inner() {
  const [armed, setArmed] = useState(isCribbageActiveHandArmed());
  const [counts, setCounts] = useState(getCribbageActiveHandCounts());
  const [expanded, setExpanded] = useState(false);
  useEffect(() => subscribeCribbageActiveHand(() => {
    setArmed(isCribbageActiveHandArmed());
    setCounts(getCribbageActiveHandCounts());
  }), []);
  const contradictionCount = counts.perGroup.contradiction;

  const handleExport = () => {
    const text = exportCribbageActiveHandText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cribbage-active-hand-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 36px)',
        right: 6,
        zIndex: 40,
        pointerEvents: 'auto',
      }}
      className="flex flex-col items-end gap-1 rounded border border-amber-500/70 bg-black/90 px-2 py-1 text-[10px] text-amber-100 shadow-lg font-mono"
      title="Cribbage Active-Hand Visibility ledger"
    >
      <div className="flex items-center gap-1">
        <span className="font-semibold">CRIB-HAND</span>
        <span className={armed ? 'text-emerald-300' : 'text-amber-300'}>{armed ? 'ARMED' : 'IDLE'}</span>
        <span className="tabular-nums">{counts.total}e</span>
        <span className={`tabular-nums ${contradictionCount > 0 ? 'text-red-400 font-bold' : 'text-amber-300'}`}>
          {contradictionCount}c
        </span>
        <button
          type="button"
          onClick={() => armCribbageActiveHand(!armed)}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
          title={armed ? 'Disarm' : 'Arm'}
          aria-label="Arm/disarm"
        >
          <Power className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
          title="Export TXT"
          aria-label="Export TXT"
        >
          <Download className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => clearCribbageActiveHand()}
          className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
          title="Clear"
          aria-label="Clear"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 hover:bg-white/15"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="max-w-[260px] whitespace-pre-wrap break-words text-[9px] leading-[11px] opacity-90">
          {Object.entries(counts.perGroup).map(([g, n]) => `${g}:${n}`).join('  ')}
          {counts.contradictionsByTag.length > 0 && (
            <>
              {'\n'}
              contradictions:
              {'\n'}
              {counts.contradictionsByTag.map(([tag, n]) => `  ${tag}: ${n}`).join('\n')}
            </>
          )}
        </div>
      )}
    </div>
  );
}
