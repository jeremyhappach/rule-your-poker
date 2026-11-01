// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
const mock=vi.hoisted(()=>({rpc:vi.fn(),real:true,fail:false}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:(...args:unknown[])=>mock.rpc(...args),gameName:(game:string)=>game}));
import {AsyncInvite} from './AsyncInvite';
const games=['ptown-words','run21','tri-towers','quintzee','boxdrop'];
beforeEach(()=>{mock.real=true;mock.fail=false;mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string,args:any)=>{
 if(name==='delayed_capabilities')return {enabled:true,fake_money_only:!mock.real,max_children:32,games:games.map(id=>({id,stake:5}))};
 if(name==='delayed_opponent_page')return {items:args.p_sort==='recent'?[{id:'b',name:'Zoe',isHuman:true},{id:'a',name:'Amy',isHuman:true}]:[{id:'a',name:'Amy',isHuman:true},{id:'b',name:'Zoe',isHuman:true}],hasMore:false,next:null};
 if(name==='delayed_create'){if(mock.fail)throw Error('Response lost; retry.');return 'created';}
});});
afterEach(cleanup);
function Path(){return <output data-testid="path">{useLocation().pathname}</output>;}
async function mount(){render(<MemoryRouter initialEntries={['/delayed/new']}><AsyncInvite/><Path/></MemoryRouter>);await screen.findByRole('option',{name:'Zoe'});await screen.findByRole('option',{name:'boxdrop'});}
it('starts with recent opponents and keeps the alphabetical toggle',async()=>{
 await mount();expect(mock.rpc.mock.calls.find(c=>c[0]==='delayed_opponent_page')?.[1].p_sort).toBe('recent');
 expect([...screen.getByLabelText('Opponent').querySelectorAll('option')].map(o=>o.textContent)).toEqual(['Choose a human player','Zoe','Amy']);
 fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Sort by username'}));
 await waitFor(()=>expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_opponent_page').at(-1)?.[1].p_sort).toBe('username'));
 expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');expect(screen.getByRole('button',{name:'Sort by recent opponents'})).toBeTruthy();
});
it('requires explicit real-money selection and sends the full five-game stake directly',async()=>{
 await mount();expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
 fireEvent.click(screen.getByRole('switch',{name:'Real Money'}));
 for(let i=1;i<5;i++){fireEvent.click(screen.getByRole('button',{name:'Add game'}));fireEvent.change(screen.getByLabelText('Game '+(i+1)),{target:{value:games[i]}});}
 fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});
 expect(screen.getByText('$25')).toBeTruthy();expect(screen.queryByText('Review invitation')).toBeNull();
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_create')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await waitFor(()=>expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_create')).toBe(true));
 const args=mock.rpc.mock.calls.find(c=>c[0]==='delayed_create')![1];expect(args.p_real_money).toBe(true);expect(args.p_lineup).toEqual(games.map(game=>({game,stake:5})));
});
it('keeps play money usable when server real-money admission is closed',async()=>{
 mock.real=false;await mount();expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'a'}});fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));
 await waitFor(()=>expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_create')).toBe(true));expect(mock.rpc.mock.calls.find(c=>c[0]==='delayed_create')![1].p_real_money).toBe(false);
});
it('retries a lost real invitation response with the same request identity',async()=>{
 await mount();mock.fail=true;fireEvent.click(screen.getByRole('switch',{name:'Real Money'}));fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});
 fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await waitFor(()=>expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_create')).toHaveLength(2));
 const calls=mock.rpc.mock.calls.filter(c=>c[0]==='delayed_create');expect(calls[0][1]).toEqual(calls[1][1]);
});

it('discards edited real-money stakes when switched off and returns to the async lobby',async()=>{
 await mount();fireEvent.click(screen.getByRole('switch'));fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value:'900'}});
 fireEvent.click(screen.getByRole('switch'));expect(screen.queryByLabelText('Stake 1')).toBeNull();
 fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/delayed'));
 expect(mock.rpc.mock.calls.find(c=>c[0]==='delayed_create')![1]).toMatchObject({p_real_money:false,p_lineup:[{game:'ptown-words',stake:5}]});
});
it.each(['0','-1','1.5','10000',''])('blocks invalid stake %s inline',async value=>{
 await mount();fireEvent.click(screen.getByRole('switch'));fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});
 fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value}});
 expect(screen.getByLabelText('Stake 1').getAttribute('aria-invalid')).toBe('true');
 expect((screen.getByRole('button',{name:'Send Invitation'}) as HTMLButtonElement).disabled).toBe(true);
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_create')).toBe(false);
});
it('blocks repeat sends synchronously and retains configuration on failure',async()=>{
 await mount();fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});
 let reject!:(error:Error)=>void;mock.rpc.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));
 const send=screen.getByRole('button',{name:'Send Invitation'});fireEvent.click(send);fireEvent.click(send);
 expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_create')).toHaveLength(1);
 reject(Error('Invitation unavailable. Retry.'));await screen.findByRole('alert');
 expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');
 expect((screen.getByLabelText('Game 1') as HTMLSelectElement).value).toBe('ptown-words');
});
