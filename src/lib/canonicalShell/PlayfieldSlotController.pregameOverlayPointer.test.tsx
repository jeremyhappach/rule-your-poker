// @vitest-environment jsdom
//
// Regression: dealer-setup Chat input focus.
//
// For the non-configuring / waiting player, PlayfieldSlotController
// renders the pregame-overlay wrapper on top of the persistent
// children. `preGameOverlay` for that player is either null
// (HighCardDealerSelection shim returns null) or a body-portaled
// modal (DealerGameSetup portals to document.body).
//
// The inner wrapper previously carried `pointer-events-auto` across
// the entire inset-0 rect, blocking focus/typing on the Chat input
// beneath. This test locks in the fix: the outer AND inner wrappers
// must be non-interactive by default so the underlying pane
// (Chat/Cards/Lobby content) remains focusable.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./diagnostics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./diagnostics')>();
  return {
    ...actual,
    recordShellEvent: vi.fn(),
    checkSlotTransition: vi.fn(() => true),
  };
});

import { PlayfieldSlotController } from './PlayfieldSlotController';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PlayfieldSlotController pregame overlay pointer-events (waiting player Chat focus)', () => {
  it('renders the pregame-overlay wrapper with pointer-events:none on outer AND inner', () => {
    act(() => {
      root.render(
        <PlayfieldSlotController
          desiredIdentity={null}
          persistentChildrenKey="session-key"
          preGameOverlay={null}
        >
          <input data-testid="chat-input" placeholder="chat" />
        </PlayfieldSlotController>,
      );
    });

    const outer = container.querySelector<HTMLElement>('[data-canonical-shell-pregame-overlay]');
    const inner = container.querySelector<HTMLElement>('[data-canonical-shell-pregame-overlay-inner]');
    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();

    // Both wrappers must be non-interactive so the underlying persistent
    // children (Chat input) remain reachable for focus.
    expect(outer!.className).toContain('pointer-events-none');
    expect(inner!.className).toContain('pointer-events-none');
    expect(outer!.className).not.toContain('pointer-events-auto');
    expect(inner!.className).not.toContain('pointer-events-auto');
  });

  it('renders persistent children beneath the overlay so the Chat input can be focused', () => {
    act(() => {
      root.render(
        <PlayfieldSlotController
          desiredIdentity={null}
          persistentChildrenKey="session-key"
          preGameOverlay={null}
        >
          <input data-testid="chat-input" placeholder="chat" />
        </PlayfieldSlotController>,
      );
    });

    const input = container.querySelector<HTMLInputElement>('[data-testid="chat-input"]');
    expect(input).not.toBeNull();
    // Focus must land on the input — nothing above should absorb it.
    input!.focus();
    expect(document.activeElement).toBe(input);
  });
});
