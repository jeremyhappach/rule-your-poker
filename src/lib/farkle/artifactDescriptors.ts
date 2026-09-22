import { vmin, type ArtifactDescriptor } from '@/lib/wave4LayoutResolver';

/** Farkle-only geometry. Existing dice-game descriptors remain untouched. */
export function getFarkleArtifactDescriptors(): ArtifactDescriptor[] {
  return [
    { id: 'farkle.remoteDice', y: .42, width: .88, aspect: 3 },
    { id: 'farkle.scoreboard', y: .43, width: .68, aspect: 1.5 },
    { id: 'farkle.thisTurn', y: .82, width: .62, aspect: 5 },
    { id: 'farkle.turnStatus', y: .2, width: .72, aspect: 8 },
  ].map(stage => ({ id: stage.id, owner: 'FarkleGameTable', composeMode: 'anchored',
    preferredSize: { width: vmin(0), height: vmin(0) }, minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 90, collapsePriority: 'never', anchorX: .5, anchorY: stage.y,
    anchorOrigin: 'center', widthPct: stage.width, aspectRatio: stage.aspect }));
}
