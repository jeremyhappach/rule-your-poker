import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {ArcadeAbandonButton} from './ArcadeAbandonButton';
import {ArcadeInfo} from './ArcadeInfo';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {dropTransport,type DropTransport} from '@/lib/drop357/client';
import {cardFace,cardRank,laneSizes} from '@/lib/drop357/model';
import {useDrop357} from '@/hooks/useDrop357';
import {useDrop357Audio} from '@/hooks/useDrop357Audio';
import {presentSound} from '@/lib/audio/presentationSound';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {platformAudio} from '@/lib/audio/platformAudio';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import bridge from '@/assets/peoria-bridge-mobile.jpg';
import './drop357.css';

const Face=memo(function Face({card}:{card:number}){return <PlayingCard card={cardFace(card)} frontStyle="arcade-classic" size="sm" style={{width:'100%',height:'100%'}}/>;});
export function SoloDrop357({runId,userId,transport:provided}:{runId:string;userId:string;transport?:DropTransport}){
 const transport=useMemo(()=>provided??dropTransport(runId),[provided,runId]),live=useRef(hasTriStart(runId));
 const game=useDrop357(runId,userId,transport,live.current),v=game.snapshot,r=v?.result,navigate=useNavigate();
 const surface=useRef<HTMLDivElement>(null),[abandon,setAbandon]=useState(false),done=useRef(false);
 const liveResult=!!r&&game.liveRevision===v?.revision;
 useDrop357Audio(userId,v,game.liveLanes,game.now,surface);
 const tally=r?Math.max(0,game.now-r.completedAt):0;
 const seconds=v?Math.max(0,Math.ceil(((r?r.completedAt:game.now)>v.deadline?0:v.deadline-(r?r.completedAt:game.now))/1000)):120;
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 useEffect(()=>{
  if(!v||v.status==='active'||done.current)return;
  if(game.bornEnded||v.status==='abandoned'||r&&game.now>=r.completedAt+5000){done.current=true;navigate('/arcade/357-drop?result='+runId,{replace:true});}
 },[v,game.now,game.bornEnded,r,navigate,runId]);
 useEffect(()=>{
  if(!game.cue||game.cue.intent.type==='abandon')return;
  const cue=approvedSound(game.cue.intent.type==='place'?'slide':'flip');
  platformAudio.present({userId,id:'357-action:'+runId+':'+game.cue.requestId,cue:isSoundSurfaceVisible(surface.current)&&cue?
   {...cue,policy:{priority:50,group:'357-action',intervalMs:0}}:undefined});
 },[game.cue,runId,userId]);
 useEffect(()=>{if(v&&game.liveRevision===v.revision&&v.placements===0&&v.passesLeft===3)presentSound('flip',runId+':opening',surface.current);},[game.liveRevision,v,runId]);
 useEffect(()=>{if(liveResult&&r&&r.allBonus>0&&tally>=1800)presentSound('winner',runId+':all-three',surface.current);},[liveResult,r,tally,runId]);
 const natural=v?.laneResults.find((x,i)=>x?.natural&&game.liveLanes.includes(i)&&game.now>=x.completedAt+350&&game.now<x.completedAt+800);
 usePresentedScoreAudio(userId,natural?runId+':natural:'+natural.completedAt:null,
  natural?{startedAt:natural.completedAt+350,endsAt:natural.completedAt+800,from:natural.points,to:natural.score}:null,game.now);
 const locked=!v||v.status!=='active'||game.pending||!game.ready||game.now>=v.deadline;
 return <div className="arcade-run drop357-page" ref={surface} data-status={v?.status??'loading'}>
  <header className="drop357-header"><div><small>P-TOWN ORIGINAL</small><h1>357 DROP</h1></div><nav aria-label="Game controls"><ArcadeInfo game="357-drop" name="357 Drop" ruleset="357-drop/1"/><GameplaySoundButton/><ArcadeAbandonButton disabled={!v||v.status!=='active'} onClick={()=>setAbandon(true)}/></nav></header>
  {!v?<div className="drop357-loading" role="status">{game.error||'Shuffling the deck…'}{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</div>:
  <main className="drop357-board">
   <div className="drop357-bridge" style={{backgroundImage:`url(${bridge})`}} aria-hidden="true"/>
   <div className="drop357-score"><strong aria-label="Score">{(r&&tally<1800?r.base:v.score).toLocaleString()}</strong><time aria-label="Time remaining">{Math.floor(seconds/60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</time><meter min={0} max={120} value={seconds} aria-label="Time remaining meter"/></div>
   <div className="drop357-draw"><div className="drop357-stock"><PlayingCard card={{rank:'2',suit:'♣'}} isHidden size="sm" style={{width:'100%',height:'100%'}}/><span>{v.stockLeft}</span></div><div className="drop357-current" aria-label="Current card">{v.current!==null?<Face card={v.current}/>:<span>DONE</span>}</div><button className="drop357-pass" disabled={locked||v.passesLeft===0} onClick={()=>game.act('pass')}>PASS · {v.passesLeft}</button></div>
   {laneSizes.map((size,index)=>{const result=v.laneResults[index],fresh=!!result&&game.liveLanes.includes(index)&&game.now-result.completedAt<800;
    const elapsed=result?Math.max(0,game.now-result.completedAt):0;
    const shown=result?(fresh?Math.round(elapsed<350?result.points*elapsed/350:result.points+result.bonus*Math.min(1,(elapsed-350)/450)):result.score):0;
    return <button key={size} className="drop357-lane" data-lane={size} data-wild={!result&&v.current!==null&&cardRank(v.current)===size} data-natural={result?.natural??false} data-fresh={fresh}
     data-category={result?.category} disabled={locked||!!result} aria-label={'Place in '+size+' lane'} onClick={()=>game.act('place',[index])}>
     <span className="drop357-label"><strong>{size}</strong><small>WILD</small></span>
     <span className="drop357-slots">{Array.from({length:size},(_,slot)=>{const card=v.lanes[index][slot];return <span key={slot} className="drop357-slot" data-selected={!!result&&result.selected.includes(slot)} data-muted={!!result&&!result.selected.includes(slot)}>{card===undefined?null:<Face card={card}/>}</span>;})}</span>
     {result&&<span className="drop357-lane-result"><span>{result.category} · <span className="drop357-count-motion">{shown.toLocaleString()}</span><span className="drop357-count-static">{result.score.toLocaleString()}</span></span>{result.natural&&<small>NATURAL +20%</small>}</span>}
    </button>;
   })}
  </main>}
  {game.error&&v&&<div className="drop357-error" role="alert">{game.error}<button onClick={game.reconnect}>Reconnect</button></div>}
  {r&&<div className="drop357-tally" role="status"><strong>{r.reason==='timeout'?'TIME UP':'BOARD COMPLETE'}</strong><span>Base {r.base.toLocaleString()}{r.allBonus>0?' · All three +200':''}</span><span>Time bonus +{r.timeBonus.toLocaleString()}</span>{tally>=2500&&<ArcadeCompletion score={r.score} record={v!.completion}/>}</div>}
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. The clock continues while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending} onClick={()=>game.act('abandon')}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
