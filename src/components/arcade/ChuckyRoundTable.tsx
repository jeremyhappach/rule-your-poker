import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowLeft,Heart} from 'lucide-react';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import type {useChuckyShowdown} from '@/hooks/useChuckyShowdown';
import {isSoundSurfaceVisible,presentSound} from '@/lib/audio/presentationSound';
import type {ApprovedSound} from '@/lib/audio/approvedSounds';
import type {Card} from '@/lib/cardUtils';
import type {V2Scene,V2Snapshot} from '@/lib/chuckyShowdown/model';
import {winBonus} from '@/lib/chuckyShowdown/model';
import {admit,handAnnouncement,scoreMotion,seek} from '@/lib/chuckyShowdown/presentationV2';
import {CardSlot,EndRun,Riffle} from './ChuckyTableParts';
import {ArcadeInfo} from './ArcadeInfo';
import {ChuckyLevelAvailability} from './ChuckyLevelAvailability';
import {ChuckyCrackLoss, crackLiftMs, crackEndMs} from './ChuckyCrackLoss';
import {useChuckyBustAudio} from '@/hooks/useChuckyBustAudio';
import {RoundIntroArtwork} from '@/components/run21/Run21RoundIntro';
import {useRun21Bell} from '@/hooks/useRun21Bell';
import '../run21/run21.css';

const portrait = '/arcade/approved-v1/chucky-portrait.webp';

type Controls=ReturnType<typeof useChuckyShowdown>;
const tally=(elapsed:number,offset:number,max:number)=>Math.min(max,Math.max(0,1+Math.floor((elapsed-offset)/180)));
const faceKey=(card:Card)=>card.rank+card.suit;
function cuePlan(s:V2Scene):[number,ApprovedSound,string][]{
  const cues:[number,ApprovedSound,string][]=[];
  const slides=(count:number,start:number,key:string)=>{for(let i=0;i<count;i++)cues.push([start+i*180,'slide',key+i]);};
  if(s.phase==='deal'){
    cues.push([0,'riffle','shuffle']);slides(4,800,'player');slides(4,1550,'community');
  }else if(s.phase==='showdown'&&!s.chucky.length){
    cues.push([0,'chip','commit']);slides(s.level,180,'chucky');
  }else if(s.phase==='round_over'&&s.reason!=='busted')cues.push([0,'chip','bank']);
  return cues;
}

