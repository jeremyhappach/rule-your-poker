/**
 * holmEndpointAudit — WAR-TIME endpoint-resolver assertions for Holm.
 *
 * Cards must NEVER fly to TABLED_SELF / lone-player / solo-showdown
 * geometry, and opponent deal endpoints must land on the canonical
 * opponent cardback stack, not on chipstack / chip-disc / seat-root
 * centers.
 *
 * Emits two violations into holmWartimeForensics:
 *
 *   HOLM_HAND_ENDPOINT_RESOLVED_TO_TABLED_SELF
 *     fires when an endpoint of kind 'hand' (or 'dealer' fallback to
 *     hand) resolves to an element inside any forbidden tabled marker.
 *
 *   HOLM_OPP_CARD_RESOLVED_TO_CHIPSTACK
 *     fires when an endpoint of kind 'oppStack' (or 'seat' fallback to
 *     opp-stack) resolves to chip geometry instead of a cardback area.
 *
 * Each event includes:
 *   handContextId, playerId|position, endpoint, resolvedSelector,
 *   anchorOwner, rect, nearestComponent, distanceToChipstackCenter,
 *   distanceToCardbackAreaCenter
 *
 * INSTRUMENTATION ONLY. No fixes, no DOM mutation.
 */

import type { CardEndpoint } from './types';
import { recordHolmTimelineEvent } from './holmWartimeForensics';

// Markers that should NEVER own a self-hand deal destination.
const FORBIDDEN_SELF_HAND_SELECTORS = [
  '[data-holm-tabled-self]',
  '[data-holm-lone-player-stage]',
  '[data-holm-lone-player-fan]',
  '[data-holm-solo-showdown]',
  '[data-holm-tabled-cards]',
  '[data-canonical-shell-slot-content="holm.lonePlayerTabledCardsStage"]',
];

// Markers that indicate the resolved element is chip/economy geometry.
const CHIP_GEOMETRY_SELECTORS = [
  '[data-chip-center]',
  '[data-chip-reaction-target]',
  '[data-canonical-chipstack]',
];

// Acceptable opponent cardback-area markers.
const CARDBACK_AREA_SELECTORS = [
  '[data-card-anchor^="opp-stack-"]',
  '[data-canonical-card-back]',
];

interface ResolvedShape {
  resolvedAnchor: string;
  owner: string | null;
  viewportRect: { x: number; y: number; w: number; h: number };
}

