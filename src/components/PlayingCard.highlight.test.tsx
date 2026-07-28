/**
 * @vitest-environment jsdom
 *
 * Proves the canonical face-level card highlight contract:
 *   - The highlight layer is mounted INSIDE the `<PlayingCard/>` face
 *     element (the shadcn `<Card>` that owns the visible white
 *     background / border-radius / clipping), not on any external
 *     wrapper.
 *   - The layer uses `border-radius: inherit` and `inset: 0`, so its
 *     corners always match the real card face — regardless of face
 *     radius token (`rounded-lg` default, `rounded-[10%]` for the
 *     shared active-hand shell).
 *   - No `ring-*` class-based approximation is applied to an outer
 *     wrapper by the primitive itself.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PlayingCard } from '@/components/PlayingCard';

describe('PlayingCard highlight (canonical face geometry)', () => {
  it('renders no highlight overlay when highlight prop is absent', () => {
    const { container } = render(
      <PlayingCard card={{ rank: 'A', suit: '♠' }} size="md" />,
    );
    expect(container.querySelector('[data-playing-card-highlight]')).toBeNull();
  });

  it('mounts the gold highlight overlay INSIDE the card-face element', () => {
    const { container } = render(
      <PlayingCard card={{ rank: 'A', suit: '♠' }} size="md" highlight="gold" />,
    );
    const face = container.querySelector('[data-playing-card-face]') as HTMLElement | null;
    expect(face).not.toBeNull();
    const overlay = container.querySelector(
      '[data-playing-card-highlight="gold"]',
    ) as HTMLElement | null;
    expect(overlay).not.toBeNull();
    // Overlay must be a descendant of the face element — never an
    // external sibling / wrapper approximation.
    expect(face!.contains(overlay!)).toBe(true);
  });

  it('overlay inherits face border-radius and pins to inset:0', () => {
    const { container } = render(
      <PlayingCard card={{ rank: 'K', suit: '♥' }} size="lg" highlight="gold" />,
    );
    const overlay = container.querySelector(
      '[data-playing-card-highlight="gold"]',
    ) as HTMLElement;
    // Inline style — the canonical geometry contract.
    expect(overlay.style.borderRadius).toBe('inherit');
    expect(overlay.style.inset).toBe('0px');
    expect(overlay.style.position).toBe('absolute');
    expect(overlay.style.pointerEvents).toBe('none');
    // Inset box-shadow provides the crisp gold edge that follows the
    // real card silhouette. Outer wrappers must never introduce a
    // ring/border approximation instead.
    expect(overlay.style.boxShadow).toContain('inset');
  });

  it('face element carries no wrapper-ring approximation classes', () => {
    const { container } = render(
      <PlayingCard card={{ rank: '5', suit: '♦' }} size="md" highlight="gold" />,
    );
    const face = container.querySelector('[data-playing-card-face]') as HTMLElement;
    // No `ring-*` on the face — the highlight is an inset overlay.
    expect(face.className).not.toMatch(/\bring-\d/);
  });
});
