// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
vi.mock('./AsyncTurnStage',()=>({AsyncTurnStage:({title}:{title?:string})=><div role="status">{title??'Felt waiting'}</div>}));
import {AsyncTurnEntry} from './AsyncTurnEntry';
afterEach(cleanup);
function mount(path:string,state?:unknown){return render(<MemoryRouter initialEntries={[{pathname:path,state}]}><Routes>{['/delayed','/delayed/:matchId','/delayed/:matchId/play/:childId'].map(p=><Route key={p} path={p} element={<AsyncTurnEntry/>}/>)}</Routes></MemoryRouter>);}
it.each(['/delayed','/delayed/new','/delayed/m','/delayed/m/play/c'])('cold %s has no route hint and retains the shell',path=>{mount(path);expect(screen.getByRole('status').textContent).toBe('Felt waiting');});
it.each([null,{}, {asyncEntry:null},{asyncEntry:{}}])('list entry tolerates absent/incomplete navigation state %j',state=>{mount('/delayed',state);expect(screen.getByRole('status').textContent).toBe('Felt waiting');});
it('uses only a matching turn identity for the named review intro',()=>{mount('/delayed/m/play/c',{asyncEntry:{matchId:'m',childId:'c',reviewPending:true,opponentName:'Hap'}});expect(screen.getByText("Showing Hap's results")).toBeTruthy();});
it('does not reuse another child’s review identity',()=>{mount('/delayed/m/play/c',{asyncEntry:{matchId:'m',childId:'other',reviewPending:true,opponentName:'Hap'}});expect(screen.getByRole('status').textContent).toBe('Felt waiting');});
