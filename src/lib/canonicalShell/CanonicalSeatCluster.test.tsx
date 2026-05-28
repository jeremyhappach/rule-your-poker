/**
 * CanonicalSeatCluster tests — PR-A primitive preparation.
 *
 * Goals:
 *   1. Verify the new decorator vocabulary (innerDecoration,
 *      outerDecoration, chipOverlay, raisePosition, dimChip,
 *      onChipClick, hideChipBubble) does what it claims.
 *   2. Lock the byte-for-byte contract for existing consumers
 *      (Gin / Cribbage / Yahtzee): when none of the new props are
 *      passed, NO decoration nodes are emitted into the DOM. This
 *      protects the migration path that is about to land in PR-B.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { SeatAnchorLayer } from './SeatAnchorLayer';

function renderInLayer(
  ui: React.ReactElement,
  opts?: {
    viewerPosition?: number | null;
    projectionMode?: 'observer-absolute' | 'active-canonical';
    seats?: Array<{ position: number; occupied: boolean }>;
  },
) {
  return render(
    <SeatAnchorLayer
      projectionMode={opts?.projectionMode ?? 'observer-absolute'}
      viewerPosition={opts?.viewerPosition ?? null}
      seats={opts?.seats ?? [{ position: 1, occupied: true }, { position: 2, occupied: true }]}
    >
      {ui}
    </SeatAnchorLayer>,
  );
}

describe('CanonicalSeatCluster — byte-for-byte contract for existing consumers', () => {
  it('emits no decoration nodes when only baseline props are passed', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={2}
        position={2}
        name="Alice"
        chipValue="$100"
      />,
    );

    expect(container.querySelector('[data-canonical-seat-decoration="inner"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-decoration="outer"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-chip-overlay]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-cluster-content]')).toBeNull();
    // Identity pill is present.
    expect(container.querySelector('[data-chip-center="2"]')).not.toBeNull();
  });

  it('renders children below pill on top/mid slots and above pill on bottom slots', () => {
    const { container: top } = renderInLayer(
      <CanonicalSeatCluster slot={2} position={2} name="A" chipValue="$1">
        <span data-testid="content">child</span>
      </CanonicalSeatCluster>,
    );
    const topCluster = top.querySelector('[data-canonical-seat-cluster]')!;
    expect(topCluster.className).toContain('flex-col');
    expect(topCluster.className).not.toContain('flex-col-reverse');

    const { container: bottom } = renderInLayer(
      <CanonicalSeatCluster slot={0} position={3} name="A" chipValue="$1">
        <span>child</span>
      </CanonicalSeatCluster>,
      { seats: [{ position: 3, occupied: true }] },
    );
    const bottomCluster = bottom.querySelector('[data-canonical-seat-cluster]')!;
    expect(bottomCluster.className).toContain('flex-col-reverse');
  });
});

describe('CanonicalSeatCluster — new decorator vocabulary', () => {
  it('renders innerDecoration on the right of the chip for left-side slots', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="Bob"
        chipValue="$50"
        innerDecoration={<span data-testid="inner">L</span>}
      />,
    );
    const inner = container.querySelector('[data-canonical-seat-decoration="inner"]')!;
    expect(inner).not.toBeNull();
    // left-side slot → inner sits to the RIGHT of the chip (translate-x-full + right-0).
    expect(inner.className).toContain('translate-x-full');
    expect(inner.className).toContain('right-0');
  });

  it('renders innerDecoration on the left of the chip for right-side slots', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={4}
        position={6}
        name="Carol"
        chipValue="$50"
        innerDecoration={<span>L</span>}
      />,
      { seats: [{ position: 6, occupied: true }] },
    );
    const inner = container.querySelector('[data-canonical-seat-decoration="inner"]')!;
    expect(inner.className).toContain('-translate-x-full');
    expect(inner.className).toContain('left-0');
  });

  it('renders outerDecoration on the opposite side of innerDecoration', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="Bob"
        chipValue="$50"
        innerDecoration={<span>I</span>}
        outerDecoration={<span>O</span>}
      />,
    );
    const inner = container.querySelector('[data-canonical-seat-decoration="inner"]')!;
    const outer = container.querySelector('[data-canonical-seat-decoration="outer"]')!;
    // left-side slot: inner=right, outer=left.
    expect(inner.className).toContain('right-0');
    expect(outer.className).toContain('left-0');
  });

  it('renders chipOverlay over the chip when provided', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="Bob"
        chipValue="$50"
        chipOverlay={<span data-testid="overlay">ring</span>}
      />,
    );
    expect(container.querySelector('[data-canonical-seat-chip-overlay]')).not.toBeNull();
  });

  it('applies raise class only for raise-eligible slots when raisePosition is true', () => {
    // slot 1 (mid-left) is raise-eligible.
    const { container: mid } = renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" raisePosition />,
    );
    expect(mid.querySelector('[data-canonical-seat-cluster]')!.className).toContain('!top-[40%]');

    // slot 0 (bottom-left corner) is NOT raise-eligible — no raise class added.
    const { container: corner } = renderInLayer(
      <CanonicalSeatCluster slot={0} position={3} name="A" chipValue="$1" raisePosition />,
      { seats: [{ position: 3, occupied: true }] },
    );
    expect(corner.querySelector('[data-canonical-seat-cluster]')!.className).not.toContain('!top-[40%]');
    expect(corner.querySelector('[data-canonical-seat-cluster]')!.className).not.toContain('!top-[18%]');
  });

  it('does not apply raise class when raisePosition is false (default)', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" />,
    );
    expect(container.querySelector('[data-canonical-seat-cluster]')!.className).not.toContain('!top-[40%]');
  });

  it('dims the chip face when dimChip is true', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" dimChip />,
    );
    expect(container.querySelector('[data-chip-center="2"]')!.className).toContain('opacity-50');
  });

  it('makes chip clickable and pointer-events-auto when onChipClick is provided', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="A"
        chipValue="$1"
        onChipClick={() => {}}
      />,
    );
    const chip = container.querySelector('[data-chip-center="2"]')!;
    expect(chip.className).toContain('cursor-pointer');
    expect(chip.className).toContain('pointer-events-auto');
  });

  it('omits the identity pill entirely when hideChipBubble is true', () => {
    const { container } = renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="A"
        chipValue="$1"
        hideChipBubble
      >
        <span data-testid="content">cards</span>
      </CanonicalSeatCluster>,
    );
    expect(container.querySelector('[data-chip-center="2"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-cluster-content]')).not.toBeNull();
  });
});
