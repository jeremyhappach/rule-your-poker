import {FIVE_ALIVE_RULES} from '../../../server/fiveAlive/rules';
import type {FiveAliveGuess} from './FiveAliveBoard';

export interface FiveAliveWordResult {answer?:string;difficulty?:number;score?:number;solved?:boolean;guesses?:FiveAliveGuess[]}
export type FiveAliveRevealedWord=FiveAliveWordResult|{own:FiveAliveWordResult;opponent:FiveAliveWordResult};
export const fiveAliveTiers=['','Very Easy','Easy','Medium','Hard','Very Hard'];
export function fiveAliveBase(result:FiveAliveWordResult){return result.solved?FIVE_ALIVE_RULES.baseScores[(result.guesses?.length??1)-1]:0;}
export function fiveAliveOutcome(result:FiveAliveWordResult){const count=result.guesses?.length??0;return result.solved?`${count} ${count===1?'guess':'guesses'}`:'Failed';}
export function FiveAliveScoreLine({label,result}:{label:string;result?:FiveAliveWordResult}){
 return <p className="five-alive-score-line"><span className="five-alive-result-outcome">{label}: <span className="five-alive-result-count">{result?(result.solved?fiveAliveOutcome(result):'Failed = 0'):'Pending'}</span></span>{result?.solved&&<>
  {' '}{result.difficulty!=null&&<><span className="five-alive-result-math">= {fiveAliveBase(result).toLocaleString()} × {(FIVE_ALIVE_RULES.multipliers[result.difficulty-1]/100).toFixed(1)} {fiveAliveTiers[result.difficulty].toLowerCase()}</span>{' '}</>}
  <span className="five-alive-result-total">= {(result.score??0).toLocaleString()} points</span>
 </>}</p>;
}
export function FiveAliveResults({rounds,waiting,opponentName='Opponent',reviewedRounds}:{reviewedRounds?:number[];rounds:FiveAliveRevealedWord[];waiting?:FiveAliveWordResult;opponentName?:string}){
 const words:FiveAliveRevealedWord[]=[...rounds,...(waiting?[waiting]:[])];
 return <div className="five-alive-scorecard">{words.map((word,index)=>{
  const own='own'in word?word.own:word,opponent='opponent'in word&&(!reviewedRounds||reviewedRounds.includes(index+1))?word.opponent:undefined;
  return <section key={index} aria-label={'Word '+(index+1)}><h3>Word {index+1}</h3>
   <div className="five-alive-answer" aria-label={'Answer '+own.answer}>{[...(own.answer??'')].map((letter,i)=><span key={i}>{letter}</span>)}</div>
   {('own'in word||waiting===word)&&<FiveAliveScoreLine label={opponentName} result={opponent}/>}
   <FiveAliveScoreLine label="You" result={own}/>
  </section>;
 })}</div>;
}
