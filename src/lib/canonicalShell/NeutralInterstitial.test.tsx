// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return { ...actual, recordShellEvent: vi.fn() };
});

import { NeutralInterstitial } from './NeutralInterstitial';
import { recordShellEvent } from './diagnostics';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (recordShellEvent as unknown as ReturnType<typeof vi.fn>).mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('NeutralInterstitial', () => {
  it('renders neutral data attribute and fires telemetry on mount/unmount', () => {
    act(() => { root.render(<NeutralInterstitial gameId="g1" reason="test" />); });
    expect(container.querySelector('[data-canonical-shell-neutral]')).not.toBeNull();

    const mock = recordShellEvent as unknown as ReturnType<typeof vi.fn>;
    expect(mock.mock.calls.filter(([n]) => n === 'slot-entered-neutral').length).toBe(1);

    act(() => { root.render(<></>); });
    expect(mock.mock.calls.filter(([n]) => n === 'slot-left-neutral').length).toBe(1);
  });
});
