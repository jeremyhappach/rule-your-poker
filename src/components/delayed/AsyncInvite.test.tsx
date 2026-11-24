// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {findGame} from '@/lib/gameCatalog';
const mock=vi.hoisted(()=>({rpc:vi.fn(),real:true,fail:false,max:32}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:(...args:unknown[])=>mock.rpc(...args),gameName:(game:string)=>game}));
import {AsyncInvite} from './AsyncInvite';
const games=['ptown-words','run21','tri-towers','quintzee','boxdrop'];
beforeEach(()=>{mock.real=true;mock.fail=false;mock.max=32;mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string,args:any)=>{
 if(name==='delayed_capabilities')return {enabled:true,fake_money_only:!mock.real,max_children:mock.max,games:games.map(id=>({id,stake:5}))};
 if(name==='delayed_opponent_page')return {items:args.p_sort==='recent'?[{id:'b',name:'Zoe',isHuman:true},{id:'a',name:'Amy',isHuman:true}]:[{id:'a',name:'Amy',isHuman:true},{id:'b',name:'Zoe',isHuman:true}],hasMore:false,next:null};
 if(name==='delayed_create'){if(mock.fail)throw Error('Response lost');return 'match';}
});});
afterEach(cleanup);
function Path(){const location=useLocation();return <output data-testid="path">{location.pathname}</output>;}
async function mount(){render(<MemoryRouter initialEntries={['/delayed/new']}><AsyncInvite/><Path/></MemoryRouter>);await screen.findByRole('button',{name:'Run21'});}
function pick(game='ptown-words'){fireEvent.click(screen.getByRole('button',{name:game==='ptown-words'?'P-Town Words':findGame(game)!.name}));}
function ok(){fireEvent.click(screen.getByRole('button',{name:'OK'}));}
function opponent(){fireEvent.click(screen.getByRole('button',{name:'Choose Opponent'}));fireEvent.change(screen.getByLabelText('Opponent'),{target:{value:'b'}});}
const sends=()=>mock.rpc.mock.calls.filter(c=>c[0]==='delayed_create');
it('starts games first, defaults to real money and sends the exact ordered five-game payload',async()=>{
 await mount();expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(true);expect(screen.queryByLabelText('Opponent')).toBeNull();
 for(const [i,game] of games.entries()){if(i)fireEvent.click(screen.getByRole('button',{name:'Add Game'}));pick(game);expect((screen.getByLabelText('Stake '+(i+1)) as HTMLInputElement).value).toBe('5');ok();}
 opponent();expect(screen.getByText('$25')).toBeTruthy();expect(sends()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));await waitFor(()=>expect(sends()).toHaveLength(1));
 expect(sends()[0][1].p_real_money).toBe(true);expect(sends()[0][1].p_lineup).toEqual(games.map(game=>({game,stake:5})));
});
it('uses the Five Alive default and sends the edited ante unchanged',async()=>{
 const original=mock.rpc.getMockImplementation()!;
 mock.rpc.mockImplementation(async(name:string,args:any)=>name==='delayed_capabilities'
  ?{enabled:true,fake_money_only:false,max_children:32,games:[{id:'five-alive',stake:1}]}:original(name,args));
 render(<MemoryRouter><AsyncInvite userId="a"/></MemoryRouter>);
 await screen.findByRole('button',{name:'Five Alive'});pick('five-alive');
 expect((screen.getByLabelText('Stake 1') as HTMLInputElement).value).toBe('1');
 fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value:'7'}});ok();opponent();
 fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));
 await waitFor(()=>expect(sends()).toHaveLength(1));
 expect(sends()[0][1]).toMatchObject({p_real_money:true,p_lineup:[{game:'five-alive',stake:7}]});
});
it('preserves recent/alphabetical opponent ordering and the selection when games reopen',async()=>{
 await mount();pick();ok();opponent();expect(mock.rpc.mock.calls.find(c=>c[0]==='delayed_opponent_page')?.[1].p_sort).toBe('recent');
 fireEvent.click(screen.getByRole('button',{name:'Sort by username'}));await waitFor(()=>expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_opponent_page').at(-1)?.[1].p_sort).toBe('username'));
 fireEvent.click(screen.getByRole('button',{name:/Games \(1\)/}));fireEvent.click(screen.getByRole('button',{name:'Choose Opponent'}));
 expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');
});
it('copies exact entries, separates stakes, removes one copy and keeps original order',async()=>{
 await mount();pick('run21');fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value:'3'}});ok();
 fireEvent.click(screen.getByRole('button',{name:'Copy Run21, $3'}));
 fireEvent.click(screen.getByRole('button',{name:'Add Game'}));pick('run21');ok();
 expect(screen.getByText('2×')).toBeTruthy();expect(screen.getByText('1×')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Remove one Run21, $3'}));expect(screen.getByRole('button',{name:'Remove one Run21, $3'})).toBeTruthy();expect(screen.queryByText('Edit individual games or order')).toBeNull();
 opponent();expect(screen.getByText('1× $3 Run21, 1× $5 Run21')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));
 await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_lineup).toEqual([{game:'run21',stake:3},{game:'run21',stake:5}]);
});
it('Back leaves an uncommitted game out of the review and respects the child limit',async()=>{
 mock.max=1;await mount();pick('run21');fireEvent.click(screen.getByRole('button',{name:'← Back to games'}));pick('boxdrop');ok();
 expect((screen.getByRole('button',{name:'Add Game'}) as HTMLButtonElement).disabled).toBe(true);
 expect((screen.getByRole('button',{name:'Copy Boxdrop, $5'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Remove one Boxdrop, $5'}));expect(screen.queryByRole('button',{name:'Edit Boxdrop, $5'})).toBeNull();expect((screen.getByRole('button',{name:'Choose Opponent'}) as HTMLButtonElement).disabled).toBe(true);expect(sends()).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Add Game'}));pick('boxdrop');ok();
 opponent();fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_lineup).toEqual([{game:'boxdrop',stake:5}]);
});
it('keeps fake money confirmation, cancellation and established default stake reset',async()=>{
 await mount();pick();fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value:'900'}});fireEvent.click(screen.getByRole('switch'));
 expect((screen.getByLabelText('Stake 1') as HTMLInputElement).value).toBe('5');expect((screen.getByLabelText('Stake 1') as HTMLInputElement).disabled).toBe(true);ok();opponent();
 fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));expect(screen.getByRole('alertdialog')).toBeTruthy();expect(sends()).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));fireEvent.click(screen.getByRole('button',{name:'Send Fake Money Invitation'}));
 await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1]).toMatchObject({p_real_money:false,p_lineup:[{game:'ptown-words',stake:5}]});
});
it('keeps fake money usable when real admission is closed',async()=>{
 mock.real=false;await mount();expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);pick();ok();opponent();fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));fireEvent.click(screen.getByRole('button',{name:'Send Fake Money Invitation'}));await waitFor(()=>expect(sends()).toHaveLength(1));expect(sends()[0][1].p_real_money).toBe(false);
});
it.each(['0','-1','1.5','10000',''])('blocks invalid stake %s before committing a draft',async value=>{
 await mount();pick();expect(screen.queryByText('Enter a whole-number stake from 1 to 9,999.')).toBeNull();expect(screen.queryByRole('alert')).toBeNull();fireEvent.change(screen.getByLabelText('Stake 1'),{target:{value}});expect(screen.getByLabelText('Stake 1').getAttribute('aria-invalid')).toBe('true');expect(screen.getByRole('alert').textContent).toBe('Stake must be a whole number from 1 to 9,999.');expect(screen.getByLabelText('Stake 1').getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);expect((screen.getByRole('button',{name:'OK'}) as HTMLButtonElement).disabled).toBe(true);expect(sends()).toHaveLength(0);
});
it('retries lost responses with the same request and retains the chosen opponent',async()=>{
 await mount();pick();ok();opponent();mock.fail=true;fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Send Invite'}));await waitFor(()=>expect(sends()).toHaveLength(2));expect(sends()[0][1]).toEqual(sends()[1][1]);expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');
});
it('blocks repeated sends synchronously',async()=>{
 await mount();pick();ok();opponent();let reject!:(error:Error)=>void;mock.rpc.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));
 const send=screen.getByRole('button',{name:'Send Invite'});fireEvent.click(send);fireEvent.click(send);expect(sends()).toHaveLength(1);reject(Error('Retry'));await screen.findByRole('alert');expect((screen.getByLabelText('Opponent') as HTMLSelectElement).value).toBe('b');
});
