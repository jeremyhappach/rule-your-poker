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
 const [miss,setMiss]=useState<FiveAliveGuess|null>(null);
 const scoreRef=useRef<HTMLDivElement>(null);
 const latest=useRef<Snapshot|null>(null),generation=useRef(0),busy=useRef(false);
 useEffect(()=>platformAudio.acquireGameplay(),[]);
 const finishAward=useCallback(()=>setAward(null),[]);
 const wrongGuess=useCallback(()=>{if(!document.hidden)platformAudio.request({userId,id:`five-alive-poof:${id}:${crypto.randomUUID()}`,expiresAt:performance.now()+300,cue:fiveAlivePoof});},[userId,id]);
 const request=useCallback((body:Record<string,unknown>)=>mode==='arcade'
  ?arcadeRequest<Snapshot>({...body,game:'five-alive',runId:id})
  :delayedRequest<Snapshot>({...body,game:'five-alive',childId:id}),[mode,id]);
 const accept=useCallback((value:Snapshot)=>{
  if(value.id!==id)return;
  const previous=latest.current;
  if(previous&&value.revision<previous.revision)return;
  if(previous&&value.revision===previous.revision&&JSON.stringify(value.view)!==JSON.stringify(previous.view)){
   setError('State changed unexpectedly. Reconnect to restore your game.');return;
  }
  latest.current=value;setSnapshot(value);setError('');setConnectionBlocked(false);
 },[id]);
 const refresh=useCallback(async()=>{
  const ticket=generation.current;
  try{const value=await request({op:'state'});if(ticket===generation.current){accept(value);return true;}}
  catch(e){if(ticket===generation.current){setConnectionBlocked(true);setError(e instanceof Error?e.message:'Unable to restore the game.');}}
  return false;
 },[request,accept]);
 useEffect(()=>{
  generation.current++;const ticket=generation.current;latest.current=null;setSnapshot(null);void refresh();
  const channel=supabase.channel('five-alive:'+mode+':'+id+':'+crypto.randomUUID())
   .on('postgres_changes',{event:'*',schema:'public',table:mode==='arcade'?'arcade_revisions':'delayed_match_updates',filter:mode==='arcade'?'run_id=eq.'+id:'user_id=eq.'+userId},()=>{if(generation.current===ticket)void refresh();})
   .subscribe(status=>{if(status==='SUBSCRIBED'&&generation.current===ticket)void refresh();});
  const recover=()=>{if(!document.hidden)void refresh();};
  window.addEventListener('online',recover);document.addEventListener('visibilitychange',recover);
  return()=>{if(generation.current===ticket)generation.current=ticket+1;void supabase.removeChannel(channel);window.removeEventListener('online',recover);document.removeEventListener('visibilitychange',recover);};
 },[mode,id,userId,refresh]);
 const act=useCallback(async(intent:{type:'guess';word:string}|{type:'abandon'})=>{
  const current=latest.current;if(!current||busy.current||connectionBlocked||current.held||current.terminal||current.status!=='active')return false;
  busy.current=true;setPending(true);const ticket=generation.current;
  const command=mode==='arcade'?{op:'action',requestId:crypto.randomUUID(),revision:current.revision,roundId:current.view.roundId,intent}
   :{op:'action',requestId:crypto.randomUUID(),revision:current.revision,segment:current.segment,intent};
  try{const value=await request(command);if(ticket===generation.current){
   if(intent.type==='guess'&&!document.hidden){
    const item=value.view.revealed[current.view.revealed.length];
    const result=value.view.ownResult??(item&&'own'in item?item.own:item as Reveal|undefined);
    if(result?.solved&&result.answer&&result.difficulty&&result.score){
     setAward({id:`five-alive:${id}:${command.requestId}`,word:result.answer,difficulty:result.difficulty,points:result.score,from:current.view.ownScore??current.view.score??current.score??0});
    }else if(result?.solved===false&&result.guesses?.length){
     setMiss(result.guesses[result.guesses.length-1]);wrongGuess();
    }
   }
   accept(value);return true;
  }return false;}
  catch(e){
   if(ticket===generation.current){
    const message=e instanceof Error?e.message:'Unable to submit.';
    const recovered=await refresh();if(ticket===generation.current)setError(recovered?message:'Connection uncertain. Reconnect before playing.');
   }return false;
  }finally{if(ticket===generation.current){busy.current=false;setPending(false);}}
 },[mode,id,request,accept,refresh,connectionBlocked,wrongGuess]);
 const back=()=>navigate(mode==='arcade'?'/arcade/five-alive'+(snapshot?.status==='completed'?'?result='+id:''):'/delayed/'+matchId);
 const latestReveal=snapshot?.view.revealed.at(-1);
 const ownReveal:Reveal|undefined=snapshot?.view.ownResult??(latestReveal?('own'in latestReveal?latestReveal.own:latestReveal as Reveal):undefined);
 const opponentReveal:Reveal|undefined=!snapshot?.view.ownResult&&latestReveal&&'opponent'in latestReveal?latestReveal.opponent:undefined;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
  {snapshot?<><FiveAliveBoard mode={mode} round={snapshot.view.round} score={animatedScore??((snapshot.view.ownScore??snapshot.view.score??snapshot.score??0)+(snapshot.view.ownResult?.score??0))}
   scoreRef={scoreRef} opponentScore={snapshot.view.opponentScore} current={snapshot.view.current} pending={pending||connectionBlocked||!!snapshot.held||!!award||!!miss||rules||history||abandon} error={error}
   notice={ownReveal?.answer&&<div className="five-alive-last-result" role="status">{ownReveal.answer} · {tiers[ownReveal.difficulty??0]} · {multipliers[ownReveal.difficulty??0]}× · {ownReveal.score?.toLocaleString()??0} points{opponentReveal?` · Opponent ${opponentReveal.score?.toLocaleString()??0}`:''}{snapshot.view.revealed.length>0&&<button type="button" onClick={()=>setHistory(true)}>Word results</button>}</div>}
   summary={(snapshot.view.completed||snapshot.terminal)&&<div className="five-alive-summary" role="status"><h2>{mode==='arcade'?'Game Over':'Match complete'}</h2>
    {mode==='async'&&snapshot.outcome&&<p>{snapshot.outcome.reason==='draw'?'Draw':snapshot.outcome.winner===userId?'You won':'Opponent won'}{snapshot.outcome.reason==='timeout_forfeit'?' · Deadline missed':''}</p>}
    <RoundHistory rounds={snapshot.view.revealed}/>
    <button type="button" onClick={back}>{mode==='arcade'?'View Leaderboard':'Back to Match'}</button></div>}
   award={award?<FiveAliveAward key={award.id} event={award} userId={userId} target={scoreRef} onDone={finishAward} onScore={setAnimatedScore}/>:miss&&<div className="five-alive-award" aria-label="Final guess"><div className="five-alive-award-tiles five-alive-poof" onAnimationEnd={()=>setMiss(null)}>{[...miss.word].map((letter,index)=><span data-color={miss.feedback[index]} key={index}>{letter}</span>)}</div></div>}
   onReconnect={connectionBlocked?()=>void refresh():undefined} onWrongGuess={wrongGuess} onSubmit={word=>void act({type:'guess',word})} onBack={back} onRules={()=>setRules(true)} onAbandon={mode==='arcade'?()=>setAbandon(true):undefined}/>
  </>:<p role={error?'alert':'status'}>{error||'Restoring your game…'} {error&&<button onClick={()=>void refresh()}>Retry</button>}</p>}
  <Dialog open={rules} onOpenChange={setRules}><DialogContent><DialogTitle>Five Alive · Rules</DialogTitle><DialogDescription>Scoring and play for Five Alive.</DialogDescription>
   <p>Guess each five-letter word in six valid tries. Green marks the right letter and place; yellow marks a letter in another place; gray means that copy is absent.</p>
   <p>Base scores are 1,000, 700, 490, 343, 240 and 168. A hidden difficulty multiplier is revealed after each completed word. Three word scores make your total.</p>
  </DialogContent></Dialog>
  <Dialog open={history} onOpenChange={setHistory}><DialogContent><DialogTitle>Word results</DialogTitle><DialogDescription>Words both players have completed.</DialogDescription><RoundHistory rounds={snapshot?.view.revealed??[]}/></DialogContent></Dialog>
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon this game?</AlertDialogTitle><AlertDialogDescription>Your score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>{setAbandon(false);void act({type:'abandon'}).then(ok=>{if(ok)navigate('/arcade/five-alive');});}}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
