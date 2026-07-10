// @vitest-environment jsdom
/**
 * Regression: Cribbage hand-stage measurement must attach to the
 * ref-bearing node whenever it mounts, including LATE mounts after an
 * initial `activeHandBlocked && !shouldSelfHeal` early-return render.
 *
 * Root cause of the prior P0 (pill export):
 *   stageRefAttached=true but resolvedStageRect=null and
 *   resizeObserverAttached=false. A `useLayoutEffect(..., [])` fired
 *   before the ref-bearing div mounted and never re-ran.
 *
 * The fix converts measurement to a ref-callback. This test asserts:
 *   1. The ref-callback is invoked with a non-null node.
 *   2. ResizeObserver.observe is called with that same node.
 *   3. If the node unmounts and remounts, exactly one active observer
 *      exists at any time (previous one is disconnected).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState, useLayoutEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  static activeCount = 0;
  observed: Element[] = [];
  disconnected = false;
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    MockResizeObserver.instances.push(this);
    MockResizeObserver.activeCount += 1;
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    if (!this.disconnected) {
      this.disconnected = true;
      MockResizeObserver.activeCount -= 1;
    }
  }
}

beforeEach(() => {
  MockResizeObserver.instances = [];
  MockResizeObserver.activeCount = 0;
  // @ts-expect-error jsdom
  globalThis.ResizeObserver = MockResizeObserver;
});

/**
 * Minimal harness that mirrors the exact ref-callback lifecycle shape
 * used in CribbageMobileCardsTab. Testing the harness directly avoids
 * pulling the entire game tree into jsdom (already covered by
 * `CribbageMobileCardsTab.domRender.test.tsx`), while locking the
 * measurement contract that fixed the P0.
 */
function StageHarness({ blocked, onMeasure }: { blocked: boolean; onMeasure: (r: { w: number; h: number }) => void }) {
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  const roRef = React.useRef<ResizeObserver | null>(null);
  const measure = React.useCallback(() => {
    const stage = nodeRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    onMeasure({ w: rect.width, h: rect.height });
  }, [onMeasure]);
  const refCallback = React.useCallback((node: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    nodeRef.current = node;
    if (!node) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(node);
    roRef.current = ro;
  }, [measure]);
  if (blocked) {
    // Early-return branch: same data attr, NO ref.
    return <div data-crib-active-hand-stage="" />;
  }
  return <div data-crib-active-hand-stage="" ref={refCallback} />;
}

describe('Cribbage hand-stage ref-callback measurement', () => {
  let container: HTMLElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('measures + observes only after the ref-bearing branch mounts (blocked → unblocked flip)', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const measures: Array<{ w: number; h: number }> = [];

    // Initial: blocked branch — no ref, no measurement, no observer.
    act(() => root.render(<StageHarness blocked={true} onMeasure={(r) => measures.push(r)} />));
    expect(measures.length).toBe(0);
    expect(MockResizeObserver.activeCount).toBe(0);

    // Flip to unblocked — ref-bearing div mounts, callback fires.
    act(() => root.render(<StageHarness blocked={false} onMeasure={(r) => measures.push(r)} />));
    expect(measures.length).toBe(1);
    expect(MockResizeObserver.activeCount).toBe(1);
    expect(MockResizeObserver.instances[0].observed.length).toBe(1);
    const observedNode = MockResizeObserver.instances[0].observed[0];
    expect(observedNode).toBe(container.querySelector('[data-crib-active-hand-stage]'));
  });

  it('keeps exactly one active ResizeObserver across blocked flips', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onMeasure = vi.fn();

    act(() => root.render(<StageHarness blocked={false} onMeasure={onMeasure} />));
    expect(MockResizeObserver.activeCount).toBe(1);

    // Unmount ref-bearing branch: observer disconnects.
    act(() => root.render(<StageHarness blocked={true} onMeasure={onMeasure} />));
    expect(MockResizeObserver.activeCount).toBe(0);

    // Remount: a NEW observer attaches, old stays disconnected.
    act(() => root.render(<StageHarness blocked={false} onMeasure={onMeasure} />));
    expect(MockResizeObserver.activeCount).toBe(1);
    expect(MockResizeObserver.instances.length).toBe(2);
  });
});
