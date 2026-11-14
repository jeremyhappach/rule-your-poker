// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ChessForfeitControl} from './ChessForfeitControl';
import {newChess} from '@/lib/chess/rules';
import type {ChessSnapshot} from '@/lib/chess/client';
afterEach(cleanup);
function view(mode:'live'|'async'):ChessSnapshot{return {...newChess({mode,identity:{sessionId:'m',dealerGameId:'c',roundId:'r'},backgroundId:'',players:[{id:'a',userId:'a',name:'Alice',seat:0,isBot:false},{id:'b',userId:'b',name:'Bob',seat:1,isBot:false}]},1000),id:'c',viewerId:'b',revision:7,serverAt:1000,canAct:false,paused:false,pausedAt:null,settled:false,finished:false,settlement:null,financial:{}};}
it.each(['live','async'] as const)('requires confirmation on an opponent turn in %s',mode=>{
 const intent=vi.fn(async()=>true);render(<ChessForfeitControl view={view(mode)} connected pending={false} onIntent={intent}/>);
 fireEvent.click(screen.getByRole('button',{name:'Forfeit'}));expect(intent).not.toHaveBeenCalled();
 expect(screen.getByRole('alertdialog',{name:'Forfeit this Chess game?'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Keep playing'}));expect(intent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Forfeit'}));fireEvent.click(screen.getByRole('button',{name:'Confirm forfeit'}));
 expect(intent).toHaveBeenCalledExactlyOnceWith({type:'resign'},7);
});
it('invalidates confirmation when the authoritative revision changes',()=>{
 const intent=vi.fn(async()=>true),v=view('async');const ui=render(<ChessForfeitControl view={v} connected pending={false} onIntent={intent}/>);
 fireEvent.click(screen.getByRole('button',{name:'Forfeit'}));ui.rerender(<ChessForfeitControl view={{...v,revision:8}} connected pending={false} onIntent={intent}/>);
 expect(screen.queryByRole('alertdialog')).toBeNull();expect(intent).not.toHaveBeenCalled();
 ui.rerender(<ChessForfeitControl view={{...v,phase:'complete',settled:true}} connected pending={false} onIntent={intent}/>);
 expect(screen.queryByRole('button',{name:'Forfeit'})).toBeNull();
});
