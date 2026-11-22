// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {FiveAliveMatchWords} from './FiveAliveMatchWords';
const request=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/delayed/client',()=>({delayedRequest:request}));
afterEach(()=>{cleanup();request.mockReset();});
it('offers finished-word history from the match without beginning or acknowledging a turn',async()=>{
 const result={answer:'APPLE',solved:true,score:800,difficulty:1,guesses:[{word:'APPLE',feedback:Array(5).fill('correct')}]};
 request.mockResolvedValue({id:'child',revision:4,view:{round:2,ownFinished:2,opponentFinished:1,ownResult:{...result,answer:'WATER',solved:false,score:0,guesses:Array(6).fill({word:'STARE',feedback:[]})},revealed:[{own:result,opponent:result}]}});
 render(<FiveAliveMatchWords childId="child" revision={4} opponentName="Hap"/>);
 expect(await screen.findByText('You: 2 of 3 finished · Hap: 1 of 3 finished')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'View Words'}));
 const history=within(screen.getByRole('dialog'));expect(history.getByRole('heading',{name:'Word 1'})).toBeTruthy();expect(history.getByRole('heading',{name:'Word 2'})).toBeTruthy();expect(history.getByText('Opponent: Pending')).toBeTruthy();expect(history.getByText(/Failed in 6 guesses · 0 points/)).toBeTruthy();
 fireEvent.click(history.getByRole('button',{name:'Close'}));expect(request).toHaveBeenCalledExactlyOnceWith({game:'five-alive',op:'state',childId:'child'});
});
