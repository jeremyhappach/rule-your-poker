// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {ReviewGate,ChildResults,MatchFinale} from './ResultReview';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
const mock=vi.hoisted(()=>({rpc:vi.fn(),change:()=>{},state:null as any,home:null as any}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:mock.rpc}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>{const c={on:(_a:any,_b:any,cb:()=>void)=>{mock.change=cb;return c;},subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
vi.mock('canvas-confetti',()=>({default:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{request:vi.fn(()=>vi.fn()),follow:vi.fn(()=>vi.fn())}}));
const event={id:'event',kind:'attempt',actor:'other',round:1,score:100,at:'2026-10-29T00:00:00Z',receipt:{game:'run21'},board:null,seen:false};
const mount=(element:React.ReactNode)=>render(<TooltipProvider><ResponsiveGeometryProvider><MemoryRouter initialEntries={['/review']}><Routes><Route path='/review' element={element}/><Route path='/delayed/match' element={<h1>Match home destination</h1>}/></Routes></MemoryRouter></ResponsiveGeometryProvider></TooltipProvider>);
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-29T15:00:00Z'));Object.defineProperty(document,'hidden',{configurable:true,value:false});Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener(){},removeEventListener(){}});global.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}} as any;
 mock.state={events:[structuredClone(event)],terminal:false,actor:'me',segment:2,revision:2,started:false,expiresAt:new Date(Date.now()+3600000).toISOString(),held:false,serverAt:Date.now()};
 mock.home={id:'match',status:'settled',organizer:'me',opponent:'other',players:[{id:'me',name:'Hap'},{id:'other',name:'Other'}],net:-5,receipt:{match_id:'match'},lineup:[{id:'child',game:'run21',stake:5,ordinal:1,terminal:true,result:{winner:'other',delta:-5}}]};
 mock.rpc.mockReset();mock.rpc.mockImplementation(async(name:string,args:any)=>{if(name==='delayed_reviews')return structuredClone(mock.state);if(name==='delayed_review_begin')return {elapsed:0,seen:false};if(name==='delayed_review_ack'){mock.state.events.find((e:any)=>e.id===args.p_event).seen=true;return;}if(name==='delayed_home'||name==='delayed_history_detail')return mock.home;});
});
afterEach(()=>{cleanup();vi.useRealTimers();});
const flush=async()=>act(async()=>{await Promise.resolve();await Promise.resolve();});
const advance=async(ms:number)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
const gate=()=> <ReviewGate childId='child' matchId='match' userId='me'>{()=> <h1>Gameplay owner</h1>}</ReviewGate>;
it('shows pending result and automatically hands off only after ACK; no Continue',async()=>{mount(gate());await flush();expect(screen.queryByText('Gameplay owner')).toBeNull();expect(screen.queryByRole('button',{name:/continue/i})).toBeNull();await advance(10100);expect(screen.getByText('Your turn!')).toBeTruthy();await advance(2100);expect(screen.getByText('Gameplay owner')).toBeTruthy();expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_ack')).toHaveLength(1);});
it('resumes an already-started attempt immediately without covering its clock',async()=>{mock.state.started=true;mount(gate());await flush();expect(screen.getByText('Gameplay owner')).toBeTruthy();expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_begin')).toBe(false);});
it('another device starting ends the reveal and hands off to the existing owner',async()=>{mount(gate());await flush();mock.state.started=true;await act(async()=>mock.change());expect(screen.getByText('Gameplay owner')).toBeTruthy();expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);});
it('expiry during reveal prevents handoff',async()=>{mount(gate());await flush();mock.state.serverAt=Date.parse(mock.state.expiresAt);await advance(10100);expect(screen.getByText('Match home destination')).toBeTruthy();expect(screen.queryByText('Gameplay owner')).toBeNull();});
it('offline presentation never acknowledges or hands off',async()=>{mount(gate());await flush();Object.defineProperty(navigator,'onLine',{configurable:true,value:false});await act(async()=>window.dispatchEvent(new Event('offline')));await advance(6000);expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);expect(screen.queryByText('Gameplay owner')).toBeNull();});
it('unmounted presentation cannot submit a delayed ACK',async()=>{const view=mount(gate());await flush();view.unmount();await advance(6000);expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);});
it('lost ACK stays pending and cannot start gameplay',async()=>{const original=mock.rpc.getMockImplementation()!;mock.rpc.mockImplementation((name,args)=>name==='delayed_review_ack'?Promise.reject(Error('lost')):original(name,args));mount(gate());await flush();await advance(10100);expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByText('Gameplay owner')).toBeNull();});
it('reduced motion completes with a visible final result, without a Continue action',async()=>{window.matchMedia=vi.fn().mockReturnValue({matches:true});mount(gate());await flush();await advance(6100);expect(screen.getByText('Your turn!')).toBeTruthy();await advance(2100);expect(screen.getByText('Gameplay owner')).toBeTruthy();});
it('losing child result has no confetti and acknowledges only after its overlay',async()=>{mock.state.terminal=true;mock.state.events=[{id:'final',kind:'child',receipt:{winner:'other'},seen:false}];const view=mount(<ChildResults childId='child' matchId='match' userId='me'/>);await flush();expect(view.container.querySelector('.async-confetti')).toBeNull();expect(screen.getByText('Game Complete')).toBeTruthy();await advance(3100);expect(screen.getByText('Other banked the $5 stake')).toBeTruthy();expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);});
it('losing match finale moves the net amount without winner confetti or financial calls',async()=>{const view=mount(<MatchFinale matchId='match' userId='me'/>);await flush();expect(view.container.querySelector('.async-confetti')).toBeNull();expect(screen.getByRole('img',{name:'Other wins the match'})).toBeTruthy();expect(mock.rpc.mock.calls.every(c=>['delayed_history_detail','delayed_finale_ack'].includes(c[0]))).toBe(true);});
it('draw finale has neither transfer nor confetti',async()=>{mock.home.net=0;const view=mount(<MatchFinale matchId='match' userId='me'/>);await flush();expect(view.container.querySelector('.async-chip-transfer')).toBeNull();expect(view.container.querySelector('.async-confetti')).toBeNull();expect(screen.getByRole('img',{name:'Match drawn'})).toBeTruthy();expect(view.container.querySelectorAll('.boxer-neutral')).toHaveLength(2);expect(view.container.querySelectorAll('.boxer-winner')).toHaveLength(0);});

