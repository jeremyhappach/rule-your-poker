import {pendingPlacement,type PendingRun21Action} from '@/lib/run21/actionPresentation';
import {run21InputTiming,run21Timing,run21TimingEnabled} from '@/lib/run21/diagnostics';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {createPortal} from 'react-dom';
import { PlayingCard } from '@/components/PlayingCard';
import type { Suit as DisplaySuit } from '@/lib/cardUtils';
import { applyGeometryOverrides, useDraftedGeometryOverrides } from '@/lib/geometryLab/store';
import { getRun21ArtifactDescriptors, type Run21Geometry } from '@/lib/run21/geometry';
import type { Card, Intent, BoardProjection as Projection } from '@/lib/run21/model';
import { aggregate, legalColumns, multiplierAt, perfectAggregate, total } from '@/lib/run21/rules';
import {outcomePresentation, qualificationThreshold} from '@/lib/run21/outcomePresentation';
import {useCardFrontDesign} from '@/lib/cardFrontDesign/config';
import {useVisualPreferences} from '@/hooks/useVisualPreferences';
import {cardFan} from '@/lib/run21/cardFan';
import type {Rect} from '@/lib/run21/safeFelt';
import './run21.css';
import {Run21ScoringHelp} from './Run21ScoringHelp';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';
import {Exact21Feedback} from '@/lib/run21/exact21Feedback';
import {displayedPlayerId} from '@/lib/run21/presentation';
import {roundIntro} from '@/lib/run21/roundIntro';
import {Run21RoundIntro} from './Run21RoundIntro';

