// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
const mock=vi.hoisted(()=>({rpc:vi.fn(),home:{} as any,changed:()=>{}}));
vi.mock('@/hooks/useAuthGuard',()=>({useAuthGuard:()=>({user:{id:'me'},isReady:true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:(_a:any,_b:any,cb:()=>void)=>{mock.changed=cb;return c;},subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:mock.rpc,gameName:(g:string)=>g,signed:String}));
vi.mock('@/components/delayed/NotificationBell',()=>({NotificationBell:()=>null}));
vi.mock('@/components/delayed/PlayingNow',()=>({PlayingNow:()=>null}));
vi.mock('@/components/delayed/PushPreferences',()=>({PushPreferences:()=>null}));
vi.mock('@/components/delayed/DelayedTurn',()=>({DelayedTurn:()=>null}));
vi.mock('@/components/delayed/WordsTurn',()=>({WordsTurn:()=>null}));
vi.mock('@/components/delayed/ResultReview',()=>({ReviewGate:()=>null,ChildResults:()=>null,MatchFinale:()=>null}));
import Delayed from './Delayed';
beforeEach(()=>{
 mock.home={id:'match',offerHash:'frozen-offer',status:'invited',revision:1,organizer:'other',opponent:'me',realMoney:true,held:false,players:[{id:'me',name:'Viewer'},{id:'other',name:'Opponent'}],serverAt:Date.now(),createdAt:new Date().toISOString(),invitationExpiresAt:new Date(Date.now()+86400000).toISOString(),acceptedAt:null,net:0,completed:0,exposure:15,receipt:null,
 lineup:['run21','tri-towers','quintzee'].map((game,i)=>({id:'child-'+i,ordinal:i+1,game,stake:5,terminal:false,actor:i?'other':'me',expiresAt:new Date(Date.now()+3600000).toISOString(),lastCallAt:new Date(Date.now()+1800000).toISOString()}))};
 mock.rpc.mockReset();mock.rpc.mockImplementation(async name=>name==='delayed_list'?[mock.home]:name==='delayed_respond'?null:{...mock.home});
});
afterEach(cleanup);
function mount(path='/delayed/match'){return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/delayed" element={<Delayed/>}/><Route path="/delayed/:matchId" element={<Delayed/>}/><Route path="/" element={<h1>Multiplayer lobby</h1>}/></Routes></MemoryRouter>);}
const responses=()=>mock.rpc.mock.calls.filter(c=>c[0]==='delayed_respond');
it('leaves a hard-deleted invitation and refreshes the list without a cancellation alert',async()=>{
 mock.home.organizer='me';mock.home.opponent='other';let cancelled=false;
 mock.rpc.mockImplementation(async name=>{if(name==='delayed_respond'){cancelled=true;return {status:'cancelled',deleted:true};}if(name==='delayed_list')return cancelled?[]:[mock.home];return mock.home;});
 mount();fireEvent.click(await screen.findByRole('button',{name:'Cancel invitation'}));await screen.findByText('No active async matches.');
 expect(responses()[0][1].p_action).toBe('cancel');expect(screen.queryByText('Invitation cancelled')).toBeNull();
});
it('returns the recipient to the list when the pending invitation is deleted remotely',async()=>{
 mount();await screen.findByRole('button',{name:'Accept lineup and stakes'});
 mock.rpc.mockImplementation(async name=>{if(name==='delayed_list')return [];throw Error('delayed:invitation_cancelled');});
 await act(async()=>mock.changed());await screen.findByText('No active async matches.');expect(screen.queryByRole('button',{name:'Accept lineup and stakes'})).toBeNull();
});
it('requires the live warning for real money; cancel leaves the invitation pending',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'Accept lineup and stakes'}));
 expect(screen.getByRole('alertdialog')).toBeTruthy();expect(screen.getByText('This is a Real Money Game!')).toBeTruthy();
 expect(screen.getByText(/Missing a 36-hour turn deadline/)).toBeTruthy();expect(screen.getByText(/Maximum loss per player:/).textContent).toContain('$15');
 expect(responses()).toHaveLength(0);fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(responses()).toHaveLength(0);
 expect(screen.getByRole('button',{name:'Accept lineup and stakes'})).toBeTruthy();
});
it('confirms through the same offer-hash acceptance path and blocks repeat taps',async()=>{
 let resolve!:()=>void;mock.rpc.mockImplementation(async name=>name==='delayed_respond'?new Promise<void>(r=>resolve=r):{...mock.home});
 mount();fireEvent.click(await screen.findByRole('button',{name:'Accept lineup and stakes'}));const confirm=screen.getByRole('button',{name:'I Acknowledge'});
 fireEvent.click(confirm);fireEvent.click(confirm);expect(responses()).toHaveLength(1);
 expect(responses()[0][1]).toMatchObject({p_match:'match',p_offer_hash:'frozen-offer',p_action:'accept'});
 await act(async()=>resolve());
});
it('keeps the same request identity after a failed acceptance and requires confirmation again',async()=>{
 mock.rpc.mockImplementation(async name=>{if(name==='delayed_respond')throw Error('Acceptance response lost. Retry.');return {...mock.home};});
 mount();fireEvent.click(await screen.findByRole('button',{name:'Accept lineup and stakes'}));fireEvent.click(screen.getByRole('button',{name:'I Acknowledge'}));await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Accept lineup and stakes'}));fireEvent.click(screen.getByRole('button',{name:'I Acknowledge'}));
 await waitFor(()=>expect(responses()).toHaveLength(2));expect(responses()[0][1]).toEqual(responses()[1][1]);
});
it('keeps acceptance disabled until the post-response authoritative refresh completes',async()=>{
 mock.home.realMoney=false;mount();const accept=await screen.findByRole('button',{name:'Accept lineup and stakes'});
 let finish!:(value:any)=>void;mock.rpc.mockImplementation(async name=>name==='delayed_respond'?null:new Promise(r=>finish=r));
 fireEvent.click(accept);await waitFor(()=>expect(finish).toBeTypeOf('function'));
 expect((screen.getByRole('button',{name:'Working…'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(accept);expect(responses()).toHaveLength(1);
 await act(async()=>finish({...mock.home,status:'active',revision:2}));expect(screen.queryByRole('button',{name:'Accept lineup and stakes'})).toBeNull();
});
it('invalidates confirmation when the authoritative offer changes',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'Accept lineup and stakes'}));
 mock.home={...mock.home,revision:2,offerHash:'changed-offer'};await act(async()=>mock.changed());
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(responses()).toHaveLength(0);
});
it('accepts fake money directly without a green money marker or extra popup',async()=>{
 mock.home.realMoney=false;mount();fireEvent.click(await screen.findByRole('button',{name:'Accept lineup and stakes'}));
 await waitFor(()=>expect(responses()).toHaveLength(1));expect(screen.queryByRole('alertdialog')).toBeNull();expect(screen.queryByLabelText('Real money')).toBeNull();
});
it('preserves the unified parent and simultaneous child turns, pending results and timers',async()=>{
 mock.home={...mock.home,status:'active',acceptedAt:new Date().toISOString(),completed:1};
 mock.home.lineup[1].scores={me:100,other:null};mock.home.lineup[1].pendingResults={other:1};
 mock.home.lineup[2]={...mock.home.lineup[2],terminal:true,result:{delta:5,reason:'score',winner:'me'},viewed:true};
 mount();await screen.findByText('Your turn');expect(screen.getByText('Opponent’s turn')).toBeTruthy();
 expect(screen.getByText('Pending')).toBeTruthy();expect(screen.getAllByRole('link',{name:'Take Turn'})).toHaveLength(1);
 expect(document.querySelectorAll('.delayed-game-card')).toHaveLength(3);expect(document.querySelectorAll('.delayed-turn-status time')).toHaveLength(2);
 expect(screen.getByLabelText('Real money').textContent).toBe('$');
 expect(screen.getByRole('button',{name:/Quintzee.*W.*\$5/}).getAttribute('aria-expanded')).toBe('false');
});
it('keeps one lobby parent card and navigation to setup, archive and multiplayer',async()=>{
 mount('/delayed');await screen.findByRole('link',{name:/vs. Opponent/});
 expect(document.querySelectorAll('.delayed-lineup>li')).toHaveLength(1);
 expect(screen.getByRole('link',{name:'New Async Match'}).getAttribute('href')).toBe('/delayed/new');
 expect(screen.getByRole('link',{name:'Archived / Completed Sessions'}).getAttribute('href')).toBe('/?sessions=completed');
 fireEvent.click(screen.getByRole('link',{name:'Lobby'}));expect(screen.getByRole('heading',{name:'Multiplayer lobby'})).toBeTruthy();
});
