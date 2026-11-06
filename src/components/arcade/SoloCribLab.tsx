import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowLeft,ArrowLeftRight,FlaskConical,Layers,LogOut} from 'lucide-react';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {PlayingCard} from '@/components/PlayingCard';
import {ArcadeInfo} from './ArcadeInfo';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {AlertDialog,AlertDialogTrigger,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {useCribLab} from '@/hooks/useCribLab';
import {presentSound,isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {cribLabTransport,type LabTransport} from '@/lib/cribLab/client';
import {totalCountWindow,decisionTimeLeft,pairSelected,scoreBeat,suitGlyph,type Counts,type LabCard,type LabTransition} from '@/lib/cribLab/model';
import './cribLab.css';

const categories:[keyof Omit<Counts,'total'>,string][]=[['fifteens','Fifteens'],['pairs','Pairs'],['runs','Runs'],['flush','Flush'],['nobs','Nobs']];
const labels={discard:'Discard',stock:'Draw From Stock',cut:'Cut',swap:'Swap',scoring:'Scoring'};
const phaseTitles={discard:'Discard Phase',stock:'Stock Phase',swap:'Swap Phase'};
const cardName=(c:LabCard)=>c.rank+' of '+c.suit;
const Face=memo(function Face({card,selected=false}:{card:LabCard;selected?:boolean}){
  return <PlayingCard frontStyle="arcade-classic" card={{rank:card.rank,suit:suitGlyph[card.suit]}} highlight={selected?'gold':null} size="sm" style={{width:'100%',height:'100%'}}/>;
});

function PhaseOverlay({hold,live}:{hold:LabTransition;live:boolean}){
  const surface=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(live)presentSound('peg',hold.id+':transition',surface.current);},[hold.id,live]);
  if(hold.phase==='cut')return null;
  const Icon=hold.phase==='swap'?ArrowLeftRight:Layers;
  return <div className="lab-overlay" ref={surface} role="status" data-live={live}>
    <div className="lab-overlay-title"><Icon aria-hidden="true"/><strong>{phaseTitles[hold.phase]}</strong></div>
  </div>;
}

