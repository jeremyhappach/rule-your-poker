import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {createPortal} from 'react-dom';
import { PlayingCard } from '@/components/PlayingCard';
import type { Suit as DisplaySuit } from '@/lib/cardUtils';
import { applyGeometryOverrides, useDraftedGeometryOverrides } from '@/lib/geometryLab/store';
import { getRun21ArtifactDescriptors, type Run21Geometry } from '@/lib/run21/geometry';
import type { Card, Intent, Projection } from '@/lib/run21/model';
import { legalColumns, total } from '@/lib/run21/rules';
import {useCardFrontDesign} from '@/lib/cardFrontDesign/config';
import {useVisualPreferences} from '@/hooks/useVisualPreferences';
import {cardFan} from '@/lib/run21/cardFan';
import type {Rect} from '@/lib/run21/safeFelt';
import './run21.css';
import {Run21ScoringHelp} from './Run21ScoringHelp';

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
    <PlayingCard card={card?{rank:card.rank,suit:SUITS[card.suit]}:undefined} isHidden={!card} faceFillPx={width} size="sm" style={{width,height:width*1.5}} />
  </span>;
}
function Run21ColumnCards({cards}:{cards:Card[]}){
  const ref=useRef<HTMLSpanElement>(null);
  const [size,setSize]=useState({width:24,height:36});
  const config=useCardFrontDesign();
  const {getEffectiveDeckColorMode}=useVisualPreferences();
  const fan=cardFan(size.width,size.height,cards.length,config,getEffectiveDeckColorMode()==='four_color'?'four-color':'two-color');
  useLayoutEffect(()=>{
    if(!ref.current)return;
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(ref.current);return()=>observer.disconnect();
  },[]);
  return <span ref={ref} className="run21-column-stack" data-run21-scroll-stack={fan.contentHeight>size.height+1}>
    {cards.map((card,index)=><span key={`${card.rank}:${card.suit}`} className="run21-stacked-card" style={{top:index*fan.step,width:fan.width,height:fan.height}}><Run21Card card={card}/></span>)}
  </span>;
}
interface Props {
  view: Projection; now: number; onIntent?: (intent: Intent)=>void;
  pending?: boolean; geometry?: Run21Geometry; playerId?: string;
  drawLayer?: HTMLElement | null;
  drawRect?: Rect;
}
/** Slot contents only. The canonical shell owns the table, seats, HUD and lifecycle. */
export function Run21Felt({view,now,onIntent,pending=false,geometry,drawLayer,drawRect,playerId=view.viewerId??view.players[0].id}:Props) {
  const overrides=useDraftedGeometryOverrides();
  const descriptors=applyGeometryOverrides(getRun21ArtifactDescriptors(geometry),overrides);
  const board=view.boards[playerId];
  const active=playerId===view.viewerId && playerId===view.active_player_id && !!board?.current && !board.result && (board.deadline===null||now<board.deadline) && !pending && !!onIntent;
  const legal=board?legalColumns(board,view.config):[];
  const player=view.players.find(p=>p.id===playerId)!;
  const slot=(id:string,children:ReactNode)=>{
    const d=descriptors.find(d=>d.id===`run21.${id}`)!;
    const style:CSSProperties={left:`${d.anchorX!*100}%`,top:`${d.anchorY!*100}%`,width:`${d.widthPct!*100}%`,height:`${d.heightPct!*100}%`};
    return <div className={`run21-slot run21-${id}`} style={style} data-run21-artifact={d.id}>{children}</div>;
  };
  const reason=board?.result?.reason;
  // A single centered pair in the same interaction layer, just inside the rim.
  const draw=drawRect?<div className="run21-draw" data-run21-draw style={{left:`${drawRect.x*100}%`,top:`${drawRect.y*100}%`,width:`${drawRect.width*100}%`,height:`${drawRect.height*100}%`}}>
    {view.viewerId&&slot('deck',<><Run21Card card={null}/><small className="sr-only">Deck</small></>)}
    {view.viewerId&&slot('currentCard',<>{(view.revealed||view.active_player_id===playerId||view.active_player_id===undefined)&&board?.current&&<Run21Card card={board.current}/>}<small className="sr-only">Current card</small></>)}
    {slot('help',<Run21ScoringHelp/>)}
  </div>:null;
  return <section className="run21-felt-content" data-run21-gameplay aria-label={`Run21 board for ${player.name}`}>
    {slot('board',<div className={view.revealed?'run21-revealed-boards':'run21-single-board'}>
      {(view.revealed?view.players.map(p=>p.id):[playerId]).map(id=>{
        const visibleBoard=view.boards[id];
        return <div className="run21-board-group" key={id}>
          {view.revealed&&<small>{view.players.find(p=>p.id===id)!.name}</small>}
          {visibleBoard?<div className="run21-columns">{visibleBoard.columns.map((column,index)=>
            <button key={index} type="button" className="run21-column" aria-label={`Place in column ${index+1}, total ${total(column,view.config.target).value}`}
              aria-disabled={view.revealed||!active||!legal.includes(index)}
              disabled={view.revealed||!active||!legal.includes(index)}
              onKeyDown={event=>{
                const stack=event.currentTarget.querySelector<HTMLElement>('.run21-column-stack');
                if(stack&&stack.scrollHeight>stack.clientHeight&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
                  event.preventDefault();
                  stack.scrollTo({top:event.key==='Home'?0:event.key==='End'?stack.scrollHeight:stack.scrollTop+(event.key==='ArrowDown'?1:-1)*stack.clientHeight*.5});
                }
              }}
              onClick={()=>{if(!view.revealed&&active&&legal.includes(index))onIntent?.({type:'place',column:index});}}>
              <span className="run21-column-total">{total(column,view.config.target).value}</span>
              <Run21ColumnCards key={view.roundId} cards={column}/>
            </button>)}</div>:<div className="run21-private">Opponent is playing privately</div>}
        </div>;
      })}
    </div>)}
    {drawLayer?createPortal(draw,drawLayer):draw}
    {reason&&!view.revealed&&slot('resultOverlay',<div className="run21-result" role="status">{reason==='timeout'?'TIME EXPIRED':reason==='bust'?'BUST':reason==='collect'?'WIN COLLECTED':'ROUND COMPLETE'}<small>{board!.result!.score.toLocaleString()} points</small></div>)}
  </section>;
}
