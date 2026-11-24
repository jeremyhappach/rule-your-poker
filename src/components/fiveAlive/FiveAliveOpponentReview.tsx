import {useCallback,useEffect,useRef,useState} from 'react';
import {delayedRpc} from '@/lib/delayed/client';
import {useVisible} from '@/lib/delayed/usePlayback';
import {useFiveAliveScoreAudio} from './useFiveAliveScoreAudio';
import {FiveAliveBoard,type FiveAliveGuess} from './FiveAliveBoard';
import {FiveAliveScoreLine,fiveAliveOutcome,type FiveAliveWordResult} from './FiveAliveResults';
import {FiveAliveIntro} from './FiveAliveInterlude';

export interface FiveAliveWordReview {id:string;round:number;seen:boolean}
interface Props {scoreAfter?:[number,number];event:FiveAliveWordReview;own:FiveAliveWordResult;opponent:FiveAliveWordResult;prior:[number,number];userId:string;matchId?:string;opponentName?:string;onDone:()=>Promise<unknown>;onBack:()=>void;onRules:()=>void}

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

function ReviewPlayback({scoreAfter,event,own,opponent,prior,userId,matchId,opponentName='Opponent',onBack,onRules,onComplete,error}:Props&{onComplete:()=>Promise<void>;error:string}){
 const count=opponent.guesses?.length??0,[introduced,setIntroduced]=useState(false),[row,setRow]=useState(0),[scores,setScores]=useState<[number,number]>(prior);
 const finalDone=row>=count;
 const guesses:FiveAliveGuess[]=(opponent.guesses??[]).slice(0,row+1).map((guess,index)=>({
  word:finalDone&&opponent.solved&&index===count-1?guess.word:'',
  feedback:guess.feedback,
 }));
 const finish=useCallback((receipt:string)=>{if(receipt===event.id+':row:'+row)setRow(value=>value+1);},[event.id,row]);
 const finishIntro=useCallback(()=>setIntroduced(true),[]);
 if(!introduced)return <FiveAliveIntro identity={event.id+':intro'} title={`Viewing ${opponentName}’s Word ${event.round} results`} matchId={matchId} userId={userId} onDone={finishIntro}/>;
 return <FiveAliveBoard mode="async" opponentReview round={event.round} score={scores[0]} opponentScore={scores[1]} opponentName={opponentName} current={{completed:true,guesses}} pending onSubmit={()=>{}} onBack={onBack} onRules={onRules}
  notice={<div className="five-alive-review-label" role="status"><strong>Word {event.round} results</strong><p>{opponentName}: {finalDone?fiveAliveOutcome(opponent):'Revealing…'}</p><p>You: {fiveAliveOutcome(own)}</p></div>}
  reveal={!finalDone?{id:event.id+':row:'+row,row}:undefined} onRevealComplete={finish}
  award={finalDone?<PairScores scoreAfter={scoreAfter} opponentName={opponentName} id={event.id} own={own} opponent={opponent} prior={prior} userId={userId} onScores={setScores} onDone={onComplete}/>:undefined}
  error={error} onReconnect={error?()=>void onComplete():undefined}/>;
}

function PairScores({scoreAfter,id,own,opponent,prior,userId,opponentName,onScores,onDone}:{scoreAfter?:[number,number];opponentName:string;id:string;own:FiveAliveWordResult;opponent:FiveAliveWordResult;prior:[number,number];userId:string;onScores:(scores:[number,number])=>void;onDone:()=>Promise<void>}){
 const [phase,setPhase]=useState<{startedAt:number;endsAt:number}|null>(null),done=useRef(false);
 const awards=useRef<HTMLDivElement>(null);
 useEffect(()=>{const startedAt=performance.now()+5000;setPhase({startedAt,endsAt:startedAt+700});},[id]);
 const now=performance.now();
 useFiveAliveScoreAudio(userId,phase?id+':own':null,phase?{...phase,from:prior[0],to:scoreAfter?.[0]??prior[0]+(own.score??0)}:null,now);
 useFiveAliveScoreAudio(userId,phase?id+':opponent':null,phase?{...phase,from:prior[1],to:scoreAfter?.[1]??prior[1]+(opponent.score??0)}:null,now);
 useEffect(()=>{if(!phase||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const root=awards.current,targets=root?.closest('.five-alive')?.querySelectorAll('.five-alive-score'),animations:Animation[]=[];
  root?.querySelectorAll<HTMLElement>('[data-award-points]').forEach((element,index)=>{const target=targets?.[index];if(!target||!element.animate)return;
   const from=element.getBoundingClientRect(),to=target.getBoundingClientRect();
   animations.push(element.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(.3)`,opacity:0}],{delay:Math.max(0,phase.startedAt-performance.now()),duration:600,fill:'forwards',easing:'ease-in'}));
  });return()=>animations.forEach(animation=>animation.cancel());
 },[phase]);
 useEffect(()=>{if(!phase)return;let frame=0;const tick=(at:number)=>{
  const progress=Math.max(0,Math.min(1,(at-phase.startedAt)/700));
  onScores([prior[0]+Math.round(((scoreAfter?.[0]??prior[0]+(own.score??0))-prior[0])*progress),prior[1]+Math.round(((scoreAfter?.[1]??prior[1]+(opponent.score??0))-prior[1])*progress)]);
  if(progress<1)frame=requestAnimationFrame(tick);else if(!done.current){done.current=true;void onDone();}
 };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[phase,prior,own.score,opponent.score,onScores,onDone]);
 return <div className="five-alive-award" role="status" ref={awards}><h2>Word scores</h2><FiveAliveScoreLine label="You" result={own}/><strong data-award-points>+{own.score??0}</strong><FiveAliveScoreLine label={opponentName} result={opponent}/><strong data-award-points>+{opponent.score??0}</strong></div>;
}
