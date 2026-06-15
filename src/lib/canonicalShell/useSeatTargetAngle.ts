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

function rad2conic(rad: number): number {
  // Standard math angle (atan2 dy, dx — east = 0, ccw +) → conic-gradient
  // angle (north = 0, clockwise +). Conic = 90° - mathDeg, wrapped.
  let deg = 90 - (rad * 180) / Math.PI;
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
  // atan2(dy, dx) is the standard east-zero ccw angle in radians.
  // Conic gradients measure from north, clockwise — convert via rad2conic.
  return rad2conic(Math.atan2(dy, dx));
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
