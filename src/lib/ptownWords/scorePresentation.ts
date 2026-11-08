import type {WordsSnapshot} from './model';
export const SCORE_HOLD=1000,SCORE_FLIGHT=600,SCORE_AFTER=2000;
export function scoreFrame(v:WordsSnapshot,at:number,start:number,limit=Infinity){
 const p=v.movePresentation,move=p&&v.moves.find(m=>m.turn===p.turn&&m.playerId===p.playerId&&m.action==='place');
 if(!p||!move||p.turn!==v.turn-1)return null;
 const progress=Math.max(0,Math.min(1,(at-start-SCORE_HOLD)/SCORE_FLIGHT));
 const end=Math.min(limit,start+SCORE_HOLD+SCORE_FLIGHT+SCORE_AFTER);
 const target=v.preAdjustmentScores?.[p.playerId]??v.scores[p.playerId]??0;
 return {id:`${v.identity.dealerGameId}:${v.viewerId}:${p.turn}`,playerId:p.playerId,points:move.points,progress,end,
  phase:at<start?'reveal':progress===0?'hold':progress<1?'flight':'after',
  score:progress<1?target-move.points:target,active:at<end};
}

export function lastScoredWord(v:WordsSnapshot,playerId:string){
 const move=[...v.moves].reverse().find(m=>m.playerId===playerId&&m.action==='place'&&m.points>0);
 return move?`Last: ${move.words.map(w=>w.word).join(', ')} (${move.points})`:'';
}
