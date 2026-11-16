// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FiveAliveSession} from './FiveAliveSession';

const {request,navigate}=vi.hoisted(()=>({request:vi.fn(),navigate:vi.fn()}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}));
vi.mock('@/lib/arcade/client',()=>({arcadeRequest:request}));
vi.mock('@/lib/delayed/client',()=>({delayedRequest:request}));
vi.mock('@/lib/audio/platformAudio',()=>({platformAudio:{acquireGameplay:()=>()=>{},request:vi.fn()}}));
vi.mock('./FiveAliveAward',()=>({FiveAliveAward:({event}:{event:{word:string;points:number}})=><div data-testid="score-flight">{event.word} +{event.points}</div>}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

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

it('presents an accepted solve as a score flight',async()=>{
 request.mockResolvedValueOnce(initial).mockResolvedValueOnce({...initial,revision:2,score:800,view:{...initial.view,round:2,score:800,revealed:[{answer:'APPLE',difficulty:1,score:800,solved:true,guesses:[{word:'APPLE',feedback:['correct','correct','correct','correct','correct']}]}]}});
 render(<FiveAliveSession mode="arcade" id="run" userId="user"/>);
 await screen.findByLabelText('Keyboard');
 for(const letter of 'APPLE')fireEvent.keyDown(window,{key:letter});
 fireEvent.keyDown(window,{key:'Enter'});
 expect((await screen.findByTestId('score-flight')).textContent).toBe('APPLE +800');
});
