import {memo,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowLeft,Check,FlaskConical} from 'lucide-react';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {PlayingCard} from '@/components/PlayingCard';
import {ArcadeInfo} from './ArcadeInfo';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {getHandScoringCombos,getTotalFromCombos} from '@/lib/cribbageScoringDetails';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {useCribLab} from '@/hooks/useCribLab';
import {presentSound,isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {cribLabTransport,type LabTransport} from '@/lib/cribLab/client';
import {pairSelected,scoreBeat,suitGlyph,type Counts,type LabCard} from '@/lib/cribLab/model';
import './cribLab.css';

const categories: [keyof Omit<Counts,'total'>,string][]=[['fifteens','Fifteens'],['pairs','Pairs'],['runs','Runs'],['flush','Flush'],['nobs','Nobs']];
const labels={discard:'Discard',stock:'Stock',cut:'Cut',swap:'Swap',scoring:'Scoring'};
const cardName=(c:LabCard)=>c.rank+' of '+c.suit;
const Face=memo(function Face({card,selected=false}:{card:LabCard;selected?:boolean}){
  return <PlayingCard frontStyle="arcade-classic" card={{rank:card.rank,suit:suitGlyph[card.suit]}} highlight={selected?'gold':null} size="sm" style={{width:'100%',height:'100%'}}/>;
});

export function SoloCribLab({runId,userId,transport:provided}:{runId:string;userId:string;transport?:LabTransport}){
  const transport=useMemo(()=>provided??cribLabTransport(runId),[provided,runId]);
  const live=useRef(hasTriStart(runId)),navigate=useNavigate();
  const game=useCribLab(runId,userId,transport,live.current),v=game.snapshot,r=v?.result;
  const root=useRef<HTMLDivElement>(null),pill=useRef<HTMLDivElement>(null),fly=useRef<HTMLSpanElement>(null);
  const [picks,setPicks]=useState<number[][]>([]),[confirmExit,setConfirmExit]=useState(false);
  const beat=r?scoreBeat(r,game.now):null;
  const handIndex=beat?.stage==='hand'?beat.index:-1;
  const scoredHand=v?.hands[handIndex],starter=v?.cut,points=r?.hands[handIndex];
  const breakdown=useMemo(()=>{
    if(!scoredHand||!starter||!points)return '';
    const combos=getHandScoringCombos(scoredHand,starter,false);
    // This describes the frozen award. Only the server subtotal drives the score pill.
    if(getTotalFromCombos(combos)!==points.total)
      return categories.filter(([k])=>points[k]>0).map(([k,name])=>name+' +'+points[k]).join(' · ');
    const groups=new Map<string,{count:number;points:number}>();
    for(const combo of combos){
      const label=combo.type==='fifteen'?'Fifteen':combo.label,group=groups.get(label)??{count:0,points:0};
      groups.set(label,{count:group.count+1,points:group.points+combo.points});
    }
    return Array.from(groups,([label,g])=>(g.count>1?g.count+' × ':'')+label+' +'+g.points).join(' · ');
  },[scoredHand,starter,points]);
  const countLive=!!r&&game.count===r.id;
  const phase=v?.phase,roundId=v?.roundId;
  useEffect(()=>()=>retireTriStart(runId),[runId]);
  useEffect(()=>{setPicks([]);setConfirmExit(false);},[phase,roundId,v?.revision]);
  useEffect(()=>{
    if(!v)return;
    if(v.status==='abandoned'||(v.status==='completed'&&(game.bornEnded||game.now>=(v.phaseUntil??0)+1600)))
      navigate('/arcade/crib-lab?result='+runId,{replace:true});
  },[game.bornEnded,game.now,v,navigate,runId]);
  const cue=game.cue;
  useEffect(()=>{
    if(!cue||cue.roundId!==roundId)return;
    if(cue.intent.type==='pass')presentSound('triInvalid',cue.requestId,root.current);
    if(cue.intent.type==='replace')presentSound('slide',cue.requestId,root.current);
    if(cue.intent.type==='swap')presentSound('slide',cue.requestId+':out',root.current);
  },[cue,roundId]);
  const [lastCount,setLastCount]=useState('');
  useEffect(()=>{
    if(!countLive||!beat||!r||!isSoundSurfaceVisible(root.current))return;
    const id=r.id+':'+beat.stage+':'+beat.index;
    if(beat.stage==='hand')presentSound('cribbageHighlight',id,root.current);
    if(beat.stage==='total')presentSound('scorePost',id,root.current);
    setLastCount(id);
  },[countLive,beat?.stage,beat?.index,r?.id]);
  // Move the subtotal from its hand to the actual pill, including split landscape layouts.
  useEffect(()=>{
    const node=fly.current,target=pill.current;
    if(!node||!target||!lastCount||!countLive||beat?.stage!=='hand'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const a=node.getBoundingClientRect(),b=target.getBoundingClientRect();
    const x=b.left+b.width/2-a.left-a.width/2,y=b.top+b.height/2-a.top-a.height/2;
    const motion=node.animate([{opacity:0},{opacity:1,offset:.18},{opacity:1,offset:.45},{transform:'translate('+x+'px,'+y+'px) scale(.65)',opacity:0}],{duration:1080,fill:'both'});
    return ()=>motion.cancel();
  },[lastCount,countLive]);
  const countWindow=r?{from:r.base,to:r.award,startedAt:r.scoredAt+7000,endsAt:r.scoredAt+8350}:null;
  usePresentedScoreAudio(userId,r&&countLive&&beat?.stage==='award'&&isSoundSurfaceVisible(root.current)&&game.now>=r.scoredAt+7000?'crib-lab:count:'+r.id:null,countWindow,game.now);
  if(!v)return <main className="arcade-page"><p role="status">{game.error||'Dealing Crib Lab…'}</p>{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</main>;
  const frozen=phase==='scoring',remaining=Math.max(0,Math.min(v.durationMs,v.deadline-(r?.scoredAt??game.now)));
  const multiplier=r?.multiplier??100+Math.floor(200*remaining/v.durationMs);
  const blocked=!game.ready||game.pending||v.status!=='active'||remaining===0;
  const allReady=v.discardMasks.every(pairSelected),shown=v.offer??v.cut;
  const swapCue=cue?.intent.type==='swap'&&cue.revision+1===v.revision?cue:null;
  const active=beat?.stage==='hand'?beat.index:-1;
  const selected=(h:number,i:number)=>phase==='discard'?!!(v.discardMasks[h]&(1<<i)):picks.some(([row,idx])=>row===h&&idx===i);
  const choose=(h:number,i:number)=>{
    if(phase==='discard')game.act('select',[h,i]);
    if(phase==='stock')game.act('replace',[h,i]);
    if(phase==='swap'){
      if(selected(h,i))setPicks(picks.filter(([row])=>row!==h));
      else setPicks([...picks.filter(([row])=>row!==h).slice(0,1),[h,i]]);
    }
  };
  const scoreLabel=beat?({hand:'Base score',base:'Base score',award:'Round score',total:'Game total'})[beat.stage]:'Game total';
  return <main className="arcade-run lab-scene" data-shell-presentation-mode="fullscreen">
    <div ref={root} className="lab-table" data-phase={phase} data-round={v.round}>
      <header className="lab-header"><Link aria-label="Back to Crib Lab leaderboard" to="/arcade/crib-lab"><ArrowLeft size={20}/></Link>
        <h1><FlaskConical aria-hidden="true"/>Crib Lab</h1><span>Round <b>{v.round}</b> / 3</span>
        <GameplaySoundButton/><ArcadeInfo game="crib-lab" name="Crib Lab" ruleset={v.ruleset}/></header>
      <div className="lab-hud"><div className="lab-meter" aria-label={'Round timer, '+Math.ceil(remaining/1000)+' seconds'}>
        <div><b>{Math.floor(Math.ceil(remaining/1000)/60)}:{String(Math.ceil(remaining/1000)%60).padStart(2,'0')}</b></div>
        <CountdownDots remaining={remaining} duration={v.durationMs}/>{r&&beat?.stage!=='total'&&<small>Game total · {r.before.toLocaleString()}</small>}</div>
        <div ref={pill} className="lab-score"><small>{scoreLabel}</small><TriScorePill root={root} item={{id:userId,score:v.score,active:true}} value={beat?.value??v.score}/></div>
        <div className="lab-factor"><small>Multiplier</small><b>×{multiplier}</b></div>
      </div>
      <section className="lab-rows" aria-label="Five hands" key={v.roundId}>
        {v.hands.map((hand,h)=><div className="lab-row" key={h} data-counting={h===active} data-ready={phase==='discard'&&pairSelected(v.discardMasks[h])}>
          <div className="lab-hand-label" aria-label={'Hand '+(h+1)}><small>Hand</small><b>{h+1}</b>{phase==='discard'&&pairSelected(v.discardMasks[h])&&<Check size={12}/>}</div>
          <div className="lab-cards">{hand.map((card,i)=>{
            const marked=selected(h,i),arrive=game.deal===v.roundId&&phase==='discard';
            const exchange=swapCue&&((swapCue.intent.items[0]===h&&swapCue.intent.items[1]===i)?'out':(swapCue.intent.items[2]===h&&swapCue.intent.items[3]===i)?'in':'');
            return <button key={card.suit+card.rank} className="lab-card" aria-label={'Hand '+(h+1)+', '+cardName(card)} aria-pressed={marked}
              disabled={blocked||!['discard','stock','swap'].includes(v.phase)||phase==='discard'&&pairSelected(v.discardMasks[h])&&!marked}
              data-picked={marked} data-arrive={arrive} data-exchange={exchange||undefined} style={{'--deal-delay':h*185+i*20+'ms'} as CSSProperties}
              onAnimationStart={e=>{
                if(e.target!==e.currentTarget)return;
                if(arrive&&i===0)presentSound('slide',v.roundId+':deal:'+h,e.currentTarget);
                if(exchange==='in'&&swapCue)presentSound('flip',swapCue.requestId+':in',e.currentTarget);
              }} onClick={()=>choose(h,i)}><Face card={card} selected={marked}/>
              {marked&&<span className="lab-mark" aria-hidden="true">{phase==='discard'?'−':'✓'}</span>}</button>;
          })}</div>{h===active&&r&&<span ref={fly} className="lab-flight" aria-hidden="true">+{r.hands[h].total}</span>}
        </div>)}
      </section>
      <section className="lab-controls" aria-label="Round actions">
        <div className="lab-phase" key={v.phase}><strong>{labels[v.phase]}</strong>
          <span>{phase==='discard'?v.discardMasks.filter(pairSelected).length+' / 5 ready':phase==='stock'?v.stockLeft+' stock left':phase==='swap'?v.swapsLeft+' swaps left':phase==='cut'?'Shared starter':'Round '+v.round}</span></div>
        <div className="lab-actionline">{shown&&<div className={'lab-offer '+(phase==='stock'?'lab-stock':'')} key={cardName(shown)}
          aria-label={(phase==='stock'?'Stock offer, ':'Shared starter, ')+cardName(shown)} data-reveal={phase==='cut'&&!!cue&&cue.revision+1===v.revision}
          onAnimationStart={e=>{if(e.target===e.currentTarget&&phase==='cut'&&cue?.revision===v.revision-1)presentSound('flip',v.roundId+':cut',e.currentTarget);}}>
          <Face card={shown}/><small>{phase==='stock'?'Stock':'Starter'}</small></div>}
          <div className="lab-decisions">
            {phase==='discard'&&<><p>Mark two cards in each hand.</p><button className="lab-primary" disabled={blocked||!allReady} onClick={()=>game.act('lock')}>Lock Discards</button></>}
            {phase==='stock'&&<><p>Tap a kept card to replace it.</p><button className="lab-primary" disabled={blocked} onClick={()=>game.act('pass')}>Pass</button></>}
            {phase==='cut'&&<p>One starter for all five hands.</p>}
            {phase==='swap'&&<><p>{picks.length===2?'Exchange hands '+(picks[0][0]+1)+' and '+(picks[1][0]+1)+'?':'Pick one card in each of two hands.'}</p>
              <div className="lab-buttons">{picks.length===2&&<button className="lab-primary" disabled={blocked} onClick={()=>game.act('swap',picks.flat())}>Confirm Swap</button>}
              {!!picks.length&&<button disabled={blocked} onClick={()=>setPicks([])}>Cancel</button>}
              <button className={picks.length?'':'lab-primary'} disabled={blocked} onClick={()=>game.act('stand')}>Stand Pat</button></div></>}
            {r&&beat&&<div aria-live="polite" className="lab-breakdown">
              {beat.stage==='hand'?<><b>Hand {beat.index+1} · {r.hands[beat.index].total} points</b>
              <p>{breakdown||'No scoring combinations'}</p></>
              :<><b>{beat.stage==='base'?'Five-hand base':beat.stage==='award'?'Round award':'Game total'}</b>
              <p>{beat.stage==='base'?r.base+' points':beat.stage==='award'?r.base+' × '+r.multiplier:r.before.toLocaleString()+' + '+r.award.toLocaleString()}</p></>}
            </div>}
          </div>
        </div>
        {(game.error||!game.ready)&&<div className="lab-feedback" role="status">{game.error||'Connecting…'} <button onClick={game.reconnect}>Reconnect</button></div>}
        {!frozen&&<div className="lab-exit">{confirmExit?<><span>End this unranked?</span><button disabled={game.pending} onClick={()=>game.act('abandon')}>End game</button><button onClick={()=>setConfirmExit(false)}>Keep playing</button></>:<button onClick={()=>setConfirmExit(true)}>Abandon game</button>}</div>}
      </section>
    </div>
    {v.status==='completed'&&!game.bornEnded&&game.now>=(v.phaseUntil??Infinity)&&<ArcadeCompletion score={v.score} record={v.completion}/>}
  </main>;
}
