// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {ChessFinalReview} from './ChessFinalReview';
import {ChessFinalPosition} from './ChessHistory';
import {newChess} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
vi.mock('./ChessView',()=>({ChessView:(p:any)=><div data-read-only={p.readOnly}><ChessFinalPosition view={p.view}/>{p.reviewReady&&<button onClick={p.onContinue}>Continue</button>}</div>}));
afterEach(cleanup);
it.each(['timeout','resignation','stalemate'])('holds the saved final board until Continue for %s',reason=>{
 const next=vi.fn(),s=newChess({mode:'async',identity:{sessionId:'m',dealerGameId:'c',roundId:'r'},backgroundId:'',players:[{id:'a',userId:'a',name:'Alice',seat:0,isBot:false},{id:'b',userId:'b',name:'Bob',seat:1,isBot:false}]},1000);
 const v={...s,viewerId:'a',phase:'complete',reason,winnerIds:reason==='stalemate'?['a','b']:['b']} as ChessSnapshot;
 const ui=render(<MemoryRouter><ChessFinalReview view={v} matchId='m' onContinue={next}/></MemoryRouter>);
 expect(screen.getByRole('img',{name:'Saved final Chess board'})).toBeTruthy();expect(ui.container.querySelectorAll('[data-history-square]')).toHaveLength(64);
 if(reason==='timeout')expect(screen.getByText(/Alice timed out/)).toBeTruthy();
 expect(ui.container.querySelector('[data-read-only="true"]')).toBeTruthy();expect(next).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Continue'}));expect(next).toHaveBeenCalledOnce();
});
