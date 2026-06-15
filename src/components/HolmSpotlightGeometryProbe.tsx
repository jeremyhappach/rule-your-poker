/**
 * HolmSpotlightGeometryProbe — geometry-only investigation overlay.
 *
 * Renders, per render frame:
 *   GREEN dot  = chipCenter (rect center of [data-chip-center="N"])
 *   BLUE dot   = feltCenter (rect center of [data-canonical-felt-surface]
 *                — also samples [data-canonical-shell-felt-frame] for
 *                comparison, since useSeatTargetAngle/spotlight apex
 *                actually use the FRAME, not the surface)
 *   RED line   = the ray ACTUALLY rendered by TurnSpotlight, drawn from
 *                the spotlight overlay's own 50%/50% apex along
 *                `renderedWedgeAngleDeg` (read from
 *                [data-turn-spotlight-overlay] data attrs)
 *
 * Prints, per render:
 *   currentTurnPosition
 *   targetPlayer (best-effort, from seat cluster name row)
 *   targetSlot (the position number — slot = position in canonical shell)
 *   chipCenterX/Y
 *   feltCenterX/Y (surface) + frameCenterX/Y
 *   computedAngleDeg   (atan2 from frame center → chip center, conic)
 *   renderedWedgeAngleDeg (what TurnSpotlight is actually painting)
 *   deltaAngleDeg = computed - rendered
 *   legacySlotAngleDeg = legacy slot→angle table (the old observer table)
 *                        for the same position, for diff comparison
 *
 * Holm only. No spotlight visuals changed; this is a pure overlay.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  position: number | null;
}

// Legacy observer slot→angle table preserved verbatim from TurnSpotlight's
// non-shell fallback (observer branch). Used here ONLY for diff reporting.
const LEGACY_OBSERVER_ANGLES: Record<number, number> = {
  1: -45, 2: -90, 3: -135, 4: 180, 5: 135, 6: 90, 7: 45,
};

function conicFromCenters(
  cx: number, cy: number, tx: number, ty: number,
): number | null {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return null;
  let deg = 90 - (Math.atan2(dy, dx) * 180) / Math.PI;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

function center(r: DOMRect | null): { x: number; y: number } | null {
  if (!r) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

interface Sample {
  position: number;
  targetPlayerName: string | null;
  chipRect: DOMRect | null;
  surfaceRect: DOMRect | null;
  frameRect: DOMRect | null;
  overlayRect: DOMRect | null;
  renderedRotation: number | null;
}

export function HolmSpotlightGeometryProbe({ position }: Props) {
  const [s, setS] = useState<Sample | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (position === null || position === undefined) { setS(null); return; }
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const chipEl = document.querySelector<HTMLElement>(
        `[data-chip-center="${position}"]`,
      );
      const surfaceEl = document.querySelector<HTMLElement>(
        '[data-canonical-felt-surface]',
      );
      const frameEl = document.querySelector<HTMLElement>(
        '[data-canonical-shell-felt-frame]',
      );
      const overlayEl = document.querySelector<HTMLElement>(
        '[data-turn-spotlight-overlay]',
      );
      const seatEl = document.querySelector<HTMLElement>(
        `[data-canonical-seat-cluster][data-seat-position="${position}"]`,
      );
      const nameEl = seatEl?.querySelector<HTMLElement>(
        '[data-canonical-seat-name-row]',
      ) ?? null;

      const rotAttr = overlayEl?.getAttribute('data-turn-spotlight-rotation');
      const renderedRotation = rotAttr !== null && rotAttr !== undefined && rotAttr !== ''
        ? Number(rotAttr)
        : null;

      setS({
        position,
        targetPlayerName: (nameEl?.textContent || '').trim().slice(0, 40) || null,
        chipRect: chipEl?.getBoundingClientRect() ?? null,
        surfaceRect: surfaceEl?.getBoundingClientRect() ?? null,
        frameRect: frameEl?.getBoundingClientRect() ?? null,
        overlayRect: overlayEl?.getBoundingClientRect() ?? null,
        renderedRotation,
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [position]);

  if (!s) return null;

  const chipC = center(s.chipRect);
  const surfaceC = center(s.surfaceRect);
  const frameC = center(s.frameRect);
  const overlayC = center(s.overlayRect);

  // Computed angle uses the SAME basis as useSeatTargetAngle: the felt
  // frame center (NOT the surface).
  const computedAngleDeg = frameC && chipC
    ? conicFromCenters(frameC.x, frameC.y, chipC.x, chipC.y)
    : null;
  const renderedWedgeAngleDeg = s.renderedRotation;
  const deltaAngleDeg =
    computedAngleDeg !== null && renderedWedgeAngleDeg !== null
      ? Math.round((computedAngleDeg - renderedWedgeAngleDeg) * 10) / 10
      : null;
  const legacySlotAngleDeg = LEGACY_OBSERVER_ANGLES[s.position] ?? null;

  // RED line: ray actually rendered by TurnSpotlight — origin =
  // overlay center (its conic apex is `at 50% 50%`), angle =
  // renderedRotation, in conic basis (0=north, clockwise+).
  const rayOrigin = overlayC;
  const rayLength = 320;
  let rayEnd: { x: number; y: number } | null = null;
  if (rayOrigin && renderedWedgeAngleDeg !== null) {
    // conic → math: math = 90 - conic (degrees, CCW from east)
    const mathRad = ((90 - renderedWedgeAngleDeg) * Math.PI) / 180;
    rayEnd = {
      x: rayOrigin.x + Math.cos(mathRad) * rayLength,
      // screen Y is inverted vs math Y
      y: rayOrigin.y - Math.sin(mathRad) * rayLength,
    };
  }

  const dot = (
    color: string, x: number, y: number, label: string,
  ) => (
    <div
      style={{
        position: 'fixed', left: x - 6, top: y - 6, width: 12, height: 12,
        borderRadius: '50%', background: color, border: '2px solid white',
        pointerEvents: 'none', zIndex: 99999,
        boxShadow: '0 0 0 1px black',
      }}
      title={label}
    />
  );

  const fmt = (n: number | null) => n === null ? 'n/a' : String(Math.round(n));
  const fmt1 = (n: number | null) => n === null ? 'n/a' : (Math.round(n * 10) / 10).toFixed(1);

  return (
    <>
      {/* RED ray as a thin rotated bar from overlay center */}
      {rayOrigin && rayEnd && (
        <svg
          style={{
            position: 'fixed', left: 0, top: 0, width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: 99998,
          }}
        >
          <line
            x1={rayOrigin.x} y1={rayOrigin.y}
            x2={rayEnd.x} y2={rayEnd.y}
            stroke="#ff2222" strokeWidth={2}
          />
          <circle cx={rayOrigin.x} cy={rayOrigin.y} r={3} fill="#ff2222" />
        </svg>
      )}

      {surfaceC && dot('#2266ff', surfaceC.x, surfaceC.y, 'BLUE felt surface center')}
      {frameC && dot('rgba(0,180,255,0.8)', frameC.x, frameC.y, 'cyan felt frame center')}
      {chipC && dot('#22cc44', chipC.x, chipC.y, 'GREEN chip center')}

      <div
        style={{
          position: 'fixed', left: 8, bottom: 8, maxWidth: 380, padding: 8,
          background: 'rgba(0,0,0,0.88)', color: 'white',
          fontFamily: 'ui-monospace, monospace', fontSize: 10, lineHeight: 1.35,
          borderRadius: 4, zIndex: 99999, pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          HOLM SPOTLIGHT GEOMETRY
        </div>
        <div>currentTurnPosition: {s.position}</div>
        <div>targetPlayer: {s.targetPlayerName ?? 'n/a'}</div>
        <div>targetSlot: {s.position}</div>
        <div>chipCenter: {chipC ? `${fmt(chipC.x)}, ${fmt(chipC.y)}` : 'n/a'}</div>
        <div>feltCenter (surface): {surfaceC ? `${fmt(surfaceC.x)}, ${fmt(surfaceC.y)}` : 'n/a'}</div>
        <div>feltCenter (frame*): {frameC ? `${fmt(frameC.x)}, ${fmt(frameC.y)}` : 'n/a'}</div>
        <div>overlayCenter (ray apex): {overlayC ? `${fmt(overlayC.x)}, ${fmt(overlayC.y)}` : 'n/a'}</div>
        <div style={{ marginTop: 4 }}>
          computedAngleDeg (frame→chip): {fmt1(computedAngleDeg)}
        </div>
        <div>
          renderedWedgeAngleDeg: {fmt1(renderedWedgeAngleDeg)}
        </div>
        <div style={{ color: deltaAngleDeg !== null && Math.abs(deltaAngleDeg) > 1 ? '#ff6666' : '#66ff88' }}>
          deltaAngleDeg: {fmt1(deltaAngleDeg)}
        </div>
        <div>legacySlotAngleDeg (observer table): {fmt1(legacySlotAngleDeg)}</div>
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          * spotlight apex uses frame, not surface. If frame ≠ surface,
          the ray will look off-center even with a correct angle.
        </div>
      </div>
    </>
  );
}
