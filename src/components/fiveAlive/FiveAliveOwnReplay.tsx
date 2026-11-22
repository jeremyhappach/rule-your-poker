import {useCallback,useRef,useState} from 'react';
import {FiveAliveBoard} from './FiveAliveBoard';
import {FiveAliveAward} from './FiveAliveAward';
import {FiveAliveFailure} from './FiveAliveInterlude';
import {FiveAliveScoreLine,fiveAliveBase,type FiveAliveWordResult} from './FiveAliveResults';

/** Passive playback of an already permitted result. No commands, review ACKs,
 * admission, navigation to the next turn, or financial side effects. */
export function FiveAliveOwnReplay({identity,round,result,prior,opponentScore,opponentName,userId,onClose,onWords}:{
 identity:string;round:number;result:FiveAliveWordResult;prior:number;opponentScore:number;opponentName:string;userId:string;onClose:()=>void;onWords:()=>void;
}){
 const [row,setRow]=useState(0),[awardDone,setAwardDone]=useState(false),[score,setScore]=useState<number|null>(null);
 const scoreRef=useRef<HTMLDivElement>(null),count=result.guesses?.length??0,finished=row>=count;
 const finish=useCallback((receipt:string)=>{if(receipt===identity+':row:'+row)setRow(n=>n+1);},[identity,row]);
 const finishAward=useCallback(()=>setAwardDone(true),[]);
 return <FiveAliveBoard mode="async" round={round} scoreRef={scoreRef} score={score??prior+(awardDone?(result.score??0):0)} opponentScore={opponentScore} opponentName={opponentName}
  current={{completed:true,guesses:result.guesses?.slice(0,row+1)}} pending onSubmit={()=>{}} onBack={onClose}
  notice={<><strong>Your Word {round}</strong><button className="five-alive-word-results" onClick={onWords}>View Words</button>{finished&&awardDone&&<div className="five-alive-last-result"><strong>{result.answer}</strong><FiveAliveScoreLine label="You" result={result}/></div>}</>}
  reveal={!finished?{id:identity+':row:'+row,row}:undefined} onRevealComplete={finish}
  award={finished&&!awardDone?(result.solved?<FiveAliveAward event={{id:identity,word:result.answer??'',difficulty:result.difficulty??1,base:fiveAliveBase(result),points:result.score??0,guessCount:count,from:prior}} userId={userId} target={scoreRef} onDone={finishAward} onScore={setScore}/>:<FiveAliveFailure identity={identity} answer={result.answer??''} userId={userId} onDone={finishAward} replay/>):undefined}/>;
}
