import {memo,useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {ArcadeAbandonButton} from './ArcadeAbandonButton';
import {ArcadeInfo} from './ArcadeInfo';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {TriScorePill,TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {dropTransport,type DropTransport} from '@/lib/drop357/client';
import {cardFace,cardRank,laneSizes} from '@/lib/drop357/model';
import {dropHandLabel} from '@/lib/drop357/presentation';
import {useDrop357} from '@/hooks/useDrop357';
import {useDrop357Audio} from '@/hooks/useDrop357Audio';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {platformAudio} from '@/lib/audio/platformAudio';
import bridge from '@/assets/peoria-bridge-mobile.jpg';
import './drop357.css';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
const Face=memo(function Face({card}:{card:number}){return <PlayingCard card={cardFace(card)} frontStyle="arcade-classic" size="sm" style={{width:'100%',height:'100%'}}/>;});
export function SoloDrop357({runId,userId,transport:provided}:{runId:string;userId:string;transport?:DropTransport}){
 const transport=useMemo(()=>provided??dropTransport(runId),[provided,runId]),live=useRef(hasTriStart(runId));
 const game=useDrop357(runId,userId,transport,live.current);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 if(!game.snapshot)return <div className="arcade-run drop357-page"><div className="drop357-loading" role="status">{game.error||'Shuffling the deck…'}{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</div></div>;
 return <DropBoard game={game} userId={userId} liveEntry={live.current}/>;
}
function DropBoard({game,userId,liveEntry}:{game:ReturnType<typeof useDrop357>;userId:string;liveEntry:boolean}){
 const v=game.snapshot!,partial=['357-drop/4','357-drop/5'].includes(v.ruleset),carry=partial||v.ruleset==='357-drop/3',r=v.result,navigate=useNavigate(),runId=v.id;
 const surface=useRef<HTMLDivElement>(null),board=useRef<HTMLDivElement>(null),[abandon,setAbandon]=useState(false),done=useRef(false);
 useDrop357Audio(userId,v,game.liveLanes,game.now,surface);
 const [carryDraft,setCarryDraft]=useState<{roundId:string;lane:number;cards:number[]}>({roundId:'',lane:-1,cards:[]});
 const carryLane=v.carryChoices?.[0]===null?0:1;
 const choices=carryDraft.roundId===v.roundId&&carryDraft.lane===carryLane?carryDraft.cards:[];
 const toggleCarry=(slot:number)=>setCarryDraft(previous=>{const selected=previous.roundId===v.roundId&&previous.lane===carryLane?previous.cards:[];return {roundId:v.roundId,lane:carryLane,cards:carryLane===0?[slot]:selected.includes(slot)?selected.filter(c=>c!==slot):selected.length<2?[...selected,slot]:[selected[1],slot]};});
 const tally=r?Math.max(0,game.now-r.completedAt):0;
 const bonusDelay=r&&r.allBonus>0?(v.allFilledMs??0):0;
 const bonusCount=r&&bonusDelay?{from:0,to:r.allBonus,startedAt:r.completedAt+1000,endsAt:r.completedAt+2000}:null;
 const bonusValue=bonusCount?Math.round(r!.allBonus*Math.max(0,Math.min(1,(game.now-bonusCount.startedAt)/1000))):0;
 usePresentedScoreAudio(userId,bonusCount&&!game.bornEnded&&game.liveRevision>=0&&tally>=1000&&tally<2000?'357-all-filled:'+v.roundId:null,bonusCount,game.now);
 const result=r?{...r,id:r.id??v.roundId+':result',completedAt:r.completedAt+bonusDelay,elapsed:tally-bonusDelay,scoreBefore:r.scoreBefore??0,displayScore:r.score}:null;
 const presentation=useTriRoundPresentation({scope:'357-drop:'+v.roundId,phase:r?'stage_complete':v.phase,connected:game.ready&&!game.error,paused:false,result,
  now:game.now,deadline:v.deadline,userId,active:true,modern:true,liveEntry,recoveryEpoch:game.recoveryEpoch});
 const seconds=v.phase==='intro'?120:r?Math.ceil(r.remainingMs/1000):Math.max(0,Math.ceil((v.deadline-game.now)/1000));
 useEffect(()=>{
  if(v.status==='active'||done.current)return;
  if(v.status==='abandoned'){done.current=true;navigate('/arcade/357-drop?result='+runId,{replace:true});}
 },[v.status,navigate,runId]);
 useEffect(()=>{
  if(!game.cue||game.cue.intent.type==='abandon')return;
  const cue=approvedSound(game.cue.intent.type!=='pass'?'slide':'flip');
  platformAudio.present({userId,id:'357-action:'+runId+':'+game.cue.requestId,cue:isSoundSurfaceVisible(surface.current)&&cue?
   {...cue,policy:{priority:50,group:'357-action',intervalMs:0}}:undefined});
 },[game.cue,runId,userId]);
 const locked=v.phase!=='playing'||v.status!=='active'||game.pending||!game.ready||game.now>=v.deadline;
 const showFinal=v.status==='completed'&&!!r&&(game.bornEnded||tally>=5000+bonusDelay);
 if(showFinal){
  const naturalBonus=v.laneResults.reduce((sum,lane)=>sum+(lane?.bonus??0),0);
  const rounds=v.roundScores??(v.ruleset==='357-drop/1'?[{round:1,score:r.score,handPoints:r.base-r.allBonus-naturalBonus,naturalBonus,allBonus:r.allBonus,timeBonus:r.timeBonus}]:[]);
  return <ArcadeCompletion title="Final Score" score={v.score} record={v.completion} backLabel="Back to Leaderboard" onBackToArcade={()=>navigate('/arcade/357-drop?result='+runId,{replace:true})}>
   <dl className="drop357-final-rounds">{rounds.map(round=><div key={round.round} data-round-score={round.round}>
    <dt>Round {round.round}</dt><dd><strong>{round.score.toLocaleString()}</strong></dd>
    <dd className="drop357-final-bonuses"><span>Hands {round.handPoints.toLocaleString()}</span>{round.naturalBonus>0&&<span>Natural +{round.naturalBonus.toLocaleString()}</span>}{round.allBonus>0&&<span>All lanes +{round.allBonus.toLocaleString()}</span>}{round.timeBonus>0&&<span>Time +{round.timeBonus.toLocaleString()}</span>}</dd>
   </div>)}</dl>
  </ArcadeCompletion>;
 }
 return <div className="arcade-run drop357-page" ref={surface} data-status={v.status} data-phase={v.phase} data-round={v.round??1} data-partial={partial}>
  <header className="drop357-header"><div><small>{partial?'PARTIAL CARRY TEST':carry?'CARRY-FORWARD TEST':'P-TOWN ORIGINAL'}</small><h1>357 DROP</h1></div><nav aria-label="Game controls"><ArcadeInfo game="357-drop" name="357 Drop" ruleset={v.ruleset}/><GameplaySoundButton/><ArcadeAbandonButton disabled={v.status!=='active'} onClick={()=>setAbandon(true)}/></nav></header>
  <main className="drop357-board" ref={board}>
   <div className="drop357-bridge" style={{backgroundImage:`url(${bridge})`}} aria-hidden="true"/>
   <div className="drop357-score"><span className="drop357-round">ROUND <b>{v.round??1}/{v.rounds??1}</b></span><TriScorePill item={{id:userId,active:true,score:v.score}} root={board} fraction={presentation.fraction} value={r?presentation.displayScore??r.score:v.banked??v.score}/><meter min={0} max={120} value={seconds} aria-label="Time remaining" aria-valuetext={`${seconds} seconds remaining`}/></div>
   <div className="drop357-draw"><div className="drop357-stock"><PlayingCard card={{rank:'2',suit:'♣'}} isHidden size="sm" style={{width:'100%',height:'100%'}}/><span>{v.stockLeft}</span></div><div className="drop357-current" aria-label="Current card">{v.current!==null?game.pending?<span>Placing…</span>:<Face card={v.current}/>:<span>{partial&&v.phase==='playing'?'Choose carry':'DONE'}</span>}</div><button className="drop357-pass" disabled={locked||v.current===null||v.passesLeft===0} onClick={()=>game.act('pass',[],v.revision)}>PASS · {v.passesLeft}</button></div>
   {laneSizes.map((size,index)=>{const scored=v.laneResults[index],fresh=!!scored&&game.liveLanes.includes(index)&&game.now-scored.completedAt<800;
    const inherited=partial?index:carry?[0,3,5][index]:0,Tag=carry?'div':'button';
    const choosing=partial&&index<2&&!!scored&&v.carryChoices?.[index]===null;
    return <Tag key={size} className="drop357-lane" data-lane={size} data-wild={!scored&&v.current!==null&&cardRank(v.current)===size} data-natural={scored?.natural??false} data-fresh={fresh}
     data-category={scored?.category} {...(!carry?{disabled:locked||!!scored,'aria-label':'Place in '+size+' lane',onClick:()=>game.act('place',[index],v.revision)}:{})}>
     <span className="drop357-label"><strong>{size}</strong><small>WILD</small></span>
     <span className="drop357-slots">{Array.from({length:size},(_,slot)=>{const accepted=v.lanes[index][slot];
      const landing=game.placement?.roundId===v.roundId&&game.placement.revision===v.revision&&game.placement.lane===index&&game.placement.slot===slot;
      const card=landing?game.placement!.card:accepted,Inherited=slot<inherited,Slot=choosing||carry&&!Inherited?'button':'span';
      return <Slot key={slot} className="drop357-slot" data-inherited={Inherited} data-carry-choice={choosing} data-carry-picked={choosing&&choices.includes(slot)} data-pending={landing} data-selected={!!scored&&scored.score>0&&scored.selected.includes(slot)} data-muted={!!scored&&!scored.selected.includes(slot)}
       {...(choosing?{disabled:locked,'aria-label':(index===0?'Carry':'Select carry')+' '+size+' lane card '+(slot+1),'aria-pressed':choices.includes(slot),onClick:()=>toggleCarry(slot)}:carry&&!Inherited?{disabled:locked||accepted!=null,'aria-label':'Place in '+size+' lane slot '+(slot+1),onClick:()=>game.act('place',[index,slot],v.revision)}:{'aria-label':Inherited?'Inherited from '+(index===1?'3':'5')+' lane':undefined})}>
       {card==null?<span className="drop357-slot-hint" aria-hidden="true">{Inherited?'↳':'+'}</span>:<Face card={card}/>}</Slot>;
     })}</span>
     <span className="drop357-lane-result" data-filled={!!scored}>{scored&&<><span className="drop357-hand"><b>{dropHandLabel(scored)}</b></span><strong>{scored.score.toLocaleString()}</strong></>}</span>
     {choosing&&<span className="drop357-carry-controls"><span>Pick {index+1} · {choices.length}/{index+1}</span><button disabled={locked||choices.length!==index+1} onClick={()=>game.act('carry',[index,...choices],v.revision)}>Confirm</button></span>}
     {scored?.natural&&<small className="drop357-natty" aria-label="Natural bonus, 20 percent">Natty +20%</small>}
    </Tag>;
   })}
   {v.phase==='intro'&&<div className="drop357-intro"><TriRoundIntro remaining={Math.max(0,v.deadline-game.now)} roundLabel={`ROUND ${v.round??1}`} paused={false}/></div>}
   {r&&<div className="drop357-tally" data-filled={r.allBonus>0&&tally>=180&&tally<(bonusDelay||1200)} role="status"><strong>{r.reason==='timeout'?'TIME UP':r.allBonus>0&&tally>=180&&tally<(bonusDelay||1200)?'ALL FILLED':'ROUND COMPLETE'}</strong>{bonusDelay>0&&tally>=180&&tally<bonusDelay&&<b className="drop357-bonus-award">+{bonusValue}</b>}<span className="sr-only">Round award {(r.roundScore??r.score).toLocaleString()}; total {r.score.toLocaleString()}</span></div>}
  </main>
  {game.error&&<div className="drop357-error" role="alert">{game.error}<button onClick={game.reconnect}>Reconnect</button></div>}
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. The clock continues while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending} onClick={()=>game.act('abandon')}>Abandon</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
