// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {endAnimation} from './animationTestEvent';
import {FiveAliveMatchWords} from './FiveAliveMatchWords';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/delayed/client',()=>({delayedRequest:request}));
afterEach(()=>{cleanup();request.mockReset();});
it('offers finished-word history from the match without beginning or acknowledging a turn',async()=>{
 const result={answer:'APPLE',solved:true,score:800,difficulty:1,guesses:[{word:'APPLE',feedback:Array(5).fill('correct')}]};
 request.mockResolvedValue({id:'child',revision:4,view:{round:2,ownFinished:2,opponentFinished:1,ownResult:{...result,answer:'WATER',solved:false,score:0,guesses:Array(6).fill({word:'STARE',feedback:[]})},revealed:[{own:result,opponent:result}]}});
 render(<FiveAliveMatchWords childId="child" userId="me" revision={4} opponentName="Hap"/>);
 expect(await screen.findByText('You: 2 of 3 finished · Hap: 1 of 3 finished')).toBeTruthy();expect(screen.queryByText(/APPLE|WATER|points/)).toBeNull();fireEvent.click(screen.getByRole('button',{name:'View Last Word'}));expect(screen.queryByLabelText('Keyboard')).toBeNull();expect(screen.getByLabelText('Guess board').textContent).toBe('STARE');for(let column=0;column<5;column++){const tile=document.querySelector('[data-reveal=close]')!;endAnimation(tile,'five-alive-flip-close');endAnimation(tile,'five-alive-flip-open');}expect(screen.getByLabelText('Guess board').textContent).toBe('STARESTARE');fireEvent.click(screen.getByRole('button',{name:'View Words'}));
 const history=within(screen.getByRole('dialog'));expect(history.getByRole('heading',{name:'Word 1'})).toBeTruthy();expect(history.getByRole('heading',{name:'Word 2'})).toBeTruthy();expect(history.getByText((_text,el)=>el?.matches('.five-alive-score-line')===true&&el.textContent==='Hap: Pending')).toBeTruthy();expect(history.getByText((_text,el)=>el?.matches('.five-alive-score-line')===true&&el.textContent==='You: Failed = 0')).toBeTruthy();
 fireEvent.click(history.getByRole('button',{name:'Close'}));expect(request).toHaveBeenCalledExactlyOnceWith({game:'five-alive',op:'state',childId:'child'});
});
