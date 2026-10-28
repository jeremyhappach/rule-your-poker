import { rectVmin } from '@/lib/wave4LayoutResolver/units';
import type { Rect } from '@/lib/wave4LayoutResolver/types';

// Intrinsic 140x84 renderer plus the full 48px held/scatter paint envelope.
// These are renderer units, not viewport offsets. Both games use the same dice.
export const DICE_OBSERVER_PAINT = { width: 280, height: 204, padding: '24px 70px 96px' } as const;

/** Preserve assigned width, expanding the old shallow stage to its paint aspect.
 * Clamp within canonical space below the pot; only genuine space pressure fits
 * the composition down. The resulting rect is the slot's actual contract. */
export function fitObserverPaintBounds(preferred: Rect, viewport: Rect, potBottom: number | null): Rect {
  const left = viewport.x.value, right = left + viewport.width.value;
  const top = Math.max(viewport.y.value, potBottom ?? viewport.y.value);
  const bottom = viewport.y.value + viewport.height.value;
  const ratio = DICE_OBSERVER_PAINT.width / DICE_OBSERVER_PAINT.height;
  const width = Math.max(0, Math.min(preferred.width.value, right-left, (bottom-top)*ratio));
  const height = width / ratio;
  const centerX = preferred.x.value + preferred.width.value / 2;
  const centerY = preferred.y.value + preferred.height.value / 2;
  return rectVmin(Math.max(left,Math.min(centerX-width/2,right-width)),
    Math.max(top,Math.min(centerY-height/2,bottom-height)),width,height);
}
