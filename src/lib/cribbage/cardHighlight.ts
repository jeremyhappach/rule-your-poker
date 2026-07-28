/**
 * DEPRECATED — legacy Cribbage card-highlight class tokens.
 *
 * These class strings applied a Tailwind `ring` to an EXTERNAL wrapper
 * around the card, plus a percentage border-radius. The wrapper's box
 * and the card face's real box are not the same, and the shadcn card
 * face uses `rounded-lg` (fixed 8px) not `rounded-[10%]`. As a result
 * the gold ring corners never followed the visible card silhouette.
 *
 * Highlights now flow through the canonical `highlight` prop on
 * `<PlayingCard/>` / `<CribbagePlayingCard/>`. The prop renders an
 * absolute overlay INSIDE the card-face element with
 * `border-radius: inherit`, so the gold edge always hugs the true
 * card corner curve regardless of size, rotation, or fan transform.
 *
 * Do not reintroduce wrapper-ring tokens here. See:
 *   src/components/PlayingCard.tsx        (highlight prop + overlay)
 *   src/components/CribbagePlayingCard.tsx (pass-through)
 *   src/components/activeHand/ActiveHandFan.tsx (buildCardNode helper)
 */
export {};
