/**
 * CanonicalAnnouncementLayer — renders the active LIFECYCLE announcement
 * inline within the shell's 36px announcement rail.
 *
 * Scope ownership:
 *   - Lifecycle / waiting / contextual messaging only.
 *   - Celebration-tier events (see CELEBRATION_TYPES in ./types) are
 *     intentionally skipped here and rendered by the shell-owned
 *     CanonicalCelebrationLayer overlay instead. A celebration event
 *     must never land in the lifecycle rail.
 *
 * Actor visibility gate:
 *   - For `cta_prompt`, when `payload.actorUserId` is present we
 *     require it to match the provider-threaded `viewerUserId`.
 *     Mismatched viewers see nothing for this slot (the matching
 *     `waiting_for_player` ambient, if any, is the observer-side
 *     surface and is emitted separately by the game). Defense in
 *     depth: emitters are also expected to only fire on the actor's
 *     own client.
 */

import { useAnnouncementContext } from './CanonicalAnnouncementProvider';
import { renderAnnouncement } from './renderers';
import { isCelebrationType, isCtaAmbientType } from './types';

export function CanonicalAnnouncementLayer() {
  const ctx = useAnnouncementContext();
  if (!ctx) return null;

  // ── Global between-games lifecycle precedence ──────────────────
  // A `dealer_configuring` ambient represents a session-level
  // between-games boundary: the next dealer is configuring the next
  // game, and the shell rail's job is to surface that fact to every
  // client (including observers) the moment the boundary opens.
  //
  // Without this precedence, a prior-game transient still in its TTL
  // window (most notably `match_win`, which renders in BOTH the
  // celebration overlay AND the rail) would occupy the rail for the
  // full TTL — and by the time it expired, the next dealer would
  // often have already completed setup, so observers never saw the
  // "is setting up the next game" plate. This made the global
  // between-games interstitial lifecycle contract diverge from the
  // initial-session bootstrap path (where no prior transient exists),
  // which is exactly the divergence this unifies.
  //
  // The celebration overlay (CanonicalCelebrationLayer) continues to
  // render the prior-game `match_win` independently — the rail does
  // not own celebration; it owns "what is the shell doing now".
  const railActive =
    ctx.ambient?.type === 'dealer_configuring' ? ctx.ambient : ctx.active;
  if (!railActive) return null;

  // Celebration-tier events ALSO render a centered overlay via
  // CanonicalCelebrationLayer, but match_win additionally renders a
  // winner plate in the lifecycle rail so observers and players get a
  // clear "who won" announcement. Other celebration types (if added)
  // continue to skip the rail.
  if (isCelebrationType(railActive.type) && railActive.type !== 'match_win') return null;
  // Actor-directed CTAs / waiting-on-player prompts render in the
  // ambient helper text area inside the active content pane — not in
  // the shell announcement rail. This keeps the rail focused on
  // shared gameplay/lifecycle state and avoids per-action churn.
  if (isCtaAmbientType(railActive.type)) return null;

  // Actor-only visibility gate for cta_prompt.
  if (railActive.type === 'cta_prompt') {
    const actorUserId = (railActive.payload as { actorUserId?: string } | undefined)?.actorUserId;
    if (actorUserId && actorUserId !== ctx.viewerUserId) {
      if (import.meta.env?.DEV) {
        // eslint-disable-next-line no-console
        console.warn(
          '[canonical-rail] cta_prompt suppressed for non-actor viewer',
          { actorUserId, viewerUserId: ctx.viewerUserId, id: railActive.id },
        );
      }
      return null;
    }
  }

  const node = renderAnnouncement(railActive);
  if (!node) return null;
  return (
    <div
      data-canonical-announcement-content=""
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {node}
    </div>
  );
}
