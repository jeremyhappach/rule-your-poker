/**
 * ChatBubbleOverlay — canonical shell chat bubble overlay (Phase 2).
 *
 * Owns per-seat chat bubble rendering anchored to the canonical seat
 * contract. Bubbles are routed to seats by authoritative position
 * (1..7) and visually anchored using the resolved canonical slot
 * (HOME, BOTTOM_RAIL, perimeter 0..5).
 *
 * Phase 2 scope:
 *   - Module exists with stable API.
 *   - Pure routing logic is unit-tested.
 *   - NOT live-wired into any rendering surface in this phase, because
 *     MobileGameTable does not currently render per-seat chat bubbles
 *     on its playfield (bubbles flow through the chat tab). Wiring
 *     into the persistent shell occurs in a later phase along with
 *     shell-owned overlay mounting.
 */

import { ChatBubble } from '@/components/ChatBubble';
import {
  resolveSeatAnchors,
  type ProjectionMode,
  type ResolvedSeatAnchor,
  type SeatAnchorInput,
} from './seatAnchors';
import { useLifecycleMount } from './lifecycleDebug';

export interface ChatBubbleDatum {
  id: string;
  user_id: string;
  message: string;
  image_url?: string | null;
  username?: string;
  expiresAt: number;
}

export interface ChatBubbleOverlayInputs {
  bubbles: ChatBubbleDatum[];
  /** Resolve a user id to their current seat position (1..7), or undefined. */
  getPositionForUserId: (userId: string) => number | undefined;
  projectionMode: ProjectionMode;
  viewerPosition: number | null;
  seats: SeatAnchorInput[];
  gameId?: string;
  gameType?: string;
}

export interface RoutedBubbleGroup {
  position: number;
  anchor: ResolvedSeatAnchor;
  bubbles: ChatBubbleDatum[];
}

/**
 * Pure routing: groups bubbles by seat position and pairs each group
 * with its resolved canonical anchor. Bubbles whose author cannot be
 * mapped to a seat are dropped silently (matches legacy behavior).
 */
export function routeChatBubbles(
  inputs: ChatBubbleOverlayInputs,
): RoutedBubbleGroup[] {
  const anchors = resolveSeatAnchors({
    projectionMode: inputs.projectionMode,
    viewerPosition: inputs.viewerPosition,
    seats: inputs.seats,
    gameId: inputs.gameId,
    gameType: inputs.gameType,
  });
  const anchorByPos = new Map(anchors.map(a => [a.position, a]));

  const byPos = new Map<number, ChatBubbleDatum[]>();
  for (const b of inputs.bubbles) {
    const pos = inputs.getPositionForUserId(b.user_id);
    if (pos === undefined) continue;
    if (!anchorByPos.has(pos)) continue;
    const list = byPos.get(pos) ?? [];
    list.push(b);
    byPos.set(pos, list);
  }

  return Array.from(byPos.entries()).map(([position, bubbles]) => ({
    position,
    anchor: anchorByPos.get(position)!,
    bubbles,
  }));
}

export interface ChatBubbleOverlayProps extends ChatBubbleOverlayInputs {
  /**
   * Renders one group at its anchor. Provided by the shell so the
   * overlay module stays geometry-agnostic. Default renderer stacks
   * bubbles above the chip column (legacy PlayerChatBubbles layout).
   */
  renderGroup?: (group: RoutedBubbleGroup) => React.ReactNode;
}

/**
 * Default presentational component. Phase 2 ships the module ready
 * for mounting by the persistent shell in a later phase. Consumers
 * may pass a custom renderGroup to integrate with their geometry.
 */
export function ChatBubbleOverlay(props: ChatBubbleOverlayProps) {
  useLifecycleMount('ChatBubbleOverlay');
  const groups = routeChatBubbles(props);
  const render = props.renderGroup ?? defaultRenderGroup;
  return <>{groups.map(g => <span key={g.position}>{render(g)}</span>)}</>;
}

function defaultRenderGroup(group: RoutedBubbleGroup) {
  return (
    <div
      data-canonical-shell-bubble-anchor={group.position}
      className="absolute z-50 flex flex-col gap-1 bottom-full mb-1 left-1/2 -translate-x-1/2"
    >
      {group.bubbles.map(b => (
        <ChatBubble
          key={b.id}
          username={b.username || 'Unknown'}
          message={b.message}
          imageUrl={b.image_url}
          expiresAt={b.expiresAt}
        />
      ))}
    </div>
  );
}
