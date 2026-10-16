import {useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {adjacent,cardName,position,isV2,nextRemovalAward,RULES,type Rules,type Projection,type Intent} from '@/lib/triTowers/model';
import {RoundTimeBar} from '@/lib/canonicalShell/RoundTimeBar';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import {useTriTowersFinancialPresentation} from './useTriTowersFinancialPresentation';
import './triTowers.css';
import {stagePresentation} from '@/lib/triTowers/stagePresentation';
import {TriTowersStageResult} from './TriTowersStageResult';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
const suits=['♠','♥','♦','♣'] as const;
function TowerCard({card}:{card:number|null}){
  const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(32);
  useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
  return <span ref={ref} className="tri-card-art"><PlayingCard card={card===null?undefined:{rank:ranks[card%13],suit:suits[Math.floor(card/13)]}}
    isHidden={card===null} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/></span>;
}
export function TriTowersRules({rules=RULES}:{rules?:Rules}){if(isV2(rules))return <div className="tri-rules"><h3>How to play</h3>
  <p>Remove exposed cards one rank above or below the waste. Kings wrap to Aces. Each round has a fresh independent deck and 23 stock draws.</p>
  <p>Consecutive removals award {rules.streakAwards?.map(n=>n.toLocaleString()).join(', ')}, then {rules.streakAwards?.at(-1)?.toLocaleString()} per card. Drawing resets the streak and deducts {rules.drawPenalty} from your cumulative score, with a floor of zero.</p>
  <p>Towers add {rules.peakBonuses.map(n=>n.toLocaleString()).join(' / ')}. Clear or Take Score adds {rules.timePerSecond} per whole second remaining. Only clear adds {rules.stockPerCard?.toLocaleString()} per unused stock card. There is no extra all-clear award.</p>
  <p>Everyone plays round one, then round two, starting left of the caller with the caller last. A cumulative {rules.bonusThreshold.toLocaleString()} after round two earns exactly one bonus round in that same order. No free replay.</p>
  <p>Each round allows {rules.readyMs/1000} seconds to play your first valid card or draw; that action starts the full {rules.stageMs/1000}-second clock. Missed Ready or timeout ends only this round. Take Score keeps your total and ends this round. Results hold for {rules.holdMs/1000} seconds.</p>
  <p>Highest scores share losing stakes; all-player ties move no chips. P-Town accepted scoring · {rules.version}.</p></div>;
 return <div className="tri-rules"><h3>How to play · legacy v1</h3>
  <p>Remove an exposed card one rank above or below the waste. Aces connect Kings and Twos. Clear the three peaks. Draw a stock card when you want to start a new run.</p>
  <p>Each run scores 1,000, then 2,000, then 3,000… Drawing resets the run. Capturing the peaks awards 5,000, 10,000 and 15,000. Clear all three for 100 points per remaining second.</p>
  <p>Play two stages, then one bonus stage if you reach 80,000. You finish your whole turn before the next player receives a new independent deal. Everyone watches the same exposed board.</p>
  <p>Ready expires after 30 seconds; each stage lasts 120 seconds. Timeout or Give up records your earned score and ends your turn. Highest scores share the losing stakes; all-player ties move no chips.</p>
  <p>Take Score keeps your earned points and ends only this stage, without a clear bonus. Every stage result stays visible for five seconds; your next eligible stage starts automatically.</p>
  <p>PTown arcade rules v1. Numerical scoring, timing and wrapping are explicit adaptation choices pending owner acceptance.</p></div>;}
interface Props {view:Projection;now:number;pending?:boolean;connected?:boolean;onIntent:(intent:Intent)=>void;
  activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;panel:ReactNode;sessionEnded?:boolean;onContinue?:()=>void;error?:ReactNode}
export function TriTowersView({view:v,now,pending=false,connected=true,onIntent,activeTab,setActiveTab,panel,sessionEnded,onContinue,error}:Props){
  const player=v.players.find(p=>p.id===v.activePlayerId),v2=isV2(v.rules),at=v.paused?(v.pausedAt??v.serverAt):now;
  const canAct=v.canAct&&v.viewerId===v.activePlayerId&&!player?.isBot&&connected&&!pending&&!v.paused&&at<v.deadline;
  const seconds=Math.max(0,Math.ceil((v.deadline-at)/1000));
  const financial=useTriTowersFinancialPresentation(v,sessionEnded);
  const result=stagePresentation(v,now);
  const controls=v.phase==='complete'?<button onClick={onContinue} disabled={!onContinue||!!v.financial&&!financial.ready}>Continue</button>:
    v.phase==='ready'?v2?<span>{v.viewerId===v.activePlayerId?'Play a card or draw to start':`Waiting for ${player?.name}`}</span>:<button disabled={!canAct} onClick={()=>onIntent({type:'start'})}>{canAct?'Start my turn':`Waiting for ${player?.name}`}</button>:
    v.phase==='stage_complete'?<span>Continuing automatically…</span>:
    v.viewerId===v.activePlayerId&&!player?.isBot?<button className="tri-take-score" disabled={!canAct} onClick={()=>onIntent({type:'take_score'})}>Take Score</button>:null;
  return <FullscreenGameShell title="TriTowers" description={v.phase==='complete'?'Final scores':`Round ${v.stage}${v.stage>2?' · Bonus':''}`}
    activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} sessionEnded={sessionEnded}
    scores={<div className="tri-scores" aria-label="Competition scores">{v.players.map(p=><div key={p.id} data-active={p.id===v.activePlayerId}>
      <span>{p.name}</span><strong>{p.id===v.activePlayerId?<><span className="tri-count-animated">{(result?.displayScore??v.score).toLocaleString()}</span><span className="tri-count-reduced">{v.score.toLocaleString()}</span></>:p.id in v.scores?v.scores[p.id].toLocaleString():'Waiting'}</strong>
      <small>{v.settlement?'Final':p.id===v.activePlayerId?v.phase==='ready'?'Ready':'Playing':v2?`${v.stages.filter(r=>r.playerId===p.id).length} rounds completed`:p.id in v.scores?'Final':'Up next'}</small>
      {v.financial&&<TriTowersBalance player={p} raw={v.financial.balances[p.id]}/>}
    </div>)}</div>}
    timer={!sessionEnded&&v.phase!=='complete'&&(v.phase==='playing'?<div className="tri-timer"><small>{v.paused?'Paused':'Round time'}</small><RoundTimeBar remaining={Math.max(0,Math.min(v.rules.stageMs,v.deadline-at))} full={v.rules.stageMs}/></div>:<span className="tri-clock" role="timer">{v.paused?'Paused':`${seconds}s`} <small>{v.phase==='ready'?'to play first card':'result hold'}</small></span>)}
    actions={!sessionEnded&&<div className="tri-actions">{controls}</div>}>
    <div className="tri-game" data-tri-towers data-phase={v.phase} data-turn={v.viewerId===v.activePlayerId?'active':'watching'}>
      {error}
      {!sessionEnded&&<>
        <div className="tri-status"><span className="tri-turn">{player?v.viewerId===player.id?'Your Turn':`Watching ${player.name}`:'Competition complete'}</span>
          <strong aria-live="polite">{v.event.label}{v.event.points?` ${v.event.points>0?'+':''}${v.event.points.toLocaleString()}`:''}</strong></div>
        {v.phase==='complete'?<div className="tri-complete"><span>COMPETITION COMPLETE</span><h2>{v.players.filter(p=>v.scores[p.id]===Math.max(...Object.values(v.scores))).map(p=>p.name).join(' & ')} wins</h2><p>All turns recorded. {v.settlement===null?'Confirming settlement…':'Settlement recorded.'}</p></div>:
        <>
          <div className="tri-tableau-space">{result?<TriTowersStageResult key={result.id} result={result}/>:<div className="tri-tableau" aria-label="Three towers">
            {[0,1,2].map(i=><span className="tri-peak-label" key={i} style={{left:`${(i*3+2)*10}%`}}>PEAK {i+1}</span>)}
            {v.cards.map((card,i)=>{if(v.removed.includes(i))return null;const pos=position(i),legal=card!==null&&adjacent(card,v.waste);
              return <button key={`${v.turnIndex}:${v.stage}:${i}`} className="tri-card" style={{'--x':pos.x,'--y':pos.y} as CSSProperties}
                data-tri-card={i} data-exposed={card!==null} data-legal={legal} aria-label={card===null?`Covered card ${i+1}`:`Remove ${cardName(card)}`}
                disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||!legal} onClick={()=>onIntent({type:'remove',index:i})}><TowerCard card={card}/></button>;
            })}
          </div>}</div>
          <div className="tri-deck-row"><button className="tri-stock" data-empty={v.stockRemaining===0} disabled={!canAct||!(v.phase==='playing'||v2&&v.phase==='ready')||v.stockRemaining===0} onClick={()=>onIntent({type:'draw'})} aria-label={`Draw stock, ${v.stockRemaining} stock cards remaining`}><TowerCard card={null}/><span className="tri-stock-count" aria-hidden="true">{v.stockRemaining}</span></button>
            <div className="tri-waste" aria-label={`Waste ${cardName(v.waste)}`}><TowerCard card={v.waste}/><span>BUILD HERE</span></div>
            <div className="tri-run"><small>CARD RUN</small><strong>{v.run}</strong><span>Next +{nextRemovalAward(v.rules,v.run).toLocaleString()}</span></div>
          </div>
        </>}
      </>}
    </div>
  </FullscreenGameShell>;
}
function TriTowersBalance({player,raw}:{player:Projection['players'][number];raw:number|undefined}){
 const balance=usePresentationPlayerChipBalance(player.id,raw??0);
 return <small className="tri-balance" data-chip-center={player.seat} data-chip-reaction-target={player.seat} data-tri-balance={player.id} aria-label={`${player.name} balance ${raw===undefined?'unavailable':balance}`}>{raw===undefined?'—':balance} chips</small>;
}
