/**
 * ChipPresentationDeltaRuntime
 *
 * One shell-owned renderer for signed stack/pot labels. The ledger emits an
 * event only when it changes a visible endpoint; this runtime only finds the
 * corresponding visible anchor and paints the transient effect. It never
 * derives a delta from raw realtime rows.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { formatChipValue } from '@/lib/utils';
import {
  CHIP_BALANCE_DELTA_DURATION_MS,
  useChipPresentationBalanceDeltas,
} from './ChipTransportProvider';
import type { ChipPresentationBalanceDelta } from './ChipPresentationLedger';

interface PositionedDelta {
  delta: ChipPresentationBalanceDelta;
  left: number;
  top: number;
}

interface ResolvedDeltaAnchor {
  element: HTMLElement;
  kind: 'pot' | 'self' | 'opponent-seat';
}

type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

function hasRenderableAnchorGeometry(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  // A source stack/pot may be visibility-hidden while its moving chip owns
  // the visual. Its signed delta still belongs at that preserved geometry.
  // display:none has no endpoint geometry and is treated as an abort.
  return style.display !== 'none';
}

function firstRenderable(
  elements: Iterable<HTMLElement>,
): HTMLElement | null {
  for (const element of elements) {
    if (hasRenderableAnchorGeometry(element)) return element;
  }
  return null;
}

function elementsWithAttribute(
  container: HTMLElement,
  attribute: string,
  value: string,
): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${attribute}]`))
    .filter((element) => element.getAttribute(attribute) === value);
}

function resolveDeltaAnchor(
  container: HTMLElement,
  delta: ChipPresentationBalanceDelta,
): ResolvedDeltaAnchor | null {
  if (delta.endpoint.kind === 'pot') {
    const element = firstRenderable(container.querySelectorAll<HTMLElement>(
      '[data-canonical-pot-zone], [data-pot-anchor]',
    ));
    return element ? { element, kind: 'pot' } : null;
  }

  const playerId = delta.endpoint.playerId;
  if (playerId) {
    const selfAnchor = firstRenderable(elementsWithAttribute(
      container,
      'data-chip-delta-anchor',
      `player:${playerId}`,
    ));
    if (selfAnchor) return { element: selfAnchor, kind: 'self' };
  }

  if (delta.position != null) {
    const element = firstRenderable(elementsWithAttribute(
      container,
      'data-chip-reaction-target',
      String(delta.position),
    ));
    return element ? { element, kind: 'opponent-seat' } : null;
  }
  return null;
}

/** Places an opponent label on the chip disc's edge facing the felt center. */
export function projectFeltFacingRimOrigin(
  anchorRect: Rect,
  feltRect: Rect,
): { left: number; top: number } {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const feltCenterX = feltRect.left + feltRect.width / 2;
  const feltCenterY = feltRect.top + feltRect.height / 2;
  const dx = feltCenterX - anchorCenterX;
  const dy = feltCenterY - anchorCenterY;
  const distance = Math.hypot(dx, dy);
  const radius = Math.min(anchorRect.width, anchorRect.height) / 2;

  if (distance === 0 || radius === 0) {
    return { left: anchorCenterX, top: anchorRect.top };
  }
  return {
    left: anchorCenterX + (dx / distance) * radius,
    top: anchorCenterY + (dy / distance) * radius,
  };
}

export interface ChipPresentationDeltaRuntimeProps {
  containerRef: RefObject<HTMLElement>;
  overlayRootRef: RefObject<HTMLElement>;
}

export function ChipPresentationDeltaRuntime({
  containerRef,
  overlayRootRef,
}: ChipPresentationDeltaRuntimeProps) {
  const deltas = useChipPresentationBalanceDeltas();
  const [positioned, setPositioned] = useState<PositionedDelta[]>([]);
  const seenIdsRef = useRef(new Set<string>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const overlayRoot = overlayRootRef.current;
    if (!container || !overlayRoot) return;

    const containerRect = container.getBoundingClientRect();
    const feltRect = firstRenderable(container.querySelectorAll<HTMLElement>(
      '[data-canonical-felt-interaction-layer]',
    ))?.getBoundingClientRect() ?? containerRect;
    const additions: PositionedDelta[] = [];
    for (const delta of deltas) {
      if (seenIdsRef.current.has(delta.id)) continue;
      // A missing rendered endpoint is an abandoned presentation, never a cue
      // to replay the financial effect later when a new surface mounts.
      seenIdsRef.current.add(delta.id);
      const anchor = resolveDeltaAnchor(container, delta);
      if (!anchor) continue;
      const rect = anchor.element.getBoundingClientRect();
      const origin = anchor.kind === 'opponent-seat'
        ? projectFeltFacingRimOrigin(rect, feltRect)
        : { left: rect.left + rect.width / 2, top: rect.top };
      additions.push({
        delta,
        left: origin.left - containerRect.left,
        top: origin.top - containerRect.top,
      });
    }
    if (additions.length > 0) {
      setPositioned((previous) => [...previous, ...additions]);
    }
  }, [containerRef, deltas, overlayRootRef]);

  useEffect(() => {
    const liveIds = new Set(deltas.map((delta) => delta.id));
    setPositioned((previous) => previous.filter(({ delta }) => liveIds.has(delta.id)));
  }, [deltas]);

  const overlayRoot = overlayRootRef.current;
  if (!overlayRoot || positioned.length === 0) return null;

  return createPortal(
    <>
      {positioned.map(({ delta, left, top }) => (
        <div
          key={delta.id}
          className="absolute pointer-events-none z-[81] font-bold text-[11px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
          style={{
            left,
            top,
            color: delta.amount < 0 ? '#f87171' : '#f6c343',
            animation: `chipPresentationBalanceDelta ${CHIP_BALANCE_DELTA_DURATION_MS}ms ease-out forwards`,
          }}
        >
          {delta.amount < 0 ? '-$' : '+$'}{formatChipValue(Math.abs(delta.amount))}
        </div>
      ))}
      <style>{`
        @keyframes chipPresentationBalanceDelta {
          0% { opacity: 0; transform: translate(-50%, 0); }
          10% { opacity: 1; transform: translate(-50%, -5px); }
          50% { opacity: 1; transform: translate(-50%, -30px); }
          100% { opacity: 0; transform: translate(-50%, -60px); }
        }
      `}</style>
    </>,
    overlayRoot,
  );
}
