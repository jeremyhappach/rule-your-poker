import {useEffect,useRef,useState} from 'react';
import {usePlayback} from '@/lib/delayed/usePlayback';
import {wordsRpc} from '@/lib/ptownWords/client';
import type {Tile,WordsSnapshot} from '@/lib/ptownWords/model';

interface FinalRacks {id:string;revision:number;racks:Record<string,Tile[]>;before:Record<string,number>;scores:Record<string,number>}
export const WORDS_RACK_REVEAL_MS=2000,WORDS_RACK_ADJUST_MS=1800,WORDS_FINAL_HOLD_MS=2000;

/** One visible timeline; the supplied scores are already committed by PostgreSQL. */
export function WordsEndSequence({view,mode,active=true,onScores,onComplete}:{view:WordsSnapshot;mode:'live'|'async';active?:boolean;onScores:(scores:Record<string,number>)=>void;onComplete:()=>void}){
 const [data,setData]=useState<FinalRacks|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const callbacks=useRef({onScores,onComplete});callbacks.current={onScores,onComplete};
 const id=view.identity.dealerGameId,identity=id+':'+view.turn+':'+view.terminal?.resultId;
 const finished=useRef('');
 useEffect(()=>{let alive=true;setData(null);setError('');
  void wordsRpc<FinalRacks>('ptown_words_final_racks',{p_mode:mode,p_id:id}).then(result=>{
   if(result.id!==id||view.players.some(p=>!Array.isArray(result.racks?.[p.id])||result.racks[p.id].length>7||!Number.isFinite(result.before?.[p.id])||result.scores?.[p.id]!==view.scores[p.id]))throw Error('The saved result changed. Reopen the game.');
   if(alive)setData(result);
  }).catch(()=>{if(alive)setError('Unable to load remaining tiles.');});
  return()=>{alive=false;};
 },[id,identity,mode,retry]);
 const duration=WORDS_RACK_REVEAL_MS+view.players.length*WORDS_RACK_ADJUST_MS+WORDS_FINAL_HOLD_MS;
 const play=usePlayback(data&&active?duration:0,data&&active?identity:'waiting:'+identity);
 const adjusted=data?Math.min(view.players.length,Math.max(0,Math.floor((play.elapsed-WORDS_RACK_REVEAL_MS)/WORDS_RACK_ADJUST_MS)+1)):0;
 useEffect(()=>{if(data)callbacks.current.onScores(Object.fromEntries(view.players.map((p,i)=>[p.id,i<adjusted?data.scores[p.id]:data.before[p.id]])));},[data,adjusted]);
 useEffect(()=>{if(active&&data&&play.done&&finished.current!==identity){finished.current=identity;callbacks.current.onComplete();}},[active,data,play.done,identity]);
 return <section className="words-end-sequence" aria-label="Remaining tile adjustments" data-canonical-felt-interaction-layer="">
  <h2>{adjusted?'Remaining-tile score adjustments':'Remaining tiles'}</h2>
  {!data?<p role="status">{error||'Loading remaining tiles…'}{error&&<button onClick={()=>setRetry(n=>n+1)}>Retry</button>}</p>:view.players.map((p,i)=>{
   const applied=i<adjusted,delta=data.scores[p.id]-data.before[p.id];
   return <div className="words-end-player" key={p.id} data-adjusted={applied}>
    <strong>{p.id===view.viewerId?'You':p.name}</strong>
    <div className="words-final-rack" aria-label={p.name+' remaining tiles'}>{data.racks[p.id].map(tile=><span key={tile.id} className="words-final-tile" aria-label={(tile.face==='?'?'Blank':tile.face)+', '+tile.value+' points'}>{tile.face==='?'?'◇':tile.face}<small>{tile.value}</small></span>)}{!data.racks[p.id].length&&<span>No tiles remaining</span>}</div>
    <output aria-live="polite">{applied?`${data.before[p.id]} ${delta<0?'−':'+'} ${Math.abs(delta)} = ${data.scores[p.id]}`:data.before[p.id]}</output>
   </div>;
  })}
 </section>;
}
