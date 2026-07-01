/**
 * Yahtzee-only interaction portal for felt controls. Mirrors
 * GinAnchoredInteractionSlot: consumes the same anchored placement
 * from YahtzeeGameplayGeometryProvider, but portals into the shell-
 * owned `[data-canonical-felt-interaction-layer]` so interactive
 * targets sit above every gameplay visual artifact. Visual mounts stay
 * in YahtzeeAnchoredSlot; only interactive controls belong here.
 */

import { type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toVmin, type ResolvedPlacement } from '@/lib/wave4LayoutResolver';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';
import { useYahtzeeGameplayGeometry } from '@/lib/wave5GameplayGeometry/YahtzeeGameplayGeometryProvider';
import { useCanonicalFeltInteractionLayerElement } from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import { AssignedRectPxProvider } from '@/lib/wave5GameplayGeometry/AssignedRectPx';

export interface YahtzeeAnchoredInteractionSlotProps {
  artifactId: string;
  innerStyle?: CSSProperties;
  children: ReactNode;
}

export function YahtzeeAnchoredInteractionSlot({
  artifactId,
  innerStyle,
  children,
}: YahtzeeAnchoredInteractionSlotProps) {
  const { vminInPx } = useLiveGeometryConstraints();
  const { placementsById, lastValidPlacementsById } = useYahtzeeGameplayGeometry();
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
      data-wave5-yahtzee-interaction-slot={artifactId}
      data-artifact-id={artifactId}
      data-placement-mode="anchored-interaction"
      data-placement-frame="felt-interaction-layer"
      data-placement-source={current && current.visible ? 'current' : 'lastValid'}
      style={{
        position: 'absolute',
        left: `${x}vmin`,
        top: `${y}vmin`,
        width: `${w}vmin`,
        height: `${h}vmin`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        ...innerStyle,
      }}
    >
      <AssignedRectPxProvider
        value={{ widthPx: w * vminInPx, heightPx: h * vminInPx }}
      >
        {children}
      </AssignedRectPxProvider>
    </div>,
    interactionLayer,
  );
}

export default YahtzeeAnchoredInteractionSlot;
