import {useCallback,useEffect,useRef,useState} from 'react';
import {delayedRpc} from '@/lib/delayed/client';
import {usePlayback,useVisible} from '@/lib/delayed/usePlayback';
import {useFiveAliveScoreAudio} from './useFiveAliveScoreAudio';
import {FiveAliveBoard,type FiveAliveGuess} from './FiveAliveBoard';
import {FiveAliveScoreLine,type FiveAliveWordResult} from './FiveAliveResults';

export interface FiveAliveWordReview {id:string;round:number;seen:boolean}
interface Props {event:FiveAliveWordReview;own:FiveAliveWordResult;opponent:FiveAliveWordResult;prior:[number,number];userId:string;onDone:()=>Promise<unknown>;onBack:()=>void;onRules:()=>void}

/** The existing Async begin/ACK receipts own completion across devices. */
export function FiveAliveOpponentReview(props:Props){
 const active=useVisible(),[ready,setReady]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),busy=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!active)return;let current=true;setReady(false);setError('');
  void delayedRpc<{seen:boolean}>('delayed_review_begin',{p_event:props.event.id}).then(value=>{
   if(!current)return;if(value.seen)void props.onDone();else setReady(true);
  }).catch(()=>{if(current)setError('Unable to restore the saved word result.');});
  return()=>{current=false;};
 },[active,props.event.id,props.onDone,retry]);
 const complete=useCallback(async()=>{
  if(busy.current||document.hidden||!navigator.onLine)return;busy.current=true;
  try{await delayedRpc('delayed_review_ack',{p_event:props.event.id});if(alive.current)await props.onDone();}
  catch{if(alive.current){busy.current=false;setError('Unable to confirm viewing. Your result is still saved.');}}
 },[props.event.id,props.onDone]);
 if(!active||!ready)return <FiveAliveBoard mode="async" round={props.event.round} score={props.prior[0]} opponentScore={props.prior[1]} current={{completed:true,waiting:true}} pending onSubmit={()=>{}} onBack={props.onBack} onRules={props.onRules} summary={<p role="status">{error||(!active?'Return online to review the saved word.':'Restoring word results…')}{error&&<button onClick={()=>setRetry(n=>n+1)}>Retry</button>}</p>}/>;
 return <ReviewPlayback {...props} onComplete={complete} error={error}/>;
}

function ReviewPlayback({event,own,opponent,prior,userId,onBack,onRules,onComplete,error}:Props&{onComplete:()=>Promise<void>;error:string}){
 const count=opponent.guesses?.length??0,play=usePlayback(Math.max(0,count-1)*700,event.id),[finalDone,setFinalDone]=useState(false),[scores,setScores]=useState<[number,number]>(prior);
 const guesses:FiveAliveGuess[]=Array.from({length:play.done?count:Math.min(count-1,Math.floor(play.elapsed/700)+1)},(_,i)=>
  i===count-1?opponent.guesses![i]:{word:'•••••',feedback:['absent','absent','absent','absent','absent']});
 const finish=useCallback(()=>setFinalDone(true),[]);
 return <FiveAliveBoard mode="async" round={event.round} score={scores[0]} opponentScore={scores[1]} current={{completed:true,guesses}} pending onSubmit={()=>{}} onBack={onBack} onRules={onRules}
  notice={<div className="five-alive-review-label" role="status"><strong>Word {event.round} results</strong><p>Opponent completed in {count}</p><p>You completed in {own.guesses?.length??0}</p></div>}
  reveal={play.done&&!finalDone?{id:event.id+':final',row:count-1}:undefined} onRevealComplete={finish}
  award={finalDone?<PairScores id={event.id} own={own} opponent={opponent} prior={prior} userId={userId} onScores={setScores} onDone={onComplete}/>:undefined}
  error={error} onReconnect={error?()=>void onComplete():undefined}/>;
}

function PairScores({id,own,opponent,prior,userId,onScores,onDone}:{id:string;own:FiveAliveWordResult;opponent:FiveAliveWordResult;prior:[number,number];userId:string;onScores:(scores:[number,number])=>void;onDone:()=>Promise<void>}){
 const [phase,setPhase]=useState<{startedAt:number;endsAt:number}|null>(null),done=useRef(false);
 useEffect(()=>{const startedAt=performance.now()+5000;setPhase({startedAt,endsAt:startedAt+700});},[id]);
 const now=performance.now();
 useFiveAliveScoreAudio(userId,phase?id+':own':null,phase?{...phase,from:prior[0],to:prior[0]+(own.score??0)}:null,now);
 useFiveAliveScoreAudio(userId,phase?id+':opponent':null,phase?{...phase,from:prior[1],to:prior[1]+(opponent.score??0)}:null,now);
 useEffect(()=>{if(!phase)return;let frame=0;const tick=(at:number)=>{
  const progress=Math.max(0,Math.min(1,(at-phase.startedAt)/700));
  onScores([prior[0]+Math.round((own.score??0)*progress),prior[1]+Math.round((opponent.score??0)*progress)]);
  if(progress<1)frame=requestAnimationFrame(tick);else if(!done.current){done.current=true;void onDone();}
 };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[phase,prior,own.score,opponent.score,onScores,onDone]);
 return <div className="five-alive-award" role="status"><h2>Word scores</h2><FiveAliveScoreLine label="Opponent" result={opponent}/><FiveAliveScoreLine label="You" result={own}/></div>;
}
