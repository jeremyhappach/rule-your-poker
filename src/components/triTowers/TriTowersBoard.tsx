import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {adjacent,cardName,position,isV2,type Projection,type Intent} from '@/lib/triTowers/model';
import {towerAwards,dotClock} from '@/lib/triTowers/polishPresentation';
import {TriScorePill,TriRoundIntro,useTriRoundPresentation,type TriScore} from './TriTowersPresentation';
import {TriAllClear} from './TriAllClear';
import {triDealProgress} from '@/lib/triTowers/roundTimeline';
import type {TriIntentBuffer} from '@/lib/triTowers/intentBuffer';
import {triInputTiming,triTiming,triPaintTiming} from '@/lib/triTowers/diagnostics';
import {useTriTowerClearAudio} from './useTriTowerClearAudio';
import type {TriTowersStageResult} from './TriTowersStageResult';
import tower from '@/assets/cartoon/tower.webp';
import './triTowersScene.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const suits=['♠','♥','♦','♣'] as const;
function TowerCard({card,tableau=false,badge}:{card:number|null;tableau?:boolean;badge?:ReactNode}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(32);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span ref={ref} className="tri-card-art"><span style={{position:'relative',display:'block',width,height:width*1.5}}><PlayingCard frontStyle="cartoon" cartoonLayout={tableau?'tableau':'standard'} card={card===null?undefined:{rank:ranks[card%13],suit:suits[Math.floor(card/13)]}} isHidden={card===null} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>{badge}</span></span>;
}
export type TriTowersBoardView=Pick<Projection,'rules'|'phase'|'cards'|'removed'|'waste'|'stockRemaining'|'run'|'deadline'|'highRun'>;
interface Props {replay?:boolean;view:TriTowersBoardView;canAct:boolean;onIntent:(intent:Intent)=>void;result:Parameters<typeof TriTowersStageResult>[0]['result']|null;roundKey:string;now?:number;paused?:boolean;highRun?:number;scores?:TriScore[];takeScore?:ReactNode;userId?:string;connected?:boolean;presentationActive?:boolean;roundLabel?:string;turnLabel?:string;liveEntry?:boolean;recoveryEpoch?:number;input?:TriIntentBuffer;diagnosticRevision?:number}
export function TriTowersBoard({replay=false,view:v,canAct,onIntent,result,roundKey,now=0,paused=false,highRun=v.highRun,scores=[],takeScore,userId='',connected=true,presentationActive=true,roundLabel='ROUND 1',turnLabel,liveEntry=false,recoveryEpoch=0,input,diagnosticRevision}:Props){
 const root=useRef<HTMLDivElement>(null),v2=isV2(v.rules),awards=towerAwards(v.removed,v.rules);
 const previous=useRef({roundKey,cleared:v.removed.filter(i=>i<3)});
 const fresh=previous.current.roundKey===roundKey?awards.filter(a=>!previous.current.cleared.includes(a.tower)).map(a=>a.tower):[];
 const [animated,setAnimated]=useState<number[]>([]);
 useLayoutEffect(()=>{setAnimated(fresh);previous.current={roundKey,cleared:v.removed.filter(i=>i<3)};},[roundKey,v.removed]);
 const modern=['tri-towers/3','tri-towers/4','tri-towers/5'].includes(v.rules.version);
 const motion=useTriRoundPresentation({replay,scope:roundKey,phase:v.phase,connected,paused,result,now,deadline:v.deadline,userId,active:presentationActive,modern,liveEntry,recoveryEpoch,celebrationMs:v.rules.clearCelebrationMs??0});
 useTriTowerClearAudio({scope:roundKey,userId,removed:v.removed,phase:v.phase,recoveryEpoch,
  active:modern&&connected&&presentationActive&&!paused,reduced:motion.reduced,replay});
 useLayoutEffect(()=>{if(!presentationActive||!connected||paused)input?.interrupt();},[input,presentationActive,connected,paused]);
 const remaining=Math.max(0,v.deadline-now),full=modern?v.rules.stageMs:v.phase==='intro'?v.rules.roundIntroMs??2500:v.phase==='ready'?v.rules.readyMs:v.phase==='stage_complete'?v.rules.holdMs:v.rules.stageMs;
 const displayRemaining=modern&&v.phase==='stage_complete'?motion.drainRemaining:remaining,dots=dotClock(displayRemaining,full);
 const dealing=modern&&v.phase==='intro',dealElapsed=(v.rules.roundIntroMs??2500)-remaining;
 const deal=(index:number|'stock'|'upcard')=>dealing&&!motion.reduced?triDealProgress(dealElapsed,index):1;
 const flip=deal('upcard');
 useLayoutEffect(()=>triPaintTiming(roundKey+':'+diagnosticRevision),[roundKey,diagnosticRevision]);
 return <div ref={root} className="tri-shared-board" data-round-key={roundKey} data-stage-result={result?.id} data-dealing={dealing} data-result-elapsed={result?.elapsed}>
  <div className="tri-gameplay-top">
   <div className="tri-take-slot tri-actions">{takeScore}</div>
   <div className="tri-score-group" aria-label="Game scores" data-players={scores.length}>{scores.map(item=><TriScorePill key={item.id} item={replay?{...item,active:item.id===userId}:item} root={root} fraction={item.active?motion.fraction:0} value={item.active?(motion.displayScore??item.score):item.score}/>)}</div>
   <div className="tri-high-run" aria-label={`Round highest streak ${highRun??'unavailable'}`}><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M8 15 28 30 50 4 72 30 92 15 81 64H19Z" fill="#f5c32e" stroke="#a96d10" strokeWidth="4"/><path d="M19 56H81" stroke="#fff1a1" strokeWidth="3"/><text x="50" y="52" textAnchor="middle" fontSize="31" fontWeight="900" fill="#4c300a">{highRun??'—'}</text></svg><strong>HI-RUN</strong></div>
  </div>
  <div className="tri-tableau-space"><div className="tri-tableau" aria-label="Three towers">
   <div className="tri-castle" aria-hidden="true">{[0,1,2].map(i=><img key={i} src={tower} alt="" draggable={false} style={{left:`${(position(i).x+.485)*10}%`}}/>)}</div>
   {awards.map(a=><span key={`${roundKey}:${a.tower}`} className="tri-tower-award" data-animate={animated.includes(a.tower)} data-tower-award={a.tower} style={{left:`${(position(a.tower).x+.485)*10}%`}} aria-label={`Tower ${a.tower+1} bonus ${a.amount}`}>+{a.amount/1000}k</span>)}
   {v.cards.map((card,i)=>{if(v.removed.includes(i))return null;const pos=position(i),legal=card!==null&&adjacent(card,v.waste);
    return <button key={`${roundKey}:${i}`} className="tri-card" style={{'--x':pos.x,'--y':pos.y,opacity:deal(i),...(dealing?{transform:`translateY(${(1-deal(i))*-45}%) scale(${.85+.15*deal(i)})`}:{} )} as CSSProperties} data-tri-card={i} data-pending={input?.pendingCards.includes(i)} data-exposed={card!==null} data-legal={legal} aria-label={card===null?`Covered card ${i+1}`:`Remove ${cardName(card)}`} disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||card===null||(!legal&&!(input?.busy&&v.phase==='playing'))} onPointerDown={e=>triInputTiming('pointerdown',e.timeStamp)} onPointerUp={e=>triInputTiming('pointerup',e.timeStamp)} onClick={e=>{triInputTiming('click-handler',e.timeStamp);triTiming('intent',roundKey);onIntent({type:'remove',index:i});}}><TowerCard card={card} tableau/></button>;
   })}
  </div></div>
  {modern&&(v.phase==='ready'||v.phase==='intro')?<div className="tri-dot-clock tri-ready-text">{v.phase==='ready'&&<small>{paused?'Paused · ':''}Play a card or draw · {Math.ceil(remaining/1000)}s</small>}</div>:<div className="tri-dot-clock" role="progressbar" aria-label={v.phase==='stage_complete'?'Round timer completion':v.phase==='ready'?'Ready time remaining':'Round time remaining'} aria-valuemin={0} aria-valuemax={full/1000} aria-valuenow={Math.min(full,displayRemaining)/1000} aria-valuetext={`${paused?'Paused · ':''}${Math.ceil(displayRemaining/1000)} seconds remaining`} data-tone={dots.tone} data-intro={v.phase==='intro'}>
   <CountdownDots remaining={displayRemaining} duration={full}/>
   {(paused||v.phase==='ready')&&<small>{paused?'Paused':`Ready · ${Math.ceil(remaining/1000)}s`}</small>}
  </div>}
  <div className="tri-deck-row">
   <div className="tri-run"><strong>CURRENT RUN</strong><output aria-label="Current removal streak">{v.run}</output></div>
   <div className="tri-waste" aria-label={`Waste ${cardName(v.waste)}`}><div className="tri-upcard-flip" style={{visibility:flip===0?'hidden':'visible',transform:`scaleX(${Math.abs(1-flip*2)})`}}><TowerCard card={flip<.5?null:v.waste}/></div></div>
   <button className="tri-stock" style={{opacity:deal('stock')}} data-empty={v.stockRemaining===0} disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||v.stockRemaining===0} onClick={()=>onIntent({type:'draw'})} aria-label={`Draw stock, ${v.stockRemaining} stock cards remaining`}><TowerCard card={null} badge={<span className="tri-stock-count" aria-hidden="true">{v.stockRemaining}</span>}/></button>
  </div>
  {modern&&result&&(!motion.admitted||result.reason!=='cleared'||motion.elapsed>=(v.rules.clearCelebrationMs??0))&&<div className="tri-round-summary" role="status"><strong>{result.reason==='cleared'?'All towers cleared':result.reason==='ready_timeout'?'Round not started':result.reason==='timeout'?'Time expired':'Round complete'}</strong><span>{result.timeBonus>0&&`Time +${result.timeBonus.toLocaleString()}`}{result.timeBonus>0&&!!result.stockBonus?' · ':''}{!!result.stockBonus&&`Stock +${result.stockBonus.toLocaleString()}`}</span></div>}
  {modern&&motion.admitted&&result?.reason==='cleared'&&motion.elapsed<(v.rules.clearCelebrationMs??4000)&&<TriAllClear root={root} elapsed={motion.elapsed} opacity={motion.timeline.crest} reduced={motion.reduced}/>}
  {v.phase==='intro'&&<div className="tri-deal-title"><TriRoundIntro key={roundKey} remaining={remaining} roundLabel={roundLabel} turnLabel={turnLabel} paused={paused}/></div>}
  {input?.message&&<div className="tri-input-status" role="status">{input.message}{input.uncertain&&<button onClick={()=>void input.recover()}>Resolve play</button>}</div>}
 </div>;
}
