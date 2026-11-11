import {QuintzeeRulesIcon} from './QuintzeeRulesIcon';
import {ArcadeAbandonButton} from '@/components/arcade/ArcadeAbandonButton';
import {useQuintzeeRollAudio} from './useQuintzeeRollAudio';
import {presentQuintzeeHold} from '@/lib/audio/quintzeeHoldCue';
import {QuintzeeBonuses} from './QuintzeeBonuses';
import {useQuintzeeScorePresentation} from './useQuintzeeScorePresentation';
import {TriScorePill,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {triResultTimeline,triCountWindow,TRI_ROUND_TIMELINE} from '@/lib/triTowers/roundTimeline';
import {celebrationCueAt} from '@/lib/audio/celebrationCue';
import {QuintzeeDie} from './QuintzeeDie';
import {type ReactNode,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {QUINTZEE_CATEGORIES,QUINTZEE_LABELS,quintzeeClock,quintzeeBasePreview,quintzeeNeedsZeroConfirmation,quintzeeRoundLabel,type QuintzeeIntent,type QuintzeeSnapshot} from '@/lib/quintzee/model';
import './quintzee.css';
import {useQuintzeeRumble} from './useQuintzeeRumble';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogTitle} from '@/components/ui/alert-dialog';
export function QuintzeeView({replay=false,awaitingStart=false,onResultTimelineEnd,snapshot:v,actor,userId=actor,now,pending,error,onIntent,onReconnect,activeTab,setActiveTab,sessionEnded=false,panel,balance,navigation}:{replay?:boolean;awaitingStart?:boolean;onResultTimelineEnd?:(at:number)=>void;navigation?:ReactNode;activeTab?:ShellTabId;setActiveTab?:(tab:ShellTabId)=>void;sessionEnded?:boolean;panel?:ReactNode;balance?:(id:string)=>ReactNode;snapshot:QuintzeeSnapshot;actor:string;userId?:string;now:number;pending:boolean;error:string;onIntent:(i:QuintzeeIntent)=>void;onReconnect:()=>void}){
 const [localTab,setLocalTab]=useState<ShellTabId>('cards'),[held,setHeld]=useState<number[]>([]),[layer,setLayer]=useState<Element|null>(null),[abandon,setAbandon]=useState(false),root=useRef<HTMLDivElement>(null);
 const [zero,setZero]=useState<{category:number;revision:number;scope:string}|null>(null),confirming=useRef(false);
 const heldCurrent=useRef<number[]>([]);
 const tab=activeTab??localTab,setTab=setActiveTab??setLocalTab;
 const s=v.state,b=s.board,active=s.players[s.turnIndex],mine=active===actor,at=v.pausedAt??now,clock=quintzeeClock(b,at);
 const playerName=(id:string,index:number)=>v.playerNames?.[id]?.trim()||`Player ${index+1}`;
 const rumble=useQuintzeeRumble(v.scope,b.rollSerial,b.dice.length,b.held,(b.phase==='playing'||b.result?.reason==='no_matches')&&!s.finished&&v.pausedAt===null&&at<b.deadline);
 const ready=b.phase==='ready',v2=b.rules.version!=='quintzee/1',viewport=useRef<HTMLDivElement>(null);
 useQuintzeeRollAudio(rumble,!replay&&!sessionEnded&&!error&&tab==='cards',viewport);
 const baseMotion=useQuintzeeScorePresentation(v,at,replay?'':userId,!sessionEnded&&!error&&v.pausedAt===null&&tab==='cards',viewport);
 const result=b.phase==='stage_complete'&&b.result?{...b.result,id:v.scope+':result',elapsed:Math.max(0,b.rules.resultMs-(b.deadline-at)),displayScore:b.result.score}:null;
 const resultSequence=useMemo(()=>({namespace:'quintzee',clearMs:0,clearCueAt:celebrationCueAt,seekOnRecovery:false,timeline:(elapsed:number)=>triResultTimeline(Math.max(0,elapsed-baseMotion.finalDelay)),countWindow:()=>{const w=triCountWindow();return {start:w.start+baseMotion.finalDelay,end:w.end+baseMotion.finalDelay};}}),[baseMotion.finalDelay]);
 const motion=useTriRoundPresentation({replay,scope:v.scope,phase:b.phase,connected:!error,paused:v.pausedAt!==null,now:at,deadline:b.deadline,userId,active:!sessionEnded&&tab==='cards',modern:true,liveEntry:false,recoveryEpoch:0,result,resultSequence});
 useEffect(()=>{if(result)onResultTimelineEnd?.(at-result.elapsed+baseMotion.finalDelay+TRI_ROUND_TIMELINE.homeAt);},[result?.id,baseMotion.finalDelay,b.deadline,onResultTimelineEnd]);
 const canAct=!replay&&!sessionEnded&&!v.autoplay&&mine&&!pending&&!error&&!rumble&&!baseMotion.busy&&at>=(b.celebration?.endsAt??0)&&tab==='cards'&&(b.phase==='playing'||ready)&&!s.finished&&v.pausedAt===null&&at<b.deadline;
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 useLayoutEffect(()=>{heldCurrent.current=[...b.held];setHeld(heldCurrent.current);},[v.scope,b.rollSerial,b.dice.length]);
 useEffect(()=>{setZero(null);confirming.current=false;},[v.scope,v.revision]);
 const [submitted,setSubmitted]=useState<{scope:string;revision:number;intent:QuintzeeIntent}|null>(null);
 const waiting=pending&&submitted?.scope===v.scope&&submitted.revision===v.revision?submitted.intent:null;
 const submit=(intent:QuintzeeIntent)=>{
  setSubmitted({scope:v.scope,revision:v.revision,intent});
  onIntent(intent);
 };
 const choose=(category:number)=>{if(!canAct||ready||b.dice.length!==5)return;const name=QUINTZEE_CATEGORIES[category];if(b.scores[name]!==undefined)return;const isZero=quintzeeBasePreview(name,b.dice)===0;if(v2&&isZero&&quintzeeNeedsZeroConfirmation(b,name))setZero({category,revision:v.revision,scope:v.scope});else submit({type:v2&&isZero?'score_zero':'score',items:[category]});};
 const confirmZero=()=>{if(!zero||confirming.current||!canAct||zero.revision!==v.revision||zero.scope!==v.scope)return;confirming.current=true;setZero(null);submit({type:'score_zero',items:[zero.category]});};
 const rollNumber=b.dice.length===5?3-b.rollsRemaining:0;
 const seconds=Math.ceil(clock.remaining/1000);
 const toggleHold=(index:number)=>{
  if(!canAct||ready||b.rollsRemaining===0)return;
  const next=!heldCurrent.current.includes(index);
  heldCurrent.current=next?[...heldCurrent.current,index]:heldCurrent.current.filter(i=>i!==index);
  setHeld(heldCurrent.current);
  presentQuintzeeHold(userId,v.scope,next,viewport.current);
 };
 const status=v.status==='expired'?'Start time expired':s.finished?'Match complete':v.pausedAt!==null?'Paused':b.phase==='intro'?'Get Ready':b.phase==='stage_complete'?quintzeeRoundLabel(b.result?.reason):'';
 return <FullscreenGameShell gameplay={!replay} className={`quintzee-shell quintzee-${v.theme}`} title="QUINTZEE" description={s.round===3?'Bonus round':`Round ${s.round} of 2`} activeTab={tab} setActiveTab={setTab} sessionEnded={sessionEnded} announcement={s.players.length===1?false:undefined} sessionLabel={<QuintzeeRulesIcon/>}
  endControl={!navigation&&s.players.length===1&&v.status==='active'&&<ArcadeAbandonButton disabled={pending} onClick={()=>setAbandon(true)}/>}
 navigation={navigation??(s.players.length===1?<nav aria-label="Quintzee controls"><button onClick={()=>setTab('lobby')}><QuintzeeRulesIcon/></button></nav>:undefined)}
  panel={panel??<div><p>Five dice. Hold any dice and reroll up to twice. {v2?'Choose any open category; confirm zero only when another open category can score.':'Choose a matching category.'} No jokers.</p><p>Upper subtotal 63 earns +35. All twelve categories earn +{b.rules.clearBonus}. Multiply the whole card by ×100–×300 according to time remaining.</p><p>Two rounds. A total of 80,000 earns one bonus round. Its score adds to your final total.</p><p>Each round allows {b.rules.durationMs/1000} seconds{v2?' after Start. You have 30 seconds to start each round.':'.'} The clock continues through rolls{b.rules.version==='quintzee/3'?', except the fixed upper-bonus celebration pause.':' and animations.'}</p></div>}>
 <div ref={root}>{layer&&createPortal(<div className="quintzee-plane" ref={viewport} data-theme={v.theme} data-quintzee="">
  <div className="q-players" aria-label="Cumulative player scores">{s.players.map((p,i)=><TriScorePill key={p} root={viewport} item={{id:p,name:s.players.length===1?'TOTAL SCORE':playerName(p,i),score:s.scores[p],active:p===active,balance:balance?.(p)}} value={p===active&&result?(motion.displayScore??s.scores[p]):s.scores[p]} fraction={p===active&&!sessionEnded?motion.fraction:0}/>)}</div>
  {!sessionEnded&&<><div className="q-timing">{ready?<p className="q-start-deadline" role="timer" aria-label="Start deadline">{awaitingStart?'Start when ready':`Start within ${Math.max(0,Math.ceil((b.deadline-at)/1000))}s`}</p>:<><div className="q-base"><span>BASE SCORE</span><strong data-base-score>{baseMotion.base.toLocaleString()}</strong></div><div className="q-time"><div role="progressbar" aria-label="Time remaining" aria-valuetext={seconds+' seconds remaining'} aria-valuenow={seconds} aria-valuemin={0} aria-valuemax={b.rules.durationMs/1000}><i style={{width:`${100*clock.remaining/b.rules.durationMs}%`}}/></div></div></>}</div>
  <div className="q-scorecard">{[QUINTZEE_CATEGORIES.slice(0,6),QUINTZEE_CATEGORIES.slice(6)].map((column,j)=><section key={j} aria-label={j?'Combinations':'Numbers'}>{column.map((c,row)=>{const banked=b.scores[c],saving=waiting?.type.startsWith('score')&&waiting.items[0]===QUINTZEE_CATEGORIES.indexOf(c);return <div key={c} data-category={c} className="q-category" data-banked={banked!==undefined} data-selector={row%2?'right':'left'}><span>{QUINTZEE_LABELS[c]}</span>{banked===undefined?<button className="q-selector" type="button" disabled={!canAct||ready||b.dice.length!==5||(!v2&&b.potentials[c]===undefined)} onClick={()=>choose(QUINTZEE_CATEGORIES.indexOf(c))} aria-label={QUINTZEE_LABELS[c]+': unfilled'} aria-busy={saving||undefined}><span aria-hidden="true">{saving?'…':'+'}</span></button>:<strong aria-label={QUINTZEE_LABELS[c]+': '+banked+' recorded'}>{banked}</strong>}</div>;})}</section>)}</div>
  <QuintzeeBonuses rules={b.rules} scores={b.scores} showOutcomes={mine||replay||!!result} result={result?b.result:null}/>
  <div className="q-play-area">
   {v.autoplay&&<label className="q-autoplay"><input type="checkbox" checked disabled={pending||!!error} onChange={()=>onIntent({type:'reclaim',items:[]})}/>Auto-play</label>}
   <div className="q-roll-guide"><strong>{rollNumber?`Roll ${rollNumber} of 3`:ready?'Ready to start':''}</strong>{mine&&!ready&&!v.autoplay&&<span>{b.rollsRemaining===0?'Choose a category':''}</span>}</div>
   <div className="q-dice" aria-label="Dice - tap to hold or release">{b.dice.length===5&&b.dice.map((value,i)=>{const rolling=!!rumble&&!rumble.held.includes(i);return <button key={v.scope+':'+i} disabled={!canAct||ready||b.rollsRemaining===0} data-held={held.includes(i)} data-rolling={rolling} onClick={()=>toggleHold(i)} aria-label={'Die '+(i+1)+': '+(rolling?'rolling':value)+', '+(held.includes(i)?'held; tap to release':'not held; tap to hold')} aria-pressed={held.includes(i)}><QuintzeeDie value={value} rolling={rolling}/><small>{held.includes(i)?'HELD':'HOLD'}</small></button>;})}</div>
   {replay?<div className="q-opponent-turn" role="status">Saved round result</div>:mine?<button className="q-roll" disabled={!canAct||b.rollsRemaining===0} onClick={()=>submit({type:ready?'start':'roll',items:ready||b.dice.length===0?[]:held})}>{waiting?.type==='start'?'Starting…':waiting?.type==='roll'?'Rolling…':rumble?'ROLLING…':ready?'Start':b.phase==='intro'?'GET READY':b.rollsRemaining===0?'CHOOSE A CATEGORY':b.dice.length===0?'Roll (3 remaining)':'REROLL DICE'}{b.phase==='playing'&&b.dice.length===5&&<small>{b.rollsRemaining} {b.rollsRemaining===1?'reroll':'rerolls'} left</small>}</button>:<div className="q-opponent-turn" role="status">{playerName(active,s.turnIndex)}’s turn</div>}
   {result?.reason==='timeout'&&motion.admitted&&motion.elapsed<1200&&!baseMotion.banner&&<div className="q-celebration" role="status">Time’s up</div>}
   {!rumble&&!baseMotion.busy&&(!motion.admitted||motion.elapsed>=baseMotion.finalDelay+4300)&&(b.phase==='intro'||b.phase==='stage_complete'||s.finished)&&<div className="q-result" role="status"><strong>{status}</strong>{v.status==='expired'?<span>Run unranked</span>:b.phase==='intro'?<span>{Math.max(1,Math.ceil((b.deadline-at)/1000))}</span>:<span>{b.result?.rawSubtotal} × {b.result?.multiplier} = <b>{b.result?.stageScore.toLocaleString()}</b></span>}{s.finished&&v.status==='completed'&&<small>Final totals above · {s.qualified.length?'Bonus round included':'Two rounds complete'}</small>}</div>}
  </div>
  {(error||status)&&<p className="q-status" role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:status}</p>}</>}
  {!sessionEnded&&baseMotion.banner&&<div className="q-celebration-backdrop" data-quintzee-celebration-backdrop><div className="q-celebration" role="status" data-quintzee-celebration>{baseMotion.banner}</div></div>}
 </div>,layer)}</div>
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>onIntent({type:'abandon',items:[]})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <AlertDialog open={zero!==null} onOpenChange={open=>{if(!open)setZero(null);}}><AlertDialogContent><AlertDialogTitle>Confirm 0</AlertDialogTitle><AlertDialogDescription>Record zero for {zero===null?'this category':QUINTZEE_LABELS[QUINTZEE_CATEGORIES[zero.category]]}?</AlertDialogDescription><AlertDialogFooter className="q-confirm-controls"><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!canAct||pending} onClick={confirmZero}>Confirm 0</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>;
}
