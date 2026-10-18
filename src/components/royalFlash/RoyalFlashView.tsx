import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {CountdownDots} from '@/components/ui/CountdownDots';
import type {RoyalIntent,RoyalSnapshot} from '@/lib/royalFlash/model';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import {useRoyalPlacementAudio} from '@/hooks/useRoyalPlacementAudio';
import './royalFlash.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const,suits=['♠','♥','♦','♣'] as const;
function Card({id}:{id:number|null}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(20);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span className="royal-card" ref={ref}>{id!==null&&<PlayingCard frontStyle="cartoon" cartoonLayout="tableau" card={{rank:ranks[id%13],suit:suits[Math.floor(id/13)]}} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>}</span>;
}
const cardName=(id:number|null)=>id===null?'empty':`${ranks[id%13]}${suits[Math.floor(id/13)]}`;
interface Props {terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:RoyalSnapshot['players'][number])=>ReactNode;view:RoyalSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:RoyalIntent)=>void;onReconnect:()=>void;onFinish?:()=>void}
export function RoyalFlashView({view:v,userId,now,pending,error,epoch,liveEntry=false,onIntent,onReconnect,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 useRoyalPlacementAudio(v,userId,epoch,tab==='cards'&&!error&&!v.paused&&!sessionEnded&&!document.hidden);
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,remaining=Math.max(0,b.deadline-at);
 const result=b.result?{...b.result,id:b.result.id??v.scope,elapsed:Math.max(0,at-(b.deadline-b.rules.holdMs))}:null;
 const motion=useTriRoundPresentation({scope:'royal:'+v.scope,phase:b.phase,connected:!error,paused:v.paused,result,now:at,deadline:b.deadline,userId,active:tab==='cards',modern:true,liveEntry,recoveryEpoch:epoch});
 const root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),submitted=useRef(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{submitted.current=false;},[v.scope,v.revision,epoch]);
 const terminal=b.phase==='complete',canAct=v.canAct&&!v.paused&&!pending&&!error&&remaining>0&&['ready','playing'].includes(b.phase)&&tab==='cards'&&!sessionEnded;
 const send=(intent:RoyalIntent)=>{if(!canAct||submitted.current)return;submitted.current=true;onIntent(intent);};
 const active=v.players.find(p=>p.active),score=motion.displayScore??active?.score??v.terminal?.score??0;
 return <FullscreenGameShell className="royal-scene" title="Royal Flash" description="" activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded}
 navigation={v.solo?<nav aria-label="Royal Flash controls"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined}
 announcement={v.solo?false:undefined} panelTitle={v.solo?'Rules':undefined} panelDescription={`P-Town rules · ${b.rules.version}`} panel={panel??<RoyalFlashRules/>}>
 <div className="royal-root" ref={root} data-royal-flash={sessionEnded?undefined:''}>
 {error&&!sessionEnded&&<div className="royal-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
 {layer&&createPortal(<div className="royal-plane">
 <div className="royal-score-band"><span>{!terminal&&!sessionEnded&&(v.round===3?'Bonus round':`Round ${v.round} / 2`)}</span><div className="royal-primary-score">{!v.solo&&<small>{active?.name??'Final score'}</small>}<strong>{score.toLocaleString()}</strong></div>{!terminal&&!sessionEnded&&<button disabled={!canAct||b.phase!=='playing'} onClick={()=>send({type:'take_score'})}>Take Score</button>}</div>
 {!v.solo&&<div className="royal-players" aria-label="Player scores">{v.players.map(p=><div key={p.id} data-active={p.active}><span>{p.name}</span><b>{(p.active?score:p.score).toLocaleString()}</b>{balance?.(p)}</div>)}</div>}
 {!sessionEnded&&<div className="royal-playfield">
 {!terminal&&<><div className="royal-grid" aria-label="Royal Flash five by five board">{b.slots.map((id,index)=><button key={index} data-placed={b.event.slot===index&&b.phase==='playing'} disabled={!canAct} aria-label={`Row ${Math.floor(index/5)+1}, column ${index%5+1}, ${cardName(id)}`} onClick={()=>send({type:'place',index})}><Card id={id}/>{id===null&&<span className="royal-empty">+</span>}</button>)}</div>
 <div className="royal-controls"><div className="royal-draw"><span>Next card</span><Card id={b.current}/><small>{b.stockRemaining} cards left</small></div><div className="royal-lines" aria-label="Row and column scores"><span>Rows</span>{b.lines.slice(0,5).map((line,i)=><span key={'r'+i} title={line.kind.replace(/_/g,' ')}>{line.points.toLocaleString()}</span>)}<span>Columns</span>{b.lines.slice(5).map((line,i)=><span key={'c'+i} title={line.kind.replace(/_/g,' ')}>{line.points.toLocaleString()}</span>)}</div></div>
 {b.phase==='ready'&&<div className="royal-clock" role="timer">{v.paused?'Paused':'Place your first card'} · {Math.ceil(remaining/1000)}s</div>}
 {b.phase==='playing'&&<div className="royal-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={150} aria-valuenow={remaining/1000}><CountdownDots remaining={remaining} duration={b.rules.stageMs}/>{v.paused&&<small>Paused</small>}</div>}
 </>}
 {b.phase==='intro'&&<div className="royal-overlay royal-intro"><TriRoundIntro remaining={remaining} roundLabel={v.round===3?'BONUS ROUND':`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${active?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
 {result&&<div className="royal-overlay royal-result" role="status"><span>{b.event.label}</span><strong>{(motion.displayScore??result.score).toLocaleString()}</strong><p>Hands +{result.handPoints.toLocaleString()}<br/>Speed +{result.timeBonus.toLocaleString()}</p></div>}
 {terminal&&<div className="royal-overlay royal-result" role="status"><span>Game Over</span><strong>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong><p>{v.terminal?.score.toLocaleString()} points</p>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).flatMap(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id])).map(label=><p key={label}>{label}</p>)}</div>}
 {pending&&<span className="royal-pending" role="status">Confirming play…</span>}
 </div>}
 </div>,layer)}</div></FullscreenGameShell>;
}
export function RoyalFlashRules(){return <div className="royal-rules"><p>Place the next card anywhere in the 5 × 5 grid. Placing on an occupied square permanently replaces that card. You have 52 cards; no passes or undo.</p><p>Each complete row and column scores its best poker hand. Diagonals and partial lines score zero. Replacing a card may lower your score.</p><dl>{[['Royal flush','50,000'],['Straight flush','40,000'],['Four of a kind','30,000'],['Full house','20,000'],['Flush','10,000'],['Straight','9,000'],['Three of a kind','8,000'],['Two pair','7,000'],['Pair','5,000']].map(([name,points])=><div key={name}><dt>{name}</dt><dd>{points}</dd></div>)}</dl><p>Ace may be low or high. Card order does not matter; straights cannot wrap.</p><p>After the bell, you have 20 seconds to place your first card and start the full 150-second round. Take Score is available after that first play. A full grid finished early earns 250 per whole second remaining; timeout and partial grids earn no speed bonus.</p><p>Play two rounds. Reach 200,000 points to earn exactly one bonus round. Each result remains for five seconds, then play advances automatically.</p></div>;}
