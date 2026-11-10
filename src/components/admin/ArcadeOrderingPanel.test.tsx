// @vitest-environment jsdom
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,within,waitFor} from '@testing-library/react';
import {ArcadeOrderingPanel} from './ArcadeOrderingPanel';
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/arcade/lobbyLayoutClient',()=>({loadLobbyLayout:mocks.load,saveLobbyLayout:mocks.save}));
const initial={revision:4,layout:{originals:['horses-blitz','357-drop','crib-lab','chucky-showdown'],other:['run21','tri-towers','eleven-up','boxdrop','trip-flip','take-two','royal-flash','mega-card-golf','quintzee','hidden-game']}};
beforeEach(()=>{mocks.load.mockReset().mockResolvedValue(initial);mocks.save.mockReset().mockImplementation(async layout=>({layout,revision:5}));});
afterEach(cleanup);
it('stages section changes and keyboard-button moves until one explicit save',async()=>{
 render(<ArcadeOrderingPanel/>);
 const select=await screen.findByLabelText('Run21 section');
 fireEvent.change(select,{target:{value:'originals'}});
 expect(document.activeElement).toBe(screen.getByLabelText('Run21 section'));
 fireEvent.click(screen.getByRole('button',{name:'Move Run21 up'}));
 expect(mocks.save).not.toHaveBeenCalled();
 const games=within(screen.getByRole('list',{name:'P-Town Originals'})).getAllByRole('listitem');
 expect(games.map(row=>row.getAttribute('data-arcade-order-game'))).toEqual(['horses-blitz','357-drop','crib-lab','chucky-showdown','river-city-run','run21','ship-cap-voyage']);
 fireEvent.click(screen.getByRole('button',{name:'Save Arcade order'}));
 await screen.findByText('Arcade order saved.');
 expect(mocks.save).toHaveBeenCalledTimes(1);
 expect(mocks.save.mock.calls[0][1]).toBe(4);
 expect(mocks.save.mock.calls[0][0].other).toContain('hidden-game');
 expect(screen.queryByText('hidden-game')).toBeNull();
});
it('retains the draft after a failed save and requires a reload before retry',async()=>{
 mocks.save.mockRejectedValue(Error('Save was not confirmed.'));
 render(<ArcadeOrderingPanel/>);
 fireEvent.click(await screen.findByRole('button',{name:'Move Run21 down'}));
 fireEvent.click(screen.getByRole('button',{name:'Save Arcade order'}));
 await screen.findByRole('alert');
 expect((screen.getByRole('button',{name:'Save Arcade order'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Reload published order'}));
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 expect((screen.getByLabelText('Run21 section') as HTMLSelectElement).value).toBe('other');
});
