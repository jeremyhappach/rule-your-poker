// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,cleanup} from '@testing-library/react';
import {GameSelection} from '@/components/GameSelection';
const access=vi.hoisted(()=>({allowed:false}));
vi.mock('@/hooks/useRun21AppTestAccess',()=>({useRun21AppTestAccess:()=>access.allowed}));
vi.mock('@/lib/debugHarness/activeHarnessWarning',()=>({useActiveHarnessMap:()=>({})}));
afterEach(()=>{cleanup();access.allowed=false;});
describe('canonical game selector with gated Other',()=>{
  it('keeps Cards and Dice available with Run21 creation disabled',()=>{
    const select=vi.fn(),ui=render(<GameSelection onSelectGame={select} activePlayerCount={2}/>);
    expect(ui.queryByRole('tab',{name:'Other'})).toBeNull();
    fireEvent.click(ui.getByText('Holm'));expect(select).toHaveBeenLastCalledWith('holm-game');
    fireEvent.mouseDown(ui.getByRole('tab',{name:'Dice Games'}),{button:0,ctrlKey:false});
    fireEvent.click(ui.getByText('Horses'));expect(select).toHaveBeenLastCalledWith('horses');
    fireEvent.click(ui.getByText('Yahtzee'));expect(select).toHaveBeenLastCalledWith('yahtzee');
  });
  it('selects Run21 through Other only after scoped admission',()=>{
    access.allowed=true;
    const select=vi.fn(),ui=render(<GameSelection onSelectGame={select} activePlayerCount={2}/>);
    fireEvent.mouseDown(ui.getByRole('tab',{name:'Other'}),{button:0,ctrlKey:false});
    fireEvent.click(ui.getByText('Run21'));expect(select).toHaveBeenCalledWith('run21');
  });
});
