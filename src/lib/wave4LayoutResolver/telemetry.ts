/**
 * Wave 4 — Phase 5A
 * Layout fault telemetry.
 *
 * DEV: console.warn + in-memory ring buffer consumed by LayoutFaultBadge.
 * PROD: same emitter, with a hook (`onLayoutFault`) the app can wire to
 *       its existing telemetry sink (Sentry, Supabase events, etc.).
 *
 * No DOM access. No React. Pure side-channel.
 */

import type { LayoutFault } from "./types";

export interface LayoutFaultEvent {
  /** Monotonic id, useful to identify "last valid layout" before fault. */
  layoutHash: string;
  game: string;
  orientation: "portrait" | "landscape" | "unknown";
  viewportBucket: string;
  faults: ReadonlyArray<LayoutFault>;
  timestamp: number;
}

type Listener = (e: LayoutFaultEvent) => void;

const listeners = new Set<Listener>();
const ring: LayoutFaultEvent[] = [];
const RING_MAX = 32;

export function emitLayoutFault(event: LayoutFaultEvent): void {
  ring.push(event);
  if (ring.length > RING_MAX) ring.shift();
  for (const l of listeners) {
    try {
      l(event);
    } catch {
      /* listener errors must not break gameplay */
    }
  }
  if (typeof console !== "undefined") {
    // Stable, greppable prefix so devs can filter the console.
    // eslint-disable-next-line no-console
    console.warn("[wave4:layout_fault]", {
      game: event.game,
      orientation: event.orientation,
      viewport: event.viewportBucket,
      hash: event.layoutHash,
      faults: event.faults.map((f) => ({
        code: f.code,
        ids: f.artifactIds,
        band: f.band,
        message: f.message,
      })),
    });
  }
}

export function onLayoutFault(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getRecentLayoutFaults(): ReadonlyArray<LayoutFaultEvent> {
  return ring.slice();
}

/** Cheap, deterministic layout hash for "last valid layout id". */
export function hashLayout(
  placements: ReadonlyArray<{ id: string; visible: boolean }>,
): string {
  let h = 5381;
  for (const p of placements) {
    const s = `${p.id}:${p.visible ? 1 : 0};`;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
  }
  return (h >>> 0).toString(36);
}

export function viewportBucketFor(w: number, h: number): string {
  const max = Math.max(w, h);
  if (max < 480) return "xs";
  if (max < 768) return "sm";
  if (max < 1024) return "md";
  if (max < 1440) return "lg";
  if (max < 1920) return "xl";
  return "2xl";
}

export function orientationFor(
  w: number,
  h: number,
): "portrait" | "landscape" | "unknown" {
  if (!w || !h) return "unknown";
  return w >= h ? "landscape" : "portrait";
}
