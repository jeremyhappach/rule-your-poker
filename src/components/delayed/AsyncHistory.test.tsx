// @vitest-environment jsdom
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {AsyncHistory} from './AsyncHistory';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/delayed/client',()=>({delayedRpc:rpc}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([false,true])('history route is shared and play-money receipt stays informational (balance=%s)',async balance=>{
 rpc.mockResolvedValue([{id:'match',opponent:'Other',completedAt:'2026-10-29T12:00:00Z',startedAt:'2026-10-28T12:00:00Z',count:5,net:5,realMoney:false}]);
 render(<MemoryRouter><AsyncHistory profileId='me' balance={balance}/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('link').getAttribute('href')).toBe('/delayed/match?history=1'));
 expect(screen.getByText('Play-money result · real balance unchanged')).toBeTruthy();
 expect(rpc.mock.calls.every(([name])=>name==='delayed_history')).toBe(true);
});
