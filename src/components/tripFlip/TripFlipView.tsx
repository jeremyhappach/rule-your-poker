import {TripFlipRules} from '@/components/rules/TripFlipRules';
export {TripFlipRules} from '@/components/rules/TripFlipRules';
import {memo,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {tripFlipPlayWindow,tripFlipDots,tripFlipCard,type TripFlipIntent,type TripFlipSnapshot} from '@/lib/tripFlip/model';
import {winnerAchievementLabels} from '@/lib/arcade/scoreAchievements';
import {platformAudio} from '@/lib/audio/platformAudio';
import {tripFlipClearCue} from '@/lib/tripFlip/audio';
import {TripFlipScorePill} from './TripFlipScorePill';
import {tripFlipRoundPresentation} from '@/lib/tripFlip/roundPresentation';
import './tripFlip.css';
const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const,suits=['♠','♥','♦','♣'] as const;
export const tripFlipCardName=(id:number|null|undefined)=>id==null?'empty':id>=52?'Joker':`${ranks[id%13]}${suits[Math.floor(id/13)]}`;
const Card=memo(function Card({id}:{id:number|null}){
 const ref=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(20);
 useLayoutEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.min(entry.contentRect.width,entry.contentRect.height/1.5)));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 return <span className="trip-card" ref={ref}>{id!==null&&(id>=52?<span className="trip-joker" data-red={id===53}><small>JOKER</small><b>★</b><span>WILD</span></span>:<PlayingCard frontStyle="cartoon" cartoonLayout="royal" card={{rank:ranks[id%13],suit:suits[Math.floor(id/13)]}} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>)}</span>;
});
export function TripFlipLoading({solo=false,error,onReconnect,activeTab,setActiveTab}:{solo?:boolean;error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards');
 const shell=<FullscreenGameShell className="trip-scene" ready={false} title="Trip Flip" description="" activeTab={activeTab??tab} setActiveTab={setActiveTab??setTab} panel={<TripFlipRules/>} announcement={solo?false:undefined}><div className="trip-loading" role="status">{error||'Loading Trip Flip…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;
 return solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen">{shell}</div>:shell;
}
interface Props {connected?:boolean;terminalPresenting?:boolean;onAbandon?:()=>void;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(p:TripFlipSnapshot['players'][number])=>ReactNode;view:TripFlipSnapshot;userId:string;now:number;pending:boolean;error:string;epoch:number;liveEntry?:boolean;onIntent:(intent:TripFlipIntent)=>void|Promise<void>;onReconnect:()=>void;onFinish?:()=>void}
export function TripFlipView({view:v,userId,now,pending,error,epoch,liveEntry=false,connected=true,onIntent,onReconnect,onAbandon,activeTab,setActiveTab,sessionEnded=false,panel,balance}:Props){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,window=tripFlipPlayWindow(b,at,!v.solo),result=tripFlipRoundPresentation(b,v.scope,at);
 const [selection,setSelection]=useState<{location:number;card:number;scope:string;revision:number}|null>(null),[feedback,setFeedback]=useState(''),[submitting,setSubmitting]=useState(false);
 const selected=selection?.scope===v.scope&&selection.revision===v.revision&&tripFlipCard(b,selection.location)===selection.card?selection:null;
 const presentation=useTriRoundPresentation({scope:'trip-flip:'+v.scope,phase:b.phase,connected:connected&&!error,paused:v.paused,result,now:at,deadline:b.deadline,userId,active:tab==='cards'&&!sessionEnded,modern:true,liveEntry,recoveryEpoch:epoch});
 const root=useRef<HTMLDivElement>(null),viewportRef=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),flight=useRef(false),previous=useRef({scope:v.scope,revision:v.revision,epoch});
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{setSelection(null);setFeedback('');},[v.scope,epoch,tab]);
 useEffect(()=>{const p=previous.current;previous.current={scope:v.scope,revision:v.revision,epoch};if(p.scope!==v.scope||p.epoch!==epoch||p.revision>=v.revision||!connected||error||v.paused||tab!=='cards'||document.hidden||b.phase!=='playing'||b.event.points<=0)return;return platformAudio.request({userId,id:`trip-flip:${v.scope}:${v.revision}:clear`,expiresAt:performance.now()+1100,cue:tripFlipClearCue(!!b.event.special)});},[v.scope,v.revision,epoch,connected,error,v.paused,tab,b.phase,b.event.points,b.event.special,userId]);
 const terminal=b.phase==='complete',canSelect=v.canAct&&connected&&!v.paused&&!error&&window.playable&&tab==='cards'&&!sessionEnded,canAct=canSelect&&!pending&&!submitting;
 const send=(intent:TripFlipIntent)=>{if(!canAct||flight.current)return;flight.current=true;setSubmitting(true);setSelection(null);setFeedback('');void Promise.resolve(onIntent(intent)).finally(()=>{flight.current=false;setSubmitting(false);});};
 const tap=(location:number)=>{
  if(!canSelect)return;const card=tripFlipCard(b,location);
  if(selected?.location===location){setSelection(null);return;}
  if(selected&&canAct&&b.legalMoves.some(([src,dst,id])=>src===selected.location&&dst===location&&id===selected.card)){send({type:'move',items:[selected.location,location,selected.card]});return;}
  if(card!=null){setSelection({location,card,scope:v.scope,revision:v.revision});setFeedback('');}else setFeedback('Choose a card first.');
 };
 const target=(location:number)=>!!selected&&b.legalMoves.some(([src,dst,id])=>src===selected.location&&dst===location&&id===selected.card);
 const active=v.players.find(p=>p.active),lit=window.phase==='intro'?b.rules.dots:result?result.timeDots:window.phase==='playing'?tripFlipDots(b,window.remaining):0;
 const displayScore=result?(presentation?.displayScore??result.score):b.score;
 return <FullscreenGameShell className="trip-scene" title="Trip Flip" description="" activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded}
 navigation={v.solo?<nav aria-label="Trip Flip controls"><button onClick={()=>setTab('lobby')}>Rules</button>{onAbandon&&<button onClick={onAbandon}>Abandon</button>}</nav>:undefined}
 announcement={v.solo?false:undefined} panelTitle={v.solo?'Rules':undefined} panelDescription={`P-Town rules · ${b.rules.version}`} panel={panel??<TripFlipRules/>}>
 <div className="trip-root" ref={root} data-trip-flip={sessionEnded?undefined:''}>
 {error&&!sessionEnded&&<div className="trip-error" role="alert">{error} <button onClick={onReconnect}>Reconnect</button></div>}
 {!connected&&!error&&!sessionEnded&&<div className="trip-error" role="status">Connecting live updates…</div>}
 {layer&&createPortal(<div className="trip-plane" ref={viewportRef}>
 <header className="trip-scoreband"><span className="trip-round">Round <b>{v.round}/2</b></span><div className="trip-scores" data-multiplayer={!v.solo} aria-label="Player scores">{v.players.map(p=><TripFlipScorePill key={p.id} root={viewportRef} name={v.solo?'SCORE':p.name} value={p.active?displayScore:p.score} active={p.active} fraction={p.active&&!sessionEnded?(presentation?.fraction??0):0} balance={!v.solo?balance?.(p):undefined}/>)}</div>{!sessionEnded&&<button className="trip-bank" disabled={!canAct} onClick={()=>send({type:'take_score'})}>Take Score</button>}</header>
 {!sessionEnded&&<><div className="trip-secondary"><span>Trips <b>{b.trips}</b> <small>×3,000</small></span><span>Runs <b>{b.runs}</b> <small>×600</small></span><span>Best <b>{b.highScore.toLocaleString()}</b></span></div>
 <div className="trip-fit"><div className="trip-board">
 <div className="trip-flips" aria-label="Flip cells">{b.cells.map((card,i)=><button key={i} data-location={i+4} data-selected={selected?.location===i+4||undefined} data-target={target(i+4)||undefined} disabled={!canSelect} onClick={()=>tap(i+4)} aria-label={`Flip ${i+1}: ${tripFlipCardName(card)}`} aria-pressed={selected?.location===i+4}><span className="trip-slot-label">FLIP</span><Card id={card}/></button>)}</div>
 <div className="trip-columns" aria-label="Four tableau columns">{b.columns.map((cards,i)=><div className="trip-column" key={i} data-target={target(i)||undefined}><button className="trip-column-target" disabled={!canSelect} onClick={()=>tap(i)} aria-label={`Column ${i+1}, ${cards.length} cards`}><span>{i+1}</span></button>{cards.map((card,j)=><button key={card} style={{top:`${j*64/278*100}%`,zIndex:j+1}} data-location={i} data-card={card} data-selected={j===cards.length-1&&selected?.location===i||undefined} disabled={!canSelect||j!==cards.length-1} onClick={()=>tap(i)} aria-label={`Column ${i+1}: ${tripFlipCardName(card)}${j===cards.length-1?'':', covered'}`} aria-pressed={j===cards.length-1&&selected?.location===i}><Card id={card}/></button>)}</div>)}</div>
 <div className="trip-bottom"><div className="trip-clock" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={180} aria-valuenow={Math.min(180,window.remaining/1000)}><b>{v.paused?'PAUSED':result?'Banked':Math.ceil(Math.min(window.remaining,b.rules.stageMs)/1000)+'s'}</b><div>{Array.from({length:b.rules.dots},(_,i)=><i key={i} data-lit={i<lit} data-zone={i<5?'red':i<12?'yellow':'green'}/>)}</div><small>{lit} × 125</small></div>
 <div className="trip-fan" aria-label="Three-card fan">{[...b.fan].reverse().map((card,reverseIndex)=>{const index=b.fan.length-1-reverseIndex;return <button key={card} style={{left:`${index*15}%`,top:`${index*3}%`,zIndex:3-index}} disabled={!canSelect||index!==0} data-location={7} data-card={card} data-front={index===0} data-selected={index===0&&selected?.location===7||undefined} onClick={()=>tap(7)} aria-label={`Fan ${index===0?'front':'covered'}: ${tripFlipCardName(card)}`} aria-pressed={index===0&&selected?.location===7}><Card id={card}/></button>;})}<span className="trip-stock">{b.stockRemaining} in stock</span></div>
 <div className="trip-special" data-claimed={b.specialClaimed} aria-label="Special Run objective"><b>SPECIAL RUN</b><div>{b.special.map((card,i)=><span key={i}><Card id={card}/></span>)}</div><strong>{b.specialClaimed?'✓ Claimed':'+10,000'}</strong></div></div>
 {b.event.points>0&&b.phase==='playing'&&<div key={`${v.scope}:${v.revision}`} className="trip-award" data-special={b.event.special} aria-live="polite"><b>{b.event.label}</b><strong>+{b.event.points.toLocaleString()}</strong></div>}
 {window.phase==='intro'&&<div className="trip-overlay"><TriRoundIntro remaining={window.remaining} roundLabel={`ROUND ${v.round}`} turnLabel={v.solo?'':v.canAct?'YOUR TURN':`${active?.name??'Player'}’S TURN`} paused={v.paused}/></div>}
 {terminal&&<div className="trip-overlay trip-result" role="status"><h2>Game Over</h2><strong>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')} {v.terminal?.winnerIds.length===1?'wins':'tie'}</strong><p>{v.terminal?.score.toLocaleString()} points</p>{v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).flatMap(p=>winnerAchievementLabels(p.name,v.terminal?.achievements[p.id])).map(label=><p key={label}>{label}</p>)}</div>}
 </div></div>{result&&<div className="trip-round-result" data-result-id={result.id} role="status"><h2>{result.reason==='timeout'?'Time Up':'Round Complete'}</h2><span className="sr-only">Total {result.score.toLocaleString()}</span></div>}<p className="trip-status" role="status">{feedback||(result?'':pending||submitting?'Confirming move…':!v.solo&&!v.canAct?`${active?.name??'Opponent'} is playing`:selected?'Tap a highlighted destination':b.event.label==='Get ready'?'':b.event.label)}</p></>}
 </div>,layer)}</div></FullscreenGameShell>;
}
