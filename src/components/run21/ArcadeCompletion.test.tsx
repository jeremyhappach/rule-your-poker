// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,act} from '@testing-library/react';
import {ArcadeCompletion} from './ArcadeCompletion';
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('Arcade final results',()=>{
 it('preserves the noninteractive completion used by existing games',()=>{
  render(<ArcadeCompletion score={3500}/>);
  expect(screen.getByRole('status').textContent).toContain('TOTAL SCORE: 3,500');
  expect(screen.queryByRole('button')).toBeNull();
 });
 it('holds a detailed final score until the player uses Back to Arcade',()=>{
  vi.useFakeTimers();const back=vi.fn();
  render(<ArcadeCompletion title="Final Score" score={3500} onBackToArcade={back}>
   <p>Round 1: 1,200 · Round 2: 800 · Round 3: 1,500</p>
  </ArcadeCompletion>);
  act(()=>vi.advanceTimersByTime(60000));
  expect(screen.getByRole('region',{name:'Final Score'}).textContent).toContain('3,500');
  expect(screen.getByText('Round 1: 1,200 · Round 2: 800 · Round 3: 1,500')).toBeTruthy();
  expect(back).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Back to Arcade'}));
  expect(back).toHaveBeenCalledTimes(1);
 });
});
