// @vitest-environment jsdom
import {useEffect} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FiveAliveSession} from './FiveAliveSession';
import {endAnimation} from './animationTestEvent';
import {platformAudio} from '@/lib/audio/platformAudio';
import {fiveAliveInvalid} from './fiveAliveAudio';
vi.mock('./FiveAliveInterlude',()=>({FiveAliveIntro:({onDone}:any)=>{useEffect(onDone,[onDone]);return null;},FiveAliveFailure:({answer,onDone}:any)=><button onClick={onDone}>You failed! {answer}</button>}));

const {request,navigate,updates}=vi.hoisted(()=>({request:vi.fn(),navigate:vi.fn(),updates:[] as (()=>void)[]}));
vi.mock('@/lib/audio/presentationSound',()=>({presentSound:vi.fn()}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:request}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:request,delayedRpc:vi.fn()}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{acquireGameplay:()=>()=>{},request:vi.fn()}}));
vi.mock('./FiveAliveAward',()=>({FiveAliveAward:({event,onDone}:{event:{word:string;points:number};onDone:()=>void})=><button data-testid="score-flight" onClick={onDone}>{event.word} +{event.points}</button>}));
vi.mock('./FiveAliveOpponentReview',()=>({FiveAliveOpponentReview:({event}:{event:{id:string}})=><div data-testid="opponent-review">{event.id}</div>}));
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
 fireEvent.click(screen.getByRole('button',{name:'View Words'}));
 expect(screen.getAllByText(/You: Solved in 1 guess · 800 points/)[0]).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Close'}));
 fireEvent.click(screen.getByRole('button',{name:'View Leaderboard'}));
 expect(navigate).toHaveBeenCalledWith('/arcade/five-alive?result=run');
});

it('shows the player their private completed word while waiting',async()=>{
 request.mockResolvedValue({...initial,segment:2,view:{...initial.view,round:2,ownScore:800,opponentScore:800,current:{completed:true,waiting:true},ownResult:{answer:'APPLE',difficulty:1,score:800,solved:true,guesses:[apple]},revealed:[{own:{answer:'BREAD',score:800},opponent:{answer:'BREAD',score:800}}]}});
 render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 expect(await screen.findByText(/Waiting on opponent./)).toBeTruthy();
 expect(screen.queryByText(/APPLE · Very Easy/)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'View Words'}));expect(screen.getByLabelText('Answer APPLE')).toBeTruthy();expect(screen.getByText('Opponent: Pending')).toBeTruthy();
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
 await act(async()=>updates[0]());
 fireEvent(window,new Event('online'));
 await waitFor(()=>expect(request).toHaveBeenCalledTimes(4));
 expect(screen.getByTestId('score-flight').textContent).toBe('APPLE +800');
 expect(screen.getByText('Word 1 of 3')).toBeTruthy();
 expect(container.querySelector('.five-alive-score strong')?.textContent).toBe('0');
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
 expect([...container.querySelectorAll('.five-alive-tile')].map(tile=>tile.textContent).join('')).toBe('STONE'.repeat(6));expect(screen.getByText('+168')).toBeTruthy();expect(screen.getByText('Word 1 of 3')).toBeTruthy();
 finishTiles(container);expect(screen.getByText('Word 1 of 3')).toBeTruthy();endAnimation(container.querySelector('[data-helper=burst]')!,'five-alive-helper-burst');expect(screen.getByText('Word 2 of 3')).toBeTruthy();expect(screen.queryByTestId('score-flight')).toBeNull();
});

it('restores only own completed guesses while the opponent is sealed, then admits shared history',async()=>{
 const waiting={...initial,revision:2,segment:1,view:{...initial.view,current:{completed:true,waiting:true},ownResult:result,ownScore:0,opponentScore:0}};
 request.mockResolvedValue(waiting);
 const {container}=render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 await screen.findByText(/Waiting on opponent./);
 expect(screen.getByLabelText('Guess board').textContent).toBe('APPLE');expect(container.querySelector('[data-reveal]')).toBeNull();
 expect(screen.queryByText(/Opponent: (Solved|Failed)/)).toBeNull();expect(screen.getByRole('button',{name:'View Words'})).toBeTruthy();
 request.mockResolvedValue({...solved,revision:3,segment:2,view:{...solved.view,ownScore:800,opponentScore:0,revealed:[{own:result,opponent:{...result,solved:false,score:0,guesses:[{word:'STONE',feedback:['absent','absent','present','absent','correct']}]}}]}});
 await act(async()=>updates[0]());
 fireEvent.click(await screen.findByRole('button',{name:'View Words'}));
 expect(screen.getByText(/Opponent: Failed in 1 guess · 0 points/)).toBeTruthy();expect(screen.queryByText(/STONE/)).toBeNull();
});

it.each(['arcade','async'] as const)('shakes a rejected %s word, plays its original cue and retains the editable draft',async mode=>{
 request.mockResolvedValueOnce(initial).mockRejectedValueOnce(new Error(mode==='arcade'?'That word is not in the guess dictionary.':'delayed:invalid_guess')).mockResolvedValue(initial);
 const {container}=render(<FiveAliveSession mode={mode} id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');for(const key of 'ZZZZZ')fireEvent.keyDown(window,{key});fireEvent.keyDown(window,{key:'Enter'});
 await screen.findByText('Not in the word list. Try another word.');
 expect(container.querySelector('.five-alive-row:first-child.five-alive-invalid')).toBeTruthy();
 expect([...container.querySelectorAll('.five-alive-row:first-child .five-alive-tile')].map(tile=>tile.textContent).join('')).toBe('ZZZZZ');
 expect(screen.getByText('+1000')).toBeTruthy();expect(container.querySelector('[data-reveal]')).toBeNull();
 expect(platformAudio.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:'user',cue:fiveAliveInvalid}));
 fireEvent.keyDown(window,{key:'Backspace'});fireEvent.keyDown(window,{key:'A'});
 expect([...container.querySelectorAll('.five-alive-row:first-child .five-alive-tile')].map(tile=>tile.textContent).join('')).toBe('ZZZZA');
});

it('queues a delivered opponent review while Word Results is open, then releases it on confirmed close and restores it on reload',async()=>{
 const waiting={...initial,revision:2,segment:1,view:{...initial.view,current:{completed:true,waiting:true},ownResult:result,ownScore:0,opponentScore:0}};
 const shared={...solved,revision:3,segment:2,reviewRevision:3,wordReviews:[{id:'saved-word-review',round:1,seen:false}],view:{...solved.view,ownScore:800,opponentScore:392,revealed:[{own:result,opponent:{...result,score:392,guesses:[{word:'',feedback:[]},{word:'',feedback:[]},apple]}}]}};
 request.mockResolvedValue(waiting);
 const mounted=render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 await screen.findByText(/Waiting on opponent./);
 fireEvent.click(screen.getByRole('button',{name:/^View Words$/}));
 expect(screen.getByText('Opponent: Pending')).toBeTruthy();
 request.mockResolvedValue(shared);await act(async()=>updates[0]());
 expect(screen.getByText(/Opponent: Solved in 3 guesses/)).toBeTruthy();
 expect(screen.queryByTestId('opponent-review')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/^Close$/}));
 expect((await screen.findByTestId('opponent-review')).textContent).toBe('saved-word-review');
 mounted.unmount();
 render(<FiveAliveSession mode="async" id="run" userId="user" matchId="match"/>);
 expect((await screen.findByTestId('opponent-review')).textContent).toBe('saved-word-review');
});
