import {BoxdropRules} from '@/components/rules/BoxdropRules';
export {BoxdropRules} from '@/components/rules/BoxdropRules';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {boxdropPlayWindow,type BoxdropBox,type BoxdropIntent,type BoxdropSnapshot} from '@/lib/boxdrop/model';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import {boxdropRoundPresentation} from '@/lib/boxdrop/roundPresentation';
import {BoxdropScorePill} from './BoxdropScorePill';
import {platformAudio} from '@/lib/audio/platformAudio';
import {boxdropCue} from '@/lib/boxdrop/audio';
import './boxdrop.css';
function Crate({box}:{box:BoxdropBox}){return <span className="box-crate" data-color={box.recycled?'white':box.color}><i aria-hidden="true">▧</i><b data-digits={String(box.value).length}>{box.value}</b></span>;}
export function BoxdropLoading({solo=false,error,onReconnect,activeTab,setActiveTab}:{solo?:boolean;error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const shell=<FullscreenGameShell className="box-scene" ready={false} title="Boxdrop" description="" activeTab={activeTab??tab} setActiveTab={setActiveTab??setTab} panel={<BoxdropRules/>} announcement={solo?false:undefined}><div role="status">{error||'Loading Boxdrop…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;
 return solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen">{shell}</div>:shell;
}
interface Props {navigation?:ReactNode;connected?:boolean;terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:BoxdropSnapshot['players'][number])=>ReactNode;view:BoxdropSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:BoxdropIntent)=>void|Promise<void>;onReconnect:()=>void;onFinish?:()=>void}
export function BoxdropView({view:v,userId,now,pending,error,epoch,liveEntry=false,connected=true,onIntent,onReconnect,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance,navigation}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,window=boxdropPlayWindow(b,at,!v.solo);
 const result=boxdropRoundPresentation(b,v.scope,at),timelineResult=result?{...result,reason:result.reason==='full_clear'?'cleared':result.reason}:null;
 const presentation=useTriRoundPresentation({scope:'boxdrop:'+v.scope,phase:b.phase,connected:connected&&!error,paused:v.paused,result:timelineResult,now:at,deadline:b.deadline,userId,active:tab==='cards'&&!sessionEnded,modern:true,liveEntry,recoveryEpoch:epoch,celebrationMs:3000});
 const root=useRef<HTMLDivElement>(null),viewportRef=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),flight=useRef(false),[submitting,setSubmitting]=useState(false),[target,setTarget]=useState<number|null>(null);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useEffect(()=>{setTarget(null);},[v.scope,v.revision,epoch]);
 const prior=useRef({scope:v.scope,revision:v.revision,epoch});
 useEffect(()=>{const p=prior.current;prior.current={scope:v.scope,revision:v.revision,epoch};
  if(p.scope!==v.scope||p.epoch!==epoch||p.revision>=v.revision||!connected||error||v.paused||tab!=='cards'||document.hidden||b.phase!=='playing')return;
  return platformAudio.request({userId,id:`boxdrop:${v.scope}:${v.revision}`,expiresAt:performance.now()+500,cue:boxdropCue(b.event.label)});
 },[v.scope,v.revision,epoch,connected,error,v.paused,tab,b.phase,b.event.label,userId]);
 const canAct=v.canAct&&connected&&!v.paused&&!error&&window.playable&&tab==='cards'&&!sessionEnded&&!pending&&!submitting;
 const send=(intent:BoxdropIntent,destination:number)=>{if(!canAct||flight.current)return;flight.current=true;setSubmitting(true);setTarget(destination);void Promise.resolve(onIntent(intent)).finally(()=>{flight.current=false;setSubmitting(false);setTarget(null);});};
 const active=v.players.find(p=>p.active),displayScore=result?(presentation?.displayScore??result.score):b.score;
 const seconds=Math.ceil(window.remaining/1000),clearing=result?.reason==='full_clear'&&result.elapsed<3000;
 return <FullscreenGameShell className="box-scene" title="Boxdrop" description="" activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded}
 navigation={navigation??(v.solo?<nav aria-label="Boxdrop controls"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined)}
 announcement={v.solo?false:undefined} panelTitle={v.solo?'Rules':undefined} panelDescription={`P-Town rules · ${b.rules.version}`} panel={panel??<BoxdropRules/>}>
 <div ref={root}>{layer&&createPortal(<div className="box-plane" ref={viewportRef} data-boxdrop="">
 <header className="box-scoreband"><span className="box-round">{v.round===3?'Bonus round':`Round ${v.round}/2`}</span><div className="box-scores" data-multiplayer={!v.solo} aria-label="Player scores">{v.players.map(p=><BoxdropScorePill key={p.id} root={viewportRef} name={v.solo?'SCORE':p.name} value={p.active?displayScore:p.score} active={p.active} fraction={p.active&&!sessionEnded?(presentation?.fraction??0):0} balance={!v.solo?balance?.(p):undefined}/>)}</div>{!sessionEnded&&<button className="box-bank" disabled={!canAct} onClick={()=>send({type:'take_score'},-2)}>Take Score</button>}</header>
 {!sessionEnded&&<><div className="box-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={result?0:b.phase==='intro'?100:seconds}><i style={{width:`${b.phase==='intro'?100:result?0:window.remaining/1000}%`}} data-zone={b.phase==='intro'?'green':seconds<=10?'red':seconds<=30?'yellow':'green'}/><b>{v.paused?'PAUSED':result?'BANKED':b.phase==='intro'?'READY':`${seconds}s`}</b></div>
 <div className="box-fit"><div className="box-factory" data-clearing={clearing}>
 <div className="box-pipework" aria-hidden="true"/><div className="box-conveyor"><span className="box-arrow" aria-hidden="true">⇧</span><div className="box-current" key={`${v.scope}:${b.current.id}`} aria-label={`Current box ${b.current.value}${b.current.recycled?', recycled':''}`}><Crate box={b.current}/></div><span className="box-belt"/></div>
 <button className="box-recycle" disabled={!canAct} data-pending={target===-1} onClick={()=>send({type:'recycle',items:[b.current.id]},-1)} aria-label={`Recycle current box. ${b.queue.length} of 6 slots occupied. Potential bonus ${b.recycleIndicator}`}><span>♻</span><b>{b.recycleIndicator.toLocaleString()}</b><small>RECYCLE</small></button>
 <div className="box-queue" aria-label="Recycling queue, oldest first">{Array.from({length:6},(_,i)=><span key={i}>{b.queue[i]?<Crate box={b.queue[i]}/>:<i/>}</span>)}</div>
 <div className="box-scales">{b.scales.map((s,i)=><button key={i} className="box-shaft" data-stage={s.stage} data-status={s.status} data-pending={target===i} disabled={!canAct||s.status!=='active'} onClick={()=>send({type:'place',items:[i,b.current.id]},i)} aria-label={`Scale ${i+1}, ${s.status}, ${Math.max(0,s.target-s.sum)} remaining to ${s.target}, ${s.boxes.length} of ${s.limit} boxes`}>
 <span className="box-duct" aria-hidden="true"/><span className="box-sign">{s.status==='closed'?'✓':s.status==='broken'?'✕':s.status==='short'?'FULL':s.target-s.sum}</span>
 <span className="box-stack">{s.boxes.map((box,j)=><span className="box-stack-item" key={`${box.id}:${j}`}><Crate box={box}/></span>)}</span>
 <span className="box-platform"/><span className="box-piston"/><span className="box-control">▼</span>
 <span className="box-scale-state">{s.status==='closed'?'COMPLETE':s.status==='broken'?'OVERLOAD':s.status==='short'?'FULL':`${s.target} ORDER`}</span></button>)}</div>
 {window.phase==='intro'&&<div className="box-overlay"><TriRoundIntro remaining={window.remaining} roundLabel={v.round===3?'BONUS ROUND EARNED':`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${active?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
 {clearing&&<div className="box-overlay box-clear" role="status"><b>ALL ORDERS COMPLETE!</b><span>★ ★ ★ ★</span></div>}
 {b.phase==='complete'&&<div className="box-overlay box-terminal" role="status"><h2>Game Over</h2><b>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</b><p>{v.terminal?.score.toLocaleString()} points</p>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).flatMap(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id])).map(label=><p key={label}>{label}</p>)}</div>}
 </div></div>
 <p className="box-status" role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:!connected?'Connecting live updates…':pending||submitting?'Placing…':!v.solo&&!v.canAct?`${active?.name??'Opponent'} is playing`:result?(result.reason==='timeout'?'Time Up':clearing?'':'Round Complete'):b.phase==='intro'?'':b.event.label}</p></>}
 </div>,layer)}</div></FullscreenGameShell>;
}
