import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import {adjacent,cardName,position,isV2,type Projection,type Intent} from '@/lib/triTowers/model';
import {towerAwards,dotClock} from '@/lib/triTowers/polishPresentation';
import {TriTowersStageResult} from './TriTowersStageResult';
import tower from '@/assets/cartoon/tower.webp';

const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const suits=['♠','♥','♦','♣'] as const;
function TowerCard({card}:{card:number|null}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(32);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span ref={ref} className="tri-card-art"><PlayingCard frontStyle="cartoon" card={card===null?undefined:{rank:ranks[card%13],suit:suits[Math.floor(card/13)]}} isHidden={card===null} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/></span>;
}
export type TriTowersBoardView=Pick<Projection,'rules'|'phase'|'cards'|'removed'|'waste'|'stockRemaining'|'run'|'deadline'|'highRun'>;
export function TriTowersBoard({view:v,canAct,onIntent,result,roundKey,now=0,paused=false,highRun=v.highRun}:{view:TriTowersBoardView;canAct:boolean;onIntent:(intent:Intent)=>void;result:Parameters<typeof TriTowersStageResult>[0]['result']|null;roundKey:string;now?:number;paused?:boolean;highRun?:number}){
 const v2=isV2(v.rules),awards=towerAwards(v.removed,v.rules);
 const previous=useRef({roundKey,cleared:v.removed.filter(i=>i<3)});
 const fresh=previous.current.roundKey===roundKey?awards.filter(a=>!previous.current.cleared.includes(a.tower)).map(a=>a.tower):[];
 // Capture only new live clears. Restored rounds show settled badges without replay.
 const [animated,setAnimated]=useState<number[]>([]);
 useLayoutEffect(()=>{setAnimated(fresh);previous.current={roundKey,cleared:v.removed.filter(i=>i<3)};},[roundKey,v.removed]);
 const remaining=Math.max(0,v.deadline-now),full=v.phase==='ready'?v.rules.readyMs:v.phase==='stage_complete'?v.rules.holdMs:v.rules.stageMs;
 const dots=dotClock(remaining,full);
 return <div className="tri-shared-board" data-round-key={roundKey}>
  <div className="tri-high-run" aria-label={`Round highest streak ${highRun??'unavailable'}`}><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M8 15 28 30 50 4 72 30 92 15 81 64H19Z" fill="#f5c32e" stroke="#a96d10" strokeWidth="4"/><path d="M19 56H81" stroke="#fff1a1" strokeWidth="3"/><text x="50" y="52" textAnchor="middle" fontSize="31" fontWeight="900" fill="#4c300a">{highRun??'—'}</text></svg><strong>HI-RUN</strong></div>
  <div className="tri-tableau-space"><div className="tri-tableau" aria-label="Three towers">
   <div className="tri-castle" aria-hidden="true">{[0,1,2].map(i=><img key={i} src={tower} alt="" draggable={false} style={{left:`${(position(i).x+.485)*10}%`}}/>)}</div>
   {awards.map(a=><span key={`${roundKey}:${a.tower}`} className="tri-tower-award" data-animate={animated.includes(a.tower)} data-tower-award={a.tower} style={{left:`${(position(a.tower).x+.485)*10}%`}} aria-label={`Tower ${a.tower+1} bonus ${a.amount}`}>+{a.amount/1000}k</span>)}
   {result?<div className="tri-result-over-castle"><TriTowersStageResult key={result.id} result={result}/></div>:v.cards.map((card,i)=>{if(v.removed.includes(i))return null;const pos=position(i),legal=card!==null&&adjacent(card,v.waste);
    return <button key={`${roundKey}:${i}`} className="tri-card" style={{'--x':pos.x,'--y':pos.y} as CSSProperties} data-tri-card={i} data-exposed={card!==null} data-legal={legal} aria-label={card===null?`Covered card ${i+1}`:`Remove ${cardName(card)}`} disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||!legal} onClick={()=>onIntent({type:'remove',index:i})}><TowerCard card={card}/></button>;
   })}
  </div></div>
  <div className="tri-dot-clock" role="progressbar" aria-label={v.phase==='ready'?'Ready time remaining':v.phase==='stage_complete'?'Result hold remaining':'Round time remaining'} aria-valuemin={0} aria-valuemax={full/1000} aria-valuenow={Math.min(full,remaining)/1000} aria-valuetext={`${paused?'Paused · ':''}${Math.ceil(remaining/1000)} seconds remaining`} data-tone={dots.tone}>
   <div aria-hidden="true" className="tri-dots">{Array.from({length:24},(_,i)=><i key={i} data-lit={i<dots.lit} data-zone={i<2?'red':i<4?'yellow':'green'}/>)}</div>
   <small>{paused?'Paused':v.phase==='ready'?'Ready':v.phase==='stage_complete'?'Result hold':'Round time'} · {Math.ceil(remaining/1000)}s</small>
  </div>
  <div className="tri-deck-row">
   <div className="tri-waste" aria-label={`Waste ${cardName(v.waste)}`}><TowerCard card={v.waste}/></div>
   <div className="tri-run"><strong>CURRENT RUN</strong><output aria-label="Current removal streak">{v.run}</output></div>
   <button className="tri-stock" data-empty={v.stockRemaining===0} disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||v.stockRemaining===0} onClick={()=>onIntent({type:'draw'})} aria-label={`Draw stock, ${v.stockRemaining} stock cards remaining`}><TowerCard card={null}/><span className="tri-stock-count" aria-hidden="true">{v.stockRemaining}</span></button>
  </div>
 </div>;
}
