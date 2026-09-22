// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { FarkleScoreboard } from './FarkleScoreboard';
import { FarkleActiveArea } from './FarkleActiveArea';
import { FarkleRemoteStage } from './FarkleRemoteStage';
import { farkleTestState } from '@/lib/farkle/__fixtures__/testState';
afterEach(cleanup);
it('shows authoritative banked totals with commas, without unbanked points or turn counts', () => {
  const state = farkleTestState(); state.playerStates[state.currentTurnPlayerId] = { banked: 8450, completedTurns: 12 }; state.thisTurn = 250;
  render(<FarkleScoreboard state={state} nameFor={id => id === state.currentTurnPlayerId ? 'Self' : 'Peer'} surface="pane" />);
  expect(screen.getByText('8,450')).toBeTruthy(); expect(screen.queryByText('8,700')).toBeNull();
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByText('Self').closest('[role="row"]')?.getAttribute('data-active')).toBe('true');
});
it('disables committed dice independently of highlights, retaining server contribution', () => {
  const state = farkleTestState(); state.stage = 'bank_or_roll'; state.thisTurn = 100; state.available = [1,2,3,4,5];
  render(<FarkleActiveArea state={state} controllable pending={false} retired={[0]} scoring={[0]}
    committed={[{ sequence: 2, dice: [state.dice[0]], points: 100, rollNumber: 1 }]} onAction={() => {}} />);
  const button = screen.getByRole('button', { name: 'Die 1: 1' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true); expect(button.parentElement?.dataset.retired).toBe('true');
  expect(button.parentElement?.dataset.scoring).toBe('true'); expect(screen.getByLabelText('Committed scoring dice').textContent).toContain('+100');
});
it('centers Roll N without increasing the six-dice spacing', () => {
  const {container} = render(<FarkleRemoteStage dice={[1,2,3].map((value,index)=>({value,index}))} receiptKey="roll" />);
  const xs = [...container.querySelectorAll<HTMLElement>('.farkle-remote-die')].map(el=>parseFloat(el.style.getPropertyValue('--farkle-row-x')));
  expect(xs[1]).toBe(50); expect(xs[1]-xs[0]).toBeCloseTo(100/6); expect(xs[2]-xs[1]).toBeCloseTo(100/6);
});
