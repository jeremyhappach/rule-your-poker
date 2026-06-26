/**
 * HolmTracePill — temporary on-screen pill for Holm portal/lifecycle
 * investigation. Single COPY action exports the full ordered event
 * history (rolling 500-event buffer) as text.
 *
 * Mount: only when `isHolmTraceActive()` is true (managed by Game.tsx
 * based on `game.game_type === 'holm-game'`).
 *
 * No console output. No server writes. No behavior change.
 */
import { useSyncExternalStore, useState, useCallback, useEffect } from 'react';
import {
  formatHolmTraceAsText,
  getHolmTraceEvents,
  isHolmTraceActive,
  recordHolmTrace,
  subscribeHolmTrace,
} from '@/lib/holm/holmTrace';

export function HolmTracePill() {
  const events = useSyncExternalStore(
    subscribeHolmTrace,
    getHolmTraceEvents,
    () => [],
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = formatHolmTraceAsText();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }, []);

  // Pot geometry sampler — runs only while pill is mounted (= Holm active).
  useEffect(() => {
    if (!isHolmTraceActive()) return;
    let lastSig = '';
    const sample = () => {
      const pot = document.querySelector<HTMLElement>('[data-pot-anchor]');
      const felt = document.querySelector<HTMLElement>('[data-canonical-felt-surface]');
      const frame = document.querySelector<HTMLElement>('[data-canonical-shell-felt-frame]');
      if (!pot) return;
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const potRect = rect(pot);
      const feltRect = felt ? rect(felt) : null;
      const frameRect = frame ? rect(frame) : null;
      const rootStyles = getComputedStyle(document.documentElement);
      const cssVar = (n: string) => rootStyles.getPropertyValue(n).trim() || null;
      const ancestorTransform: string[] = [];
      let n: HTMLElement | null = pot;
      let depth = 0;
      while (n && depth < 8) {
        const t = getComputedStyle(n).transform;
        if (t && t !== 'none') ancestorTransform.push(`${n.tagName}:${t}`);
        n = n.parentElement;
        depth++;
      }
      const sig = `${Math.round(potRect.y)}|${Math.round(potRect.x)}|${Math.round(feltRect?.y ?? 0)}|${Math.round(frameRect?.y ?? 0)}`;
      if (sig === lastSig) return;
      lastSig = sig;
      recordHolmTrace('POT_GEOMETRY', `pot.y=${potRect.y.toFixed(1)}`, {
        potRect,
        feltRect,
        frameRect,
        cssVars: {
          '--play-top-safe-area': cssVar('--play-top-safe-area'),
          '--shell-felt-h': cssVar('--shell-felt-h'),
          '--shell-play-h': cssVar('--shell-play-h'),
        },
        ancestorTransform,
        showdownAttr: pot.closest('[data-showdown]')?.getAttribute('data-showdown') ?? null,
      });
    };
    const iv = window.setInterval(sample, 300);
    sample();
    return () => window.clearInterval(iv);
  }, []);


  if (!isHolmTraceActive()) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 6,
        right: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#FFD580',
        border: '1px solid #FFD580',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
      data-holm-trace-pill=""
    >
      <span style={{ fontWeight: 700 }}>HOLM TRACE</span>
      <span style={{ opacity: 0.75 }}>ARMED</span>
      <span>EVENTS: {events.length}</span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          background: copied ? '#9FE2BF' : '#FFD580',
          color: '#000',
          border: 'none',
          borderRadius: 3,
          padding: '2px 6px',
          font: 'inherit',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {copied ? 'COPIED' : 'COPY'}
      </button>
    </div>
  );
}

export default HolmTracePill;
