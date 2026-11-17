import {FIVE_ALIVE_RULES} from '../../../server/fiveAlive/rules';
import type {FiveAliveGuess} from './FiveAliveBoard';

export interface FiveAliveWordResult {answer?:string;difficulty?:number;score?:number;solved?:boolean;guesses?:FiveAliveGuess[]}
export type FiveAliveRevealedWord=FiveAliveWordResult|{own:FiveAliveWordResult;opponent:FiveAliveWordResult};
export const fiveAliveTiers=['','Very Easy','Easy','Medium','Hard','Very Hard'];
export function fiveAliveBase(result:FiveAliveWordResult){return result.solved?FIVE_ALIVE_RULES.baseScores[(result.guesses?.length??1)-1]:0;}
export function FiveAliveScoreLine({label,result}:{label:string;result?:FiveAliveWordResult}){
 return <p>{label}: {result?<>{result.guesses?.length??0} guesses · {fiveAliveBase(result).toLocaleString()} × {((FIVE_ALIVE_RULES.multipliers[(result.difficulty??1)-1])/100).toFixed(1)} = {(result.score??0).toLocaleString()}</>:'Waiting'}</p>;
}
export function FiveAliveResults({rounds,waiting}:{rounds:FiveAliveRevealedWord[];waiting?:FiveAliveWordResult}){
 const words:FiveAliveRevealedWord[]=[...rounds,...(waiting?[waiting]:[])];
 return <div className="five-alive-scorecard">{words.map((word,index)=>{
  const own='own'in word?word.own:word,opponent='opponent'in word?word.opponent:undefined;
  return <section key={index} aria-label={'Word '+(index+1)}><h3>Word {index+1}</h3>
   <div className="five-alive-answer" aria-label={'Answer '+own.answer}>{[...(own.answer??'')].map((letter,i)=><span key={i}>{letter}</span>)}</div>
   <strong>{fiveAliveTiers[own.difficulty??0]}</strong>
   {('own'in word||waiting===word)&&<FiveAliveScoreLine label="Opponent" result={opponent}/>}
   <FiveAliveScoreLine label="You" result={own}/>
  </section>;
 })}</div>;
}
