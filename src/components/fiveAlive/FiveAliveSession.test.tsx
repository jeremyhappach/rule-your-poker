// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FiveAliveSession} from './FiveAliveSession';
import {endAnimation} from './animationTestEvent';

const {request,navigate,updates}=vi.hoisted(()=>({request:vi.fn(),navigate:vi.fn(),updates:[] as (()=>void)[]}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:request}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:request}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{acquireGameplay:()=>()=>{},request:vi.fn()}}));
vi.mock('./FiveAliveAward',()=>({FiveAliveAward:({event,onDone}:{event:{word:string;points:number};onDone:()=>void})=><button data-testid="score-flight" onClick={onDone}>{event.word} +{event.points}</button>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>({on(_event:unknown,_filter:unknown,callback:()=>void){updates.push(callback);return this;},subscribe(){return this;}}),removeChannel:vi.fn()}}));
afterEach(()=>{cleanup();request.mockReset();vi.clearAllMocks();updates.length=0;});

function finishTiles(container:HTMLElement){for(let i=0;i<5;i++){
 const tile=container.querySelector('[data-reveal="close"]')!;expect(tile).toBeTruthy();
 endAnimation(tile,'five-alive-flip-close');
 endAnimation(tile,'five-alive-flip-open');
}}
const apple={word:'APPLE',feedback:['correct','correct','correct','correct','correct']};
const result={answer:'APPLE',difficulty:1,score:800,solved:true,completed:true,guesses:[apple]};
const solved={id:'run',revision:2,status:'active',score:800,view:{round:2,roundId:'run:2',score:800,completed:false,current:{completed:false,guesses:[],nextBase:1000},revealed:[result]}};

const initial={id:'run',revision:1,status:'active',score:0,view:{round:1,roundId:'run:1',score:0,completed:false,current:{completed:false,guesses:[],nextBase:1000},revealed:[]}};
it('restores the playable board and keeps the timer absent',async()=>{
 request.mockResolvedValue(initial);
 render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 expect(await screen.findByLabelText('Guess board')).toBeTruthy();
 expect(screen.getByLabelText('Keyboard')).toBeTruthy();
 expect(screen.queryByText(/time remaining/i)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Rules and information'}));
 expect((screen.getByRole('button',{name:'A',hidden:true}) as HTMLButtonElement).disabled).toBe(true);
});

it('shows a completed run and returns to its leaderboard receipt',async()=>{
 request.mockResolvedValue({...initial,revision:4,status:'completed',score:800,view:{...initial.view,round:3,score:800,completed:true,current:null,revealed:[{answer:'APPLE',difficulty:1,score:800,solved:true,guesses:[{word:'APPLE',feedback:['correct','correct','correct','correct','correct']}]}]}});
 render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 expect(await screen.findByText('Game Over')).toBeTruthy();
 expect(screen.getByText(/1,?000 base/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'View Leaderboard'}));
 expect(navigate).toHaveBeenCalledWith('/arcade/five-alive?result=run');
});

it('shows the player their private completed word while waiting',async()=>{
 request.mockResolvedValue({...initial,segment:2,view:{...initial.view,round:2,ownScore:800,opponentScore:800,current:{completed:true,waiting:true},ownResult:{answer:'APPLE',difficulty:1,score:800,solved:true,guesses:[]},revealed:[{own:{answer:'BREAD',score:800},opponent:{answer:'BREAD',score:800}}]}});
 render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 expect(await screen.findByText(/Waiting for the other player/)).toBeTruthy();
 const notice=screen.getByText(/APPLE · Very Easy/);expect(notice).toBeTruthy();expect(notice.textContent).not.toContain('Opponent');
 expect(screen.queryByLabelText('Keyboard')).toBeNull();
});

it('offers reconnect inside the board after a lost connection',async()=>{
 request.mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(initial);
 render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');
 fireEvent(window,new Event('online'));
 fireEvent.click(await screen.findByRole('button',{name:'Reconnect'}));
 expect(await screen.findByLabelText('Guess board')).toBeTruthy();
});

it('reveals a correct row completely before its score flight or server-advanced next word',async()=>{
 request.mockResolvedValueOnce(initial).mockResolvedValue(solved);
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');
 for(const letter of 'APPLE')fireEvent.keyDown(window,{key:letter});
 fireEvent.keyDown(window,{key:'Enter'});
 await waitFor(()=>expect(container.querySelector('[data-reveal="close"]')).toBeTruthy());
 expect(screen.queryByTestId('score-flight')).toBeNull();expect(screen.getByText('Word 1 of 3')).toBeTruthy();
 finishTiles(container);
 expect(screen.getByTestId('score-flight').textContent).toBe('APPLE +800');
 expect(container.querySelector('.five-alive-grid')?.textContent).toBe('APPLE');
 fireEvent.click(screen.getByTestId('score-flight'));
 expect(screen.getByText('Word 2 of 3')).toBeTruthy();expect(screen.getByLabelText('Guess board').textContent).toBe('+1000');
});

