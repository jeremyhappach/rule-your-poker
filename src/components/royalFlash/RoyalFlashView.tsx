import {RoyalFlashRules} from '@/components/rules/RoyalFlashRules';
export {RoyalFlashRules} from '@/components/rules/RoyalFlashRules';
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {royalPlayWindow,type RoyalIntent,type RoyalSnapshot} from '@/lib/royalFlash/model';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import {useRoyalPlacementAudio} from '@/hooks/useRoyalPlacementAudio';
import {useRoyalScoringPresentation} from '@/hooks/useRoyalScoringPresentation';
import {royalScoredCell} from '@/lib/royalFlash/scoringPresentation';
import './royalFlash.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const,suits=['♠','♥','♦','♣'] as const;
function Card({id}:{id:number|null}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(20);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span className="royal-card" ref={ref} aria-label={cardName(id)}>{id!==null&&<PlayingCard frontStyle="cartoon" cartoonLayout="royal" card={{rank:ranks[id%13],suit:suits[Math.floor(id/13)]}} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>}</span>;
}
const cardName=(id:number|null)=>id===null?'empty':`${ranks[id%13]}${suits[Math.floor(id/13)]}`;
export function RoyalFlashLoading({solo=false,error,onReconnect,activeTab,setActiveTab}:{solo?:boolean;error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const shell=<FullscreenGameShell className="royal-scene" ready={false} title="Royal Flash" description="" activeTab={activeTab??tab} setActiveTab={setActiveTab??setTab} panel={<RoyalFlashRules/>} announcement={solo?false:undefined} navigation={solo?<nav><button onClick={()=>setTab('lobby')}>Rules</button></nav>:undefined}>
 <div className="royal-loading" role="status">{error||'Loading Royal Flash…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;
 return solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen">{shell}</div>:shell;
}
interface Props {connected?:boolean;terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:RoyalSnapshot['players'][number])=>ReactNode;view:RoyalSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:RoyalIntent)=>void;onReconnect:()=>void;onFinish?:()=>void}
export function RoyalFlashView({view:v,userId,now,pending,error,epoch,liveEntry=false,connected=true,onIntent,onReconnect,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 useRoyalPlacementAudio(v,userId,epoch,tab==='cards'&&!error&&!v.paused&&!sessionEnded&&!document.hidden);
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,window=royalPlayWindow(b,at,!v.solo),remaining=window.remaining;
 const result=b.result??null;
 const frame=useRoyalScoringPresentation(v,userId,epoch,tab==='cards'&&!error&&!v.paused&&!sessionEnded&&!document.hidden,at);
 useTriRoundPresentation({scope:'royal:'+v.scope,phase:b.phase,connected:!error,paused:v.paused,result:null,now:at,deadline:b.deadline,userId,active:tab==='cards',modern:true,liveEntry,recoveryEpoch:epoch});
 const root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),submitted=useRef(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{submitted.current=false;},[v.scope,v.revision,epoch]);
 const terminal=b.phase==='complete',canAct=v.canAct&&connected&&!v.paused&&!pending&&!error&&window.playable&&tab==='cards'&&!sessionEnded;
 const send=(intent:RoyalIntent)=>{if(!canAct||submitted.current)return;submitted.current=true;onIntent(intent);};
 const active=v.players.find(p=>p.active),score=frame?.score??v.terminal?.score??b.score;
 return <FullscreenGameShell className="royal-scene" title="Royal Flash" description="" activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded}
 navigation={v.solo?<nav aria-label="Royal Flash controls"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined}
 announcement={v.solo?false:undefined} panelTitle={v.solo?'Rules':undefined} panelDescription={`P-Town rules · ${b.rules.version}`} panel={panel??<RoyalFlashRules version={b.rules.version}/>}>
 <div className="royal-root" ref={root} data-royal-flash={sessionEnded?undefined:''}>
 {error&&!sessionEnded&&<div className="royal-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
 {!connected&&!error&&!sessionEnded&&<div className="royal-connection" role="status">Connecting live updates…</div>}
 {layer&&createPortal(<div className="royal-plane" data-solo={v.solo||undefined}>
 <div className="royal-score-band"><span>{!terminal&&!sessionEnded&&(v.round===3?'Bonus round':`Round ${v.round} / 2`)}</span><div className="royal-primary-score">{!v.solo&&<small>{active?.name??'Final score'}</small>}<strong>{score.toLocaleString()}</strong></div></div>
 {!v.solo&&<div className="royal-players" aria-label="Player scores">{v.players.map(p=><div key={p.id} data-active={p.active}><span>{p.name}</span><b>{(p.active?score:p.score).toLocaleString()}</b>{balance?.(p)}</div>)}</div>}
 {!sessionEnded&&<div className="royal-playfield">
 {!terminal&&<><div className="royal-grid" data-scoring={frame?.line!=null||undefined} aria-label="Royal Flash five by five board">{(result?.slots??b.slots).map((id,index)=><button key={index} data-scored={royalScoredCell(frame?.line,index)||undefined} data-placed={b.event.slot===index&&b.phase==='playing'} disabled={!canAct} aria-label={`Row ${Math.floor(index/5)+1}, column ${index%5+1}, ${cardName(id)}`} onClick={()=>send({type:'place',index})}><Card id={id}/>{id===null&&<span className="royal-empty">+</span>}</button>)}</div>
 <div className="royal-controls">{frame?<div className="royal-breakdown" role="status" data-scoring-step={frame.key}><small>{b.event.label}</small><b>{frame.label}</b><strong>{frame.key==='lead'?'Rows, then columns':<>+{frame.points.toLocaleString()}{frame.hand&&<> · {frame.hand}</>}</>}</strong></div>:<div className="royal-draw"><Card id={b.current}/></div>}</div>
 {window.phase==='ready'&&<div className="royal-clock" role="timer">{v.paused?'Paused':'Place your first card'} · {Math.ceil(remaining/1000)}s</div>}
 {b.phase==='playing'&&<div className="royal-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={b.rules.stageMs/1000} aria-valuenow={Math.min(remaining,b.rules.stageMs)/1000}><CountdownDots remaining={remaining} duration={b.rules.stageMs}/>{v.paused&&<small>Paused</small>}</div>}
 </>}
 {window.phase==='intro'&&<div className="royal-overlay royal-intro"><TriRoundIntro remaining={remaining} roundLabel={v.round===3?'BONUS ROUND':`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${active?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
 {terminal&&<div className="royal-overlay royal-result" role="status"><span>Game Over</span><strong>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong><p>{v.terminal?.score.toLocaleString()} points</p>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).flatMap(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id])).map(label=><p key={label}>{label}</p>)}</div>}
 {pending&&<span className="royal-pending" role="status">Confirming play…</span>}
 </div>}
 </div>,layer)}</div></FullscreenGameShell>;
}
