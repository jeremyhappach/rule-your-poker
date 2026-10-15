// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import {GameSelection} from '@/components/GameSelection';
const access=vi.hoisted(()=>({allowed:true}));
vi.mock('@/hooks/useTriTowersTestAccess',()=>({useTriTowersTestAccess:()=>access.allowed}));
vi.mock('@/hooks/useRun21AppTestAccess',()=>({useRun21AppTestAccess:()=>false}));
vi.mock('@/lib/debugHarness/activeHarnessWarning',()=>({useActiveHarnessMap:()=>({})}));
afterEach(()=>{cleanup();access.allowed=true;});
describe('TriTowers production selection',()=>{
 it('selects the canonical game key under Other after server admission',()=>{
  const select=vi.fn(),ui=render(<GameSelection onSelectGame={select} activePlayerCount={2}/>);
  expect(ui.getByRole('tab',{name:'Card Games'})).toBeTruthy();
  expect(ui.getByRole('tab',{name:'Dice Games'})).toBeTruthy();
  fireEvent.mouseDown(ui.getByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});
  fireEvent.click(ui.getByText('TriTowers · 2–7 players'));
  expect(select).toHaveBeenCalledWith('tri-towers');
 });
 it('keeps selection and Run Back closed when admission is denied',()=>{
  access.allowed=false;
  const ui=render(<GameSelection onSelectGame={vi.fn()} activePlayerCount={2} lastGameType="tri-towers" isFirstHand={false}/>);
  expect(ui.queryByRole('tab',{name:'Other'})).toBeNull();
  expect(ui.queryByText(/Run Back/)).toBeNull();
 });
});
