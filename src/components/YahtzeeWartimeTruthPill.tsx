import { useEffect, useState } from 'react';
import { Download, Trash2, Power } from 'lucide-react';
import {
  armYahtzeeWartime,
  clearYahtzeeWartime,
  exportYahtzeeWartimeText,
  getYahtzeeWartimeCounts,
  isYahtzeeWartimeArmed,
  subscribeYahtzeeWartime,
} from '@/lib/yahtzee/yahtzeeWartimeLedger';

/**
 * Single, temporary on-screen control for the Yahtzee Wartime Truth ledger.
 * Arm/disarm, clear, export TXT, live entry + contradiction counts.
 */
export function YahtzeeWartimeTruthPill() {
  const [armed, setArmed] = useState(isYahtzeeWartimeArmed());
  const [counts, setCounts] = useState(getYahtzeeWartimeCounts());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => subscribeYahtzeeWartime(() => {
    setArmed(isYahtzeeWartimeArmed());
    setCounts(getYahtzeeWartimeCounts());
  }), []);

  const contradictionCount = counts.perGroup.contradiction;

  const handleExport = () => {
    const text = exportYahtzeeWartimeText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yahtzee-wartime-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        right: 6,
        zIndex: 2147483646,
        pointerEvents: 'auto',
      }}
      className="flex flex-col items-end gap-1 rounded border border-red-500/70 bg-black/90 px-2 py-1 text-[10px] text-red-100 shadow-lg font-mono"
      title="Yahtzee Wartime Truth ledger"
    >
      <div className="flex items-center gap-1">
        <span className="font-semibold">YZ-WAR</span>
        <span className={armed ? 'text-emerald-300' : 'text-red-300'}>{armed ? 'ARMED' : 'IDLE'}</span>
        <span className="tabular-nums">{counts.total}e</span>
        <span className={`tabular-nums ${contradictionCount > 0 ? 'text-red-400 font-bold' : 'text-red-300'}`}>
          {contradictionCount}c
        </span>
        <button
          type="button"
          onClick={() => armYahtzeeWartime(!armed)}
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-white/15"
          title={armed ? 'Disarm' : 'Arm'}
          aria-label="Arm/disarm ledger"
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
          onClick={() => clearYahtzeeWartime()}
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
