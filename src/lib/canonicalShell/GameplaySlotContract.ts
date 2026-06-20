/**
 * GameplaySlotContract — P8.0 (Visual Unification phase, scaffolding only).
 *
 * Typed contract that gameplay surfaces will fulfill when they migrate
 * into the canonical gameplay slot owned by `PlayfieldSlotController`.
 *
 * P8.0 scope (zero behavior change):
 *   - Define the contract shape so later waves (P8.2–P8.6) can adopt it
 *     incrementally without re-negotiating per game.
 *   - No production consumer is migrated in this phase. Existing
 *     gameplay surfaces continue to render exactly as today.
 *
 * Explicitly NOT in scope here:
 *   - Lifecycle changes, sync framework changes, overlay consolidation,
 *     chip transport behavior, visual redesign.
 *
 * `centerSize` is a PROVISIONAL token. Cribbage-dense and Yahtzee-dense
 * are expected to diverge in tuning; the token graduates to named
 * sub-modes only if real reuse emerges across games. See plan §2.
 */

import type { ReactNode } from 'react';
import type { ProjectionMode, ResolvedSeatAnchor } from './seatAnchors';
import type { GeometryTokens } from './ResponsiveGeometryProvider';

/** Provisional center-content size hint. v1 — expect per-game tuning. */
export type CenterSize = 'compact' | 'standard' | 'dense';

/**
 * Motion preset for a chip transport intent. Shell-owned table of
 * keyframe + timing recipes lives in `ChipTransportRuntime`. P8.1 had
 * only the implicit 'default'; Wave 3B adds 'cribbageBounce' to absorb
 * the legacy `CribbageChipTransferAnimation` motion verbatim.
 */
export type ChipTransportVariant = 'default' | 'cribbageBounce';

/** Game-dispatched chip transport intent. Animation runtime is shell-owned (P8.1). */
export interface ChipTransportIntent {
  /** Dedupe key — stable per intent across re-renders. */
  id: string;
  amount: number;
  from: ChipEndpointRef;
  to: ChipEndpointRef;
  reason:
    | 'ante'
    | 'bet'
    | 'win'
    | 'leg'
    | 'sweep'
    | 'transfer';
  /** Optional override; shell picks a default per reason/variant otherwise. */
  durationMs?: number;
  /** Motion preset — defaults to 'default'. */
  variant?: ChipTransportVariant;
}

export type ChipEndpointRef =
  | { kind: 'seat'; position: number }
  | { kind: 'pot' };

/** Render-time inputs supplied to a gameplay slot child. */
export interface GameplaySlotRenderContext {
  seatAnchors: ResolvedSeatAnchor[];
  geometry: GeometryTokens;
  /** Viewer's seat position when seated; null when observing. */
  viewerSeat: number | null;
  /**
   * Projection invariant (locked): 'relative' for seated active users,
   * 'absolute' for observers. Slot children must not invert this.
   */
  projectionMode: ProjectionMode;
}

/**
 * Contract a gameplay surface fulfills to render inside the canonical
 * slot. Surfaces export one `*FeltContent` component matching this shape.
 *
 * Adoption is per-wave; this type exists in P8.0 only as documentation
 * and as a stable target for later migrations.
 */
export interface GameplaySlotChild {
  centerSize: CenterSize;
  render: (ctx: GameplaySlotRenderContext) => ReactNode;
  /** Slot-scoped reveals (showdown, cut card, etc.). */
  overlays?: ReactNode;
  /** Optional chip transport intents dispatched this render. */
  chipIntents?: ChipTransportIntent[];
  /**
   * Readiness gate — narrow predicate per Phase 7 guardrail: only
   * answers "is the intended game surface ready enough to mount
   * without flashing?". Threaded into PlayfieldSlotController.
   */
  readyToMount: boolean;
}

/** Canonical overlay mount slot names exposed by the shell. See ShellOverlayMounts. */
export const SHELL_OVERLAY_SLOTS = [
  'celebration',
  'settlement',
  'announcement',
  'slot',
] as const;

export type ShellOverlaySlotName = (typeof SHELL_OVERLAY_SLOTS)[number];
