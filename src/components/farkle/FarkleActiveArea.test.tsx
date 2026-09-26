// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FarkleActiveArea } from './FarkleActiveArea';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';
import type { FarkleResolvedRoll } from '@/lib/farkle/presentation';

afterEach(cleanup);
describe('Farkle local selection', () => {
  it('does not issue Bank on HOT DICE, rerender, selection, or focus; records an explicit activation', () => {
    const state = farkleTestState(), action = vi.fn();
    const view = render(<FarkleActiveArea state={state} controllable pending={false} committed={[]} onAction={action} />);
    const hot = { ...state, actionSequence: 2, stage: 'bank_or_roll' as const, thisTurn: 800,
      scoringCycle: 2, finalQueue: [state.currentTurnPlayerId], available: [0, 1, 2, 3, 4, 5] };
    view.rerender(<FarkleActiveArea state={hot} controllable pending={false} committed={[]} onAction={action} />);
    const bank = screen.getByRole('button', { name: 'Bank' });
    fireEvent.focus(bank);
    expect(action).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Roll 6' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(bank, { key: 'Enter' });
    fireEvent.click(bank, { detail: 0 });
    expect(action).toHaveBeenCalledExactlyOnceWith('bank', [], expect.objectContaining({ source: 'bank_button', key: 'Enter', enabled: true, clickDetail: 0 }));
  });
  it('records a pointer gesture begun before a snapshot change without initiating an action on that change', () => {
    const state = { ...farkleTestState(), stage: 'bank_or_roll' as const }, action = vi.fn();
    const view = render(<FarkleActiveArea state={state} controllable pending={false} committed={[]} onAction={action} />);
    const bank = screen.getByRole('button', { name: 'Bank' });
    fireEvent.pointerDown(bank, { pointerType: 'touch' });
    view.rerender(<FarkleActiveArea state={{ ...state, actionSequence: state.actionSequence + 1 }} controllable pending={false} committed={[]} onAction={action} />);
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(bank, { detail: 1 });
    expect(action.mock.calls[0][2].input).toEqual(expect.objectContaining({ eventType: 'pointerdown', sequence: state.actionSequence }));
    fireEvent.click(bank, { detail: 2 });
    expect(action.mock.calls[1][2]).toEqual(expect.objectContaining({ input: null, clickDetail: 2,
      previousClickTimestamp: action.mock.calls[0][2].eventTimestamp }));
  });
  it('selects locally and sends only the committed hold gesture', () => {
    const state = farkleTestState(), action = vi.fn();
    render(<FarkleActiveArea state={state} controllable pending={false} committed={[]} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Die 1: 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Die 2: 1' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hold Dice +200' }));
    expect(action).toHaveBeenCalledWith('hold', [0, 1]);
    expect((screen.getByRole('button', { name: 'Bank' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('clears selection on new sequence and blocks observer/bot control', () => {
    const state = farkleTestState(), action = vi.fn();
    const view = render(<FarkleActiveArea state={state} controllable pending={false} committed={[]} onAction={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Die 1: 1' }));
    view.rerender(<FarkleActiveArea state={{ ...state, actionSequence: 2 }} controllable={false} pending={false} committed={[]} onAction={action} />);
    expect(screen.getByRole('button', { name: 'Die 1: 1' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Hold Dice' }));
    expect(action).not.toHaveBeenCalled();
  });
  it('moves prior committed dice to the far-left held row after Roll N without changing indexes or points', () => {
    const state = farkleTestState();
    state.rollNumber = 2;
    state.stage = 'hold';
    state.available = [1, 2, 3, 4, 5];
    state.dice = [{ index: 1, value: 2 }, { index: 2, value: 3 }, { index: 3, value: 4 }, { index: 4, value: 6 }, { index: 5, value: 2 }];
    const { container } = render(<FarkleActiveArea state={state} controllable pending={false}
      committed={[{ sequence: 2, dice: [{ index: 0, value: 1 }], points: 100, rollNumber: 1 }]} onAction={() => {}} />);
    expect(container.querySelector('.farkle-self-dice')?.getAttribute('data-held-consolidated')).toBe('true');
    expect(container.querySelector('.farkle-self-dice [data-farkle-die="0"]')).toBeNull();
    const held = screen.getByLabelText('Committed scoring dice');
    expect(held.firstElementChild?.querySelector('[data-farkle-die="0"]')).toBeTruthy();
    expect(held.textContent).toContain('+100');
    expect(container.querySelectorAll('.farkle-self-dice .farkle-die')).toHaveLength(5);
  });

  it.each([1, 2, 6])('keeps an exact %s-die terminal roll in the self pane', count => {
    const state = farkleTestState();
    const dice = Array.from({ length: count }, (_, index) => ({ index, value: index === 0 ? 1 : 2 }));
    const resolvedRoll: FarkleResolvedRoll = {
      id: `terminal/${count}`, scopeKey: state._authorityScope, sequence: state.actionSequence,
      actorId: state.currentTurnPlayerId, rollNumber: state.rollNumber, dice, local: true,
    };
    const { container } = render(<FarkleActiveArea state={state} controllable={false} pending={false}
      committed={[]} onAction={() => {}} resolvedRoll={resolvedRoll} />);
    expect(container.querySelectorAll('.farkle-self-dice > .farkle-die')).toHaveLength(count);
    expect(container.querySelectorAll('.farkle-die .bg-muted-foreground\\/25')).toHaveLength(0);
    expect(container.querySelector('[data-farkle-die="0"] .farkle-die-visual > button > div')).toBeTruthy();
  });

  it('keeps a live blank slot shell free of a ghost pip while a rolled one stays visible', () => {
    const state = farkleTestState();
    state.dice = [{ index: 0, value: 1 }];
    state.available = [0, 1, 2, 3, 4, 5];
    const { container } = render(<FarkleActiveArea state={state} controllable={false} pending={false}
      committed={[]} onAction={() => {}} />);
    expect(container.querySelector('[data-farkle-die="0"] .farkle-die-visual > button > div')).toBeTruthy();
    expect(container.querySelectorAll('.farkle-die .bg-muted-foreground\\/25')).toHaveLength(0);
  });
});
