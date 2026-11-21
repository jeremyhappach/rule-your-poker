// @vitest-environment jsdom
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AsyncHistory} from './AsyncHistory';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/delayed/client',()=>({delayedRpc:rpc}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('shows completed lobby game quantities through the existing read projection',async()=>{
 rpc.mockImplementation(async name=>name==='delayed_history'?[{id:'match',opponent:'Other',completedAt:'2026-10-29T12:00:00Z',startedAt:'2026-10-28T12:00:00Z',count:3,net:5,realMoney:false}]:{lineup:[{game:'run21',ordinal:1},{game:'tri-towers',ordinal:2},{game:'run21',ordinal:3}]});
 render(<MemoryRouter><AsyncHistory viewerName="Hap" showGameMix/></MemoryRouter>);
 expect(await screen.findByText('2x Run21, Tri-Towers')).toBeTruthy();
 expect(rpc.mock.calls).toContainEqual(['delayed_history_detail',{p_match:'match'}]);
 expect(rpc.mock.calls.every(([name])=>['delayed_history','delayed_history_detail'].includes(name))).toBe(true);
});
it('marks real-money archived session names before their text',async()=>{
 rpc.mockResolvedValue([{id:'match',opponent:'Other',completedAt:'2026-10-29T12:00:00Z',startedAt:'2026-10-28T12:00:00Z',count:5,net:5,realMoney:true}]);
 render(<MemoryRouter><AsyncHistory viewerName="Hap"/></MemoryRouter>);
 const marker=await screen.findByLabelText('Real money');expect(marker.parentElement?.textContent).toBe('$Hap vs Other');
 expect(screen.getByText('Balances have been settled')).toBeTruthy();
});
it.each([false,true])('history route is shared and play-money receipt stays informational (balance=%s)',async balance=>{
 rpc.mockResolvedValue([{id:'match',opponent:'Other',completedAt:'2026-10-29T12:00:00Z',startedAt:'2026-10-28T12:00:00Z',count:5,net:5,realMoney:false}]);
 render(<MemoryRouter><AsyncHistory profileId='me' balance={balance} viewerName='Hap'/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('link',{name:'See Results'}).getAttribute('href')).toBe('/delayed/match?history=1'));
 expect(screen.getByText('Hap vs Other')).toBeTruthy();expect(screen.getByText('Async')).toBeTruthy();expect(screen.getByRole('link',{name:'See Results'})).toBeTruthy();expect(screen.queryByText('Balances have been settled')).toBeNull();
 expect(rpc.mock.calls.every(([name])=>name==='delayed_history')).toBe(true);
});