function rectCenter(r: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function nearestCenter(
  point: { x: number; y: number },
  selectors: string[],
  container: ParentNode,
): { distance: number; selector: string | null } {
  let best = Infinity;
  let bestSel: string | null = null;
  for (const sel of selectors) {
    const els = container.querySelectorAll(sel);
    for (const el of Array.from(els) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const d = dist(point, rectCenter({ x: r.left, y: r.top, w: r.width, h: r.height }));
      if (d < best) { best = d; bestSel = sel; }
    }
  }
  return { distance: best === Infinity ? -1 : best, selector: bestSel };
}

function findResolvedElement(
  container: HTMLElement,
  resolvedAnchor: string,
): HTMLElement | null {
  // resolveCardEndpoint chooses the first match (or the one tagged as a
  // ShellViewer endpoint). Re-run the same selection to find the live el.
  const selector = `[data-card-anchor="${resolvedAnchor}"]`;
  const matches = Array.from(container.querySelectorAll(selector)) as HTMLElement[];
  return (
    matches.find((m) => m.hasAttribute('data-canonical-shell-viewer-card-endpoint')) ??
    matches[0] ??
    null
  );
}

function describeNearest(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const owner = el.getAttribute('data-anchor-owner');
  const slot = el.getAttribute('data-canonical-shell-slot-content');
  const role = el.getAttribute('data-card-anchor');
  return [tag, owner && `owner=${owner}`, slot && `slot=${slot}`, role && `anchor=${role}`]
    .filter(Boolean)
    .join(' ');
}

/**
 * Audit a single resolved card endpoint. Safe to call for every game —
 * non-Holm games will not have any forbidden markers in the DOM so the
 * assertions are no-ops.
 */
export function auditHolmEndpointResolution(params: {
  gameType: string | null | undefined;
  handContextId: string | null;
  cardId: string | null;
  endpoint: CardEndpoint;
  resolved: ResolvedShape | null;
  container: HTMLElement;
}): void {
  const { gameType, handContextId, cardId, endpoint, resolved, container } = params;
  if (gameType !== 'holm-game') return;
  if (!resolved) return;

  // Locate the actual DOM element that was selected so we can ancestor-walk.
  const el = findResolvedElement(container, resolved.resolvedAnchor);
  if (!el) return;

  const center = rectCenter(resolved.viewportRect);
  const isHandEndpoint =
    endpoint.kind === 'hand' ||
    (endpoint.kind === 'dealer' && resolved.resolvedAnchor.startsWith('hand-'));
  const isOppStackEndpoint =
    endpoint.kind === 'oppStack' ||
    (endpoint.kind === 'seat' && resolved.resolvedAnchor.startsWith('opp-stack-'));

  // ── 1. Self-hand endpoint must NOT live inside tabled markers ─────
  if (isHandEndpoint) {
    for (const forbidden of FORBIDDEN_SELF_HAND_SELECTORS) {
      const ancestor = el.closest(forbidden);
      if (ancestor) {
        recordHolmTimelineEvent(
          'HOLM_HAND_ENDPOINT_RESOLVED_TO_TABLED_SELF',
          {
            cardId,
            handContextId,
            playerId: endpoint.kind === 'hand' ? endpoint.playerId : null,
            endpoint: { ...endpoint },
            resolvedSelector: `[data-card-anchor="${resolved.resolvedAnchor}"]`,
            anchorOwner: resolved.owner,
            rect: { ...resolved.viewportRect, cx: center.x, cy: center.y },
            forbiddenAncestor: forbidden,
            forbiddenAncestorOwner: (ancestor as HTMLElement).getAttribute('data-anchor-owner'),
            nearestComponent: describeNearest(el),
          },
          handContextId,
        );
        break;
      }
    }
  }

  // ── 2. Opponent endpoint must land on cardback area, not chip ─────
  if (isOppStackEndpoint) {
    const chipAncestor = CHIP_GEOMETRY_SELECTORS.find((sel) => el.closest(sel));
    const chipMatch = el.matches(CHIP_GEOMETRY_SELECTORS.join(','));
    const distToChip = nearestCenter(center, CHIP_GEOMETRY_SELECTORS, container);
    const distToCardback = nearestCenter(center, CARDBACK_AREA_SELECTORS, container);

    if (chipAncestor || chipMatch) {
      recordHolmTimelineEvent(
        'HOLM_OPP_CARD_RESOLVED_TO_CHIPSTACK',
        {
          cardId,
          handContextId,
          position: endpoint.kind === 'oppStack' ? endpoint.position : (endpoint.kind === 'seat' ? endpoint.position : null),
          endpoint: { ...endpoint },
          resolvedSelector: `[data-card-anchor="${resolved.resolvedAnchor}"]`,
          anchorOwner: resolved.owner,
          rect: { ...resolved.viewportRect, cx: center.x, cy: center.y },
          chipMatch,
          chipAncestor: chipAncestor ?? null,
          nearestComponent: describeNearest(el),
          distanceToChipstackCenter: distToChip.distance,
          distanceToChipstackSelector: distToChip.selector,
          distanceToCardbackAreaCenter: distToCardback.distance,
          distanceToCardbackAreaSelector: distToCardback.selector,
        },
        handContextId,
      );
    } else {
      // Non-violation telemetry: still record distance fields once per resolution
      // so the panel can prove the opp card landed on the cardback area cluster.
      recordHolmTimelineEvent(
        'HOLM_OPP_CARD_ENDPOINT_AUDIT',
        {
          cardId,
          handContextId,
          position: endpoint.kind === 'oppStack' ? endpoint.position : (endpoint.kind === 'seat' ? endpoint.position : null),
          resolvedSelector: `[data-card-anchor="${resolved.resolvedAnchor}"]`,
          anchorOwner: resolved.owner,
          rect: { ...resolved.viewportRect, cx: center.x, cy: center.y },
          distanceToChipstackCenter: distToChip.distance,
          distanceToCardbackAreaCenter: distToCardback.distance,
        },
        handContextId,
      );
    }
  }
}