it('begin failure retries begin without acknowledging an unseen result',async()=>{const original=mock.rpc.getMockImplementation()!;let failed=true;mock.rpc.mockImplementation((name,args)=>name==='delayed_review_begin'&&failed?Promise.reject(Error('lost')):original(name,args));mount(gate());await flush();await advance(6000);expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);failed=false;fireEvent.click(screen.getByRole('button',{name:'Retry'}));await flush();await advance(10100);expect(screen.getByText('Your turn!')).toBeTruthy();await advance(2100);expect(screen.getByText('Gameplay owner')).toBeTruthy();});

it('reentry resumes the persisted review and displays the final score before one ACK',async()=>{const original=mock.rpc.getMockImplementation()!;mock.rpc.mockImplementation((name,args)=>name==='delayed_review_begin'?Promise.resolve({elapsed:2500,seen:false}):original(name,args));mount(gate());await flush();expect(screen.getByText(/round 1 results/)).toBeTruthy();await advance(5700);expect(screen.getByText('Your turn!')).toBeTruthy();await advance(2100);expect(screen.getByText('Gameplay owner')).toBeTruthy();expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_review_ack')).toHaveLength(1);});
it('winner and banked stake share one completion screen; history replay does not start a game',async()=>{mock.home.net=5;mock.state.terminal=true;mock.state.events=[{id:'final',kind:'child',receipt:{winner:'me'},seen:true}];const ui=mount(<ChildResults childId='child' matchId='match' userId='me'/>);await flush();expect(ui.container.querySelector('.async-confetti')).toBeTruthy();expect(screen.getByText('Hap banked the $5 stake')).toBeTruthy();await advance(3100);expect(screen.getByText('Hap banked the $5 stake')).toBeTruthy();expect(ui.container.querySelector('.async-confetti')).toBeNull();await advance(3000);expect(mock.rpc.mock.calls.every(c=>!['delayed_commit','delayed_finalize'].includes(c[0]))).toBe(true);});
it.each([5,-12.5])('cash bag uses authoritative net %s and maps usernames to winner/loser poses',async net=>{
 mock.home.net=net;const view=mount(<MatchFinale matchId='match' userId='me'/>);await flush();
 const winner=net>0?'me':'other';expect(view.container.querySelector('.boxer-winner')?.getAttribute('data-player-id')).toBe(winner);
 expect(view.container.querySelector('.boxer-loser')?.getAttribute('data-player-id')).not.toBe(winner);
 expect(view.container.querySelector('.async-cash-label')?.textContent).toBe('$'+Math.abs(net).toLocaleString());
 expect(view.container.querySelector('.async-chip-transfer')).toBeNull();
 expect(view.container.querySelector('.async-boxing img')?.getAttribute('src')).toContain('boxing-winner-cash-v1');
 expect(mock.rpc.mock.calls.every(c=>['delayed_history_detail','delayed_finale_ack'].includes(c[0]))).toBe(true);
});
it('draw illustration has two neutral names, no cash bag, and retains both participant identities',async()=>{
 mock.home.net=0;const view=mount(<MatchFinale matchId='match' userId='me'/>);await flush();
 expect(view.container.querySelector('.async-cash-label')).toBeNull();expect(view.container.querySelector('.async-boxing img')?.getAttribute('src')).toContain('boxing-draw-v1');
 expect([...view.container.querySelectorAll('.boxer-neutral')].map(el=>el.getAttribute('data-player-id'))).toEqual(['me','other']);
});
it('reduced-motion finale retains cash amount and one review ACK without confetti',async()=>{
 window.matchMedia=vi.fn().mockReturnValue({matches:true});mock.home.net=5;const view=mount(<MatchFinale matchId='match' userId='me'/>);await flush();
 expect(view.container.querySelector('.async-cash-label')?.textContent).toBe('$5');expect(view.container.querySelector('.async-confetti')).toBeNull();
 fireEvent.load(screen.getByRole('img'));await advance(6999);expect(view.container.querySelector('.async-finale')?.getAttribute('data-phase')).toBe('ring');await advance(600);expect(view.container.querySelector('.async-finale')?.getAttribute('data-phase')).toBe('breakdown');await advance(3000);
 expect(mock.rpc.mock.calls.filter(c=>c[0]==='delayed_finale_ack')).toHaveLength(1);
});

it('round introduction precedes the saved board and never starts or acknowledges gameplay early',async()=>{
 mock.state.events[0].actorName='Hap';mount(gate());await flush();expect(screen.getByText("Hap's round 1 results")).toBeTruthy();
 expect(screen.queryByText('Historic board replay is unavailable.')).toBeNull();await advance(2999);
 expect(screen.getByText("Hap's round 1 results")).toBeTruthy();expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);
 await advance(101);expect(screen.queryByText("Hap's round 1 results")).toBeNull();expect(screen.getByText('Historic board replay is unavailable.')).toBeTruthy();
});

it.each([false,true])('boxing holds for seven seconds after image load; balance copy realMoney=%s',async realMoney=>{
 mock.home.realMoney=realMoney;const ui=mount(<MatchFinale matchId='match' userId='me'/>);await flush();await advance(12000);
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_finale_ack')).toBe(false);fireEvent.load(screen.getByRole('img'));await advance(6999);
 expect(ui.container.querySelector('.async-finale')?.getAttribute('data-phase')).toBe('ring');await advance(101);expect(ui.container.querySelector('.async-finale')?.getAttribute('data-phase')).toBe('fade');
 expect(!!screen.queryByText('Balances have been settled')).toBe(realMoney);expect(ui.container.textContent).not.toMatch(/authoritative settlement/i);
});

it('child tie is one neutral completion screen with no winner celebration',async()=>{
 mock.home.lineup[0].result={winner:null,delta:0};mock.state.terminal=true;mock.state.events=[{id:'final',kind:'child',receipt:{winner:null},seen:false}];
 const ui=mount(<ChildResults childId='child' matchId='match' userId='me'/>);await flush();expect(screen.getByText('Game Complete')).toBeTruthy();expect(screen.getByText('Tie · $0')).toBeTruthy();expect(ui.container.querySelector('.async-confetti')).toBeNull();expect(ui.container.textContent).not.toMatch(/banked|settlement/);
});

it('changing match identity waits for the new image before starting its seven-second hold',async()=>{
 function SwitchMatch(){const [id,setId]=useState('match');return <><button onClick={()=>setId('second')}>Next match</button><MatchFinale matchId={id} userId='me'/></>;}
 const ui=mount(<SwitchMatch/>);await flush();fireEvent.load(screen.getByRole('img'));await advance(5000);fireEvent.click(screen.getByText('Next match'));await flush();await advance(8000);
 expect(mock.rpc.mock.calls.some(c=>c[0]==='delayed_finale_ack')).toBe(false);fireEvent.load(screen.getByRole('img'));await advance(6999);expect(ui.container.querySelector('.async-finale')?.getAttribute('data-phase')).toBe('ring');
});
