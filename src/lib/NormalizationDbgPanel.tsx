/**
 * NormalizationDbgPanel — collapsible on-screen panel + copy button
 * showing every normalizeTwoPlayerSeatsIfNeeded() invocation and every
 * call-site decision. Mirrors ShellLifecyclePanel UX.
 *
 * Gated by the 'normalizationDbg' debug pill toggle (Admin → Debug Tools).
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  clearNormalizationDbg,
  formatNormalizationDbgAsText,
  getNormalizationDbgEntries,
  subscribeNormalizationDbg,
  type NormalizationDbgEntry,
} from './normalizationDbg';
import { useInDebugTray } from '@/lib/debugTray/DebugTray';
import { useDebugPillEnabled } from '@/lib/debugTray/debugPillsStore';

const KIND_COLOR: Record<string, string> = {
  'call-site': '#87CEFA',
  normalize: '#FFD580',
  'start-game': '#DA70D6',
};

const RESULT_COLOR: Record<string, string> = {
  normalized: '#7CFC00',
  skipped_already_opposite: '#9FE2BF',
  skipped_not_two_active_seated: '#bbbbbb',
  skipped_not_two_humans: '#bbbbbb',
  skipped_no_game: '#bbbbbb',
  skipped_host_or_other_missing_position: '#FFA07A',
  failed_pass1_other: '#FF6B6B',
  failed_pass1_occupant: '#FF6B6B',
  failed_pass2_other: '#FF6B6B',
  failed_pass2_occupant: '#FF6B6B',
  failed_unknown: '#FF6B6B',
  preflight: '#DA70D6',
  status_flip_complete: '#DA70D6',
};

function summarize(e: NormalizationDbgEntry): string {
  if (e.kind === 'call-site') {
    return `${e.caller} did=${e.didInvokeNormalizer} ${e.statusTransition ?? ''}`;
  }
  if (e.kind === 'start-game') {
    return `START ${e.checkpoint ?? '?'} seated=${e.activeSeatedPlayers ?? '?'} circ=${e.circularDistance ?? '?'}`;
  }
  return `${e.caller} ${e.result} host=${e.hostSeat ?? '?'} other=${e.otherSeat ?? '?'}→${e.targetSeat ?? '?'} circ=${e.circularDistance ?? '?'} rows=${e.dbRowsUpdated ?? '-'}`;
}

export function NormalizationDbgPanel() {
  const inTray = useInDebugTray();
  const entries = useSyncExternalStore(
    subscribeNormalizationDbg,
    getNormalizationDbgEntries,
    getNormalizationDbgEntries,
  );
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(t);
  }, [copied]);

  const pillEnabled = useDebugPillEnabled('normalizationDbg');
  if (!pillEnabled) return null;

  const handleCopy = async () => {
    const txt = formatNormalizationDbgAsText();
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
    } catch {
      try { window.prompt('Copy normalization log:', txt); } catch { /* */ }
    }
  };

  const newest = [...entries].reverse();
  const recent = newest[0];

  return (
    <div
      data-normalization-dbg-panel=""
      style={{
        ...(inTray
          ? { position: 'relative' as const }
          : { position: 'fixed' as const, left: 4, bottom: 4, zIndex: 2147483645 }),
        width: expanded ? 'min(94vw, 520px)' : 'auto',
        maxWidth: expanded ? undefined : 300,
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        border: '1px solid #444',
        borderRadius: 4,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 10,
        lineHeight: 1.3,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 6px',
          borderBottom: expanded ? '1px solid #333' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
            cursor: 'pointer', font: 'inherit', color: '#fff', padding: 0, fontWeight: 700,
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▶'} NORM DBG ({entries.length})
          {!expanded && recent ? (
            <span style={{ fontWeight: 400, opacity: 0.8 }}>
              {' '}· {summarize(recent).slice(0, 28)}
              {summarize(recent).length > 28 ? '…' : ''}
            </span>
          ) : null}
        </button>
        <button type="button" onClick={handleCopy} title="Copy full log"
          style={{ background: '#222', color: copied ? '#7CFC00' : '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          {copied ? '✓' : '⧉'}
        </button>
        <button type="button" onClick={() => clearNormalizationDbg()} title="Clear log"
          style={{ background: '#222', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 6px', cursor: 'pointer', font: 'inherit' }}>
          ✕
        </button>
      </div>
      {expanded ? (
        <div style={{ maxHeight: 400, overflow: 'auto', padding: '4px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {newest.length === 0 ? (
            <div style={{ opacity: 0.6 }}>(no normalization events yet)</div>
          ) : (
            newest.map((e) => {
              const time = new Date(e.ts).toISOString().substring(11, 23);
              if (e.kind === 'call-site') {
                return (
                  <div key={e.seq} style={{ marginBottom: 3 }}>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: KIND_COLOR['call-site'], fontWeight: 700 }}>CALL </span>
                    <span style={{ color: '#fff' }}>{e.caller}</span>
                    <span style={{ opacity: 0.8 }}> did={String(e.didInvokeNormalizer)}</span>
                    <span style={{ opacity: 0.7 }}> {e.statusTransition}</span>
                  </div>
                );
              }
              if (e.kind === 'start-game') {
                return (
                  <div key={e.seq} style={{ marginBottom: 4, borderTop: '1px dashed #333', paddingTop: 2 }}>
                    <div>
                      <span style={{ opacity: 0.7 }}>{time} </span>
                      <span style={{ color: KIND_COLOR['start-game'], fontWeight: 700 }}>START GAME NORMALIZATION DBG </span>
                      <span>{e.checkpoint}</span>
                      <span style={{ opacity: 0.75 }}> caller={e.caller}</span>
                      <span style={{ color: RESULT_COLOR[e.result ?? ''] ?? '#fff', fontWeight: 700 }}>
                        {' '}{e.result}
                      </span>
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      seated={e.activeSeatedPlayers ?? '?'} humans={e.activeHumanPlayers ?? '?'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      hostSeat={e.hostSeat ?? '?'} otherSeat={e.otherSeat ?? '?'} rawD={e.rawDistance ?? '?'} circD={e.circularDistance ?? '?'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      shouldNorm={String(e.shouldNormalize)} target={e.targetSeat ?? '?'} dbWrite={String(e.dbWriteAttempted)} rows={e.dbRowsUpdated ?? '-'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      players={(e.players ?? []).map((p) => `${p.playerId.slice(0, 8)} bot=${p.isBot} st=${p.status ?? '?'} out=${p.sittingOut} pos=${p.position ?? '?'}`).join(' | ')}
                    </div>
                    {e.errorMessage ? (
                      <div style={{ color: '#FF6B6B' }}>err: {e.errorMessage}</div>
                    ) : null}
                  </div>
                );
              }
              return (
                <div key={e.seq} style={{ marginBottom: 4, borderTop: '1px dashed #333', paddingTop: 2 }}>
                  <div>
                    <span style={{ opacity: 0.7 }}>{time} </span>
                    <span style={{ color: KIND_COLOR.normalize, fontWeight: 700 }}>NORM </span>
                    <span>{e.caller}</span>
                    <span style={{ color: RESULT_COLOR[e.result ?? ''] ?? '#fff', fontWeight: 700 }}>
                      {' '}{e.result}
                    </span>
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    status={e.statusBefore ?? '?'} type={e.gameType ?? '?'} seated={e.activeSeatedPlayers ?? '?'} humans={e.activeHumanPlayers ?? e.activeHumanCount ?? '?'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    host={e.hostPlayerId?.slice(0, 8) ?? '?'}@{e.hostSeat ?? '?'}
                    {' '}other={e.otherPlayerId?.slice(0, 8) ?? '?'}@{e.otherSeat ?? '?'}
                    {' '}rawD={e.rawDistance ?? '?'} circD={e.circularDistance ?? '?'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    shouldNorm={String(e.shouldNormalize)} target={e.targetSeat ?? '?'}
                    {' '}occ={e.occupantPlayerId?.slice(0, 8) ?? '∅'}
                  </div>
                  <div style={{ opacity: 0.85 }}>
                    dbWrite={String(e.dbWriteAttempted)} rows={e.dbRowsUpdated ?? '-'}
                    {' '}dealerPos {e.dealerPositionBefore ?? '?'}→{e.dealerPositionAfter ?? '?'}
                  </div>
                  {e.errorMessage ? (
                    <div style={{ color: '#FF6B6B' }}>err: {e.errorMessage}</div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
