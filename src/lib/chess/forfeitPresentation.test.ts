import {expect,it} from 'vitest';
import {forfeitAnnouncementAt,liveForfeitElapsed} from './forfeitPresentation';
import {newChess,playChess} from './rules';
it('uses the server forfeit window and preserves other terminal timing',()=>{
 const s=newChess({mode:'live',identity:{sessionId:'m',dealerGameId:'d',roundId:'r'},backgroundId:'',players:[{id:'a',userId:'a',name:'A',seat:1,isBot:false},{id:'b',userId:'b',name:'B',seat:2,isBot:false}]},1000);
 const v={...playChess(s,'b',{type:'resign'},1000),terminal:{forfeitStartedAt:1000,startedAt:6200,deadline:9200,resultId:'result',winnerIds:['a'],score:1}};
 expect(liveForfeitElapsed(v,1760)).toBe(760);expect(forfeitAnnouncementAt(v)).toBe(4350);
 expect(liveForfeitElapsed({...v,reason:'timeout'},1760)).toBeNull();
 expect(forfeitAnnouncementAt({...v,reason:'timeout'})).toBe(6200);
 expect(liveForfeitElapsed({...v,terminal:undefined},1760)).toBeNull();
});
