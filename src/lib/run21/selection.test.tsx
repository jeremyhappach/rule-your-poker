// @vitest-environment jsdom
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,fireEvent,cleanup} from '@testing-library/react';
import {DealerGamePicker} from '@/components/catalog/DealerGamePicker';
afterEach(cleanup);
describe('Run21 catalog selection',()=>{
 it('does not expose the game before its capability permits discovery',()=>{const ui=render(<DealerGamePicker roster={{players:2,humans:2}} access={{}} onSelect={()=>{}} previousGame="run21"/>);expect(ui.queryByRole('button',{name:'Run21'})).toBeNull();});
 it('uses the canonical ID after scoped admission',()=>{const select=vi.fn(),ui=render(<DealerGamePicker roster={{players:2,humans:2}} access={{'run21':true}} onSelect={select} previousGame="run21"/>);fireEvent.click(ui.getByRole('button',{name:'Run21'}));expect(select).toHaveBeenCalledWith('run21');});
});
