import {useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {ballPosition,ballValue,type ElevenIntent,type ElevenSnapshot} from '@/lib/elevenUp/model';
import './elevenUp.css';
const colors=['','#f6c62d','#246bd6','#d63b32','#7433b1','#f18329','#168c63','#9e2745','#262b32','#e6b923','#2b6bc3'];
function Ball({id}:{id:number}){const value=ballValue(id);return <span className="eleven-ball-art" data-striped={value>8} style={{'--ball-color':colors[value]} as CSSProperties}><span>{value}</span></span>;}
interface Props {view:ElevenSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:ElevenIntent)=>void;onReconnect:()=>void;onFinish?:()=>void}
export function ElevenUpView({view:v,userId,now,pending,error,epoch,liveEntry=false,onIntent,onReconnect,onFinish}:Props){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,r=b.result,hold=b.rules.holdMs+(r?.reason==='cleared'?b.rules.clearCelebrationMs:0);
 const result=r?{...r,id:r.id??v.scope,elapsed:Math.max(0,at-(b.deadline-hold))}:null;
 const motion=useTriRoundPresentation({scope:'eleven:'+v.scope,phase:b.phase,connected:!error,paused:v.paused,result,now:at,deadline:b.deadline,userId,active:tab==='cards',modern:true,liveEntry,recoveryEpoch:epoch,celebrationMs:b.rules.clearCelebrationMs});
 return <FullscreenGameShell className="eleven-scene" title="11 Up" description={`${v.solo?'Arcade · ':''}${v.board.phase==='complete'?'Final scores':`Round ${v.round}${v.round===3?' · Bonus':' of 2'}`}`}
  scores={<div className="eleven-scores" aria-label="Scores">{v.players.map(p=><div key={p.id} data-active={p.active}><span>{p.name}</span><strong>{(p.active?(motion.displayScore??p.score):p.score).toLocaleString()}</strong>{p.chips!==undefined&&<small>{p.chips} chips</small>}</div>)}</div>}
  activeTab={tab} setActiveTab={setTab} navigation={<nav aria-label="11 Up information"><button onClick={()=>setTab('lobby')}>Rules</button></nav>}
  announcement={false} panelTitle="Rules" panelDescription="P-Town scoring · eleven-up/1" panel={<ElevenUpRules/>}>
  <ElevenBoard {...{v,userId,now,pending,error,epoch,liveEntry,onIntent,onReconnect,onFinish,motion,result}} active={tab==='cards'}/>
 </FullscreenGameShell>;
}
function ElevenBoard({v,now,pending,error,epoch,onIntent,onReconnect,onFinish,active,motion,result}:Omit<Props,'view'>&{v:ElevenSnapshot;active:boolean;motion:ReturnType<typeof useTriRoundPresentation>;result:(NonNullable<ElevenSnapshot['board']['result']>&{id:string;elapsed:number})|null}){
 const root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),[selection,setSelection]=useState<number[]>([]);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>setSelection([]),[v.scope,v.revision,epoch,active]);
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,remaining=Math.max(0,b.deadline-at);
 const canAct=v.canAct&&!v.paused&&!pending&&!error&&remaining>0&&['ready','playing'].includes(b.phase)&&active;
 const sum=selection.reduce((n,id)=>n+ballValue(id),0);
 const toggle=(id:number)=>setSelection(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
 const terminal=b.phase==='complete'||v.finished&&b.phase!=='stage_complete';
 const finalReady=terminal||v.finished&&remaining===0;
 return <div ref={root} className="eleven-root" data-eleven-up data-phase={b.phase} data-round={v.round}>
  {error&&<div className="eleven-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
  {!terminal&&<div className="eleven-table-label">{v.paused?'Paused':b.phase==='ready'?`Make eleven or pass to start · ${Math.ceil(remaining/1000)}s`:b.phase==='playing'?`${Math.ceil(remaining/1000)} seconds`:''}</div>}
  {layer&&createPortal(<div className="eleven-plane">
   {!terminal&&<><div className="eleven-rack" aria-label="Pool balls on felt">
    {b.slots.map((id,slot)=>{if(id===null)return null;const [x,y]=ballPosition(slot),exposed=b.exposed.includes(slot);return <button key={id} className="eleven-ball" style={{left:`${x}%`,top:`${y}%`}} aria-label={`Ball ${ballValue(id)}, ${exposed?'exposed':'covered'}, position ${slot+1}`} aria-pressed={selection.includes(id)} data-exposed={exposed} disabled={!canAct||!exposed} onClick={()=>toggle(id)}><Ball id={id}/></button>;})}
   </div>
   {b.phase!=='stage_complete'&&<div className="eleven-controls">
    <div className="eleven-current"><small>DRAW · {b.stockRemaining} LEFT</small>{b.current!==null?<button className="eleven-draw" aria-label={`Draw ball ${ballValue(b.current)}`} aria-pressed={selection.includes(b.current)} disabled={!canAct} onClick={()=>toggle(b.current!)}><Ball id={b.current}/></button>:<span>Empty</span>}</div>
    <div className="eleven-group"><output aria-label={`Selected total ${sum}`}>{sum} <span>/ 11</span></output><button disabled={!canAct||sum!==11||selection.length<2} onClick={()=>onIntent({type:'group',items:[...selection]})}>Make Eleven</button><button className="eleven-reset" disabled={!selection.length||pending} onClick={()=>setSelection([])}>Clear selection</button></div>
    <div className="eleven-actions"><button disabled={!canAct||!b.canPass} onClick={()=>onIntent({type:'pass'})}>Pass</button><button disabled={!canAct||b.phase!=='playing'} onClick={()=>onIntent({type:'take_score'})}>Take Score</button></div>
   </div>}
   </>}
   {b.phase==='intro'&&<div className="eleven-intro"><TriRoundIntro remaining={remaining} roundLabel={v.round===3?'BONUS ROUND':`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${v.players.find(p=>p.active)?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
   {result&&<div className="eleven-result" role="status" data-celebrating={motion.admitted&&result.reason==='cleared'&&motion.elapsed<3000}>
    <span>{result.reason==='cleared'?'✦ ALL BALLS CLEARED ✦':b.event.label}</span><strong>{(motion.displayScore??result.score).toLocaleString()}</strong>
    {(!motion.admitted||result.reason!=='cleared'||motion.elapsed>=3000)&&<p>Elevens +{result.groupBonus.toLocaleString()}<br/>{result.clearBonus>0&&<>Clear +{result.clearBonus.toLocaleString()} · Stock +{result.stockBonus.toLocaleString()}<br/></>}Speed +{result.timeBonus.toLocaleString()}</p>}
   </div>}
   {terminal&&<div className="eleven-result"><span>{v.solo?'Game complete':'Competition complete'}</span><strong>{Math.max(...v.players.map(p=>p.score)).toLocaleString()}</strong>{!v.solo&&<p>{v.settled?'Settlement recorded':'Confirming settlement…'}</p>}</div>}
   {finalReady&&onFinish&&<button className="eleven-finish" onClick={onFinish}>{v.solo?'Leaderboard':'Continue'}</button>}
   {pending&&<span className="eleven-pending" role="status">Confirming play…</span>}
  </div>,layer)}
 </div>;
}
export function ElevenUpRules(){return <div className="eleven-rules"><p>Select exposed balls totaling exactly 11. You may use more than two balls and include the current draw ball. Covered numbers are visible, but cannot be selected.</p><p>Board rows award 600, 500, 400, 300, 200, then 100 points from back to front. The draw ball uses the next available pass position’s value, or zero if none is available.</p><p>Pass places the draw ball in the first open, uncovered position from back to front, left to right. It deducts that row’s value, stopping at zero. When the rack is full, Pass discards the draw ball and advances without a placement penalty.</p><p>Each eleven adds 1,000 when the round ends. Clear all balls for 10,000 plus 1,000 per unused draw/stock ball. Speed starts at 5,000 and loses 100 every 2.4 seconds; a timeout earns no speed bonus.</p><p>Two rounds. Reach 80,000 to earn one bonus round. No wild ball. Take Score ends the current round.</p><p>The 2.5-second bell introduction is followed by 30 seconds to make your first valid play and start the full two-minute clock. Results last five seconds; clearing adds the three-second fanfare first.</p></div>;}
