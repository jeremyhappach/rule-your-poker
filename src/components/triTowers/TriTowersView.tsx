import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {adjacent,cardName,position,type Projection,type Intent} from '@/lib/triTowers/model';
import './triTowers.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const suits=['♠','♥','♦','♣'] as const;
function TowerCard({card}:{card:number|null}){
  const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(32);
  useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
  return <span ref={ref} className="tri-card-art"><PlayingCard card={card===null?undefined:{rank:ranks[card%13],suit:suits[Math.floor(card/13)]}}
    isHidden={card===null} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/></span>;
}
export function TriTowersRules(){return <div className="tri-rules"><h3>How to play</h3>
  <p>Remove an exposed card one rank above or below the waste. Aces connect Kings and Twos. Clear the three peaks. Draw a stock card when you want to start a new run.</p>
  <p>Each run scores 1,000, then 2,000, then 3,000… Drawing resets the run. Capturing the peaks awards 5,000, 10,000 and 15,000. Clear all three for 100 points per remaining second.</p>
  <p>Play two stages, then one bonus stage if you reach 80,000. You finish your whole turn before the next player receives a new independent deal. Everyone watches the same exposed board.</p>
  <p>Ready expires after 30 seconds; each stage lasts 120 seconds. Timeout or Give up records your earned score and ends your turn. Highest scores share the losing stakes; all-player ties move no chips.</p>
  <p>PTown arcade rules v1. Numerical scoring, timing and wrapping are explicit adaptation choices pending owner acceptance.</p></div>;}
interface Props {view:Projection;now:number;pending?:boolean;connected?:boolean;onIntent:(intent:Intent)=>void;
  activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded?:boolean;onContinue?:()=>void;error?:ReactNode}
export function TriTowersView({view:v,now,pending=false,connected=true,onIntent,activeTab,setActiveTab,panel,sessionEnded,onContinue,error}:Props){
  const player=v.players.find(p=>p.id===v.activePlayerId),canAct=v.canAct&&connected&&!pending&&!v.paused;
  const seconds=Math.max(0,Math.ceil((v.deadline-now)/1000));
  const [confirmGiveUp,setConfirmGiveUp]=useState(false);
  useEffect(()=>setConfirmGiveUp(false),[v.identity.dealerGameId,v.turnIndex,v.stage,v.phase]);
  const controls=v.phase==='complete'?<button onClick={onContinue} disabled={!onContinue}>Continue</button>:
    v.phase==='ready'?<button disabled={!canAct} onClick={()=>onIntent({type:'start'})}>{canAct?'Start my turn':`Waiting for ${player?.name}`}</button>:
    v.phase==='stage_complete'?<button disabled={!canAct} onClick={()=>onIntent({type:'continue'})}>Next stage</button>:
    <><button disabled={!canAct} onClick={()=>setConfirmGiveUp(true)}>Give up</button>{confirmGiveUp&&<span role="alert">End your entire turn? <button disabled={!canAct} onClick={()=>{setConfirmGiveUp(false);onIntent({type:'give_up'});}}>End turn</button><button onClick={()=>setConfirmGiveUp(false)}>Keep playing</button></span>}</>;
  return <FullscreenGameShell title="TriTowers" description={v.phase==='complete'?'Final scores':`Stage ${v.stage}${v.stage>2?' · Bonus':''}`}
    activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} sessionEnded={sessionEnded}
    scores={<div className="tri-scores" aria-label="Competition scores">{v.players.map(p=><div key={p.id} data-active={p.id===v.activePlayerId}>
      <span>{p.name}</span><strong>{p.id in v.scores?v.scores[p.id].toLocaleString():p.id===v.activePlayerId?v.score.toLocaleString():'Waiting'}</strong>
      <small>{v.settlement?`Final · ${(v.settlement[p.id]??0)>0?'+':''}${v.settlement[p.id]??0} chips`:p.id in v.scores?'Final':p.id===v.activePlayerId?'Playing':'Up next'}</small>
    </div>)}</div>}
    timer={!sessionEnded&&v.phase!=='complete'&&<span className="tri-clock" role="timer">{v.paused?'Paused':`${seconds}s`} <small>{v.phase==='ready'?'to start':'remaining'}</small></span>}
    actions={!sessionEnded&&<div className="tri-actions">{controls}</div>}>
    <div className="tri-game" data-tri-towers data-phase={v.phase}>
      {error}
      {!sessionEnded&&<>
        <div className="tri-status"><span>{player?`${player.name}${v.viewerId===player.id?' · Your turn':' · Watching live'}`:'Competition complete'}</span>
          <strong aria-live="polite">{v.event.label}{v.event.points?` +${v.event.points.toLocaleString()}`:''}</strong></div>
        {v.phase==='complete'?<div className="tri-complete"><span>COMPETITION COMPLETE</span><h2>{v.players.filter(p=>v.scores[p.id]===Math.max(...Object.values(v.scores))).map(p=>p.name).join(' & ')} wins</h2><p>All turns recorded. {v.settlement===null?'Confirming settlement…':'Settlement recorded.'}</p></div>:
        <>
          <div className="tri-tableau-space"><div className="tri-tableau" aria-label="Three towers">
            {[0,1,2].map(i=><span className="tri-peak-label" key={i} style={{left:`${(i*3+2)*10}%`}}>PEAK {i+1}</span>)}
            {v.cards.map((card,i)=>{if(v.removed.includes(i))return null;const pos=position(i),legal=card!==null&&adjacent(card,v.waste);
              return <button key={`${v.turnIndex}:${v.stage}:${i}`} className="tri-card" style={{'--x':pos.x,'--y':pos.y} as CSSProperties}
                data-tri-card={i} data-exposed={card!==null} data-legal={legal} aria-label={card===null?`Covered card ${i+1}`:`Remove ${cardName(card)}`}
                disabled={!canAct||v.phase!=='playing'||!legal} onClick={()=>onIntent({type:'remove',index:i})}><TowerCard card={card}/></button>;
            })}
          </div></div>
          <div className="tri-deck-row"><button className="tri-stock" disabled={!canAct||v.phase!=='playing'||v.stockRemaining===0} onClick={()=>onIntent({type:'draw'})} aria-label={`Draw stock, ${v.stockRemaining} remaining`}><TowerCard card={null}/><span>DRAW · {v.stockRemaining}</span></button>
            <div className="tri-waste" aria-label={`Waste ${cardName(v.waste)}`}><TowerCard card={v.waste}/><span>BUILD HERE</span></div>
            <div className="tri-run"><small>CARD RUN</small><strong>{v.run}</strong><span>{v.run?`Next +${((v.run+1)*1000).toLocaleString()}`:'One higher or lower'}</span></div>
          </div>
        </>}
      </>}
    </div>
  </FullscreenGameShell>;
}
