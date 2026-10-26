import {QuintzeeDie} from './QuintzeeDie';
import {type ReactNode,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {QUINTZEE_CATEGORIES,QUINTZEE_LABELS,quintzeeClock,type QuintzeeIntent,type QuintzeeSnapshot} from '@/lib/quintzee/model';
import './quintzee.css';
import {useQuintzeeRumble} from './useQuintzeeRumble';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
export function QuintzeeView({snapshot:v,actor,now,pending,error,onIntent,onReconnect,activeTab,setActiveTab,sessionEnded=false,panel,balance}:{activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(id:string)=>ReactNode;snapshot:QuintzeeSnapshot;actor:string;now:number;pending:boolean;error:string;onIntent:(i:QuintzeeIntent)=>void;onReconnect:()=>void}){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),[held,setHeld]=useState<number[]>([]),[layer,setLayer]=useState<Element|null>(null),[abandon,setAbandon]=useState(false),root=useRef<HTMLDivElement>(null);
 const [zero,setZero]=useState<{category:number;revision:number;scope:string}|null>(null),confirming=useRef(false);
 const tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const s=v.state,b=s.board,active=s.players[s.turnIndex],mine=active===actor,at=v.pausedAt??now,clock=quintzeeClock(b,at);
 const playerName=(id:string,index:number)=>v.playerNames?.[id]?.trim()||`Player ${index+1}`;
 const rumble=useQuintzeeRumble(v.scope,b.rollSerial,b.dice.length,b.held,(b.phase==='playing'||b.result?.reason==='no_matches')&&!s.finished&&v.pausedAt===null&&at<b.deadline);
 const ready=b.phase==='ready',v2=b.rules.version==='quintzee/2';
 const canAct=!sessionEnded&&!v.autoplay&&mine&&!pending&&!error&&!rumble&&tab==='cards'&&(b.phase==='playing'||ready)&&!s.finished&&v.pausedAt===null&&at<b.deadline;
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{setHeld([...b.held]);},[v.scope,b.rollSerial]);
 useEffect(()=>{setZero(null);confirming.current=false;},[v.scope,v.revision]);
 const choose=(category:number)=>{if(!canAct||ready)return;const name=QUINTZEE_CATEGORIES[category];if(v2&&!(b.potentials[name]??0))setZero({category,revision:v.revision,scope:v.scope});else onIntent({type:'score',items:[category]});};
 const confirmZero=()=>{if(!zero||confirming.current||!canAct||zero.revision!==v.revision||zero.scope!==v.scope)return;confirming.current=true;setZero(null);onIntent({type:'score_zero',items:[zero.category]});};
 const upper=QUINTZEE_CATEGORIES.slice(0,6).reduce((total,c)=>total+(b.scores[c]??0),0);
 const count=Object.keys(b.scores).length,rollNumber=b.dice.length===5?3-b.rollsRemaining:0;
 const seconds=Math.ceil(clock.remaining/1000);
 const status=s.finished?'Match complete':v.pausedAt!==null?'Paused':b.phase==='intro'?'Get Ready':b.phase==='stage_complete'?b.result?.reason==='timeout'?'Time’s up':b.result?.reason==='all_categories'?'Perfect card!':'No more matches':'';
 return <FullscreenGameShell className={`quintzee-shell quintzee-${v.theme}`} title="QUINTZEE" description={s.round===3?'Bonus round':`Round ${s.round} of 2`} activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded} announcement={s.players.length===1?false:undefined}
  navigation={s.players.length===1?<nav aria-label="Quintzee controls"><button onClick={()=>setTab('lobby')}>Rules</button>{s.players.length===1&&v.status==='active'&&<button disabled={pending} onClick={()=>setAbandon(true)}>Abandon</button>}</nav>:undefined}
  panel={panel??<div><p>Five dice. Hold any dice and reroll up to twice. {v2?'Choose any open category; confirm a zero when it does not match.':'Choose a matching category.'} No jokers.</p><p>Upper subtotal 63 earns +35. All twelve categories earn +{b.rules.clearBonus}. Multiply the whole card by ×100–×300 according to time remaining.</p><p>Two rounds. A total of 80,000 earns one bonus round. Its score adds to your final total.</p><p>Each round allows {b.rules.durationMs/1000} seconds{v2?' after Start. You have 30 seconds to start each round.':'.'} The clock continues through rolls and animations.</p></div>}>
 <div ref={root}>{layer&&createPortal(<div className="quintzee-plane" data-theme={v.theme} data-quintzee="">
  <div className="q-players" aria-label="Cumulative player scores">{s.players.map((p,i)=><div key={p} data-active={!s.finished&&p===active}><span>{s.players.length===1?'YOUR SCORE':playerName(p,i)}{p===actor&&s.players.length>1?' · YOU':''}</span><strong>{s.scores[p].toLocaleString()}</strong>{balance?.(p)}</div>)}</div>
  {!sessionEnded&&<><div className="q-timing"><div className="q-time"><div role="progressbar" aria-label="Time remaining" aria-valuetext={`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`} aria-valuenow={seconds} aria-valuemin={0} aria-valuemax={b.rules.durationMs/1000}><i style={{width:`${100*clock.remaining/b.rules.durationMs}%`}}/></div></div>{ready&&<p className="q-start-deadline" role="status">Start within {Math.max(0,Math.ceil((b.deadline-at)/1000))}s</p>}</div>
  <div className="q-scorecard">{[QUINTZEE_CATEGORIES.slice(0,6),QUINTZEE_CATEGORIES.slice(6)].map((column,j)=><section key={j} aria-label={j?'Combinations':'Numbers'}>{column.map(c=>{const banked=b.scores[c];return <button key={c} data-category={c} className="q-category" data-banked={banked!==undefined} disabled={!canAct||ready||banked!==undefined||(!v2&&b.potentials[c]===undefined)} onClick={()=>choose(QUINTZEE_CATEGORIES.indexOf(c))} aria-label={QUINTZEE_LABELS[c]+(banked!==undefined?': '+banked+' recorded':': unfilled')}><span>{QUINTZEE_LABELS[c]}</span><strong>{banked??'—'}</strong></button>;})}</section>)}</div>
  <div className="q-bonuses"><span data-earned={upper>=63}>UPPER <b>{upper}/63</b> <em>+35</em></span><span data-earned={count===12}>ALL FILLED <em>+{b.rules.clearBonus}</em></span></div>
  <div className="q-play-area">
   {v.autoplay&&<label className="q-autoplay"><input type="checkbox" checked disabled={pending||!!error} onChange={()=>onIntent({type:'reclaim',items:[]})}/>Auto-play</label>}
   <div className="q-roll-guide"><strong>{rollNumber?`Roll ${rollNumber} of 3`:ready?'Ready to start':'Get Ready'}</strong>{mine&&!ready&&!v.autoplay&&<span>{b.rollsRemaining===0?'Choose a category':'Tap dice to hold or release'}</span>}</div>
   <div className="q-dice" aria-label="Dice - tap to hold or release">{b.dice.length===5&&b.dice.map((value,i)=>{const rolling=!!rumble&&!rumble.held.includes(i);return <button key={v.scope+':'+i} disabled={!canAct||ready||b.rollsRemaining===0} data-held={held.includes(i)} data-rolling={rolling} onClick={()=>setHeld(h=>h.includes(i)?h.filter(x=>x!==i):[...h,i])} aria-label={'Die '+(i+1)+': '+(rolling?'rolling':value)+', '+(held.includes(i)?'held; tap to release':'not held; tap to hold')} aria-pressed={held.includes(i)}><QuintzeeDie value={value} rolling={rolling}/><small>{held.includes(i)?'HELD':'HOLD'}</small></button>;})}</div>
   {mine?<button className="q-roll" disabled={!canAct||b.rollsRemaining===0} onClick={()=>onIntent({type:ready?'start':'roll',items:ready?[]:held})}>{rumble?'ROLLING…':pending?'SAVING…':ready?'Start':b.phase==='intro'?'GET READY':b.rollsRemaining===0?'CHOOSE A CATEGORY':'REROLL DICE'}{b.phase==='playing'&&<small>{b.rollsRemaining} {b.rollsRemaining===1?'reroll':'rerolls'} left</small>}</button>:<div className="q-opponent-turn" role="status">{playerName(active,s.turnIndex)}’s turn</div>}
   {!rumble&&(b.phase==='intro'||b.phase==='stage_complete'||s.finished)&&<div className="q-result" role="status"><strong>{status}</strong>{b.phase==='intro'?<span>{Math.max(1,Math.ceil((b.deadline-at)/1000))}</span>:<span>{b.result?.rawSubtotal} × {b.result?.multiplier} = <b>{b.result?.stageScore.toLocaleString()}</b></span>}{s.finished&&<small>Final totals above · {s.qualified.length?'Bonus round included':'Two rounds complete'}</small>}</div>}
  </div>
  {(error||pending||status)&&<p className="q-status" role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:pending?'Saving…':status}</p>}</>}
 </div>,layer)}</div>
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>onIntent({type:'abandon',items:[]})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={zero!==null} onOpenChange={open=>{if(!open)setZero(null);}}><AlertDialogContent><AlertDialogTitle>Confirm 0</AlertDialogTitle><AlertDialogDescription>Record zero for {zero===null?'this category':QUINTZEE_LABELS[QUINTZEE_CATEGORIES[zero.category]]}?</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!canAct||pending} onClick={confirmZero}>Confirm 0</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>;
}
