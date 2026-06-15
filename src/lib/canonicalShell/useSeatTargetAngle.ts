/**
 * useSeatTargetAngle — single geometry contract for seat-anchored
 * focus effects (turn spotlight, future per-seat beams).
 *
 * Returns the conic-gradient angle (in degrees, measured from 12
 * o'clock, clockwise) pointing from the felt center to the canonical
 * chip cluster identified by `[data-chip-center="${position}"]`. This
 * derives the angle from CanonicalOpponentSeat's actual DOM geometry,
 * so any global change to seat placement automatically moves the
 * spotlight — no per-game seat maps, no legacy chip coordinates, no
 * slot-to-angle tables that drift out of sync with the seat cluster.
 *
 * Returns null while the frame or chip element hasn't mounted yet so
 * callers can withhold the overlay (preferable to painting at a stale
 * angle on the very first frame).
 */
import { useEffect, useState } from 'react';

const FULL = Math.PI * 2;

function screenAtan2ToConic(rad: number): number {
  // `atan2(dy, dx)` here is called with SCREEN coordinates (Y grows
  // downward). In that basis, east=0 and the angle increases CLOCKWISE
  // as Y grows (because +y is down on screen). Conic-gradient also
  // measures clockwise, but from NORTH (12 o'clock). To rotate the
  // zero axis from east to north we ADD 90°, not subtract.
  //
  // Sanity:
  //   chip directly NORTH of center → dx=0, dy<0 → atan2 = -π/2 →
  //     conic = -90 + 90 = 0°  ✓
  //   chip directly EAST  → dx>0, dy=0 → atan2 = 0 → conic = 90° ✓
  //   chip directly SOUTH → dx=0, dy>0 → atan2 = +π/2 → conic = 180° ✓
  //   chip directly WEST  → dx<0, dy=0 → atan2 = π → conic = 270 → -90° ✓
  let deg = (rad * 180) / Math.PI + 90;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;
  return deg;
}

function measureAngle(frame: HTMLElement, position: number): number | null {
  const chip = document.querySelector<HTMLElement>(
    `[data-chip-center="${position}"]`,
  );
  if (!chip) return null;
  const frameRect = frame.getBoundingClientRect();
  if (frameRect.width === 0 || frameRect.height === 0) return null;
  const chipRect = chip.getBoundingClientRect();
  const cx = frameRect.left + frameRect.width / 2;
  const cy = frameRect.top + frameRect.height / 2;
  const tx = chipRect.left + chipRect.width / 2;
  const ty = chipRect.top + chipRect.height / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return null;
  // Screen-space atan2 → conic (north=0, clockwise+).
  return screenAtan2ToConic(Math.atan2(dy, dx));
}


void FULL;

export function useSeatTargetAngle(
  frame: HTMLElement | null,
  position: number | null | undefined,
  enabled: boolean,
): number | null {
  const [angle, setAngle] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !frame || position === null || position === undefined) {
      setAngle(null);
      return;
    }

    let raf = 0;
    let cancelled = false;

    const recompute = () => {
      if (cancelled) return;
      const next = measureAngle(frame, position);
      if (next !== null) {
        setAngle(prev => (prev !== null && Math.abs(prev - next) < 0.5 ? prev : next));
      }
    };

    // Initial measurement on next frame so the chip has laid out.
    raf = requestAnimationFrame(recompute);

    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    window.addEventListener('resize', onResize);

    // Observe the chip's container so seat layout changes (slot moves,
    // chip cluster mount/unmount) re-measure without polling.
    const observer = new MutationObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    });
    observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    };
  }, [frame, position, enabled]);

  return angle;
}