const SUITS: Record<Card['suit'],DisplaySuit>={hearts:'♥',diamonds:'♦',clubs:'♣',spades:'♠'};
export function Run21Card({card}:{card:Card|null}) {
  const ref=useRef<HTMLSpanElement>(null);
  const [width,setWidth]=useState(24);
  useLayoutEffect(()=>{
    if(!ref.current)return;
    const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setWidth(Math.min(r.width,r.height/1.5));});
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  return <span ref={ref} className="run21-card" aria-label={card?`${card.rank} of ${card.suit}`:'Card back'}>
    <PlayingCard frontStyle="cartoon" card={card?{rank:card.rank,suit:SUITS[card.suit]}:undefined} isHidden={!card} faceFillPx={width} size="sm" style={{width,height:width*1.5}} />
  </span>;
}
function Run21ColumnCards({cards,pending=false}:{cards:Card[];pending?:boolean}){
  const ref=useRef<HTMLSpanElement>(null);
  const [size,setSize]=useState({width:24,height:36});
  const config=useCardFrontDesign();
  const {getEffectiveDeckColorMode}=useVisualPreferences();
  const fan=cardFan(size.width,size.height,cards.length,config,getEffectiveDeckColorMode()==='four_color'?'four-color':'two-color','cartoon');
  useLayoutEffect(()=>{
    if(!ref.current)return;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  return <span ref={ref} className="run21-column-stack">
    {cards.map((card,index)=><span key={`${card.rank}:${card.suit}`} className="run21-stacked-card" data-pending={pending&&index===cards.length-1||undefined} style={{zIndex:index,top:index*fan.step,width:fan.width,height:fan.height}}><Run21Card card={card}/></span>)}
  </span>;
}
interface Props {
  layout?: 'table' | 'fullscreen';
  acceptedEvents?: BoardFeedbackEvent[];
  view: Projection; now: number; onIntent?: (intent: Intent)=>void;
  placement?:PendingRun21Action|null;
  pending?: boolean; geometry?: Run21Geometry; playerId?: string;
  drawLayer?: HTMLElement | null;
  drawRect?: Rect;
  hideScoring?: boolean;
  solo?: boolean;
}
/** Slot contents only. The canonical shell owns the table, seats, HUD and lifecycle. */
export function Run21Felt({view,now,acceptedEvents,onIntent,pending=false,placement=null,geometry,drawLayer,drawRect,hideScoring=false,solo=false,layout='table',playerId=displayedPlayerId(view)}:Props) {
  const feedback=useRef(new Exact21Feedback());
  const [pulses,setPulses]=useState<Record<number,number>>({});
  const scope=JSON.stringify([view.identity??view.presentationKey,view.roundId,playerId]);
  useLayoutEffect(()=>{
    const next=feedback.current.accept(scope,playerId,acceptedEvents??[]);
    if(next!==null)setPulses(current=>Object.keys(next).length?{...current,...next}:{});
  },[scope,playerId,acceptedEvents]);
  const overrides=useDraftedGeometryOverrides();
  const descriptors=applyGeometryOverrides(getRun21ArtifactDescriptors(geometry),overrides);
  const shown=pendingPlacement(view,placement),tentative=shown!==view;
  useLayoutEffect(()=>{if(tentative&&placement&&run21TimingEnabled()){run21Timing('tentative-dom',placement.requestId);const frame=requestAnimationFrame(()=>run21Timing('tentative-frame',placement.requestId));return()=>cancelAnimationFrame(frame);}},[tentative,placement]);
  const board=view.boards[playerId];
  useLayoutEffect(()=>{
    if(!run21TimingEnabled())return;
    const key=scope+':'+board?.revision;run21Timing('confirmed-dom',key);
    let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>run21Timing('confirmed-paint-opportunity',key));});
    return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[scope,board?.revision]);
  const live=!roundIntro(view,now) && view.pausedAt==null && !view.revealed && !view.scorePresentation && !view.automaticPlayers?.includes(playerId) && playerId===view.viewerId && playerId===view.active_player_id && !!board?.current && !board.result && (board.deadline===null||now<board.deadline) && !!onIntent;
  const active=live&&!pending;
  const legal=board?legalColumns(board,view.config):[];
  const player=view.players.find(p=>p.id===playerId)!;
  const slot=(id:string,children:ReactNode)=>{
    const d=descriptors.find(d=>d.id===`run21.${id}`)!;
    const style:CSSProperties={left:`${d.anchorX!*100}%`,top:`${d.anchorY!*100}%`,width:`${d.widthPct!*100}%`,height:`${d.heightPct!*100}%`};
    return <div className={`run21-slot run21-${id}`} style={layout === 'table' ? style : undefined} data-run21-artifact={d.id}>{children}</div>;
  };
  const reason=board?.result?.reason;
  const outcome=board?.result ? outcomePresentation(board.result,player.name) : null;
  const runningTotal=board ? aggregate(board,view.config) : 0;
  const watching=playerId!==view.viewerId || view.automaticPlayers?.includes(playerId);
  const turnState=live?'active':watching?'watching':'inactive';
  // A single centered pair in the same interaction layer, just inside the rim.
  const draw=drawRect || layout === 'fullscreen' ? <div className="run21-draw" data-run21-draw style={layout === 'table' && drawRect ? {left:`${drawRect.x*100}%`,top:`${drawRect.y*100}%`,width:`${drawRect.width*100}%`,height:`${drawRect.height*100}%`} : undefined}>
    {slot('deck',<><Run21Card card={null}/><small className="sr-only">Deck</small></>)}
    {slot('currentCard',<><div className="run21-live-card" data-run21-turn-state={turnState}>{tentative?<span className="run21-awaiting-card" role="status">Confirming…</span>:board?.current&&<Run21Card card={board.current}/>}</div><small className="sr-only">{active?'Your turn':watching?'Watching':'Actions unavailable'} · Current card</small></>)}
    {slot('help',<>{layout==='fullscreen'&&<output className="run21-running-total" data-qualified={multiplierAt(runningTotal,view.config)>0} aria-label={`Running total ${runningTotal}; qualify at ${qualificationThreshold(view.config)}`}><strong>{runningTotal}</strong><small>/{perfectAggregate(view.config)}</small></output>}<Run21ScoringHelp config={view.config} solo={solo}/></>)}
    {board?.current&&!board.result&&view.active_player_id===playerId&&board.passesUsed<view.config.passes&&slot('pass',
      <button type="button" aria-label="Pass" disabled={!active} onClick={()=>{if(active)onIntent?.({type:'pass'});}}>Pass</button>)}
  </div>:null;
  return <section className={`run21-felt-content${layout === 'fullscreen' ? ' run21-fullscreen-board' : ''}`} data-run21-gameplay aria-label={`Run21 board for ${player.name}`}>
    {slot('board',<div className={view.revealed&&!view.liveBoards?'run21-revealed-boards':'run21-single-board'}>
      {(view.revealed&&!view.liveBoards?view.players.map(p=>p.id):[playerId]).map(id=>{
        const visibleBoard=shown.boards[id],confirmedBoard=view.boards[id];
        return <div className="run21-board-group" key={id}>
          {visibleBoard?<div className="run21-columns">{visibleBoard.columns.map((column,index)=>
            <button key={index} type="button" className="run21-column" aria-label={`Place in column ${index+1}, total ${total(confirmedBoard!.columns[index],view.config.target).value}`}
              aria-disabled={view.revealed||!active||!legal.includes(index)}
              disabled={view.revealed||!active||!legal.includes(index)}
              onPointerDown={e=>run21InputTiming('pointerdown',e.timeStamp)} onPointerUp={e=>run21InputTiming('pointerup',e.timeStamp)}
              onClick={e=>{run21InputTiming('click-handler',e.timeStamp);if(!view.revealed&&active&&legal.includes(index))onIntent?.({type:'place',column:index});}}>
              {id===playerId&&pulses[index]!==undefined&&<span key={pulses[index]} aria-hidden="true" className="run21-exact21" data-run21-exact21={pulses[index]} onAnimationEnd={()=>setPulses(current=>current[index]===pulses[index]?Object.fromEntries(Object.entries(current).filter(([key])=>+key!==index)):current)}/>}
              <span className="run21-column-total" data-complete={total(confirmedBoard!.columns[index],view.config.target).value===view.config.target||undefined}>{total(confirmedBoard!.columns[index],view.config.target).value}</span>
              <Run21ColumnCards key={view.roundId} cards={column} pending={tentative&&id===placement?.playerId&&placement.intent.type==='place'&&index===placement.intent.column}/>
            </button>)}</div>:<div className="run21-private">Opponent is playing privately</div>}
        </div>;
      })}
    </div>)}
    {drawLayer?createPortal(draw,drawLayer):draw}
    <Run21RoundIntro view={view} now={now} solo={solo}/>
    {reason&&outcome&&!view.revealed&&!hideScoring&&slot('resultOverlay',<div className="run21-result" role="status" data-run21-scoring data-outcome={outcome.kind}>
      {outcome.kind==='bust'&&<svg className="run21-failure-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M6 36 3 22 13 9 25 5 22 18 28 25 18 33 22 43Z" fill="#8b9299"/><path d="m29 7 12 9 5 20-18 8-4-10 11-9-7-8Z" fill="#b2bac0"/></svg>}
      {outcome.kind==='no-qualify'&&<span className="run21-failure-icon" aria-hidden="true">💩</span>}
      {outcome.title}
      {outcome.kind==='score'?<small>{board!.result!.multiplier.toLocaleString()} × {board!.result!.speed} = {board!.result!.score.toLocaleString()}</small>:<small>{reason==='timeout'?'Time expired · ':''}0 points</small>}
    </div>)}
  </section>;
}
