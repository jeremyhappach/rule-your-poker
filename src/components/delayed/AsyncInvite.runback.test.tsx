// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AsyncInvite} from './AsyncInvite';
import {runbackUrl} from '@/lib/delayed/runback';
const mock=vi.hoisted(()=>({rpc:vi.fn(),home:null as any,closed:false,fail:false}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:(...args:unknown[])=>mock.rpc(...args),gameName:(game:string)=>game}));
const games=['run21','ptown-words','boxdrop'],rules=games.map(id=>({version:id+'/1',rounds:3}));
const id='158e7d85-94ec-4f7a-8738-d421d1d4cacd';
beforeEach(()=>{
 sessionStorage.clear();mock.closed=false;mock.fail=false;
 mock.home={id:'original',status:'settled',receipt:{},organizer:'me',opponent:'other',realMoney:true,opponentEligible:true,policyVersion:'delayed/1',
 players:[{id:'me',name:'Hap'},{id:'other',name:'Other'}],lineup:games.map((game,i)=>({id:'child'+i,ordinal:i+1,game,stake:[7,9,11][i],config:rules[i]}))};
 mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string)=>{
  if(name==='delayed_history_detail')return structuredClone(mock.home);
  if(name==='delayed_capabilities')return {enabled:true,fake_money_only:mock.closed,max_children:32,games:games.map((id,i)=>({id,stake:5,rules:rules[i]}))};
  if(name==='delayed_opponent_page')return {items:[{id:'replacement',name:'Replacement',isHuman:true}],hasMore:false,next:null};
  if(name==='delayed_create'){if(mock.fail)throw Error('Response lost');return 'new-match';}
 });
});
afterEach(cleanup);
function Path(){const l=useLocation();return <output data-testid="path">{l.pathname+l.search}</output>;}
async function mount(){const view=render(<MemoryRouter initialEntries={[runbackUrl('original','/?sessions=completed',id)]}><AsyncInvite userId="me"/><Path/></MemoryRouter>);await screen.findByLabelText('Stake 3');return view;}
const sends=()=>mock.rpc.mock.calls.filter(c=>c[0]==='delayed_create');
it.each([false,true])('restores exact ordered config, opponent and money/stakes (%s), opening writes nothing',async money=>{
 mock.home.realMoney=money;await mount();expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(money);
 expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('other');
 for(let i=0;i<3;i++){expect((screen.getByLabelText('Game '+(i+1)) as HTMLSelectElement).value).toBe(games[i]);expect((screen.getByLabelText('Stake '+(i+1)) as HTMLInputElement).value).toBe(String([7,9,11][i]));}
 expect(sends()).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await waitFor(()=>expect(sends()).toHaveLength(1));
 expect(sends()[0][1]).toEqual({p_request:id,p_opponent:'other',p_real_money:money,p_lineup:games.map((game,i)=>({game,stake:[7,9,11][i],config:rules[i]}))});
});
it('editing and reordering never mutates the archive and preserves stakes when switching modes',async()=>{
 const original=structuredClone(mock.home);await mount();fireEvent.click(screen.getByRole('switch'));
 expect((screen.getByLabelText('Stake 1') as HTMLInputElement).value).toBe('7');
 fireEvent.click(screen.getByRole('button',{name:'Move game 3 up'}));fireEvent.change(screen.getByLabelText('Stake 2'),{target:{value:'13'}});
 fireEvent.click(screen.getByRole('button',{name:'Remove game 1'}));fireEvent.click(screen.getByRole('button',{name:'Add game'}));
 expect(mock.home).toEqual(original);expect(sends()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_lineup[0]).toMatchObject({game:'boxdrop',stake:13,config:rules[2]});
});
it('blocks incompatible frozen config until an explicit resolution, without substituting stakes',async()=>{
 mock.home.lineup[0].config={version:'run21/removed',rounds:99};await mount();
 expect(screen.getByText(/saved run21\/removed/)).toBeTruthy();expect((screen.getByRole('button',{name:'Send Invitation'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Use current rules for game 1'}));fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));
 await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_lineup[0]).toEqual({game:'run21',stake:7,config:rules[0]});
});
it('keeps an ineligible opponent selected until a valid replacement is chosen',async()=>{
 mock.home.opponentEligible=false;await mount();expect(screen.getByText(/Other is no longer eligible/)).toBeTruthy();
 expect((screen.getByRole('button',{name:'Send Invitation'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'replacement'}});fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));
 await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_opponent).toBe('replacement');
});
it('retains real mode when closed, permits explicit fake selection and cancellation without sending',async()=>{
 mock.closed=true;await mount();expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);
 expect((screen.getByRole('button',{name:'Send Invitation'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('switch'));expect((screen.getByRole('button',{name:'Send Invitation'}) as HTMLButtonElement).disabled).toBe(false);
 fireEvent.click(screen.getByRole('link',{name:'← Cancel Run It Back'}));expect(screen.getByTestId('path').textContent).toBe('/?sessions=completed');expect(sends()).toHaveLength(0);
});
it('recovers an ambiguous send across remount with the same identity and frozen payload',async()=>{
 mock.fail=true;const first=await mount();const send=screen.getByRole('button',{name:'Send Invitation'});fireEvent.click(send);fireEvent.click(send);
 await screen.findByRole('alert');expect(sends()).toHaveLength(1);const payload=structuredClone(sends()[0][1]);first.unmount();
 await mount();expect((screen.getByLabelText('Stake 1').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 mock.fail=false;fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await waitFor(()=>expect(sends()).toHaveLength(2));expect(sends()[1][1]).toEqual(payload);
 await waitFor(()=>expect(screen.getByTestId('path').textContent).toBe('/delayed'));
});
it('new intentional archive entries receive distinct draft/request identities',()=>{
 expect(runbackUrl('original','/delayed')).not.toBe(runbackUrl('original','/delayed'));
});
it('a definite server validation rejection unlocks correction without changing the draft request ID',async()=>{
 await mount();const prior=mock.rpc.getMockImplementation()!;mock.rpc.mockImplementation(async(name,args)=>{if(name==='delayed_create')throw Error('delayed:unsupported_configuration');return prior(name,args);});
 fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));await screen.findByRole('alert');
 expect((screen.getByLabelText('Stake 1').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false);
 fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value:'15'}});mock.rpc.mockImplementation(prior);fireEvent.click(screen.getByRole('button',{name:'Send Invitation'}));
 await waitFor(()=>expect(sends()).toHaveLength(2));expect(sends()[1][1].p_request).toBe(id);expect(sends()[1][1].p_lineup[0].stake).toBe(15);
});
it('damaged saved drafts cannot silently replace missing historical rules with defaults',async()=>{
 sessionStorage.setItem('async-runback:v1:me:'+id,JSON.stringify({source:'original',realMoney:true,policyVersion:'delayed/1',opponent:{id:'other',name:'Other',isHuman:true},lineup:[{key:'one',game:'run21',stake:'7'}]}));
 render(<MemoryRouter initialEntries={[runbackUrl('original','/delayed',id)]}><AsyncInvite userId='me'/></MemoryRouter>);
 await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'Send Invitation'})).toBeNull();expect(sends()).toHaveLength(0);
});
