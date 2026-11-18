import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import {delayedRequest} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {FiveAliveBoard,type FiveAliveGuess,type FiveAliveRoundView} from './FiveAliveBoard';
import {FiveAliveAward,type FiveAliveAwardEvent} from './FiveAliveAward';
import {FiveAliveResults,type FiveAliveWordResult,type FiveAliveRevealedWord} from './FiveAliveResults';
import {FiveAliveOpponentReview,type FiveAliveWordReview} from './FiveAliveOpponentReview';
import {fiveAlivePoof,fiveAliveBink,fiveAliveInvalid} from './fiveAliveAudio';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/lib/canonicalShell/fullscreenGameShell.css';

type Reveal=FiveAliveWordResult;
type RevealedWord=FiveAliveRevealedWord;
interface Snapshot {id:string;revision:number;reviewRevision?:number;wordReviews?:FiveAliveWordReview[];segment?:number;status:string;terminal?:boolean;held?:boolean;score?:number;outcome?:{reason?:string;winner?:string|null}|null;
 view:{round:number;roundId?:string;score?:number;ownScore?:number;opponentScore?:number;completed:boolean;current:FiveAliveRoundView|null;ownResult?:Reveal;revealed:RevealedWord[]}}
interface Props {mode:'arcade'|'async';id:string;userId:string;matchId?:string;reviewOnly?:boolean;onReviewsComplete?:()=>Promise<unknown>}
interface Presentation {id:string;snapshot:Snapshot;row:number;phase:'reveal'|'award';award:FiveAliveAwardEvent|null;helper?:{base:number;nextBase?:number}}

