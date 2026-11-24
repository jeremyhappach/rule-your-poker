// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ChessFinalReview} from './ChessFinalReview';
import {ChessFinalPosition} from './ChessHistory';
import {newChess,playChess} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
vi.mock('./ChessView',()=>({ChessView:(p:any)=><div data-read-only={p.readOnly}><ChessFinalPosition view={p.view}/>{p.announcement}{p.onContinue&&<button onClick={p.onContinue}>Continue</button>}<span data-testid="elapsed">{p.forfeitElapsed}</span></div>}));
vi.mock('react-router-dom',()=>({Link:()=>null}));
afterEach(()=>{cleanup();vi.useRealTimers();});
function ended(actor:string):ChessSnapshot{
 const state=newChess({mode:'async',identity:{sessionId:'m',dealerGameId:'c',roundId:'r'},backgroundId:'',players:[{id:'a',userId:'a',name:'Alice',seat:1,isBot:false},{id:'b',userId:'b',name:'Bob',seat:2,isBot:false}]},1000);
 return {...playChess(state,actor,{type:'resign'},1000),id:'c',viewerId:'a',revision:2,serverAt:1000,canAct:false,paused:false,pausedAt:null,finished:true,settled:true,settlement:null,financial:{}};
}
it.each(['a','b'])('automatically hands %s forfeits to normal game end after announcement',actor=>{
 vi.useFakeTimers();const next=vi.fn();render(<ChessFinalReview view={ended(actor)} matchId="m" onContinue={next}/>);
 expect(screen.getByRole('img',{name:'Saved final Chess board'})).toBeTruthy();expect(document.querySelectorAll('[data-history-square]')).toHaveLength(64);
 expect(screen.queryByText('Continue')).toBeNull();expect(screen.queryByText('FORFEIT')).toBeNull();
 act(()=>vi.advanceTimersByTime(3350));expect(screen.getByText('FORFEIT')).toBeTruthy();expect(next).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1850));expect(next).toHaveBeenCalledTimes(1);
 act(()=>vi.advanceTimersByTime(9000));expect(next).toHaveBeenCalledTimes(1);
});
it.each(['stalemate'] as const)('keeps manual final-board continuation for %s',reason=>{
 vi.useFakeTimers();const next=vi.fn();render(<ChessFinalReview view={{...ended('a'),reason}} matchId="m" onContinue={next}/>);
 expect(screen.getByRole('img',{name:'Saved final Chess board'})).toBeTruthy();expect(document.querySelectorAll('[data-history-square]')).toHaveLength(64);
 expect(document.querySelector('[data-read-only="true"]')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(10000));expect(next).not.toHaveBeenCalled();expect(screen.getByText('Continue')).toBeTruthy();
 fireEvent.click(screen.getByText('Continue'));expect(next).toHaveBeenCalledTimes(1);
});
it('does not advance a backgrounded review',()=>{
 vi.useFakeTimers();const next=vi.fn();render(<ChessFinalReview view={ended('a')} matchId="m" onContinue={next}/>);
 act(()=>vi.advanceTimersByTime(2000));
 Object.defineProperty(document,'hidden',{configurable:true,value:true});act(()=>document.dispatchEvent(new Event('visibilitychange')));
 act(()=>vi.advanceTimersByTime(10000));expect(next).not.toHaveBeenCalled();
 Object.defineProperty(document,'hidden',{configurable:true,value:false});act(()=>document.dispatchEvent(new Event('visibilitychange')));
 act(()=>vi.advanceTimersByTime(5200));expect(next).toHaveBeenCalledTimes(1);
});

it('automatically completes a visible timeout once without an extra Continue',()=>{
 vi.useFakeTimers();const next=vi.fn();render(<ChessFinalReview view={{...ended('a'),reason:'timeout'}} matchId="m" onContinue={next}/>);
 expect(screen.getByText(/Alice timed out/)).toBeTruthy();expect(screen.queryByText('Continue')).toBeNull();
 act(()=>vi.advanceTimersByTime(5200));expect(next).toHaveBeenCalledTimes(1);
 act(()=>vi.advanceTimersByTime(10000));expect(next).toHaveBeenCalledTimes(1);
});
