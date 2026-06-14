// @vitest-environment jsdom

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

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return {
    ...actual,
    recordShellEvent: vi.fn(),
    checkProjectionMode: vi.fn(),
  };
});

import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { SeatAnchorLayer } from './SeatAnchorLayer';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function renderInLayer(
  ui: React.ReactElement,
  opts?: {
    viewerPosition?: number | null;
    projectionMode?: 'observer-absolute' | 'active-canonical';
    seats?: Array<{ position: number; occupied: boolean }>;
  },
) {
  act(() => {
    root.render(
      <SeatAnchorLayer
        projectionMode={opts?.projectionMode ?? 'observer-absolute'}
        viewerPosition={opts?.viewerPosition ?? null}
        seats={
          opts?.seats ?? [
            { position: 1, occupied: true },
            { position: 2, occupied: true },
          ]
        }
      >
        {ui}
      </SeatAnchorLayer>,
    );
  });
}

describe('CanonicalSeatCluster — byte-for-byte contract for existing consumers', () => {
  it('emits no decoration nodes when only baseline props are passed', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={2} position={2} name="Alice" chipValue="$100" />,
    );

    expect(container.querySelector('[data-canonical-seat-decoration="inner"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-decoration="outer"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-chip-overlay]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-cluster-content]')).toBeNull();
    expect(container.querySelector('[data-chip-center="2"]')).not.toBeNull();
  });

  it('renders children below pill on top/mid slots and above pill on bottom slots', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={2} position={2} name="A" chipValue="$1">
        <span>child</span>
      </CanonicalSeatCluster>,
    );
    const topCluster = container.querySelector('[data-canonical-seat-cluster]')!;
    expect(topCluster.className).toContain('flex-col');
    expect(topCluster.className).not.toContain('flex-col-reverse');
  });

  it('reverses cluster column for bottom-anchored slots', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={0} position={3} name="A" chipValue="$1">
        <span>child</span>
      </CanonicalSeatCluster>,
      { seats: [{ position: 3, occupied: true }] },
    );
    const bottomCluster = container.querySelector('[data-canonical-seat-cluster]')!;
    expect(bottomCluster.className).toContain('flex-col-reverse');
  });
});

describe('CanonicalSeatCluster — new decorator vocabulary', () => {
  it('renders innerDecoration on the right of the chip for left-side slots', () => {
    renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="Bob"
        chipValue="$50"
        innerDecoration={<span>L</span>}
      />,
    );
    const inner = container.querySelector('[data-canonical-seat-decoration="inner"]')!;
    expect(inner).not.toBeNull();
    expect(inner.className).toContain('translate-x-full');
    expect(inner.className).toContain('right-0');
  });

  it('renders innerDecoration on the left of the chip for right-side slots', () => {
    renderInLayer(
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
    renderInLayer(
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
    expect(inner.className).toContain('right-0');
    expect(outer.className).toContain('left-0');
  });

  it('renders chipOverlay over the chip when provided', () => {
    renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="Bob"
        chipValue="$50"
        chipOverlay={<span>ring</span>}
      />,
    );
    expect(container.querySelector('[data-canonical-seat-chip-overlay]')).not.toBeNull();
  });

  it('applies raise class only for raise-eligible slots when raisePosition is true', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" raisePosition />,
    );
    expect(
      container.querySelector('[data-canonical-seat-cluster]')!.className,
    ).toContain('!top-[40%]');
  });

  it('does not apply raise class to corner slots even when raisePosition is true', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={0} position={3} name="A" chipValue="$1" raisePosition />,
      { seats: [{ position: 3, occupied: true }] },
    );
    const className = container.querySelector('[data-canonical-seat-cluster]')!.className;
    expect(className).not.toContain('!top-[40%]');
    expect(className).not.toContain('!top-[18%]');
  });

  it('does not apply raise class when raisePosition is false (default)', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" />,
    );
    expect(
      container.querySelector('[data-canonical-seat-cluster]')!.className,
    ).not.toContain('!top-[40%]');
  });

  it('dims the chip face when dimChip is true', () => {
    renderInLayer(
      <CanonicalSeatCluster slot={1} position={2} name="A" chipValue="$1" dimChip />,
    );
    expect(container.querySelector('[data-chip-center="2"] > div')!.className).toContain(
      'opacity-50',
    );
  });

  it('makes chip clickable and pointer-events-auto when onChipClick is provided', () => {
    renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="A"
        chipValue="$1"
        onChipClick={() => {}}
      />,
    );
    const chip = container.querySelector('[data-chip-center="2"] > div')!;
    expect(chip.className).toContain('cursor-pointer');
    expect(chip.className).toContain('pointer-events-auto');
  });

  it('omits the identity pill entirely when hideChipBubble is true', () => {
    renderInLayer(
      <CanonicalSeatCluster
        slot={1}
        position={2}
        name="A"
        chipValue="$1"
        hideChipBubble
      >
        <span>cards</span>
      </CanonicalSeatCluster>,
    );
    expect(container.querySelector('[data-chip-center="2"]')).toBeNull();
    expect(container.querySelector('[data-canonical-seat-cluster-content]')).not.toBeNull();
  });
});
