import {winCue} from '@/lib/chuckyShowdown/model';
import {useEffect,useMemo,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowLeft,Check,Spade} from 'lucide-react';
import {ArcadeInfo} from './ArcadeInfo';
import {CardSlot,EndRun,Riffle} from './ChuckyTableParts';
import {ChuckyRoundTable} from './ChuckyRoundTable';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {presentSound,isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import type {ApprovedSound} from '@/lib/audio/approvedSounds';
import {useChuckyShowdown} from '@/hooks/useChuckyShowdown';
import {chuckyShowdownTransport} from '@/lib/chuckyShowdown/client';
import {dealFrame,scoreFrame,type ShowdownSnapshot} from '@/lib/chuckyShowdown/model';
import {isV2} from '@/lib/chuckyShowdown/model';
import './chuckyShowdown.css';

const roundBannerAt=(v:ShowdownSnapshot)=>v.since+(v.reason==='cracked'?1800:1150);
function phaseSounds(v:ShowdownSnapshot):[number,ApprovedSound,string][]{
  const beats:[number,ApprovedSound,string][]=[];
  const cards=(n:number,offset:number,key:string)=>{
    for(let i=0;i<n;i++)beats.push([offset+i*180,'slide',key+i]);
  };
  if(v.phase==='deal'){
    if(v.fresh)cards(4,0,'player');
    const shuffle=v.fresh?820:0;
    beats.push([shuffle,'riffle','shuffle']);
    cards(4,shuffle+850,'community');
  }else if(v.phase==='showdown'){
    beats.push([0,'chip','commit']);
    cards(v.level,180,'chucky');

  }else if(v.phase==='payout'){
    beats.push([0,v.reason==='cracked'?'cracked':'chip','payout']);
    if(v.hand%3===0)beats.push([roundBannerAt(v)-v.since,'scorePost','round']);
  }
  return beats;
}
function status(v:ShowdownSnapshot,roundClosed:boolean){
  if(roundClosed)return v.hand===9?'Final round complete':'Round '+v.round+' complete';
  if(v.phase==='win')return '+'+(v.level*100)+' at risk';
  if(v.phase==='payout')return v.reason==='cracked'?'YOU GOT CRACKED!':v.reason==='timeout'?'Time up · hand banked':v.reason==='all'?'All seven cleared!':'Hand banked';
  if(v.phase==='showdown')return 'Chucky · Level '+v.level;
  if(v.phase==='deal')return v.fresh?'New hand':'Fresh community';
  return 'Choose a level';
}

export function SoloChuckyShowdown({runId,userId}:{runId:string;userId:string}){
  const transport=useMemo(()=>chuckyShowdownTransport(runId),[runId]);
  const liveEntry=useRef(hasTriStart(runId));
  const game=useChuckyShowdown(runId,userId,transport,liveEntry.current);
  useEffect(()=>{retireTriStart(runId);},[runId]);
  const v=game.snapshot;
  if(!v)return <main className="arcade-page"><p role="status">{game.error||'Dealing Chucky Showdown…'}</p>{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</main>;
  return isV2(v)?<ChuckyRoundTable game={game} v={v} userId={userId}/>:<LegacyTable game={game} v={v} userId={userId}/>;
}
function LegacyTable({game,v,userId}:{game:ReturnType<typeof useChuckyShowdown>;v:ShowdownSnapshot;userId:string}){
  const runId=v.id,root=useRef<HTMLDivElement>(null),navigate=useNavigate();
  const now=game.now,phaseKey=v.phase+':'+v.since;
  const live=!!v&&phaseKey===game.livePhase;
  useEffect(()=>{
    if(!v||!live)return;
    const timers:ReturnType<typeof setTimeout>[]=[];
    for(const [offset,name,key] of phaseSounds(v)){
      const delay=v.since+offset-now;
      if(delay < -175)continue;
      timers.push(setTimeout(()=>presentSound(name,runId+':'+phaseKey+':'+key,root.current),Math.max(0,delay)));
    }
    return ()=>timers.forEach(clearTimeout);
    // Each persisted phase owns one cancellable sequence; clock and reveal-prefix updates seek it.
  },[live,phaseKey,runId]);
  useEffect(()=>{if(live&&v.phase==='win')presentSound(winCue(v.chucky.length),runId+':'+phaseKey+':win',root.current);},[live,phaseKey,runId,v.phase,v.chucky.length]);
  const revealed=v?.chucky.length??0;
  useEffect(()=>{
    if(v?.phase==='showdown'&&live&&revealed>0){
      const flipAt=v.since+v.level*180+540+(revealed-1)*360;
      if(now-flipAt<300)presentSound('flip',runId+':'+phaseKey+':flip'+revealed,root.current);
    }
  },[revealed,phaseKey,live,runId]);
  const roundClosed=!!v&&v.phase==='payout'&&v.hand%3===0&&now>=roundBannerAt(v);
  const roundCount=roundClosed?{from:0,to:v.bank,startedAt:roundBannerAt(v)+240,endsAt:roundBannerAt(v)+800}:null;
  const roundValue=roundCount?Math.round(roundCount.to*Math.max(0,Math.min(1,(now-roundCount.startedAt)/560))):0;
  usePresentedScoreAudio(userId,live&&roundCount&&roundCount.to>0&&now>=roundCount.startedAt&&isSoundSurfaceVisible(root.current)?
    runId+':round-count:'+v.round:null,roundCount,now);
  const scoring=v&&(v.phase==='win'||v.phase==='payout')?{
    startedAt:v.since+(v.phase==='payout'?190:0),endsAt:v.since+900,from:v.phase==='win'?v.beforeRisk:0,
    to:v.phase==='win'?v.risk:v.reason==='cracked'?0:v.beforeRisk,
  }:null;
  usePresentedScoreAudio(userId,live&&scoring&&now>=scoring.startedAt&&scoring.to>scoring.from&&isSoundSurfaceVisible(root.current)?runId+':count:'+phaseKey:null,scoring,now);
  useEffect(()=>{
    if(!v||v.status==='active')return;
    if(v.status==='abandoned'||game.bornEnded||!live||now>=v.due+2500)
      navigate('/arcade/chucky-showdown?result='+runId,{replace:true});
  },[v,live,game.bornEnded,now,navigate,runId]);

  const frames=dealFrame(v,now-v.since),score=scoreFrame(v,now);
  const decision=v.phase==='decision',left=decision?Math.max(0,v.due-(game.choice?.at??now)):0;
  const canAct=decision&&left>0&&game.ready&&!game.pending;
  const localHand=(v.hand-1)%3+1;
  return <main className="arcade-run cs-scene" data-shell-presentation-mode="fullscreen">
    <div className="cs-table" ref={root} data-phase={v.phase} data-hand={v.hand}>
      <header className="cs-header arcade-toolbar"><div className="arcade-toolbar-main">
        <Link to="/arcade/chucky-showdown" aria-label="Back to Chucky Showdown leaderboard"><ArrowLeft size={20}/></Link>
        <h1><Spade aria-hidden="true"/> Chucky Showdown</h1><GameplaySoundButton/><ArcadeInfo game="chucky-showdown" name="Chucky Showdown" ruleset={v.ruleset}>

        </ArcadeInfo></div>{v.status==='active'&&<EndRun disabled={!game.ready||game.pending} abandon={()=>game.act('abandon')}/>}
      </header>
      <section className="cs-band cs-dealer" aria-label="Chucky cards"><h2>Chucky</h2>
        <div className="cs-cards" key={v.roundId+':'+v.level}>
          {Array.from({length:frames.chucky},(_,i)=><CardSlot key={i} card={v.chucky[i]} flip={live&&v.phase==='showdown'}/>)}
        </div>
      </section>
      <section className="cs-band cs-community" aria-label="Community cards"><h2>Community</h2>
        <div className="cs-cards">{frames.mixing?<Riffle/>:v.community.slice(0,frames.community).map(c=><CardSlot key={c.rank+c.suit} card={c}/>)}</div>
      </section>
      <section className="cs-choice" aria-label="Chucky level choices">
        <div className="cs-message"><strong role="status" className={v.reason==='cracked'&&!roundClosed?'cs-cracked':''}>{status(v,roundClosed)}</strong>
          {decision&&<div className="cs-clock"><span>{Math.ceil(left/1000)}s</span><CountdownDots remaining={left} duration={v.durationMs}/></div>}
          {roundClosed&&<TriScorePill root={root} item={{id:userId,score:v.bank,active:true}} value={roundValue}/>}
        </div>
        <div className="cs-levels">{Array.from({length:7},(_,idx)=>{
          const n=idx+1,done=v.levels.includes(n);
          return <button key={n} disabled={!canAct||done} data-done={done} data-selected={(game.choice?.level??v.level)===n} onClick={()=>game.act('press',n)}
            aria-label={'Level '+n+', '+n*100+' points'+(done?', completed':'')}><b>{n}{done&&<Check aria-hidden="true"/>}</b><small>{n*100}</small></button>;
        })}</div>
      </section>
      <section className="cs-band cs-player" aria-label="My cards"><h2>My cards</h2>
        <div className="cs-cards" key={v.roundId}>{v.player.slice(0,frames.player).map(c=><CardSlot key={c.rank+c.suit} card={c}/>)}</div>
      </section>
      <section className="cs-bank" aria-label="Bank and scoring">
        <dl><div><dt>Completed rounds</dt><dd>{v.completedRounds.toLocaleString()}</dd></div>
          <div><dt>Round bank</dt><dd>{score.bank.toLocaleString()}</dd></div>
          <div><dt>At risk</dt><dd>{score.risk.toLocaleString()}</dd></div></dl>
        <div className="cs-bank-actions"><span>Round <b>{v.round}</b> / 3 <i>·</i> Hand <b>{localHand}</b> / 3</span>
          <button disabled={!canAct} onClick={()=>game.act('bank')}>Bank</button></div>
        {game.error&&<div className="cs-error" role="alert">{game.error} <button onClick={game.reconnect}>Reconnect</button></div>}
      </section>
    </div>
    {v.status==='completed'&&live&&!game.bornEnded&&now>=v.due&&<ArcadeCompletion score={v.score} record={v.completion}/>}
  </main>;
}
