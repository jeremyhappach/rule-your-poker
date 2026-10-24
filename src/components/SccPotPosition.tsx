import { useMemo, type ComponentProps } from 'react';
import { createPortal } from 'react-dom';
import { resolveLayout } from '@/lib/wave4LayoutResolver';
import { useLiveGeometryConstraints } from '@/lib/wave4LayoutResolver/useLiveGeometryConstraints';
import { useCanonicalFeltCoordFrameElement } from '@/lib/canonicalShell/useCanonicalFeltCoordFrameElement';
import { useDraftedGeometryOverrides, applyGeometryOverrides } from '@/lib/geometryLab/store';
import { diceOpponentDiceStageId, getDiceArtifactDescriptors } from '@/lib/dice/diceArtifactDescriptors';

/** Position the existing shell pot above SCC's resolved dice envelope.
 * Keep the dice envelope reserved between rolls so the pot never jumps with
 * observer/roller visibility. Both artifacts share the canonical felt frame.
 */
export function SccPotPosition({ children, style, ...props }: ComponentProps<'div'>) {
  const { geometry } = useLiveGeometryConstraints();
  const frame = useCanonicalFeltCoordFrameElement(true);
  const overrides = useDraftedGeometryOverrides();
  const stage = useMemo(() => {
    if (!geometry) return null;
    const descriptors = applyGeometryOverrides(getDiceArtifactDescriptors({
      gameType: 'ship-captain-crew', opponentDiceVisible: true, beatBadgeVisible: false,
    }), overrides);
    return resolveLayout(descriptors, geometry).placements.find(p => p.id === diceOpponentDiceStageId('ship-captain-crew') && p.visible);
  }, [geometry, overrides]);
  if (!frame || !stage) return null;
  const rect = stage.rect;
  return createPortal(<div {...props} data-scc-pot-position="above-dice" style={{
    ...style,
    position: 'absolute',
    left: `${rect.x.value + rect.width.value / 2}vmin`,
    top: `${rect.y.value - rect.height.value * 0.1}vmin`,
    transform: 'translate(-50%, -100%)',
    transition: 'none',
  }}>{children}</div>, frame);
}
