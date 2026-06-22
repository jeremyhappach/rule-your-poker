/**
 * HolmOwnershipBeacon — a zero-DOM React node that registers a (cardId,
 * renderer) tuple in the global Holm ownership registry while the
 * surrounding component is mounted. Used for WAR-TIME ownership
 * forensics — does NOT alter any rendering logic.
 *
 * Place ONE beacon per card slot, next to (or as a sibling of) the
 * card-rendering DOM node. The beacon itself renders nothing.
 */

import { useEffect } from 'react';
import {
  registerHolmCardOwner,
  unregisterHolmCardOwner,
  type HolmRendererName,
} from './holmCardOwnership';

export interface HolmOwnershipBeaconProps {
  cardId: string;
  renderer: HolmRendererName;
  componentName: string;
  handContextId?: string | null;
  phase?: string;
  renderReason?: string;
}

export function HolmOwnershipBeacon({
  cardId,
  renderer,
  componentName,
  handContextId = null,
  phase = 'unknown',
  renderReason = 'mount',
}: HolmOwnershipBeaconProps) {
  useEffect(() => {
    const id = registerHolmCardOwner({
      cardId,
      renderer,
      componentName,
      handContextId,
      phase,
      renderReason,
    });
    return () => unregisterHolmCardOwner(cardId, id);
  }, [cardId, renderer, componentName, handContextId, phase, renderReason]);
  return null;
}
