import {
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { toVmin, type ResolvedPlacement } from '@/lib/wave4LayoutResolver';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';
import { useGinRummyGameplayGeometry } from '@/lib/wave5GameplayGeometry/GinRummyGameplayGeometryProvider';
import { useCanonicalFeltInteractionLayerElement } from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';

export interface GinAnchoredInteractionSlotProps {
  artifactId: string;
  innerStyle?: CSSProperties;
  children: ReactNode;
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onClickCapture?: MouseEventHandler<HTMLDivElement>;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/**
 * Gin-only interaction portal for pile controls. Uses the same Wave 5
 * placement as the visual GinAnchoredSlot, but portals into the shell-owned
 * interaction layer so the buttons are above gameplay slot-content for
 * hit-testing. Keep this narrow: do not migrate noninteractive artifacts here.
 */
export function GinAnchoredInteractionSlot({
  artifactId,
  innerStyle,
  children,
  onPointerDownCapture,
  onPointerDown,
  onClickCapture,
  onClick,
}: GinAnchoredInteractionSlotProps) {
  const { vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById } = useGinRummyGameplayGeometry();
  const interactionLayer = useCanonicalFeltInteractionLayerElement(true);

  const current = placementsById.get(artifactId);
  const lastValid = lastValidPlacementsById.get(artifactId);
  const placement: ResolvedPlacement | undefined =
    current && current.visible ? current : lastValid;

  if (!placement || !placement.visible || vminInPx <= 0) return null;
  if (!interactionLayer) return null;

  const x = toVmin(placement.rect.x, vminInPx);
  const y = toVmin(placement.rect.y, vminInPx);
  const w = toVmin(placement.rect.width, vminInPx);
  const h = toVmin(placement.rect.height, vminInPx);

  return createPortal(
    <div
      data-wave5-gin-interaction-slot={artifactId}
      data-artifact-id={artifactId}
      data-placement-mode="anchored-interaction"
      data-placement-frame="felt-interaction-layer"
      data-placement-source={current && current.visible ? 'current' : 'lastValid'}
      onPointerDownCapture={onPointerDownCapture}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        ...innerStyle,
      }}
    >
      {children}
    </div>,
    interactionLayer,
  );
}

export default GinAnchoredInteractionSlot;
