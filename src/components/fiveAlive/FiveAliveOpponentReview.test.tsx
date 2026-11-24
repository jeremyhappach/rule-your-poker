// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {FiveAliveOpponentReview} from './FiveAliveOpponentReview';
import {endAnimation} from './animationTestEvent';
const {rpc,audio}=vi.hoisted(()=>({rpc:vi.fn(),audio:vi.fn()}));
vi.mock('@/lib/delayed/client',()=>({delayedRpc:rpc}));
vi.mock('./useFiveAliveScoreAudio',()=>({useFiveAliveScoreAudio:audio}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();rpc.mockReset();audio.mockReset();});
const wrong={word:'STARE',feedback:['absent','present','absent','absent','correct'] as any};
const right={word:'APPLE',feedback:Array(5).fill('correct')};
const result={answer:'APPLE',difficulty:1,solved:true,score:800,guesses:[right]};
const props={event:{id:'review',round:2,seen:false},own:result,opponent:{...result,score:392,guesses:[wrong,wrong,right]},prior:[800,490] as [number,number],userId:'me',opponentName:'Hap',onDone:vi.fn(async()=>{}),onBack:vi.fn(),onRules:vi.fn()};
function mount(opponent=props.opponent){return render(<MemoryRouter><FiveAliveOpponentReview {...props} opponent={opponent}/></MemoryRouter>);}
function row(container:HTMLElement){for(let column=0;column<5;column++){const tile=container.querySelector('[data-reveal="close"]')!;expect(tile).toBeTruthy();endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');}}
it('introduces the exact word, reveals each row, holds calculations, counts both scores then ACKs once',async()=>{
 vi.useFakeTimers();rpc.mockResolvedValue({seen:false});let frame:FrameRequestCallback=()=>{};
 vi.spyOn(window,'requestAnimationFrame').mockImplementation(cb=>{frame=cb;return 1;});vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{});
 const ui=mount();await act(async()=>{});expect(screen.getByText('Viewing Hap’s Word 2 results')).toBeTruthy();
 await act(async()=>vi.advanceTimersByTime(1800));
 expect(screen.queryByLabelText('Keyboard')).toBeNull();expect(screen.getByLabelText('Guess board').textContent).not.toContain('STARE');
 row(ui.container);expect(screen.getByLabelText('Guess board').textContent).not.toContain('STARE');
 row(ui.container);expect(screen.getByLabelText('Guess board').textContent).toBe('');
 const first=ui.container.querySelector('[data-reveal="close"]')!;endAnimation(first,'five-alive-flip-close');
 expect(screen.getByLabelText('Guess board').textContent).toBe('');endAnimation(first,'five-alive-flip-open');
 for(let i=1;i<5;i++){const tile=ui.container.querySelector('[data-reveal="close"]')!;endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');}
 expect(screen.getByLabelText('Guess board').textContent).toBe('STARE');
 expect(screen.getByText('Word scores')).toBeTruthy();const phase=audio.mock.calls.filter(c=>c[2]).at(-1)![2];
 act(()=>frame(phase.startedAt-1));expect(rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);
 await act(async()=>frame(phase.endsAt));expect([...ui.container.querySelectorAll('.five-alive-score strong')].map(el=>el.textContent)).toEqual(['1,600','882']);
 expect(rpc).toHaveBeenLastCalledWith('delayed_review_ack',{p_event:'review'});expect(props.onDone).toHaveBeenCalledTimes(1);
});
it.each([true,false])('distinguishes sixth-guess solve=%s and retains zero on a failure',async solved=>{
 vi.useFakeTimers();rpc.mockResolvedValue({seen:false});const ui=mount({...result,solved,score:solved?134:0,guesses:[...Array(5).fill(wrong),solved?right:wrong]});await act(async()=>{});await act(async()=>vi.advanceTimersByTime(1800));
 expect(screen.queryByText('Hap: '+(solved?'6 guesses':'Failed'))).toBeNull();for(let i=0;i<6;i++){expect(screen.getByLabelText('Guess board').textContent).toBe('');row(ui.container);}
 expect(screen.getByText('Hap: '+(solved?'6 guesses':'Failed'))).toBeTruthy();
 expect(screen.getByText((_text,el)=>el?.matches('.five-alive-score-line')===true&&el.textContent===(solved?'Hap: 6 guesses = 168 × 0.8 very easy = 134 points':'Hap: Failed = 0'))).toBeTruthy();
});
it('does not acknowledge interruption and skips an already seen receipt',async()=>{
 rpc.mockResolvedValue({seen:false});const ui=mount();await act(async()=>{});ui.unmount();expect(rpc.mock.calls.some(c=>c[0]==='delayed_review_ack')).toBe(false);
 rpc.mockResolvedValue({seen:true});const done=vi.fn(async()=>{});render(<FiveAliveOpponentReview {...props} onDone={done}/>);await act(async()=>{});expect(done).toHaveBeenCalledTimes(1);expect(audio).not.toHaveBeenCalled();
});
