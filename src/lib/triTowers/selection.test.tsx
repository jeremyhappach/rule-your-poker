// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,cleanup} from '@testing-library/react';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
afterEach(cleanup);
describe('TriTowers catalog selection',()=>{
 it('does not expose the game before its capability permits discovery',()=>{const ui=render(<DealerGamePicker roster={{players:2,humans:2}} access={{}} onSelect={()=>{}} previousGame="tri-towers"/>);expect(ui.queryByRole('button',{name:'TriTowers'})).toBeNull();});
 it('uses the canonical ID after scoped admission',()=>{const select=vi.fn(),ui=render(<DealerGamePicker roster={{players:2,humans:2}} access={{'tri-towers':true}} onSelect={select} previousGame="tri-towers"/>);fireEvent.click(ui.getByRole('button',{name:'TriTowers'}));expect(select).toHaveBeenCalledWith('tri-towers');});
});
