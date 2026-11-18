// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {FiveAliveOpponentReview} from './FiveAliveOpponentReview';
import {endAnimation} from './animationTestEvent';
const {rpc,audio}=vi.hoisted(()=>({rpc:vi.fn(),audio:vi.fn()}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:rpc}));
vi.mock('./useFiveAliveScoreAudio',()=>({useFiveAliveScoreAudio:audio}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();rpc.mockReset();audio.mockReset();});
const final={word:'APPLE',feedback:['correct','correct','correct','correct','correct'] as const};
const props={event:{id:'review',round:1,seen:false},own:{answer:'APPLE',difficulty:1,solved:true,score:800,guesses:[{...final,feedback:[...final.feedback]}]},opponent:{answer:'APPLE',difficulty:1,solved:true,score:392,guesses:[{word:'',feedback:[]},{word:'',feedback:[]},{...final,feedback:[...final.feedback]}]},prior:[0,0] as [number,number],userId:'me',onDone:vi.fn(async()=>{}),onBack:vi.fn(),onRules:vi.fn()};
async function mount(){rpc.mockResolvedValue({seen:false});return render(<FiveAliveOpponentReview {...props}/>);}
it('paces masked wrong turns, reveals only the final guess, then counts both awards and sounds on one clock before ACK',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});let frame:FrameRequestCallback=()=>{};
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(cb=>{frame=cb;return 1;});vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const view=await mount();await act(async()=>{});
 expect(screen.getByText('Opponent completed in 3')).toBeTruthy();expect(screen.getByText('You completed in 1')).toBeTruthy();
 expect(screen.getByLabelText('Guess board').textContent).toBe('•••••');
 await act(async()=>vi.advanceTimersByTime(699));expect(screen.getByLabelText('Guess board').textContent).toBe('•••••');
 await act(async()=>vi.advanceTimersByTime(1));expect(screen.getByLabelText('Guess board').textContent).toBe('••••••••••');
 await act(async()=>vi.advanceTimersByTime(700));expect(screen.getByLabelText('Guess board').textContent).toBe('••••••••••APPLE');
 for(let i=0;i<5;i++){const tile=view.container.querySelector('[data-reveal="close"]')!;expect(tile).toBeTruthy();endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');}
 expect(screen.getByText('Word scores')).toBeTruthy();
 const calls=audio.mock.calls.filter(c=>c[2]);expect(calls.slice(-2).map(c=>[c[1],c[2].startedAt,c[2].endsAt])).toEqual([['review:own',6400,7100],['review:opponent',6400,7100]]);
 act(()=>frame(6399));expect([...view.container.querySelectorAll('.five-alive-scores strong')].map(x=>x.textContent)).toEqual(['0','0']);
 expect(rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);
 act(()=>frame(6750));expect([...view.container.querySelectorAll('.five-alive-scores strong')].map(x=>x.textContent)).toEqual(['400','196']);
 await act(async()=>frame(7100));expect(rpc).toHaveBeenLastCalledWith('delayed_review_ack',{p_event:'review'});expect(props.onDone).toHaveBeenCalledTimes(1);
});
it('does not ACK an interrupted presentation and restores the pending receipt after remount',async()=>{
 const first=await mount();await act(async()=>{});expect(screen.getByText('Opponent completed in 3')).toBeTruthy();first.unmount();
 expect(rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);
 await mount();await act(async()=>{});expect(screen.getByText('Opponent completed in 3')).toBeTruthy();expect(rpc.mock.calls.filter(c=>c[0]==='delayed_review_begin')).toHaveLength(2);
});
it('skips an already-acknowledged receipt without replaying or scoring',async()=>{
 rpc.mockResolvedValue({seen:true});const done=vi.fn(async()=>{});render(<FiveAliveOpponentReview {...props} onDone={done}/>);await act(async()=>{});
 expect(done).toHaveBeenCalledTimes(1);expect(audio).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
});

it('reveals the sixth missed final guess while masking all five preceding guesses',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});rpc.mockResolvedValue({seen:false});
 const missed={...props.opponent,solved:false,score:0,guesses:[...Array.from({length:5},()=>({word:'',feedback:[]})),{word:'PLANT',feedback:['present','present','present','absent','absent'] as ('present'|'absent')[]}]};
 const view=render(<FiveAliveOpponentReview {...props} opponent={missed}/>);await act(async()=>{});await act(async()=>vi.advanceTimersByTime(3500));
 expect(screen.getByText('Opponent completed in 6')).toBeTruthy();expect(screen.getByLabelText('Guess board').textContent).toBe('•••••'.repeat(5)+'PLANT');
 for(let i=0;i<5;i++){const tile=view.container.querySelector('[data-reveal="close"]')!;endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');}
 expect([...view.container.querySelectorAll('.five-alive-row:last-child .five-alive-tile')].map(tile=>tile.getAttribute('data-color'))).toEqual(['present','present','present','absent','absent']);
 expect(screen.getByText('Opponent: 6 guesses · 0 × 0.8 = 0')).toBeTruthy();
});
