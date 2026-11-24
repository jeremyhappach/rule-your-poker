import {useEffect,useState} from 'react';
import {delayedRequest} from '@/lib/delayed/client';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {FiveAliveResults,type FiveAliveRevealedWord,type FiveAliveWordResult} from './FiveAliveResults';
import {FiveAliveOwnResult} from './FiveAliveOwnResult';
import './fiveAlive.css';

interface WordSnapshot {wordReviews?:{round:number;seen:boolean}[];id:string;revision:number;view:{round:number;ownFinished?:number;opponentFinished?:number;ownResult?:FiveAliveWordResult;revealed:FiveAliveRevealedWord[]}}
/** Reads the same permitted projection as gameplay; browsing never begins/ACKs a replay. */
export function FiveAliveMatchWords({childId,revision,opponentName}:{childId:string;revision:number;opponentName:string}){
 const [snapshot,setSnapshot]=useState<WordSnapshot|null>(null),[history,setHistory]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [selected,setSelected]=useState<WordSnapshot['view']|null>(null);
 useEffect(()=>{let active=true;void delayedRequest<WordSnapshot>({game:'five-alive',op:'state',childId}).then(value=>{
  if(active&&value.id===childId){setSnapshot(old=>old&&old.revision>value.revision?old:value);setError('');}
 }).catch(()=>{if(active)setError('Unable to load words.');});return()=>{active=false;};},[childId,revision,retry]);
 const view=snapshot?.view,last=view?.ownResult??view?.revealed.at(-1),own=last&&('own'in last?last.own:last);
 const selectedLast=selected?.ownResult??selected?.revealed.at(-1),selectedOwn=selectedLast&&('own'in selectedLast?selectedLast.own:selectedLast);
 const round=selected?.ownResult?selected.round:selected?.revealed.length??0;
 const prior=selected?.revealed.slice(0,round-1).reduce((total,word)=>total+('own'in word?word.own.score??0:word.score??0),0)??0;
 const opponentScore=selected?.revealed.reduce((total,word)=>total+('opponent'in word?word.opponent.score??0:0),0)??0;
 const close=()=>{setHistory(false);setSelected(null);};
 return <div className="five-alive-match-words">
  {view&&<p>You: {view.ownFinished??view.revealed.length+Number(!!view.ownResult)} of 3 finished · {opponentName}: {view.opponentFinished??view.revealed.length} of 3 finished</p>}
  {own&&<button className="five-alive-word-results" onClick={()=>setSelected(view!)}>View Last Word</button>}
  {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
  <Dialog open={!!selected} onOpenChange={value=>{if(!value)close();}}><DialogContent className="five-alive-result-dialog" showCloseButton={false}>
   <DialogTitle className="sr-only">Your Word {round} results</DialogTitle>
   <DialogDescription className="sr-only">Your completed board and final score. Back returns to the match.</DialogDescription>
   {selectedOwn&&<FiveAliveOwnResult round={round} result={selectedOwn} prior={prior} opponentScore={opponentScore} opponentName={opponentName} waiting={!!selected?.ownResult} onClose={close} onWords={()=>setHistory(true)}/>}
   <Dialog open={history} onOpenChange={setHistory}><DialogContent className="five-alive-history-dialog z-[10001]" overlayClassName="z-[10000]">
    <DialogTitle>Word Results</DialogTitle><DialogDescription>Opponent results remain sealed until both finish.</DialogDescription>
    <FiveAliveResults reviewedRounds={snapshot?.wordReviews?.filter(r=>r.seen).map(r=>r.round)??[]} rounds={view?.revealed??[]} waiting={view?.ownResult} opponentName={opponentName}/>
   </DialogContent></Dialog>
  </DialogContent></Dialog>
 </div>;
}