export function SoloCribLab({runId,userId,transport:provided}:{runId:string;userId:string;transport?:LabTransport}){
  const transport=useMemo(()=>provided??cribLabTransport(runId),[provided,runId]);
  const live=useRef(hasTriStart(runId)),navigate=useNavigate();
  const game=useCribLab(runId,userId,transport,live.current),v=game.snapshot,r=v?.result;
  const root=useRef<HTMLDivElement>(null),baseCounter=useRef<HTMLElement>(null),fly=useRef<HTMLSpanElement>(null);
  const [picks,setPicks]=useState<number[][]>([]);
  const beat=r?scoreBeat(r,game.now):null;
  const countLive=!!r&&!!beat&&game.count===r.id&&r.scoredAt+beat.at>game.countAfter;
  const phase=v?.phase,roundId=v?.roundId,cue=game.cue;
  const counting=beat?.stage==='combo'||beat?.stage==='hand',handBeat=counting||beat?.stage==='subtotal';
  const beatKey=beat&&r?r.id+':'+beat.stage+':'+beat.index+':'+beat.at:null;
  useEffect(()=>()=>retireTriStart(runId),[runId]);
  useEffect(()=>{setPicks([]);},[roundId,v?.revision]);
  useEffect(()=>{
    if(v&&(v.status==='abandoned'||v.status==='completed'&&(game.bornEnded||game.now>=(v.phaseUntil??0)+1600)))
      navigate('/arcade/crib-lab?result='+runId,{replace:true});
  },[game.bornEnded,game.now,v,navigate,runId]);
  useEffect(()=>{
    if(!cue||cue.roundId!==roundId)return;
    if(cue.intent.type==='pass')presentSound('triInvalid',cue.requestId,root.current);
    if(cue.intent.type==='replace')presentSound('slide',cue.requestId,root.current);
    if(cue.intent.type==='swap')presentSound('slide',cue.requestId+':out',root.current);
  },[cue,roundId]);
  const countWindow=r?totalCountWindow(r):null;
  const tallying=beat?.stage==='total'&&!!countWindow&&countWindow.to>countWindow.from;
  const landed=tallying&&game.now>=countWindow!.endsAt;
  useEffect(()=>{
    if(!countLive||!beatKey)return;
    if(counting)presentSound('cribbageHighlight',beatKey,root.current);
    if(landed)presentSound('scorePost',beatKey,root.current);
  },[countLive,beatKey,counting,landed]);
  // A flight belongs to one live beat. A recovered frame seeks the ledger silently.
  useLayoutEffect(()=>{
    const node=fly.current,target=baseCounter.current;
    if(!node||!target||!beat||!countLive||!counting||!isSoundSurfaceVisible(root.current)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const row=node.parentElement;
    const contributors=row?.querySelectorAll<HTMLElement>('.lab-card[data-scored=true]');
    if(row&&contributors?.length){
      const edge=contributors[contributors.length-1].getBoundingClientRect().right-row.getBoundingClientRect().left;
      node.style.left=Math.min(row.clientWidth-node.offsetWidth,Math.max(0,edge-node.offsetWidth*.35))+'px';
      node.style.right='auto';
    }
    const end=target.getBoundingClientRect(),start=node.getBoundingClientRect();
    const x=end.left+end.width/2-start.left-start.width/2,y=end.top+end.height/2-start.top-start.height/2;
    const motion=node.animate([{opacity:1},{opacity:1,offset:.35},{transform:'translate('+x+'px,'+y+'px) scale(.7)',opacity:0}],
      {duration:beat.ms,fill:'both'});
    motion.currentTime=Math.min(beat.ms,Math.max(0,game.now-r!.scoredAt-beat.at));
    return ()=>motion.cancel();
  },[beatKey,countLive,counting]);
  usePresentedScoreAudio(userId,r&&countLive&&tallying&&!landed&&isSoundSurfaceVisible(root.current)?'crib-lab:count:'+r.id:null,countWindow,game.now);
  if(!v)return <main className="arcade-page"><p role="status">{game.error||'Dealing Crib Lab…'}</p>{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</main>;

  const hold=v.transition,remaining=decisionTimeLeft(v,game.now),seconds=Math.ceil(remaining/1000);
  const blocked=!game.ready||game.pending||v.status!=='active'||!!hold||remaining===0;
  const allReady=v.discardMasks.every(pairSelected),shown=v.offer??v.cut;
  const swapCue=cue?.intent.type==='swap'&&cue.revision+1===v.revision?cue:null;
  const active=handBeat?beat!.index:-1,combo=beat?.stage==='combo'?beat:null;
  const selected=(h:number,i:number)=>phase==='discard'?!!(v.discardMasks[h]&(1<<i)):picks.some(([row,idx])=>row===h&&idx===i);
  const choose=(h:number,i:number)=>{
    if(phase==='discard')game.act('select',[h,i]);
    if(phase==='stock')game.act('replace',[h,i]);
    if(phase==='swap'){
      if(selected(h,i))setPicks(picks.filter(([row])=>row!==h));
      else setPicks([...picks.filter(([row])=>row!==h).slice(0,1),[h,i]]);
    }
  };
  const reveal=phase==='cut'&&(hold?game.liveTransition===hold.id:!!cue&&cue.revision+1===v.revision);
  return <main className="arcade-run lab-scene" data-shell-presentation-mode="fullscreen">
    <div ref={root} className="lab-table" data-phase={phase} data-round={v.round}>
      <header className="lab-header"><Link aria-label="Back to Crib Lab leaderboard" to="/arcade/crib-lab"><ArrowLeft size={20}/></Link>
        <h1><FlaskConical aria-hidden="true"/>Crib Lab</h1>
        <GameplaySoundButton/><ArcadeInfo game="crib-lab" name="Crib Lab" ruleset={v.ruleset}/>
        {v.status==='active'&&<AlertDialog><AlertDialogTrigger asChild><button className="lab-abandon" aria-label="Abandon game"><LogOut size={16}/>Abandon</button></AlertDialogTrigger>
          <AlertDialogContent><AlertDialogTitle>Abandon this game?</AlertDialogTitle><AlertDialogDescription>This run will end without a leaderboard score.</AlertDialogDescription>
            <AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel><AlertDialogAction disabled={!game.ready||game.pending} onClick={()=>game.act('abandon')}>End game</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent></AlertDialog>}
      </header>
      <div className="lab-hud">
        <span className="lab-round">Round <b>{v.round}</b> / 3</span>
        <div className="lab-score" role="group" aria-label="Game total"><TriScorePill root={root} item={{id:userId,score:v.score,active:true}} value={beat?.gameTotal??v.score}/></div>
      </div>
      <section className="lab-rows" aria-label="Five hands" key={v.roundId}>
        {v.hands.map((hand,h)=><div className="lab-row" key={h} role="group" aria-label={'Hand '+(h+1)} data-counting={h===active} data-ready={phase==='discard'&&pairSelected(v.discardMasks[h])}>
          <div className="lab-cards">{hand.map((card,i)=>{
            const marked=selected(h,i),scored=!!combo&&h===active&&!!(combo.mask&(1<<i)),arrive=game.deal===v.roundId&&phase==='discard'&&!hold;
            const exchange=swapCue&&((swapCue.intent.items[0]===h&&swapCue.intent.items[1]===i)?'out':(swapCue.intent.items[2]===h&&swapCue.intent.items[3]===i)?'in':'');
            return <button key={card.suit+card.rank} className="lab-card" aria-label={'Hand '+(h+1)+', '+cardName(card)} aria-pressed={marked}
              disabled={blocked||!['discard','stock','swap'].includes(v.phase)||phase==='discard'&&pairSelected(v.discardMasks[h])&&!marked}
              data-scored={scored} data-dim={!!combo&&!scored} data-arrive={arrive} data-exchange={exchange||undefined} style={{'--deal-delay':h*185+i*20+'ms'} as CSSProperties}
              onAnimationStart={e=>{
                if(e.target!==e.currentTarget)return;
                if(arrive&&i===0)presentSound('slide',v.roundId+':deal:'+h,e.currentTarget);
                if(exchange==='in'&&swapCue)presentSound('flip',swapCue.requestId+':in',e.currentTarget);
              }} onClick={()=>choose(h,i)}><Face card={card} selected={marked||scored}/></button>;
          })}</div>{h===active&&counting&&<span ref={fly} className="lab-flight" key={beatKey} aria-hidden="true">+{beat!.points}</span>}
        </div>)}
      </section>
      <div className="lab-meter" role="progressbar" aria-label="Round decision time" aria-valuemin={0} aria-valuemax={v.durationMs/1000} aria-valuenow={seconds}
        aria-valuetext={seconds+' seconds remaining'+(hold||r?', paused':'')}><CountdownDots remaining={remaining} duration={v.durationMs}/></div>
      <section className="lab-controls" aria-label="Round actions">
        <div className="lab-phase"><strong>{labels[v.phase]}</strong>
          {phase==='discard'&&<span>{v.discardMasks.filter(pairSelected).length} / 5 ready</span>}
          {phase==='swap'&&<span>{v.swapsLeft} swaps left</span>}</div>
        <div className="lab-actionline" data-has-card={!!shown}>
          {shown&&<div className={'lab-offer '+(phase==='stock'?'lab-stock':'')} key={cardName(shown)}
            aria-label={(phase==='stock'?'Stock offer, ':'Shared starter, ')+cardName(shown)} data-reveal={reveal}
            data-scored={!!combo&&(combo.mask&16)!==0} data-dim={!!combo&&(combo.mask&16)===0}
            onAnimationStart={e=>{if(e.target===e.currentTarget&&reveal)presentSound('flip',v.roundId+':cut',e.currentTarget);}}>
            <Face card={shown} selected={!!combo&&(combo.mask&16)!==0}/>
            {phase==='stock'?<span className="lab-stock-count" aria-label={v.stockLeft+' stock offers remaining'}>{v.stockLeft}</span>:<small>Starter</small>}</div>}
          {phase==='discard'&&<><p>Mark two cards in each hand.</p><button className="lab-primary" disabled={blocked||!allReady} onClick={()=>game.act('lock')}>Lock Discards</button></>}
          {phase==='stock'&&<><p>Tap a card to replace it.</p><button className="lab-primary" disabled={blocked} onClick={()=>game.act('pass')}>Pass</button></>}
          {phase==='swap'&&<>
            <div className="lab-swap-choice">
              <p aria-hidden={picks.length>0}>Pick a card in two different hands.</p>
              {picks.length>0&&<button disabled={blocked} onClick={()=>setPicks([])}>Cancel</button>}
            </div>
            {picks.length===0
              ?<button className="lab-primary" disabled={blocked} onClick={()=>game.act('stand')}>Stand Pat</button>
              :<button className="lab-primary" disabled={blocked||picks.length!==2} onClick={()=>game.act('swap',picks.flat())}>Confirm</button>}
          </>}
          {r&&beat&&handBeat&&<>
            <div className="lab-breakdown" data-stage={beat.stage} data-step={beat.at} role="status">
              <span className="sr-only">Hand {beat.index+1}. </span><b>{beat.stage==='combo'?beat.label:'Hand '+(beat.index+1)}</b>
              <p>{beat.stage==='combo'?'+'+beat.points:beat.points+' points'}</p>
              {beat.stage==='hand'&&<small>{categories.filter(([k])=>r.hands[beat.index][k]>0).map(([k,label])=>label+' +'+r.hands[beat.index][k]).join(' · ')}</small>}
            </div>
            <div className="lab-base-counter"><small>Base score</small><strong ref={baseCounter}>{beat.baseScore}</strong></div>
          </>}
        </div>
        {(game.error||!game.ready)&&<div className="lab-feedback" role="status">{game.error||'Connecting…'} <button onClick={game.reconnect}>Reconnect</button></div>}
      </section>
      {r&&beat?.stage==='equation'&&<div className="lab-overlay lab-equation" role="status">
        <div className="lab-formula" aria-hidden="true">
          <span><strong>{r.base}</strong><small>Base score</small></span><i>×</i>
          <span><strong>{r.multiplier}</strong><small>Time bonus</small></span><i>=</i>
          <span><strong>{r.award.toLocaleString()}</strong><small>Round score</small></span>
        </div>
        <span className="sr-only">Base score {r.base} times time bonus {r.multiplier} equals {r.award} round points.</span>
      </div>}
      {hold&&hold.phase!=='cut'&&game.now<hold.endsAt&&<PhaseOverlay key={hold.id} hold={hold} live={game.liveTransition===hold.id}/>}
    </div>
    {v.status==='completed'&&!game.bornEnded&&game.now>=(v.phaseUntil??Infinity)&&<ArcadeCompletion score={v.score} record={v.completion}/>}
  </main>;
}
