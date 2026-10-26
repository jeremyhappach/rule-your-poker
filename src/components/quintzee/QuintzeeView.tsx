import {type ReactNode,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {QUINTZEE_CATEGORIES,QUINTZEE_LABELS,quintzeeClock,type QuintzeeIntent,type QuintzeeSnapshot} from '@/lib/quintzee/model';
import './quintzee.css';
import {useQuintzeeRumble} from './useQuintzeeRumble';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
const pips:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
export function QuintzeeView({snapshot:v,actor,now,pending,error,onIntent,onReconnect,activeTab,setActiveTab,sessionEnded=false,panel,balance}:{activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(id:string)=>ReactNode;snapshot:QuintzeeSnapshot;actor:string;now:number;pending:boolean;error:string;onIntent:(i:QuintzeeIntent)=>void;onReconnect:()=>void}){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),[held,setHeld]=useState<number[]>([]),[layer,setLayer]=useState<Element|null>(null),[abandon,setAbandon]=useState(false),root=useRef<HTMLDivElement>(null);
 const tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const s=v.state,b=s.board,active=s.players[s.turnIndex],mine=active===actor,at=v.pausedAt??now,clock=quintzeeClock(b,at);
 const playerName=(id:string,index:number)=>v.playerNames?.[id]?.trim()||`Player ${index+1}`;
 const rumble=useQuintzeeRumble(v.scope,b.rollSerial,b.dice.length,b.held,(b.phase==='playing'||b.result?.reason==='no_matches')&&!s.finished&&v.pausedAt===null&&at<b.deadline);
 const canAct=!sessionEnded&&mine&&!pending&&!error&&!rumble&&tab==='cards'&&b.phase==='playing'&&!s.finished&&v.pausedAt===null&&at<b.deadline;
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useEffect(()=>{setHeld([...b.held]);},[v.scope,b.rollSerial]);
 const upper=QUINTZEE_CATEGORIES.slice(0,6).reduce((total,c)=>total+(b.scores[c]??0),0);
 const count=Object.keys(b.scores).length,rollNumber=b.dice.length===5?3-b.rollsRemaining:0;
 const seconds=Math.ceil(clock.remaining/1000);
 const status=s.finished?'Match complete':v.pausedAt!==null?'Paused':b.phase==='intro'?'Get Ready':b.phase==='stage_complete'?b.result?.reason==='timeout'?'Time’s up':b.result?.reason==='all_categories'?'Perfect card!':'No more matches':'';
 return <FullscreenGameShell className={`quintzee-shell quintzee-${v.theme}`} title="QUINTZEE" description={s.round===3?'Bonus round':`Round ${s.round} of 2`} activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded} announcement={s.players.length===1?false:undefined}
  navigation={s.players.length===1?<nav aria-label="Quintzee controls"><button onClick={()=>setTab('lobby')}>Rules</button>{s.players.length===1&&v.status==='active'&&<button disabled={pending} onClick={()=>setAbandon(true)}>Abandon</button>}</nav>:undefined}
  panel={panel??<div><p>Five dice. Hold any dice and reroll up to twice. Choose a matching open category. No scratch-zero scores or jokers.</p><p>Upper subtotal 63 earns +35. All twelve categories earn +{b.rules.clearBonus}. Multiply the whole card by ×100–×300 according to time remaining.</p><p>Two rounds. A total of 80,000 earns one bonus round. Its score adds to your final total.</p><p>Each round allows {b.rules.durationMs/1000} seconds after Get Ready. The clock continues through rolls and animations.</p></div>}>
 <div ref={root}>{layer&&createPortal(<div className="quintzee-plane" data-theme={v.theme} data-quintzee="">
  <div className="q-players" aria-label="Cumulative player scores">{s.players.map((p,i)=><div key={p} data-active={!s.finished&&p===active}><span>{s.players.length===1?'YOUR SCORE':playerName(p,i)}{p===actor&&s.players.length>1?' · YOU':''}</span><strong>{s.scores[p].toLocaleString()}</strong>{balance?.(p)}</div>)}</div>
  {!sessionEnded&&<><div className="q-timing"><div className="q-time"><div role="progressbar" aria-label="Time remaining" aria-valuetext={`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`} aria-valuenow={seconds} aria-valuemin={0} aria-valuemax={b.rules.durationMs/1000}><i style={{width:`${100*clock.remaining/b.rules.durationMs}%`}}/></div></div></div>
  <div className="q-scorecard">{[QUINTZEE_CATEGORIES.slice(0,6),QUINTZEE_CATEGORIES.slice(6)].map((column,j)=><section key={j} aria-label={j?'Combinations':'Numbers'}>{column.map(c=>{const banked=b.scores[c],potential=b.potentials[c];return <button key={c} data-category={c} className="q-category" data-banked={banked!==undefined} data-available={banked===undefined&&potential!==undefined} disabled={!canAct||banked!==undefined||potential===undefined} onClick={()=>onIntent({type:'score',items:[QUINTZEE_CATEGORIES.indexOf(c)]})} aria-label={`${QUINTZEE_LABELS[c]}: ${banked!==undefined?`${banked} banked`:potential!==undefined?`score ${potential}`:'no match'}`}><span>{QUINTZEE_LABELS[c]}</span><strong>{banked??potential??'—'}{banked!==undefined&&<i aria-label="banked">✓</i>}</strong></button>;})}</section>)}</div>
  <div className="q-bonuses"><span data-earned={upper>=63}>UPPER <b>{upper}/63</b> <em>+35</em></span><span data-earned={count===12}>ALL FILLED <em>+{b.rules.clearBonus}</em></span></div>
  <div className="q-play-area">
   <div className="q-roll-guide"><strong>{rollNumber?`Roll ${rollNumber} of 3`:'First roll is automatic'}</strong>{mine&&<span>{b.rollsRemaining===0?'Choose a category':'Tap dice to hold or release'}</span>}</div>
   <div className="q-dice" aria-label="Dice — tap to hold or release">{Array.from({length:5},(_,i)=><button key={`${v.scope}:${i}`} disabled={!canAct||b.rollsRemaining===0||b.dice.length!==5} data-held={held.includes(i)} data-rolling={!!rumble&&!rumble.held.includes(i)} onClick={()=>setHeld(h=>h.includes(i)?h.filter(x=>x!==i):[...h,i])} aria-label={`Die ${i+1}: ${b.dice[i]??'unrolled'}, ${held.includes(i)?'held; tap to release':'not held; tap to hold'}`} aria-pressed={held.includes(i)}><span className="q-die" key={b.rollSerial}>{(pips[b.dice[i]]??[]).map(p=><i key={p} style={{gridRow:Math.floor(p/3)+1,gridColumn:p%3+1}}/>)}</span><small>{held.includes(i)?'✓ HELD':'HOLD'}</small></button>)}</div>
   {mine?<button className="q-roll" disabled={!canAct||b.rollsRemaining===0} onClick={()=>onIntent({type:'roll',items:held})}>{rumble?'ROLLING…':pending?'SAVING…':b.phase==='intro'?'FIRST ROLL AUTOMATIC':b.rollsRemaining===0?'CHOOSE A CATEGORY':'REROLL DICE'}{b.phase==='playing'&&<small>{b.rollsRemaining} {b.rollsRemaining===1?'reroll':'rerolls'} left</small>}</button>:<div className="q-opponent-turn" role="status">{playerName(active,s.turnIndex)}’s turn</div>}
   {!rumble&&(b.phase==='intro'||b.phase==='stage_complete'||s.finished)&&<div className="q-result" role="status"><strong>{status}</strong>{b.phase==='intro'?<span>{Math.max(1,Math.ceil((b.deadline-at)/1000))}</span>:<span>{b.result?.rawSubtotal} × {b.result?.multiplier} = <b>{b.result?.stageScore.toLocaleString()}</b></span>}{s.finished&&<small>Final totals above · {s.qualified.length?'Bonus round included':'Two rounds complete'}</small>}</div>}
  </div>
  {(error||pending||status)&&<p className="q-status" role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:pending?'Saving…':status}</p>}</>}
 </div>,layer)}</div>
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>onIntent({type:'abandon',items:[]})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>;
}
