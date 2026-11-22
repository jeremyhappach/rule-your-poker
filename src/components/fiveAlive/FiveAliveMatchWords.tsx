import {useEffect,useState} from 'react';
import {delayedRequest} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {FiveAliveResults,FiveAliveScoreLine,type FiveAliveRevealedWord,type FiveAliveWordResult} from './FiveAliveResults';
import './fiveAlive.css';

interface WordSnapshot {id:string;revision:number;view:{round:number;ownFinished?:number;opponentFinished?:number;ownResult?:FiveAliveWordResult;revealed:FiveAliveRevealedWord[]}}
/** Reads the same permitted projection as gameplay; browsing never begins/ACKs a replay. */
export function FiveAliveMatchWords({childId,revision,opponentName}:{childId:string;revision:number;opponentName:string}){
 const [snapshot,setSnapshot]=useState<WordSnapshot|null>(null),[open,setOpen]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;void delayedRequest<WordSnapshot>({game:'five-alive',op:'state',childId}).then(value=>{
  if(active&&value.id===childId){setSnapshot(old=>old&&old.revision>value.revision?old:value);setError('');}
 }).catch(()=>{if(active)setError('Unable to load words.');});return()=>{active=false;};},[childId,revision,retry]);
 const view=snapshot?.view,last=view?.ownResult??view?.revealed.at(-1),own=last&&('own'in last?last.own:last);
 return <div className="five-alive-match-words">
  {view&&<p>You: {view.ownFinished??view.revealed.length+Number(!!view.ownResult)} of 3 finished · {opponentName}: {view.opponentFinished??view.revealed.length} of 3 finished</p>}
  {own&&<><strong>Word {view!.ownResult?view!.round:view!.revealed.length} — {own.answer}</strong><FiveAliveScoreLine label="You" result={own}/><button className="five-alive-word-results" onClick={()=>setOpen(true)}>View Words</button></>}
  {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="five-alive-history-dialog"><DialogTitle>Word Results</DialogTitle><DialogDescription>Opponent results remain sealed until both finish.</DialogDescription><FiveAliveResults rounds={view?.revealed??[]} waiting={view?.ownResult}/></DialogContent></Dialog>
 </div>;
}
