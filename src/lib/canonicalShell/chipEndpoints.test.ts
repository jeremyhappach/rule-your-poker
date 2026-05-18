import { describe, it, expect } from 'vitest';
import { resolveChipEndpoint, describeEndpoint } from './chipEndpoints';

function makeContainer(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return el;
}

function addMarker(
  container: HTMLElement,
  attr: string,
  rect: { left: number; top: number; width: number; height: number },
): HTMLElement {
  const el = document.createElement('div');
  const [k, v] = attr.split('=');
  el.setAttribute(k, v ?? '');
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
  container.appendChild(el);
  return el;
}

describe('chipEndpoints', () => {
  it('resolves seat endpoint to marker center', () => {
    const container = makeContainer(400, 300);
    addMarker(container, 'data-chip-center=3', { left: 100, top: 50, width: 40, height: 40 });
    const r = resolveChipEndpoint({
      ref: { kind: 'seat', position: 3 },
      container,
    });
    expect(r).toEqual({ x: 120, y: 70 });
  });

  it('resolves pot endpoint via canonical shell pot anchor', () => {
    const container = makeContainer(400, 300);
    addMarker(container, 'data-canonical-shell-pot-anchor=', {
      left: 200,
      top: 150,
      width: 0,
      height: 0,
    });
    const r = resolveChipEndpoint({ ref: { kind: 'pot' }, container });
    expect(r).toEqual({ x: 200, y: 150 });
  });

  it('returns null when endpoint missing and no cache', () => {
    const container = makeContainer(400, 300);
    const r = resolveChipEndpoint({
      ref: { kind: 'seat', position: 5 },
      container,
    });
    expect(r).toBeNull();
  });

  it('uses cached percent when marker temporarily absent', () => {
    const container = makeContainer(400, 300);
    const cache = {};
    const marker = addMarker(container, 'data-chip-center=2', {
      left: 80,
      top: 60,
      width: 40,
      height: 40,
    });
    resolveChipEndpoint({ ref: { kind: 'seat', position: 2 }, container, cache });
    container.removeChild(marker);
    const r = resolveChipEndpoint({ ref: { kind: 'seat', position: 2 }, container, cache });
    expect(r).toEqual({ x: 100, y: 80 });
  });

  it('describes endpoints stably', () => {
    expect(describeEndpoint({ kind: 'pot' })).toBe('pot');
    expect(describeEndpoint({ kind: 'seat', position: 4 })).toBe('seat:4');
  });
});
