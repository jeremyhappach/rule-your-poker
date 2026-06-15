/**
 * HolmSpotlightGeometryProbe — temporary inventory overlay.
 *
 * Draws three dots on the screen to prove (or disprove) that the DOM
 * node feeding `useSeatTargetAngle` is the same visual anchor as the
 * rendered chip disc.
 *
 *   RED   = spotlight apex target (the point the cone is aimed at,
 *           derived the SAME way as useSeatTargetAngle: center of
 *           [data-chip-center="N"].getBoundingClientRect())
 *   BLUE  = data-chip-center rect center (what spotlight uses today)
 *   GREEN = visible chip disc center (the inner .rounded-full.border-2
 *           node — the thing the user actually sees)
 *
 * Also prints a small JSON block with all three rects + the felt
 * surface rect so we can copy/paste the divergence.
 *
 * Holm only. Inventory only. No fixes.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  position: number | null;
}

interface Sample {
  position: number;
  chipCenterRect: DOMRect | null;
  visibleDiscRect: DOMRect | null;
  feltRect: DOMRect | null;
  chipCenter: { x: number; y: number } | null;
  visibleCenter: { x: number; y: number } | null;
  feltCenter: { x: number; y: number } | null;
  visibleDiscNodeDesc: string | null;
  chipNodeOuterHTMLHead: string | null;
}

function describeNode(el: Element | null): string | null {
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') || '').slice(0, 80);
  return `${tag}.${cls}`;
}

export function HolmSpotlightGeometryProbe({ position }: Props) {
  const [sample, setSample] = useState<Sample | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (position === null || position === undefined) {
      setSample(null);
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const chipEl = document.querySelector<HTMLElement>(
        `[data-chip-center="${position}"]`,
      );
      const feltEl = document.querySelector<HTMLElement>(
        '[data-canonical-felt-surface]',
      ) ?? document.querySelector<HTMLElement>('[data-canonical-shell-felt-frame]');

      // Find the actual visible chip body — the inner border-2 rounded-full
      // disc that the user sees. Fall back to the wrapper itself.
      let visibleDisc: HTMLElement | null = null;
      if (chipEl) {
        visibleDisc =
          chipEl.querySelector<HTMLElement>('.rounded-full.border-2') ??
          chipEl.querySelector<HTMLElement>('.rounded-full');
      }

      const chipRect = chipEl?.getBoundingClientRect() ?? null;
      const discRect = visibleDisc?.getBoundingClientRect() ?? null;
      const feltRect = feltEl?.getBoundingClientRect() ?? null;

      const next: Sample = {
        position,
        chipCenterRect: chipRect,
        visibleDiscRect: discRect,
        feltRect,
        chipCenter: chipRect
          ? { x: chipRect.left + chipRect.width / 2, y: chipRect.top + chipRect.height / 2 }
          : null,
        visibleCenter: discRect
          ? { x: discRect.left + discRect.width / 2, y: discRect.top + discRect.height / 2 }
          : null,
        feltCenter: feltRect
          ? { x: feltRect.left + feltRect.width / 2, y: feltRect.top + feltRect.height / 2 }
          : null,
        visibleDiscNodeDesc: describeNode(visibleDisc),
        chipNodeOuterHTMLHead: chipEl
          ? (chipEl.outerHTML.slice(0, 160))
          : null,
      };
      setSample(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [position]);

  if (!sample) return null;
  const { chipCenter, visibleCenter, feltCenter } = sample;

  const dot = (
    color: string,
    x: number,
    y: number,
    label: string,
  ) => (
    <div
      style={{
        position: 'fixed',
        left: x - 6,
        top: y - 6,
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
        border: '2px solid white',
        pointerEvents: 'none',
        zIndex: 99999,
        boxShadow: '0 0 0 1px black',
      }}
      title={label}
    />
  );

  // RED = spotlight target point = same calc as useSeatTargetAngle:
  // chip rect center. We render slightly offset so it doesn't perfectly
  // overlap BLUE when they agree.
  const redOffset = 3;
  const dxBlueGreen = chipCenter && visibleCenter
    ? Math.round(visibleCenter.x - chipCenter.x)
    : null;
  const dyBlueGreen = chipCenter && visibleCenter
    ? Math.round(visibleCenter.y - chipCenter.y)
    : null;

  return (
    <>
      {feltCenter && dot('rgba(255,255,255,0.6)', feltCenter.x, feltCenter.y, 'felt center')}
      {chipCenter && dot('#ff2222', chipCenter.x + redOffset, chipCenter.y - redOffset, 'RED spotlight target')}
      {chipCenter && dot('#2266ff', chipCenter.x, chipCenter.y, 'BLUE data-chip-center')}
      {visibleCenter && dot('#22cc44', visibleCenter.x, visibleCenter.y, 'GREEN visible disc')}

      <div
        style={{
          position: 'fixed',
          left: 8,
          bottom: 8,
          maxWidth: 380,
          padding: 8,
          background: 'rgba(0,0,0,0.85)',
          color: 'white',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 10,
          lineHeight: 1.3,
          borderRadius: 4,
          zIndex: 99999,
          pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          SPOTLIGHT GEOMETRY PROBE — pos {sample.position}
        </div>
        <div>RED (spotlight target / chipRect center): {chipCenter ? `${Math.round(chipCenter.x)},${Math.round(chipCenter.y)}` : 'null'}</div>
        <div>BLUE (data-chip-center rect): {chipCenter ? `${Math.round(chipCenter.x)},${Math.round(chipCenter.y)}` : 'null'}</div>
        <div>GREEN (visible disc): {visibleCenter ? `${Math.round(visibleCenter.x)},${Math.round(visibleCenter.y)}` : 'null'}</div>
        <div>Δ (GREEN - BLUE): {dxBlueGreen !== null ? `${dxBlueGreen}, ${dyBlueGreen}` : 'n/a'} px</div>
        <div>felt center: {feltCenter ? `${Math.round(feltCenter.x)},${Math.round(feltCenter.y)}` : 'null'}</div>
        <div style={{ marginTop: 4, opacity: 0.7 }}>visibleDisc node: {sample.visibleDiscNodeDesc ?? 'n/a'}</div>
      </div>
    </>
  );
}
