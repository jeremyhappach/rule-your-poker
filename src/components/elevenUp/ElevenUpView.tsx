import {ElevenUpRules} from '@/components/rules/ElevenUpRules';
export {ElevenUpRules} from '@/components/rules/ElevenUpRules';
import {useLayoutEffect,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {ballPosition,ballValue,type ElevenIntent,type ElevenSnapshot} from '@/lib/elevenUp/model';
import {useElevenGroupAudio} from '@/hooks/useElevenGroupAudio';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import './elevenUp.css';
const colors=['','#f6c62d','#246bd6','#d63b32','#7433b1','#f18329','#168c63','#9e2745','#262b32','#e6b923','#2b6bc3'];
function Ball({id}:{id:number}){const value=ballValue(id);return <span className="eleven-ball-art" data-striped={value>8} style={{'--ball-color':colors[value]} as CSSProperties}><span>{value}</span></span>;}
interface Props {terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:ElevenSnapshot['players'][number])=>ReactNode;view:ElevenSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:ElevenIntent)=>void;onReconnect:()=>void;onFinish?:()=>void}
export function ElevenUpView({view:v,userId,now,pending,error,epoch,liveEntry=false,onIntent,onReconnect,onFinish,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance,terminalPresenting=false}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 useElevenGroupAudio(v,userId,epoch,tab==='cards'&&!error&&!v.paused&&!sessionEnded&&!document.hidden);
 const scoreGroup=useRef<HTMLDivElement>(null),activePlayerId=v.players.find(p=>p.active)?.id;
 const scorePlayers=v.players.length>2?[...v.players.filter(p=>p.active),...v.players.filter(p=>!p.active)]:v.players;
 useLayoutEffect(()=>{if(v.players.length>2&&scoreGroup.current)scoreGroup.current.scrollLeft=0;},[activePlayerId,v.players.length]);
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,r=b.result,hold=b.rules.holdMs+(r?.reason==='cleared'?b.rules.clearCelebrationMs:0);
 const result=r?{...r,id:r.id??v.scope,elapsed:Math.max(0,at-(b.deadline-hold))}:null;
 const motion=useTriRoundPresentation({scope:'eleven:'+v.scope,phase:b.phase,connected:!error,paused:v.paused,result,now:at,deadline:b.deadline,userId,active:tab==='cards',modern:true,liveEntry,recoveryEpoch:epoch,celebrationMs:b.rules.clearCelebrationMs});
 const scores=<div ref={scoreGroup} className="eleven-scores" data-multiplayer={!v.solo} data-overflow={v.players.length>2} data-stacked={v.players.length===2} aria-label="Scores" tabIndex={v.players.length>2?0:undefined}>{scorePlayers.map(p=><div className="eleven-score-pill" key={p.id} data-active={p.active} data-winner={!v.solo&&!!v.terminal?.winnerIds.includes(p.id)&&(terminalPresenting||now<v.terminal.deadline)}>{!v.solo&&<span title={p.name}>{p.name}</span>}<strong>{(p.active?(motion.displayScore??p.score):p.score).toLocaleString()}</strong>{p.chips!==undefined&&(balance?balance(p):<small>{p.chips} chips</small>)}</div>)}</div>;
 return <FullscreenGameShell className="eleven-scene" title="11 Up" description={v.board.phase==='complete'?'Final scores':''}
  activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded} navigation={v.solo?<nav aria-label="11 Up information"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined}
  announcement={v.solo?false:undefined} panelTitle={v.solo?"Rules":undefined} panelDescription={`P-Town scoring · ${b.rules.version}`} panel={panel??<ElevenUpRules stageMs={b.rules.stageMs}/>}>
  <ElevenBoard {...{v,userId,now,pending,error,epoch,liveEntry,onIntent,onReconnect,onFinish,motion,result,sessionEnded,scores}} active={tab==='cards'}/>
 </FullscreenGameShell>;
}
function ElevenBoard({v,now,pending,error,epoch,onIntent,onReconnect,onFinish,active,motion,result,sessionEnded,scores}:Omit<Props,'view'>&{v:ElevenSnapshot;active:boolean;scores:ReactNode;motion:ReturnType<typeof useTriRoundPresentation>;result:(NonNullable<ElevenSnapshot['board']['result']>&{id:string;elapsed:number})|null}){
 const root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),[selection,setSelection]=useState<number[]>([]);
 const selected=useRef<number[]>([]),submitted=useRef(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{selected.current=[];submitted.current=false;setSelection([]);},[v.scope,v.revision,epoch,active]);
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,remaining=Math.max(0,b.deadline-at);
 const canAct=v.canAct&&!v.paused&&!pending&&!error&&remaining>0&&['ready','playing'].includes(b.phase)&&active&&!sessionEnded;
 const sum=selection.reduce((n,id)=>n+ballValue(id),0);
 const toggle=(id:number)=>{
  if(!canAct||submitted.current)return;
  const next=selected.current.includes(id)?selected.current.filter(x=>x!==id):[...selected.current,id];
  selected.current=next;setSelection(next);
  // Submit from the tap, never a render/effect. The transport persists one
  // immutable request before I/O; this latch also closes the pre-render tap gap.
  if(next.length>=2&&next.reduce((n,item)=>n+ballValue(item),0)===11){submitted.current=true;onIntent({type:'group',items:[...next]});}
 };
 const terminal=b.phase==='complete'||v.finished&&b.phase!=='stage_complete';
 const finalReady=terminal||v.finished&&remaining===0;
 return <div ref={root} className="eleven-root" data-eleven-up={sessionEnded?undefined:''} data-phase={b.phase} data-round={v.round}>
  {!sessionEnded&&error&&<div className="eleven-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
  {layer&&createPortal(<div className="eleven-plane" data-two-player={v.players.length===2}>
   <div className="eleven-score-band">
    <span className="eleven-round">{!terminal&&!sessionEnded&&(v.round===3?'Round 3 / 3 · Bonus':`Round ${v.round} / 2`)}</span>
    {scores}
    {!terminal&&!sessionEnded&&b.phase!=='stage_complete'&&<button className="eleven-take-score" disabled={!canAct||b.phase!=='playing'} onClick={()=>onIntent({type:'take_score'})}>Take Score</button>}
   </div>
   {!sessionEnded&&<div className="eleven-playfield">
   {!terminal&&<>
   <div className="eleven-rack" aria-label="Pool balls on felt">
    {b.slots.map((id,slot)=>{if(id===null)return null;const [x,y]=ballPosition(slot),exposed=b.exposed.includes(slot);return <button key={id} className="eleven-ball" style={{left:`${x}%`,top:`${y}%`}} aria-label={`Ball ${ballValue(id)}, ${exposed?'exposed':'covered'}, position ${slot+1}`} aria-pressed={selection.includes(id)} data-exposed={exposed} disabled={!canAct||!exposed} onClick={()=>toggle(id)}><Ball id={id}/></button>;})}
   </div>
   {b.phase!=='stage_complete'&&<>
    <output className="eleven-selection" aria-label={`Selected total ${sum}`}>{sum}</output>
    {b.phase==='ready'&&<div className="eleven-clock eleven-ready-clock" role="timer" aria-label="Time to start">{v.paused?'Paused · ':'Select or pass · '}{Math.floor(Math.ceil(remaining/1000)/60)}:{String(Math.ceil(remaining/1000)%60).padStart(2,'0')}</div>}
    {b.phase==='playing'&&<div className="eleven-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={b.rules.stageMs/1000} aria-valuenow={Math.min(remaining,b.rules.stageMs)/1000} aria-valuetext={`${v.paused?'Paused · ':''}${Math.ceil(remaining/1000)} seconds remaining`}><CountdownDots remaining={remaining} duration={b.rules.stageMs}/>{v.paused&&<small>Paused</small>}</div>}
    <div className="eleven-controls">
     <div className="eleven-current">{b.current!==null?<button className="eleven-draw" aria-label={`Draw ball ${ballValue(b.current)}`} aria-pressed={selection.includes(b.current)} disabled={!canAct} onClick={()=>toggle(b.current!)}><Ball id={b.current}/></button>:<span>Empty</span>}</div>
     <button className="eleven-pass" disabled={!canAct||!b.canPass} aria-label={`Pass, ${b.stockRemaining} draws remaining`} onClick={()=>onIntent({type:'pass'})}><span className="eleven-stock-count" aria-hidden="true">{b.stockRemaining}</span>Pass</button>
    </div>
   </>}
   </>}
   {b.phase==='intro'&&<div className="eleven-intro"><TriRoundIntro remaining={remaining} roundLabel={v.round===3?'BONUS ROUND':`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${v.players.find(p=>p.active)?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
   {result&&<div className="eleven-result" role="status" data-celebrating={motion.admitted&&result.reason==='cleared'&&motion.elapsed<3000}>
    <span>{result.reason==='cleared'?'✦ ALL BALLS CLEARED ✦':b.event.label}</span><strong>{(motion.displayScore??result.score).toLocaleString()}</strong>
    {(!motion.admitted||result.reason!=='cleared'||motion.elapsed>=3000)&&<p>Elevens +{result.groupBonus.toLocaleString()}<br/>{result.clearBonus>0&&<>Clear +{result.clearBonus.toLocaleString()} · Stock +{result.stockBonus.toLocaleString()}<br/></>}Speed +{result.timeBonus.toLocaleString()}</p>}
   </div>}
   {terminal&&<div className="eleven-result" role="status"><span>{v.solo?'Game complete':'Game Over'}</span>
    {!v.solo&&v.terminal?<><strong className="eleven-winner-name">{v.players.filter(p=>v.terminal!.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal.winnerIds.length===1?'wins':'tie'} with {v.terminal.score.toLocaleString()}</strong>
    <div className="eleven-achievements">{v.players.filter(p=>v.terminal!.winnerIds.includes(p.id)).map(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id]).map(label=><p key={label}>{label}</p>))}</div></>:<strong>{Math.max(...v.players.map(p=>p.score)).toLocaleString()}</strong>}
    {!v.solo&&!v.settled&&<p>Confirming settlement…</p>}</div>}
   {finalReady&&v.solo&&onFinish&&<button className="eleven-finish" onClick={onFinish}>Leaderboard</button>}
   {pending&&<span className="eleven-pending" role="status">Confirming play…</span>}
   </div>}
  </div>,layer)}
 </div>;
}