it('holds realtime advancement during submission and discards an interrupted reveal on reconnect',async()=>{
 let resolveAction!:(value:unknown)=>void;
 request.mockResolvedValueOnce(initial).mockImplementationOnce(()=>new Promise(resolve=>{resolveAction=resolve;})).mockResolvedValue(solved);
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');for(const letter of 'APPLE')fireEvent.keyDown(window,{key:letter});fireEvent.keyDown(window,{key:'Enter'});
 await act(async()=>updates[0]());
 expect(screen.getByText('Word 1 of 3')).toBeTruthy();expect(screen.queryByTestId('score-flight')).toBeNull();
 expect([...container.querySelectorAll('.five-alive-tile')].every(tile=>tile.getAttribute('data-color')==='')).toBe(true);
 await act(async()=>resolveAction(solved));
 expect(container.querySelector('[data-reveal="close"]')).toBeTruthy();
 fireEvent(window,new Event('online'));
 await waitFor(()=>expect(screen.getByText('Word 2 of 3')).toBeTruthy());
 expect(container.querySelector('[data-reveal]')).toBeNull();expect(screen.queryByTestId('score-flight')).toBeNull();
});

it('restores multiple own guesses after refresh without replaying animations',async()=>{
 const guesses=[{word:'STONE',feedback:['absent','absent','present','absent','correct']},{word:'AMPLE',feedback:['correct','absent','correct','correct','correct']}];
 request.mockResolvedValue({...initial,revision:3,view:{...initial.view,current:{completed:false,nextBase:490,guesses}}});
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByText('+490');
 expect(screen.getByLabelText('Guess board').textContent).toBe('STONEAMPLE+490');
 fireEvent(window,new Event('online'));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
 expect(screen.getByLabelText('Guess board').textContent).toBe('STONEAMPLE+490');expect(container.querySelector('[data-reveal]')).toBeNull();
});

it('restores a committed guess after a lost response without replaying its reveal',async()=>{
 const guess={word:'STARE',feedback:['absent','absent','present','absent','correct']};
 request.mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error('response lost'))
  .mockResolvedValue({...initial,revision:2,view:{...initial.view,current:{completed:false,nextBase:700,guesses:[guess]}}});
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');for(const letter of 'STARE')fireEvent.keyDown(window,{key:letter});fireEvent.keyDown(window,{key:'Enter'});
 await screen.findByText('response lost');expect(screen.getByLabelText('Guess board').textContent).toBe('STARE+700');
 expect(container.querySelector('[data-reveal]')).toBeNull();expect(screen.queryByTestId('score-flight')).toBeNull();
});

it('does not animate an equal-revision conflicting response rejected by snapshot admission',async()=>{
 request.mockResolvedValueOnce(initial).mockResolvedValue({...initial,view:{...initial.view,current:{completed:false,nextBase:700,guesses:[apple]}}});
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');for(const letter of 'APPLE')fireEvent.keyDown(window,{key:letter});fireEvent.keyDown(window,{key:'Enter'});
 await screen.findByText(/State changed unexpectedly/);expect(container.querySelector('[data-reveal]')).toBeNull();
 expect([...container.querySelectorAll('.five-alive-tile')].every(tile=>tile.getAttribute('data-color')==='')).toBe(true);
});

it('keeps the sixth miss visible through all five flips before changing words',async()=>{
 const miss={word:'STONE',feedback:['absent','absent','present','absent','correct']};
 request.mockResolvedValueOnce({...initial,view:{...initial.view,current:{completed:false,nextBase:168,guesses:Array(5).fill(miss)}}})
  .mockResolvedValue({...solved,score:0,view:{...solved.view,score:0,revealed:[{...result,solved:false,score:0,guesses:Array(6).fill(miss)}]}});
 const {container}=render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByText('+168');for(const letter of 'STONE')fireEvent.keyDown(window,{key:letter});fireEvent.keyDown(window,{key:'Enter'});
 await waitFor(()=>expect(container.querySelector('[data-reveal]')).toBeTruthy());
 expect(screen.getByLabelText('Guess board').textContent).toBe('STONE'.repeat(6));expect(screen.getByText('Word 1 of 3')).toBeTruthy();
 finishTiles(container);expect(screen.getByText('Word 2 of 3')).toBeTruthy();expect(screen.queryByTestId('score-flight')).toBeNull();
});

it('restores only own completed guesses while the opponent is sealed, then admits shared history',async()=>{
 const waiting={...initial,revision:2,segment:1,view:{...initial.view,current:{completed:true,waiting:true},ownResult:result,ownScore:0,opponentScore:0}};
 request.mockResolvedValue(waiting);
 const {container}=render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 await screen.findByText(/Waiting for the other player/);
 expect(screen.getByLabelText('Guess board').textContent).toBe('APPLE');expect(container.querySelector('[data-reveal]')).toBeNull();
 expect(screen.queryByText(/Opponent:/)).toBeNull();expect(screen.queryByRole('button',{name:'Word results'})).toBeNull();
 request.mockResolvedValue({...solved,revision:3,segment:2,view:{...solved.view,ownScore:800,opponentScore:0,revealed:[{own:result,opponent:{...result,solved:false,score:0,guesses:[{word:'STONE',feedback:['absent','absent','present','absent','correct']}]}}]}});
 await act(async()=>updates[0]());
 fireEvent.click(await screen.findByRole('button',{name:'Word results'}));
 expect(screen.getByText(/Opponent: STONE/)).toBeTruthy();
});
