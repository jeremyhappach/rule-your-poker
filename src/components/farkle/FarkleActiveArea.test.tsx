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
});
