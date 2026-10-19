import {memo,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {takeTwoPlayWindow,takeTwoMeter,type TakeTwoIntent,type TakeTwoSnapshot} from '@/lib/takeTwo/model';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import './takeTwo.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const,suits=['♠','♥','♦','♣'] as const;
const cardName=(id:number|null)=>id===null?'empty':`${ranks[id%13]}${suits[Math.floor(id/13)]}`;
const Card=memo(function Card({id}:{id:number|null}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(20);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span className="take-card" ref={ref}>{id!==null&&<PlayingCard frontStyle="cartoon" cartoonLayout="royal" card={{rank:ranks[id%13],suit:suits[Math.floor(id/13)]}} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>}</span>;
});
export function TakeTwoLoading({solo=false,error,onReconnect,activeTab,setActiveTab}:{solo?:boolean;error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const shell=<FullscreenGameShell className="take-scene" ready={false} title="Take 2" description="" activeTab={activeTab??tab} setActiveTab={setActiveTab??setTab} panel={<TakeTwoRules/>} announcement={solo?false:undefined}><div className="take-loading" role="status">{error||'Loading Take 2…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;
 return solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen">{shell}</div>:shell;
}
interface Props {connected?:boolean;terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:TakeTwoSnapshot['players'][number])=>ReactNode;view:TakeTwoSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:TakeTwoIntent)=>void|Promise<void>;onReconnect:()=>void;onFinish?:()=>void}
export function TakeTwoView({view:v,userId,now,pending,error,epoch,liveEntry=false,connected=true,onIntent,onReconnect,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,window=takeTwoPlayWindow(b,at,!v.solo),result=b.result;
 const [selection,setSelection]=useState<{index:number;card:number|null;scope:string}|null>(null),[feedback,setFeedback]=useState('');
 const [submission,setSubmission]=useState<{revision:number;scope:string;items:number[]}|null>(null);
 const selected=selection?.scope===v.scope&&(selection.index===-1?b.current:b.slots[selection.index])===selection.card&&(selection.index===-1||b.exposed.includes(selection.index))?selection.index:null;
 const submittedItems=submission?.scope===v.scope&&submission.revision===v.revision?submission.items:[];
 useTriRoundPresentation({scope:'take-two:'+v.scope,phase:b.phase,connected:!error,paused:v.paused,result:null,now:at,deadline:b.deadline,userId,active:tab==='cards',modern:true,liveEntry,recoveryEpoch:epoch});
 const root=useRef<HTMLDivElement>(null),playersRef=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),submitted=useRef(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{setSelection(null);setFeedback('');},[v.scope,epoch,tab]);
 const terminal=b.phase==='complete',canSelect=v.canAct&&connected&&!v.paused&&!error&&window.playable&&tab==='cards'&&!sessionEnded,canAct=canSelect&&!pending&&!submission;
 const send=(intent:TakeTwoIntent)=>{
  if(!canAct||submitted.current)return;
  submitted.current=true;setSubmission({revision:v.revision,scope:v.scope,items:intent.type==='pair'?intent.items:[]});setSelection(null);setFeedback('');
  // Only selection is local. The hook retains the immutable request on
  // uncertainty; authoritative snapshots alone remove cards and award points.
  void Promise.resolve(onIntent(intent)).finally(()=>{submitted.current=false;setSubmission(null);});
 };
 const choose=(index:number)=>setSelection({index,card:index===-1?b.current:b.slots[index],scope:v.scope});
 const select=(index:number)=>{
  if(!canSelect||submittedItems.includes(index))return;
  if(selected===index){setSelection(null);return;}
  if(selected===null){choose(index);setFeedback('');return;}
  if(!canAct){choose(index);return;}
  if(b.legalPairs.some(([a,z])=>a===Math.min(selected,index)&&z===Math.max(selected,index)))send({type:'pair',items:[selected,index]});
  else {choose(index);setFeedback('Choose the same value or the next value.');}
 };
 const active=v.players.find(p=>p.active),meter=takeTwoMeter(b,at),lit=Math.ceil(Math.min(window.remaining,b.rules.stageMs)/b.rules.stageMs*15);
 useLayoutEffect(()=>{playersRef.current?.querySelector('[data-active=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});},[active?.id]);
 return <FullscreenGameShell className="take-scene" title="Take 2" description="" activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded}
 navigation={v.solo?<nav aria-label="Take 2 controls"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined}
 announcement={v.solo?false:undefined} panelTitle={v.solo?'Rules':undefined} panelDescription={`P-Town rules · ${b.rules.version}`} panel={panel??<TakeTwoRules/>}>
 <div className="take-root" ref={root} data-take-two={sessionEnded?undefined:''}>
 {error&&!sessionEnded&&<div className="take-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
 {!connected&&!error&&!sessionEnded&&<div className="take-error" role="status">Connecting live updates…</div>}
 {layer&&createPortal(<div className="take-plane">
 {!v.solo&&<div className="take-players" ref={playersRef} aria-label="Player scores">{v.players.map(p=><div key={p.id} data-active={p.active}><span>{p.name}</span><b>{p.score.toLocaleString()}</b>{balance?.(p)}</div>)}</div>}
 {!sessionEnded&&<div className="take-fit"><div className="take-cabinet">
 <header><span className="take-total"><small>{v.solo?'SCORE':active?.name??'FINAL SCORE'}</small><b>{(v.terminal?.score??b.score).toLocaleString()}</b></span><span className="take-stage">Round <b>{v.round} / 3</b></span><span className="take-round" aria-label="Personal best"><small>BEST</small><b>{b.highScore.toLocaleString()}</b></span></header>
 <div className="take-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,window.remaining/1000)}><span aria-hidden="true">◷</span>{Array.from({length:15},(_,i)=><i key={i} data-lit={i<lit} data-zone={i<3?'red':i<7?'yellow':'green'}/>)}<small>{v.paused?'Paused':Math.ceil(Math.min(window.remaining,b.rules.stageMs)/1000)+'s'}</small></div>
 <div className="take-stats"><div className="take-counters"><span>K Q <b>{b.consecutivePairs}</b><small> ×400</small></span><span>J J <b>{b.samePairs}</b><small> ×1200</small></span></div><div className="take-meter" role="meter" aria-label="Pair speed bonus" aria-valuemin={50} aria-valuemax={500} aria-valuenow={meter}><span style={{width:`${meter/5}%`}}/><b>Bonus +{meter}</b></div></div>
 <p className="take-instruction" role="status">{feedback||(pending||submission?'Confirming…':b.event.label==='Get ready'?'PAIR SAME VALUES OR CONSECUTIVE CARDS':`${b.event.label}${b.event.points?' · '+(b.event.points>0?'+':'')+b.event.points:''}`)}</p>
 <div className="take-felt"><div className="take-play-group"><div className="take-tableau-space">
 <div className="take-tableau" aria-label="Take 2 playfield">{b.slots.map((id,index)=>{const p=b.layout[index],highlight=selected===index||submittedItems.includes(index);return id===null?null:<button key={index} style={{left:`${p.x*8.35}%`,top:`${p.row*(b.slots.length===28?13.7:11.2)}%`,zIndex:p.row+1}} data-selected={highlight||undefined} data-covered={!b.exposed.includes(index)||undefined} disabled={!canSelect||!b.exposed.includes(index)||submittedItems.includes(index)} aria-label={`Row ${p.row+1}, card ${p.column+1}: ${cardName(id)}${b.exposed.includes(index)?'':', covered'}`} aria-pressed={highlight} onClick={()=>select(index)}><Card id={id}/></button>;})}</div>
 </div><footer><button className="take-bank" disabled={!canAct} onClick={()=>send({type:'take_score'})}>Take Score</button><button className="take-stock" disabled={!canAct||b.stockRemaining===0} onClick={()=>send({type:'draw'})}>NEXT CARD<small>{b.stockRemaining} left · −100</small></button><button className="take-current" aria-label={`Current card: ${cardName(b.current)}`} aria-pressed={selected===-1||submittedItems.includes(-1)} data-selected={selected===-1||submittedItems.includes(-1)||undefined} disabled={!canSelect||b.current===null||submittedItems.includes(-1)} onClick={()=>select(-1)}><Card id={b.current}/></button></footer>
 </div>
 </div>
 {window.phase==='intro'&&<div className="take-overlay"><TriRoundIntro remaining={window.remaining} roundLabel={`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${active?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
 {result&&<div className="take-overlay take-result" role="status"><h2>{b.event.label}</h2><p>Pairs and draws <b>{result.displayScore-result.scoreBefore}</b></p><p>Full clear <b>+{result.clearBonus.toLocaleString()}</b></p><p>Undrawn stock <b>+{result.stockBonus.toLocaleString()}</b></p><p>Time bonus <b>+{result.timeBonus.toLocaleString()}</b></p><strong>{result.score.toLocaleString()}</strong><small>{v.solo&&v.round===3?'Final score':'Play advances automatically'}</small></div>}
 {terminal&&<div className="take-overlay take-result" role="status"><h2>Game Over</h2><strong>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong><p>{v.terminal?.score.toLocaleString()} points</p>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).flatMap(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id])).map(label=><p key={label}>{label}</p>)}</div>}
 </div></div>}
 </div>,layer)}</div></FullscreenGameShell>;
}
export function TakeTwoRules({version='take-two/1'}:{version?:string}){return <div className="take-rules"><p>Play three rounds of 100 seconds. The clock starts after Get Ready. Pair two uncovered cards of the same value or consecutive values, including the current card. Suits do not matter. Ace matches Ace, 2, or King.</p><p>Same value earns 1,200; consecutive values earn 400. Each pair adds a speed bonus: 500 for one second, then falling by 150 per second in five-point steps to 50. Only a successful pair resets it.</p><p>Next Card costs 100 points, with your total floored at zero. The outgoing current card fills the first uncovered empty space, top to bottom and left to right; a full playfield discards it. Matching the current card refills it for free.</p><p>Clear the playfield for 10,000 plus 1,000 per undrawn stock card. The current card is not stock. A clear also earns 50 per whole second remaining, up to 5,000. Take Score banks your points; it earns the time bonus only when stock is empty and no legal pair remains. Timeout earns no time bonus.</p><p>Round 1 has 28 cards; rounds 2 and 3 have 33. Each round uses a fresh shuffled deck. These are the approved P-Town rules ({version}).</p></div>;}
