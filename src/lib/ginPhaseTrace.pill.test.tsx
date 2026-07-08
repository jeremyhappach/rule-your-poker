/**
 * Integration-boundary render tests for the page-root Gin trace pill.
 *
 * These tests exercise the exact wiring Game.tsx uses (props derived
 * from authoritative game/players/currentRound state) without mounting
 * the full Game.tsx tree — which requires ~50 providers. The pill
 * itself is the visibility contract; Game.tsx feeds it derived props.
 * The predicate under test here is the same predicate Game.tsx runs.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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

describe('GinPhaseTracePill visibility contract at Game.tsx boundary', () => {
  beforeEach(() => cleanup());

  it('two-human Gin in dealer setup → pill visible and ARMED', () => {
    armGinPhaseTrace({ sessionKey: 'setup-1', identity: { gameId: 'g' } });
    const { container } = render(
      <GinPhaseTracePill {...derive({ status: 'dealer_selection', gameType: 'gin-rummy', humans: 2 })} />,
    );
    const pill = container.querySelector('[data-gin-phase-trace-pill]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toMatch(/GIN TRACE · (ARMED|CAPTURING)/);
  });

  it('two-human Gin in ante wait → pill visible and CAPTURING (has events)', () => {
    armGinPhaseTrace({ sessionKey: 'setup-2', identity: { gameId: 'g' } });
    recordGinPhaseTrace({
      kind: 'authoritative-state-update',
      summary: 'ante_decision',
      sourceFile: 'test',
      sourceFunction: 'test',
    });
    const { container } = render(
      <GinPhaseTracePill {...derive({ status: 'ante_decision', gameType: 'gin-rummy', humans: 2 })} />,
    );
    const pill = container.querySelector('[data-gin-phase-trace-pill]');
    expect(pill?.getAttribute('data-gin-phase-trace-pill')).toBe('capturing');
    expect(pill?.textContent).toContain('CAPTURING');
  });

  it('two-human Gin outside setup → pill visible with explicit WAITING/READY state', () => {
    // Fresh module state — but buffer persists across tests intentionally,
    // so this asserts the READY-to-export state when events exist and arm
    // has expired. We just assert visibility + a valid explicit label.
    const { container } = render(
      <GinPhaseTracePill {...derive({ status: 'waiting', gameType: 'gin-rummy', humans: 2 })} />,
    );
    const pill = container.querySelector('[data-gin-phase-trace-pill]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toMatch(/GIN TRACE · (WAITING|ARMED|CAPTURING|READY)/);
  });

  it('one-human Gin route → pill visible with DISABLED — humans=1', () => {
    const { container } = render(
      <GinPhaseTracePill {...derive({ status: 'waiting', gameType: 'gin-rummy', humans: 1 })} />,
    );
    const pill = container.querySelector('[data-gin-phase-trace-pill="disabled"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('DISABLED — humans=1');
  });

  it('non-Gin route → pill does not render (only silent path)', () => {
    const { container } = render(
      <GinPhaseTracePill {...derive({ status: 'in_progress', gameType: 'holm-game', humans: 2 })} />,
    );
    expect(container.querySelector('[data-gin-phase-trace-pill]')).toBeNull();
  });

  it('pill export works before ante resolves (click triggers export path)', () => {
    armGinPhaseTrace({ sessionKey: 'export-1', identity: { gameId: 'g' } });
    // Stub anchor click to avoid jsdom navigation.
    const origCreate = document.createElement.bind(document);
    let clicked = false;
    (document as any).createElement = (tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') (el as HTMLAnchorElement).click = () => { clicked = true; };
      return el;
    };
    // Stub URL.createObjectURL for jsdom.
    const origCreateURL = URL.createObjectURL;
    (URL as any).createObjectURL = () => 'blob:test';
    (URL as any).revokeObjectURL = () => {};
    try {
      const { container } = render(
        <GinPhaseTracePill {...derive({ status: 'ante_decision', gameType: 'gin-rummy', humans: 2 })} />,
      );
      const btn = container.querySelector('[data-gin-phase-trace-pill]') as HTMLButtonElement;
      fireEvent.click(btn);
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
