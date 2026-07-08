// @vitest-environment jsdom
/**
 * Integration-boundary render tests for the page-root Gin trace pill.
 *
 * These tests reproduce the exact prop wiring Game.tsx uses (derived
 * from authoritative game/players/currentRound state) without mounting
 * the full Game.tsx tree. The visibility contract is enforced entirely
 * by the pill component and the derivation function replicated here.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GinPhaseTracePill,
  armGinPhaseTrace,
  recordGinPhaseTrace,
  formatGinPhaseTraceText,
} from './ginPhaseTrace';

function derive(props: {
  status: string | null;
  gameType: string | null;
  humans: number;
}) {
  const isGin = props.gameType === 'gin-rummy';
  const eligible = isGin && props.humans === 2;
  let disabledReason: string | null = null;
  if (isGin && props.humans !== 2) disabledReason = `humans=${props.humans}`;
  return {
    eligible: eligible || (isGin && !!disabledReason),
    disabledReason,
    status: props.status,
    gameType: props.gameType,
    humanPlayerCount: props.humans,
  };
}

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

const mount = (node: React.ReactElement) => {
  act(() => { root.render(node); });
  return container.querySelector('[data-gin-phase-trace-pill]') as HTMLButtonElement | null;
};

describe('GinPhaseTracePill visibility contract at Game.tsx boundary', () => {
  it('two-human Gin in dealer setup → pill visible and ARMED', () => {
    armGinPhaseTrace({ sessionKey: 'setup-1', identity: { gameId: 'g' } });
    const pill = mount(<GinPhaseTracePill {...derive({ status: 'dealer_selection', gameType: 'gin-rummy', humans: 2 })} />);
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toMatch(/GIN TRACE · (ARMED|CAPTURING)/);
  });

  it('two-human Gin in ante wait with events → CAPTURING', () => {
    armGinPhaseTrace({ sessionKey: 'setup-2', identity: { gameId: 'g' } });
    recordGinPhaseTrace({
      kind: 'authoritative-state-update',
      summary: 'ante_decision',
      sourceFile: 'test',
      sourceFunction: 'test',
    });
    const pill = mount(<GinPhaseTracePill {...derive({ status: 'ante_decision', gameType: 'gin-rummy', humans: 2 })} />);
    expect(pill!.getAttribute('data-gin-phase-trace-pill')).toBe('capturing');
    expect(pill!.textContent).toContain('CAPTURING');
  });

  it('two-human Gin outside setup → pill visible with explicit label', () => {
    const pill = mount(<GinPhaseTracePill {...derive({ status: 'waiting', gameType: 'gin-rummy', humans: 2 })} />);
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toMatch(/GIN TRACE · (WAITING|ARMED|CAPTURING|READY)/);
  });

  it('one-human Gin route → pill visible with DISABLED — humans=1', () => {
    const pill = mount(<GinPhaseTracePill {...derive({ status: 'waiting', gameType: 'gin-rummy', humans: 1 })} />);
    expect(pill).not.toBeNull();
    expect(pill!.getAttribute('data-gin-phase-trace-pill')).toBe('disabled');
    expect(pill!.textContent).toContain('DISABLED — humans=1');
  });

  it('non-Gin route → pill silent (only allowed silent path)', () => {
    const pill = mount(<GinPhaseTracePill {...derive({ status: 'in_progress', gameType: 'holm-game', humans: 2 })} />);
    expect(pill).toBeNull();
  });

  it('pill export works before ante resolves', () => {
    armGinPhaseTrace({ sessionKey: 'export-1', identity: { gameId: 'g' } });
    let clicked = false;
    const origCreate = document.createElement.bind(document);
    (document as any).createElement = (tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = () => { clicked = true; };
      return el;
    };
    const origCreateURL = URL.createObjectURL;
    (URL as any).createObjectURL = () => 'blob:test';
    (URL as any).revokeObjectURL = () => {};
    try {
      const pill = mount(<GinPhaseTracePill {...derive({ status: 'ante_decision', gameType: 'gin-rummy', humans: 2 })} />);
      act(() => { pill!.click(); });
      expect(clicked).toBe(true);
      const txt = formatGinPhaseTraceText();
      expect(txt).toContain('Eligibility inputs');
      expect(txt).toContain('"gameType": "gin-rummy"');
    } finally {
      (document as any).createElement = origCreate;
      (URL as any).createObjectURL = origCreateURL;
    }
  });
});