export function ChuckyRoundTable({v,game,userId,competitive=false,onPresentationDone}:{v:V2Snapshot;game:Controls;userId:string;competitive?:boolean;onPresentationDone?:()=>void}){
  const root=useRef<HTMLDivElement>(null),navigate=useNavigate();
  const [frames,setFrames]=useState(()=>seek(v,game.now,game.livePhase===v.phase+':'+v.since&&!game.silent));
  const previous=useRef({snapshot:v,epoch:game.recoveryEpoch});
  useLayoutEffect(()=>{
    if(previous.current.snapshot===v&&previous.current.epoch===game.recoveryEpoch)return;
    const reset=previous.current.epoch!==game.recoveryEpoch||game.silent;
    previous.current={snapshot:v,epoch:game.recoveryEpoch};
    setFrames(old=>reset?seek(v,game.now):admit(old,v,game.now));
  },[v,game.recoveryEpoch,game.silent]);
  const frame=frames.filter(f=>f.at<=game.now).at(-1)??frames[0],s=frame.scene;
  const elapsed=Math.max(0,game.now-frame.at),live=frame.live&&!document.hidden;
  const key=s.roundId+':'+s.phase+':'+s.since;
  const prefix=s.phase==='showdown'?s.chucky.length:s.phase==='board_reveal'?s.community.length:0;
  const announced=s.phase==='crack'&&elapsed>=180;
  useEffect(()=>{
    if(!live)return;
    const timers:ReturnType<typeof setTimeout>[]=[];
    for(const [offset,name,id] of cuePlan(s)){
      if(offset-elapsed < -150)continue;
      timers.push(setTimeout(()=>presentSound(name,key+':'+id,root.current),Math.max(0,offset-elapsed)));
    }
    return ()=>timers.forEach(clearTimeout);
  },[key,prefix,live]);
  // Cue admission follows the rendered face/announcement, independent of network delivery time.
  useEffect(()=>{
    if(!live)return;
    if(s.phase==='board_reveal'&&prefix>2||s.phase==='showdown'&&prefix>0)
      presentSound('flip',key+':face:'+prefix,root.current);
  },[key,prefix,live]);
  useEffect(()=>{if(live&&announced)presentSound('cracked',key+':glass',root.current);},[key,live,announced]);
  useEffect(()=>{
    if(!live)return;
    if(s.phase==='fold')presentSound('chuckyFold',key+':fold',root.current);
  },[key,live,s.phase,s.chucky.length]);
  useChuckyBustAudio(userId,v.id+':round:'+s.roundId,s.phase==='round_over'&&s.reason==='busted',live,root);
  const motion=scoreMotion(s),fraction=motion?Math.max(0,Math.min(1,(elapsed-motion.start)/(motion.end-motion.start))):0;
  const value=motion?Math.round(motion.from+(motion.to-motion.from)*fraction):s.risk;
  const count=motion?{from:motion.from,to:motion.to,startedAt:frame.at+motion.start,endsAt:frame.at+motion.end}:null;
  usePresentedScoreAudio(userId,live&&motion&&elapsed>=motion.start&&elapsed<motion.end&&isSoundSurfaceVisible(root.current)?key+':count':null,
    count,game.now,s.phase==='crack');
  useEffect(()=>{if(s.phase==='round_over'&&elapsed>=2150)onPresentationDone?.();},[s.phase,elapsed,onPresentationDone]);
  const end=s.phase==='round_over'&&s.round===3&&v.status==='completed';
  useEffect(()=>{
    if(!competitive&&(v.status==='abandoned'||end&&elapsed>=4650))
      navigate('/arcade/chucky-showdown?result='+v.id,{replace:true});
  },[v.status,v.id,end,live,elapsed,game.bornEnded,navigate,competitive]);

  const deciding=s.phase==='fold_stay'||s.phase==='choose';
  const same=s.roundId===v.roundId&&s.phase===v.phase&&s.since===v.since;
  const remaining=Math.max(0,s.due-(game.choice?.at??game.now));
  const canAct=same&&deciding&&remaining>0&&game.ready&&!game.pending;
  const folded=s.phase==='fold'||s.phase==='round_over'&&s.reason==='folds';
  const nPrivate=folded?0:s.phase==='deal'?tally(elapsed,800,4):4;
  const nBoard=s.phase==='deal'?tally(elapsed,1550,4):4;
  // These four backs are pre-decision decoration, never a dealt/revealed hand.
  const previewChucky=s.phase==='fold_stay';
  const nChucky=previewChucky?4:s.phase==='showdown'&&!s.chucky.length?tally(elapsed,180,s.level):s.level;
  const liveBeat=live&&!game.silent;
  const cracking=s.phase==='crack'&&liveBeat;
  const cracks=s.cracks+(cracking&&elapsed<crackLiftMs?1:0);

  const roundIntro=s.phase==='deal'&&s.hand===1&&same&&liveBeat;
  const bellRemaining=roundIntro?Math.max(0,Math.min(2500-elapsed,s.due-game.now)):0;
  useRun21Bell(userId,bellRemaining>0?'chucky:'+v.id+':round:'+s.round:null,bellRemaining);

  const showPortrait=previewChucky||s.phase==='board_reveal'||s.phase==='choose';
  const portraitHand=useRef<string|null>(null);
  useLayoutEffect(()=>{
    if(showPortrait)portraitHand.current=s.roundId;
    else if(s.phase!=='showdown')portraitHand.current=null;
  },[showPortrait,s.roundId,s.phase]);
  useEffect(()=>{const image=new Image();image.src=portrait;},[]);
  const portraitLeaving=liveBeat&&s.phase==='showdown'&&!s.chucky.length&&elapsed<150&&portraitHand.current===s.roundId;
  const highlight=s.phase==='crack';
  const cards=(group:'chucky'|'community'|'player',faces:Card[],n:number)=>Array.from({length:n},(_,i)=>{
    const card=faces[i],winning=highlight&&group!=='player'&&card&&s.best?.some(c=>faceKey(c)===faceKey(card));
    const flipping=live&&(group==='chucky'&&s.phase==='showdown'||group==='community'&&(s.phase==='board_reveal'||s.phase==='fold')&&i>=2);
    return <div className="cs-slot" key={s.roundId+':'+group+i} data-winning={winning||undefined} data-dim={highlight&&!winning||undefined}>
      <CardSlot card={card} flip={flipping} classicFace/></div>;
  });
  const banked=s.phase==='round_over',risk=banked?s.beforeRisk-(motion?value:0):value;
  const completed=banked?s.score-risk:s.score;
  const title=s.phase==='crack'?(announced?'YOU GOT CRACKED!':'Chucky’s winning five'):
    banked?(s.reason==='busted'?'ROUND BUSTED':'ROUND BANKED'):s.phase==='win'?'+'+winBonus(v.config,s.chucky.length).toLocaleString()+' points':
    s.phase==='choose'?'Choose Chucky':s.phase==='showdown'?'Chucky · Level '+s.level:s.phase==='board_reveal'?'Community reveal':
    s.phase==='fold_stay'?'Fold or Stay':s.phase==='fold'?'Rabbit hunt':'New hand';
  return <main className="arcade-run cs-scene" data-competitive={competitive||undefined} data-shell-presentation-mode="fullscreen">
    <div ref={root} className="cs-table cs-v2" data-phase={s.phase} data-hand={s.hand} data-round={s.round}>
      {!competitive&&<header className="cs-header arcade-toolbar"><div className="arcade-toolbar-main"><Link to="/arcade/chucky-showdown" aria-label="Back to Chucky Showdown leaderboard"><ArrowLeft size={20}/></Link>
        <h1>Chucky Showdown</h1><ArcadeInfo game="chucky-showdown" name="Chucky Showdown" ruleset={v.ruleset}/>
        <GameplaySoundButton/></div>{v.status==='active'&&<EndRun disabled={!game.ready||game.pending} abandon={()=>game.act('abandon')}/>}</header>}
      <div className="cs-round-status" aria-label="Round, hand and lives">
        <span>Round <b>{s.round}</b> / 3</span><span>Hand <b>{s.hand}</b></span>
        <div className="cs-cracks" aria-label={cracks+(cracks===1?' life remaining':' lives remaining')} data-last={cracks===1}>
          {Array.from({length:v.config.maxCracks},(_,i)=><span key={i} data-life-slot={i}><Heart aria-hidden="true" data-active={i<cracks}/></span>)}
        </div>
      </div>
      <section className="cs-band cs-dealer" data-preview-cards={previewChucky||undefined} aria-label="Chucky cards"><h2>Chucky</h2><div className="cs-cards">
        {(showPortrait||portraitLeaving)&&<div className="cs-portrait" data-leaving={portraitLeaving} aria-hidden="true">
          <img src={portrait} alt="" width="427" height="455"/>
        </div>}
        {bellRemaining>0&&<div className="cs-round-bell"><RoundIntroArtwork label={'ROUND '+s.round} fading={bellRemaining<=200}/></div>}
        {cards('chucky',previewChucky?[]:s.chucky,nChucky)}
      </div></section>
      <section className="cs-band cs-community" aria-label="Community cards"><h2>Community</h2><div className="cs-cards">
        {s.phase==='deal'&&elapsed<800?<Riffle/>:cards('community',s.community,nBoard)}</div></section>
      <section className="cs-choice" aria-label="Decisions and results"><div className="cs-message"><strong role="status" className={announced?'cs-cracked':''}>{title}</strong>
        {deciding&&<div className="cs-clock" role="timer" aria-label={Math.ceil(remaining/1000)+' seconds remaining'}><CountdownDots remaining={remaining} duration={s.phase==='choose'?v.config.selectMs:v.config.foldMs}/></div>}
        {banked&&<TriScorePill root={root} item={{id:userId,score:s.score,active:true}} value={completed}/>}</div>
        {s.phase==='crack'&&announced&&<p className="cs-hand-label">{handAnnouncement(s)}</p>}
        {s.phase==='fold_stay'&&<ChuckyLevelAvailability uses={s.uses}/>}
        {s.phase==='fold_stay'&&<div className="cs-decisions">
          <button disabled={!canAct} onClick={()=>game.act('fold')}><b>FOLD</b> <small>{s.folds===1?'Bank Total':s.folds+' remaining'}</small></button>
          <button disabled={!canAct} onClick={()=>game.act('stay')}><b>STAY</b> <small>Choose level after reveal</small></button></div>}
        {(s.phase==='choose'||s.phase==='showdown')&&<div className="cs-levels">{s.uses.map((uses,i)=><button key={i} disabled={!canAct||uses===0}
          data-done={!uses} data-selected={(game.choice?.level??s.level)===i+1} onClick={()=>game.act('press',i+1)}
          aria-label={'Level '+(i+1)+', '+winBonus(v.config,i+1)+' points, '+uses+' uses remaining'}><b>{i+1}</b><small>{winBonus(v.config,i+1)}</small><small>{uses} left</small></button>)}</div>}
      </section>
      <section className="cs-band cs-player" aria-label="My cards"><h2>My cards</h2><div className="cs-cards" data-folding={s.phase==='fold'&&live||undefined}>{cards('player',s.player,nPrivate)}</div></section>
      <section className="cs-bank" aria-label="Scoring"><dl><div><dt>Completed rounds</dt><dd>{completed.toLocaleString()}</dd></div>
        <div><dt>At risk</dt><dd>{risk.toLocaleString()}</dd></div></dl>
        {game.error&&<div role="alert">{game.error} <button onClick={game.reconnect}>Reconnect</button></div>}
      </section>
      {cracking&&elapsed>=crackLiftMs&&elapsed<crackEndMs&&<ChuckyCrackLoss key={key}
        table={root} remaining={s.cracks} elapsed={elapsed} identity={key} userId={userId}/>}
    </div>
    {!competitive&&end&&elapsed>=2350&&elapsed<4650&&<ArcadeCompletion score={s.score} record={v.completion}/>}
  </main>;
}