/** Adapter to the existing Arcade / Async API, revision and realtime owners. */
export function FiveAliveSession({mode,id,userId,matchId,reviewOnly,onReviewsComplete}:Props){
 const navigate=useNavigate(),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState('');
 const [pending,setPending]=useState(false),[connectionBlocked,setConnectionBlocked]=useState(false),[rules,setRules]=useState(false),[abandon,setAbandon]=useState(false),[history,setHistory]=useState(false);
 const [award,setAward]=useState<FiveAliveAwardEvent|null>(null),[animatedScore,setAnimatedScore]=useState<number|null>(null);
 const [submission,setSubmission]=useState<Snapshot|null>(null),[presentation,setPresentation]=useState<Presentation|null>(null);
 const [invalidAttempt,setInvalidAttempt]=useState<string>();
 const presenting=useRef<Presentation|null>(null),presentationEpoch=useRef(0);
 const scoreRef=useRef<HTMLDivElement>(null);
 const latest=useRef<Snapshot|null>(null),generation=useRef(0),busy=useRef(false);
 useEffect(()=>platformAudio.acquireGameplay(),[]);
 const showPresentation=useCallback((value:Presentation|null)=>{presenting.current=value;setPresentation(value);},[]);
 const clearPresentation=useCallback(()=>{presentationEpoch.current++;showPresentation(null);setSubmission(null);setAward(null);setAnimatedScore(null);setInvalidAttempt(undefined);},[showPresentation]);
 const finishAward=useCallback(()=>clearPresentation(),[clearPresentation]);
 const finishReveal=useCallback((receipt:string)=>{
  const value=presenting.current;if(!value||value.id!==receipt||value.phase!=='reveal')return;
  if(value.award){showPresentation({...value,phase:'award'});setAward(value.award);}
  else clearPresentation();
 },[showPresentation,clearPresentation]);
 const wrongGuess=useCallback(()=>{const receipt=presenting.current?.id;if(receipt&&!document.hidden)platformAudio.request({userId,id:`five-alive-poof:${id}:${receipt}`,expiresAt:performance.now()+600,cue:fiveAlivePoof});},[userId,id]);
 const helperDrop=useCallback(()=>{const receipt=presenting.current?.id;if(receipt&&!document.hidden)platformAudio.request({userId,id:`five-alive-bink:${id}:${receipt}`,expiresAt:performance.now()+500,cue:fiveAliveBink});},[userId,id]);
 const request=useCallback((body:Record<string,unknown>)=>mode==='arcade'
  ?arcadeRequest<Snapshot>({...body,game:'five-alive',runId:id})
  :delayedRequest<Snapshot>({...body,game:'five-alive',childId:id}),[mode,id]);
 const accept=useCallback((value:Snapshot)=>{
  if(value.id!==id)return false;
  const previous=latest.current;
  if(previous&&(value.revision<previous.revision||(value.reviewRevision??0)<(previous.reviewRevision??0)))return false;
  if(previous&&value.revision===previous.revision&&JSON.stringify(value.view)!==JSON.stringify(previous.view)){
   setError('State changed unexpectedly. Reconnect to restore your game.');return false;
  }
  latest.current=value;setSnapshot(value);setError('');setConnectionBlocked(false);return true;
 },[id]);
 const refresh=useCallback(async()=>{
  const ticket=generation.current;
  try{const value=await request({op:'state'});if(ticket===generation.current)return accept(value);}
  catch(e){if(ticket===generation.current){setConnectionBlocked(true);setError(e instanceof Error?e.message:'Unable to restore the game.');}}
  return false;
 },[request,accept]);
 useEffect(()=>{
  generation.current++;const ticket=generation.current;latest.current=null;setSnapshot(null);clearPresentation();void refresh();
  const channel=supabase.channel('five-alive:'+mode+':'+id+':'+crypto.randomUUID())
   .on('postgres_changes',{event:'*',schema:'public',table:mode==='arcade'?'arcade_revisions':'delayed_match_updates',filter:mode==='arcade'?'run_id=eq.'+id:'user_id=eq.'+userId},()=>{if(generation.current===ticket)void refresh();})
   .subscribe(status=>{if(status==='SUBSCRIBED'&&generation.current===ticket)void refresh();});
  const recover=()=>{if(presenting.current?.phase!=='award')clearPresentation();if(!document.hidden)void refresh();};
  window.addEventListener('online',recover);document.addEventListener('visibilitychange',recover);
  return()=>{if(generation.current===ticket)generation.current=ticket+1;void supabase.removeChannel(channel);window.removeEventListener('online',recover);document.removeEventListener('visibilitychange',recover);};
 },[mode,id,userId,refresh,clearPresentation]);
 const act=useCallback(async(intent:{type:'guess';word:string}|{type:'abandon'})=>{
  const current=latest.current;if(!current||busy.current||presenting.current||connectionBlocked||current.held||current.terminal||current.status!=='active'||current.wordReviews?.some(item=>!item.seen))return false;
  busy.current=true;setInvalidAttempt(undefined);setPending(true);setSubmission(current);const ticket=generation.current,epoch=presentationEpoch.current;
  const command=mode==='arcade'?{op:'action',requestId:crypto.randomUUID(),revision:current.revision,roundId:current.view.roundId,intent}
   :{op:'action',requestId:crypto.randomUUID(),revision:current.revision,segment:current.segment,intent};
  try{const value=await request(command);if(ticket===generation.current){
   const admitted=accept(value);
   if(admitted&&intent.type==='guess'&&epoch===presentationEpoch.current&&!document.hidden){
    // The server may already have advanced the word. Retain only this player's
    // committed row for presentation; latest.current remains the action authority.
    const item=value.view.revealed[current.view.round-1];
    const result=(value.view.round===current.view.round&&!value.view.completed
     ?value.view.ownResult??value.view.current
     :item&&'own'in item?item.own:item) as (Reveal&FiveAliveRoundView)|undefined;
    const prior=current.view.current?.guesses??[],guesses=result?.guesses;
    if(result&&guesses?.length===prior.length+1&&guesses.at(-1)?.word===intent.word&&JSON.stringify(guesses.slice(0,-1))===JSON.stringify(prior)){
     const award=result.solved&&result.answer&&result.difficulty&&result.score&&current.view.current?.nextBase!=null
      ?{id:`five-alive:${id}:${command.requestId}`,word:result.answer,difficulty:result.difficulty,base:current.view.current.nextBase,points:result.score,guessCount:guesses.length,from:current.view.ownScore??current.view.score??current.score??0}:null;
     showPresentation({id:command.requestId,row:guesses.length-1,phase:'reveal',award,
      helper:current.view.current?.nextBase!=null?{base:current.view.current.nextBase,nextBase:result.nextBase}:undefined,
      snapshot:{...current,view:{...current.view,current:{...result,waiting:false},ownResult:undefined}}});
    }
   }
   return admitted;
  }return false;}
  catch(e){
   if(ticket===generation.current){
    const message=e instanceof Error?e.message:'Unable to submit.';
    const recovered=await refresh();if(ticket===generation.current){
     // Arcade's existing transport translates this rejection; Async preserves its code.
     const invalid=recovered&&latest.current?.revision===current.revision&&(message==='That word is not in the guess dictionary.'||/^(arcade|delayed|five_alive):invalid_guess$/.test(message));
     setError(invalid?'Not in the word list. Try another word.':recovered?message:'Connection uncertain. Reconnect before playing.');
     if(invalid){setInvalidAttempt(command.requestId);platformAudio.request({userId,id:`five-alive-invalid:${id}:${command.requestId}`,expiresAt:performance.now()+450,cue:fiveAliveInvalid});}
    }
   }return false;
  }finally{if(ticket===generation.current){busy.current=false;setPending(false);setSubmission(null);}}
 },[mode,id,userId,request,accept,refresh,connectionBlocked,showPresentation]);
 const back=()=>navigate(mode==='arcade'?'/arcade/five-alive'+(snapshot?.status==='completed'?'?result='+id:''):'/delayed/'+matchId);
 const display=presentation?.snapshot??submission??snapshot;
 const review=mode==='async'?snapshot?.wordReviews?.find(item=>!item.seen):undefined;
 const reviewWord=review?snapshot?.view.revealed[review.round-1]:undefined;
 const reviewDone=useCallback(async()=>{await refresh();},[refresh]);
 useEffect(()=>{if(reviewOnly&&snapshot&&!review&&!presentation&&!submission)void onReviewsComplete?.();},[reviewOnly,snapshot,review,presentation,submission,onReviewsComplete]);
 const prior:[number,number]=[0,0];
 if(review)for(const word of snapshot?.view.revealed.slice(0,review.round-1)??[]){if('own'in word){prior[0]+=word.own.score??0;prior[1]+=word.opponent.score??0;}}
 const current=display?.view.current?.waiting?{...display.view.current,guesses:display.view.ownResult?.guesses}:display?.view.current;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
  {review&&reviewWord&&'own'in reviewWord&&!presentation&&!submission&&!history&&!rules?<FiveAliveOpponentReview key={review.id} event={review} own={reviewWord.own} opponent={reviewWord.opponent} prior={prior} userId={userId} onDone={reviewDone} onBack={back} onRules={()=>setRules(true)}/>:display?<><FiveAliveBoard key={`${mode}:${id}:${userId}:${display.view.round}`} mode={mode} round={display.view.round} score={animatedScore??((display.view.ownScore??display.view.score??display.score??0)+(display.view.ownResult?.score??0))}
   scoreRef={scoreRef} opponentScore={display.view.opponentScore} current={current??null} pending={pending||connectionBlocked||!!display.held||!!presentation||!!award||!!review||reviewOnly||rules||history||abandon} error={error}
   reveal={presentation?.phase==='reveal'?{id:presentation.id,row:presentation.row,helper:presentation.helper}:undefined} onRevealComplete={finishReveal} invalidAttempt={invalidAttempt} onHelperDrop={helperDrop}
   notice={(display.view.ownResult||display.view.revealed.length>0)&&<button type="button" className="five-alive-word-results" onClick={()=>setHistory(true)}>Word Results</button>}
   summary={(display.view.completed||display.terminal)&&<div className="five-alive-summary" role="status"><h2>{mode==='arcade'?'Game Over':'Match complete'}</h2>
    {mode==='async'&&display.outcome&&<p>{display.outcome.reason==='draw'?'Draw':display.outcome.winner===userId?'You won':'Opponent won'}{display.outcome.reason==='timeout_forfeit'?' · Deadline missed':''}</p>}
    <button type="button" onClick={back}>{mode==='arcade'?'View Leaderboard':'Back to Match'}</button></div>}
   award={award?<FiveAliveAward key={award.id} event={award} userId={userId} target={scoreRef} onDone={finishAward} onScore={setAnimatedScore}/>:undefined}
   onReconnect={connectionBlocked?()=>{clearPresentation();void refresh();}:undefined} onWrongGuess={wrongGuess} onSubmit={word=>void act({type:'guess',word})} onBack={back} onRules={()=>setRules(true)} onAbandon={mode==='arcade'?()=>setAbandon(true):undefined}/>
  </>:<p role={error?'alert':'status'}>{error||'Restoring your game…'} {error&&<button onClick={()=>void refresh()}>Retry</button>}</p>}
  <Dialog open={rules} onOpenChange={setRules}><DialogContent><DialogTitle>Five Alive · Rules</DialogTitle><DialogDescription>Scoring and play for Five Alive.</DialogDescription>
   <p>Guess each five-letter word in six valid tries. Green marks the right letter and place; yellow marks a letter in another place; gray means that copy is absent.</p>
   <p>Base scores are 1,000, 700, 490, 343, 240 and 168. A hidden difficulty multiplier is revealed after each completed word. Three word scores make your total.</p>
  </DialogContent></Dialog>
  <Dialog open={history} onOpenChange={setHistory}><DialogContent><DialogTitle>Word Results</DialogTitle><DialogDescription>Completed words and scores. Opponent results remain sealed until both finish.</DialogDescription><FiveAliveResults rounds={snapshot?.view.revealed??[]} waiting={snapshot?.view.ownResult}/></DialogContent></Dialog>
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon this game?</AlertDialogTitle><AlertDialogDescription>Your score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>{setAbandon(false);void act({type:'abandon'}).then(ok=>{if(ok)navigate('/arcade/five-alive');});}}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
