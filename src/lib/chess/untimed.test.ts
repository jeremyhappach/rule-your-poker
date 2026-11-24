import {expect,it} from 'vitest';
import {newChess,playChess,chessTimeout} from './rules';
const players=['a','b'].map((id,i)=>({id,userId:id,name:id,seat:i+1,isBot:false}));
it.each(['live','async'] as const)('%s untimed retains legal play, history and no deadline across turns',mode=>{
 let s=newChess({mode,players,backgroundId:'',identity:{sessionId:'s',dealerGameId:'d',roundId:'r'}},1000);
 s={...s,timingPolicy:'play-money-untimed/1',deadline:null,clockDuration:0,opened:true};
 expect(chessTimeout(s,9e12)).toEqual(s);
 expect(()=>playChess(s,'a',{type:'bank',slot:0},9e12)).toThrow('untimed');
 s=playChess(s,'a',{type:'move',from:'e2',to:'e4'},9e12);
 expect(s.deadline).toBeNull();expect(s.opened).toBe(true);expect(s.turnIndex).toBe(1);expect(s.moves).toHaveLength(1);
 expect(()=>playChess(s,'a',{type:'move',from:'e7',to:'e5'},9e12)).toThrow('not_your_turn');
 const next=playChess(s,'b',{type:'move',from:'e7',to:'e5'},9e12+10000);
 expect(next.moves[0]).toEqual(s.moves[0]);expect(next.deadline).toBeNull();expect(next.clockDuration).toBe(0);
});
