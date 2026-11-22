import {useEffect,useState} from 'react';
import {delayedRequest} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {FiveAliveResults,type FiveAliveRevealedWord,type FiveAliveWordResult} from './FiveAliveResults';
import {FiveAliveOwnReplay} from './FiveAliveOwnReplay';
import './fiveAlive.css';

interface WordSnapshot {id:string;revision:number;view:{round:number;ownFinished?:number;opponentFinished?:number;ownResult?:FiveAliveWordResult;revealed:FiveAliveRevealedWord[]}}
/** Reads the same permitted projection as gameplay; browsing never begins/ACKs a replay. */
export function FiveAliveMatchWords({childId,revision,opponentName,userId}:{childId:string;revision:number;opponentName:string;userId:string}){
 const [snapshot,setSnapshot]=useState<WordSnapshot|null>(null),[open,setOpen]=useState<'replay'|'history'|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [replay,setReplay]=useState<{id:string;view:WordSnapshot['view']}|null>(null);
 useEffect(()=>{let active=true;void delayedRequest<WordSnapshot>({game:'five-alive',op:'state',childId}).then(value=>{
  if(active&&value.id===childId){setSnapshot(old=>old&&old.revision>value.revision?old:value);setError('');}
 }).catch(()=>{if(active)setError('Unable to load words.');});return()=>{active=false;};},[childId,revision,retry]);
 const view=snapshot?.view,last=view?.ownResult??view?.revealed.at(-1),own=last&&('own'in last?last.own:last);
 const replayView=replay?.view,replayLast=replayView?.ownResult??replayView?.revealed.at(-1),replayOwn=replayLast&&('own'in replayLast?replayLast.own:replayLast);
 const round=replayView?.ownResult?replayView.round:replayView?.revealed.length??0;
 const prior=replayView?.revealed.slice(0,round-1).reduce((total,word)=>total+('own'in word?word.own.score??0:word.score??0),0)??0;
 const opponentScore=replayView?.revealed.reduce((total,word)=>total+('opponent'in word?word.opponent.score??0:0),0)??0;
 return <div className="five-alive-match-words">
  {view&&<p>You: {view.ownFinished??view.revealed.length+Number(!!view.ownResult)} of 3 finished · {opponentName}: {view.opponentFinished??view.revealed.length} of 3 finished</p>}
  {own&&<button className="five-alive-word-results" onClick={()=>{setReplay({id:crypto.randomUUID(),view:view!});setOpen('replay');}}>View Last Word</button>}
  {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  <Dialog open={!!open} onOpenChange={value=>{if(!value)setOpen(null);}}><DialogContent className={open==='replay'?'five-alive-replay-dialog':'five-alive-history-dialog'}>
   <DialogTitle className={open==='replay'?'sr-only':undefined}>{open==='replay'?`Your Word ${round} replay`:'Word Results'}</DialogTitle>
   <DialogDescription className={open==='replay'?'sr-only':undefined}>Opponent results remain sealed until both finish.</DialogDescription>
   {open==='replay'&&replay&&replayOwn?<FiveAliveOwnReplay key={replay.id} identity={childId+':own-replay:'+replay.id} round={round} result={replayOwn} prior={prior} opponentScore={opponentScore} opponentName={opponentName} userId={userId} onClose={()=>setOpen(null)} onWords={()=>setOpen('history')}/>:<FiveAliveResults rounds={view?.revealed??[]} waiting={view?.ownResult} opponentName={opponentName}/>}
  </DialogContent></Dialog>
 </div>;
}
