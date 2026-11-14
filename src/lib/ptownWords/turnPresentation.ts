import type {WordsSnapshot} from './model';

export type WordsMove = WordsSnapshot['moves'][number];
// Only recorded provenance distinguishes a clock expiry from a voluntary pass.
export function nonWordTurn(move:WordsMove){
 if(move.action==='timeout'||move.action==='pass'&&move.reason==='timeout')return {label:'TIMED OUT',description:'timed out'};
 if(move.action==='pass')return {label:'PASS',description:'passed'};
 if(move.action==='exchange')return {label:`EXCHANGED ${move.count}`,description:`exchanged ${move.count} ${move.count===1?'tile':'tiles'}`};
 return null;
}
export function turnLabel(move:WordsMove){
 return nonWordTurn(move)?.label??(move.action==='place'?move.words.map(w=>w.word).join(', '):move.action.toUpperCase());
}
export function lastTurn(v:WordsSnapshot,playerId:string){
 const move=[...v.moves].reverse().find(m=>m.playerId===playerId);
 return move?`Last: ${turnLabel(move)}${move.action==='place'?` (${move.points})`:''}`:'';
}
