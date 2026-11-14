import {expect,it,vi} from 'vitest';
import {newChess,playChess} from './rules';
import {chessOperation} from '../../../server/chess/operation';
import {chessResultText} from './result';
const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
function state(mode:'live'|'async'){return newChess({mode,identity:{sessionId:id,dealerGameId:id,roundId:id},backgroundId:'',players:[{id:'a',userId:'a',name:'Alice',seat:0,isBot:false},{id:'b',userId:'b',name:'Bob',seat:1,isBot:false}]},1000);}
it.each(['live','async'] as const)('either player may forfeit %s without moving or opening a clock',mode=>{
 for(const actor of ['a','b']){const before=state(mode),next=playChess(before,actor,{type:'resign'},2000);
 expect(next.winnerIds).toEqual([actor==='a'?'b':'a']);expect(next.reason).toBe('resignation');
 expect(next.fen).toBe(before.fen);expect(next.moves).toEqual(before.moves);expect(next.opened).toBe(before.opened);expect(next.deadline).toBe(before.deadline);
 expect(()=>playChess(before,'outsider',{type:'resign'},2000)).toThrow('chess:not_a_player');
 expect(()=>playChess(before,actor,{type:'resign'},before.deadline)).toThrow('chess:deadline');
 }
});
it('the server accepts off-turn forfeit but rejects off-turn moves and paused/stale requests',async()=>{
 const s=state('async'),row={state:s,revision:5,serverAt:2000,viewerId:'b',paused:false,pausedAt:null,finished:false,settled:false,settlement:null,financial:{}};
 const rpc=vi.fn(async(name:string,args:any)=>name==='chess_load'?row:{outcome:'committed',record:{...row,state:args.p_state,revision:6}});
 const body={op:'action',mode:'async',matchId:id,requestId,revision:5,intent:{type:'resign'}};
 expect((await chessOperation(rpc,'b',body)).winnerIds).toEqual(['a']);
 await expect(chessOperation(rpc,'b',{...body,intent:{type:'move',from:'e7',to:'e5'}})).rejects.toThrow('chess:stale_action');
 row.paused=true;await expect(chessOperation(rpc,'b',body)).rejects.toThrow('chess:stale_action');
 row.paused=false;await expect(chessOperation(rpc,'b',{...body,revision:4})).rejects.toThrow('chess:stale_action');
});
it('names the timeout or forfeit without claiming checkmate',()=>{
 const s={...state('async'),winnerIds:['b']};
 expect(chessResultText({...s,reason:'timeout'})).toBe('Alice timed out · Bob wins');
 expect(chessResultText({...s,reason:'resignation'})).toBe('Alice forfeited · Bob wins');
 expect(chessResultText({...s,reason:'checkmate'})).toBe('Checkmate · Bob wins');
});
