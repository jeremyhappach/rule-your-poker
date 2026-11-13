import {it,expect,vi} from 'vitest';
import {chessOperation} from '../../../server/chess/operation';
import {newChess} from './rules';
import {CHESS_CHECKMATE_HOLD_MS,chessMoveDuration} from './timeline';
it('anchors the live checkmate hold to the trusted clock and replays the committed receipt',async()=>{
 const id='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333';
 const state=newChess({identity:{sessionId:id,dealerGameId:id,roundId:id},mode:'live',backgroundId:'',players:[{id:actor,userId:actor,name:'A',seat:0,isBot:false},{id:'black',userId:'b',name:'B',seat:1,isBot:false}]},1000,'R5bk/8/4Q1K1/8/8/8/8/8 w - - 0 1');
 const row={state,revision:0,serverAt:1000,viewerId:actor,paused:false,pausedAt:null,finished:false,settled:false,settlement:null,financial:{}};
 let committed:any;const rpc=vi.fn(async(name:string,args:any)=>{if(name==='chess_load')return row;committed=args.p_state;return {outcome:'committed',record:{...row,state:committed,revision:1}};});
 const body={op:'action',mode:'live',matchId:id,requestId,revision:0,intent:{type:'move',from:'e6',to:'g8'},readyAt:99999999};
 await chessOperation(rpc,actor,body);expect(committed.movePresentation.readyAt).toBe(1000+chessMoveDuration(committed.moves[0])+CHESS_CHECKMATE_HOLD_MS);
 const replay=vi.fn(async()=>({...row,state:committed,revision:1,receipt:{actor,fingerprint:{revision:0,intent:body.intent}}}));
 const result=await chessOperation(replay,actor,body);expect(replay).toHaveBeenCalledTimes(1);expect(result.movePresentation).toEqual(committed.movePresentation);
});
