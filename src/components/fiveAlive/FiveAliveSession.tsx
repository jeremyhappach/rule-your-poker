import {useCallback,useEffect,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import {delayedRequest} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {FiveAliveBoard,type FiveAliveGuess,type FiveAliveRoundView} from './FiveAliveBoard';
import {FiveAliveAward,type FiveAliveAwardEvent} from './FiveAliveAward';
import {fiveAlivePoof} from './fiveAliveAudio';
import {platformAudio} from '@/lib/audio/platformAudio';
import '@/lib/canonicalShell/fullscreenGameShell.css';

interface Reveal {answer?:string;difficulty?:number;score?:number;solved?:boolean;guesses?:FiveAliveGuess[]}
type RevealedWord=Reveal|{own:Reveal;opponent:Reveal};
interface Snapshot {id:string;revision:number;segment?:number;status:string;terminal?:boolean;held?:boolean;score?:number;outcome?:{reason?:string;winner?:string|null}|null;
 view:{round:number;roundId?:string;score?:number;ownScore?:number;opponentScore?:number;completed:boolean;current:FiveAliveRoundView|null;ownResult?:Reveal;revealed:RevealedWord[]}}
interface Props {mode:'arcade'|'async';id:string;userId:string;matchId?:string}
interface Presentation {id:string;snapshot:Snapshot;row:number;phase:'reveal'|'award';award:FiveAliveAwardEvent|null}
const tiers=['','Very Easy','Easy','Medium','Hard','Very Hard'],multipliers=['','0.8','1.0','1.2','1.4','1.6'];
function RoundHistory({rounds}:{rounds:RevealedWord[]}){
 return <>{rounds.map((item,index)=>{const own='own'in item?item.own:item,opponent='opponent'in item?item.opponent:undefined;
  const base=(result:Reveal)=>result.solved?[1000,700,490,343,240,168][(result.guesses?.length??1)-1]:0;
  return <div className="five-alive-history-word" key={index}><strong>Word {index+1}: {own.answer} · {tiers[own.difficulty??0]} ({multipliers[own.difficulty??0]}×)</strong><span>You: {own.guesses?.map(guess=>guess.word).join(', ')} · {base(own)} base · {own.score??0} total</span>{opponent&&<span>Opponent: {opponent.guesses?.map(guess=>guess.word).join(', ')} · {base(opponent)} base · {opponent.score??0} total</span>}</div>;})}</>;
}

/** Adapter to the existing Arcade / Async API, revision and realtime owners. */
export function FiveAliveSession({mode,id,userId,matchId}:Props){
 const navigate=useNavigate(),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState('');
 const [pending,setPending]=useState(false),[connectionBlocked,setConnectionBlocked]=useState(false),[rules,setRules]=useState(false),[abandon,setAbandon]=useState(false),[history,setHistory]=useState(false);
 const [award,setAward]=useState<FiveAliveAwardEvent|null>(null),[animatedScore,setAnimatedScore]=useState<number|null>(null);
 const [submission,setSubmission]=useState<Snapshot|null>(null),[presentation,setPresentation]=useState<Presentation|null>(null);
 const presenting=useRef<Presentation|null>(null),presentationEpoch=useRef(0);
 const scoreRef=useRef<HTMLDivElement>(null);
 const latest=useRef<Snapshot|null>(null),generation=useRef(0),busy=useRef(false);
 useEffect(()=>platformAudio.acquireGameplay(),[]);
 const showPresentation=useCallback((value:Presentation|null)=>{presenting.current=value;setPresentation(value);},[]);
 const clearPresentation=useCallback(()=>{presentationEpoch.current++;showPresentation(null);setSubmission(null);setAward(null);setAnimatedScore(null);},[showPresentation]);
 const finishAward=useCallback(()=>clearPresentation(),[clearPresentation]);
 const finishReveal=useCallback((receipt:string)=>{
  const value=presenting.current;if(!value||value.id!==receipt||value.phase!=='reveal')return;
  if(value.award){showPresentation({...value,phase:'award'});setAward(value.award);}
  else clearPresentation();
 },[showPresentation,clearPresentation]);
 const wrongGuess=useCallback(()=>{if(!document.hidden)platformAudio.request({userId,id:`five-alive-poof:${id}:${crypto.randomUUID()}`,expiresAt:performance.now()+300,cue:fiveAlivePoof});},[userId,id]);
 const request=useCallback((body:Record<string,unknown>)=>mode==='arcade'
  ?arcadeRequest<Snapshot>({...body,game:'five-alive',runId:id})
  :delayedRequest<Snapshot>({...body,game:'five-alive',childId:id}),[mode,id]);
 const accept=useCallback((value:Snapshot)=>{
  if(value.id!==id)return false;
  const previous=latest.current;
  if(previous&&value.revision<previous.revision)return false;
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
  const current=latest.current;if(!current||busy.current||presenting.current||connectionBlocked||current.held||current.terminal||current.status!=='active')return false;
  busy.current=true;setPending(true);setSubmission(current);const ticket=generation.current,epoch=presentationEpoch.current;
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
      ?{id:`five-alive:${id}:${command.requestId}`,word:result.answer,difficulty:result.difficulty,base:current.view.current.nextBase,points:result.score,from:current.view.ownScore??current.view.score??current.score??0}:null;
     showPresentation({id:command.requestId,row:guesses.length-1,phase:'reveal',award,
      snapshot:{...current,view:{...current.view,current:{...result,waiting:false},ownResult:undefined}}});
    }
   }
   return admitted;
  }return false;}
  catch(e){
   if(ticket===generation.current){
    const message=e instanceof Error?e.message:'Unable to submit.';
    const recovered=await refresh();if(ticket===generation.current)setError(recovered?message:'Connection uncertain. Reconnect before playing.');
   }return false;
  }finally{if(ticket===generation.current){busy.current=false;setPending(false);setSubmission(null);}}
 },[mode,id,request,accept,refresh,connectionBlocked,showPresentation]);
 const back=()=>navigate(mode==='arcade'?'/arcade/five-alive'+(snapshot?.status==='completed'?'?result='+id:''):'/delayed/'+matchId);
 const display=presentation?.snapshot??submission??snapshot;
 const latestReveal=display?.view.revealed.at(-1);
 const ownReveal:Reveal|undefined=display?.view.ownResult??(latestReveal?('own'in latestReveal?latestReveal.own:latestReveal as Reveal):undefined);
 const opponentReveal:Reveal|undefined=!display?.view.ownResult&&latestReveal&&'opponent'in latestReveal?latestReveal.opponent:undefined;
 const current=display?.view.current?.waiting?{...display.view.current,guesses:display.view.ownResult?.guesses}:display?.view.current;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
  {display?<><FiveAliveBoard key={`${mode}:${id}:${userId}:${display.view.round}`} mode={mode} round={display.view.round} score={animatedScore??((display.view.ownScore??display.view.score??display.score??0)+(display.view.ownResult?.score??0))}
   scoreRef={scoreRef} opponentScore={display.view.opponentScore} current={current??null} pending={pending||connectionBlocked||!!display.held||!!presentation||!!award||rules||history||abandon} error={error}
   reveal={presentation?.phase==='reveal'?{id:presentation.id,row:presentation.row}:undefined} onRevealComplete={finishReveal}
   notice={ownReveal?.answer&&<div className="five-alive-last-result" role="status">{ownReveal.answer} · {tiers[ownReveal.difficulty??0]} · {multipliers[ownReveal.difficulty??0]}× · {ownReveal.score?.toLocaleString()??0} points{opponentReveal?` · Opponent ${opponentReveal.score?.toLocaleString()??0}`:''}{display.view.revealed.length>0&&<button type="button" onClick={()=>setHistory(true)}>Word results</button>}</div>}
   summary={(display.view.completed||display.terminal)&&<div className="five-alive-summary" role="status"><h2>{mode==='arcade'?'Game Over':'Match complete'}</h2>
    {mode==='async'&&display.outcome&&<p>{display.outcome.reason==='draw'?'Draw':display.outcome.winner===userId?'You won':'Opponent won'}{display.outcome.reason==='timeout_forfeit'?' · Deadline missed':''}</p>}
    <RoundHistory rounds={display.view.revealed}/>
    <button type="button" onClick={back}>{mode==='arcade'?'View Leaderboard':'Back to Match'}</button></div>}
   award={award?<FiveAliveAward key={award.id} event={award} userId={userId} target={scoreRef} onDone={finishAward} onScore={setAnimatedScore}/>:undefined}
   onReconnect={connectionBlocked?()=>{clearPresentation();void refresh();}:undefined} onWrongGuess={wrongGuess} onSubmit={word=>void act({type:'guess',word})} onBack={back} onRules={()=>setRules(true)} onAbandon={mode==='arcade'?()=>setAbandon(true):undefined}/>
  </>:<p role={error?'alert':'status'}>{error||'Restoring your game…'} {error&&<button onClick={()=>void refresh()}>Retry</button>}</p>}
  <Dialog open={rules} onOpenChange={setRules}><DialogContent><DialogTitle>Five Alive · Rules</DialogTitle><DialogDescription>Scoring and play for Five Alive.</DialogDescription>
   <p>Guess each five-letter word in six valid tries. Green marks the right letter and place; yellow marks a letter in another place; gray means that copy is absent.</p>
   <p>Base scores are 1,000, 700, 490, 343, 240 and 168. A hidden difficulty multiplier is revealed after each completed word. Three word scores make your total.</p>
  </DialogContent></Dialog>
  <Dialog open={history} onOpenChange={setHistory}><DialogContent><DialogTitle>Word results</DialogTitle><DialogDescription>Words both players have completed.</DialogDescription><RoundHistory rounds={snapshot?.view.revealed??[]}/></DialogContent></Dialog>
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon this game?</AlertDialogTitle><AlertDialogDescription>Your score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>{setAbandon(false);void act({type:'abandon'}).then(ok=>{if(ok)navigate('/arcade/five-alive');});}}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
