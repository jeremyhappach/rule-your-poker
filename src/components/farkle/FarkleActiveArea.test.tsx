// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FarkleActiveArea } from './FarkleActiveArea';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';

afterEach(cleanup);
describe('Farkle local selection', () => {
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
});
