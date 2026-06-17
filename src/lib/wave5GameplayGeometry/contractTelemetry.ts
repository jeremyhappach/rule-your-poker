/**
 * Wave 5D — Phase 3
 * `wave5:contract_violation` telemetry.
 *
 * Pure event bus. No DOM, no React. DEV logs to console with a stable,
 * greppable prefix; PROD only fans out to subscribers (debug HUD, future
 * telemetry sink).
 *
 * The contract:
 *   For every anchored placement,
 *     renderedBounds (felt-local vmin)  ⊆  availableGameplayViewport (vmin)
 *
 * The framework does NOT clip, hide, reposition, or shrink. A violation
 * means the descriptor is wrong and the designer must fix it.
 */

export interface ContractRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContractOverflow {
  top: number;    // > 0 means rendered extends above viewport
  right: number;  // > 0 means rendered extends past right edge
  bottom: number; // > 0 means rendered extends below viewport
  left: number;   // > 0 means rendered extends past left edge
}

export interface ContractViolationEvent {
  artifactId: string;
  assignedRect: ContractRect;            // resolver output, vmin
  renderedBounds: ContractRect;          // DOM-measured, felt-local vmin
  availableGameplayViewport: ContractRect; // vmin
  overflow: ContractOverflow;            // vmin (always positive on the side that overflows)
  timestamp: number;
}

type Listener = (e: ContractViolationEvent) => void;

const listeners = new Set<Listener>();
const ring: ContractViolationEvent[] = [];
const RING_MAX = 64;

const EPSILON = 0.05; // vmin — sub-pixel jitter tolerance

export function computeOverflow(
  rendered: ContractRect,
  viewport: ContractRect,
): ContractOverflow {
  return {
    top: Math.max(0, viewport.y - rendered.y),
    left: Math.max(0, viewport.x - rendered.x),
    right: Math.max(
      0,
      rendered.x + rendered.width - (viewport.x + viewport.width),
    ),
    bottom: Math.max(
      0,
      rendered.y + rendered.height - (viewport.y + viewport.height),
    ),
  };
}

export function overflowExceedsEpsilon(o: ContractOverflow): boolean {
  return (
    o.top > EPSILON ||
    o.right > EPSILON ||
    o.bottom > EPSILON ||
    o.left > EPSILON
  );
}

export function emitContractViolation(event: ContractViolationEvent): void {
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
    // eslint-disable-next-line no-console
    console.warn("[wave5:contract_violation]", {
      artifactId: event.artifactId,
      assignedRect: event.assignedRect,
      renderedBounds: event.renderedBounds,
      availableGameplayViewport: event.availableGameplayViewport,
      overflow: event.overflow,
    });
  }
}

export function onContractViolation(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getRecentContractViolations(): ReadonlyArray<ContractViolationEvent> {
  return ring.slice();
}

export function clearContractViolations(): void {
  ring.length = 0;
}
