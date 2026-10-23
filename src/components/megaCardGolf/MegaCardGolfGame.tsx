import {useEffect,useState} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {PlayingCard} from '@/components/PlayingCard';
import type {Rank,Suit} from '@/lib/cardUtils';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {COURSE_IDS,INITIAL_COURSES,type CourseConfig} from '@/lib/megaCardGolf/config';
import type {Intent,MegaView} from '@/lib/megaCardGolf/engine';
import {formatGolfScore,type MegaFrame} from '@/lib/megaCardGolf/presentation';
import {CourseCardBack} from './CourseCardBack';
const ranks:Rank[]=['A','2','3','4','5','6','7','8','9','10','J','Q','K'],suits:Suit[]=['♠','♥','♦','♣'];
export function MegaCard({card,label,onClick,disabled,selected=false,highlight=false,course=INITIAL_COURSES[0],stage}:{card:number|null;label:string;onClick?:()=>void;disabled?:boolean;selected?:boolean;highlight?:boolean;course?:CourseConfig;stage?:string}){
 const face=card!==null&&Number.isInteger(card)&&card>=0&&card<52?{rank:ranks[card%13],suit:suits[Math.floor(card/13)]}:null;
 return <button className="mega-card" data-replacement-stage={stage} data-scored={highlight||undefined} aria-pressed={selected} aria-label={label+(face?' · '+face.rank+' '+face.suit:' · concealed')} onClick={onClick} disabled={disabled}>
  <span key={(face?card:'back')+'/'+(stage??'')} className="mega-card-inner">{face?<PlayingCard card={face} frontStyle="megatouch" tier="large" className="mega-canonical-face" highlight={highlight?'gold':null}/>:<CourseCardBack course={course}/>}</span>
 </button>;
}
export function MegaCardGolfGame({view,onIntent,onExit,busy,now,presentation,canAbandon=true}:{view:MegaView;onIntent:(intent:Intent)=>void;onExit:()=>void;busy:boolean;now:number;presentation?:MegaFrame;canAbandon?:boolean}){
 const [tab,setTab]=useState<ShellTabId>('cards'),[opening,setOpening]=useState<number[]>([]),[tapIn,setTapIn]=useState<{index:number;revision:number}|null>(null),[abandon,setAbandon]=useState(false);
 const result=view.phase==='scoring'?view.results.find(r=>r.hole===view.hole):null;
 const scoring=presentation?.scoring??(result?{tally:result.score,finished:true,indices:[],points:null,revealing:false}:null);
 const playable=view.status==='active'&&view.phase==='playing'&&now<view.deadline;
 const available=!busy&&!presentation?.locked;
 const canConfirm=!!tapIn&&available&&playable&&view.pending!==null&&tapIn.revision===view.revision;
 const total=scoring&&!scoring.finished?view.score-(result?.score??0):view.score;
 useEffect(()=>{setTab('cards');setAbandon(false);},[view.id]);
 useEffect(()=>{setOpening([]);setTapIn(null);},[view.id,view.hole,view.phase,view.revision]);
 const choose=(index:number)=>{
  if(!available)return;
  if(view.phase==='opening')setOpening(old=>old.includes(index)?old.filter(x=>x!==index):old.length<view.config.initialExposed?[...old,index]:old);
  else if(playable&&view.pending!==null){
   if(view.cards[index]===null&&view.exposed.filter(x=>!x).length===1)setTapIn({index,revision:view.revision});
   else onIntent({type:'replace',index});
  }
 };
 return <div className="mega-game-host" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className={'mega-scene theme-'+COURSE_IDS.indexOf(view.config.id)} title="Mega Card Golf" description="" activeTab={tab} setActiveTab={setTab} announcement={false} panelTitle="How to play" panelDescription="The completion failsafe continues while rules are open."
  panel={<div className="mega-rules"><h2>Make pairs. Go low.</h2><p>Tap the stock, then replace any of your six cards. Matching ranks in a vertical column cancel to zero.</p><p>A = 1 · 2 = −2 · 3–10 = face value · J/Q = 10 · K = 0.</p><p>You can immediately discard {view.config.discardAllowance} drawn cards per hole. Exposed cards can be replaced again.</p><p>All cards exposed, the final draw resolved, or {view.config.completionSeconds/60} minutes elapsed ends a hole. Remaining cards reveal and score normally. There is no speed bonus.</p></div>}
  navigation={<nav><button onClick={()=>setTab('lobby')}>Rules</button><button disabled={!available||!canAbandon||view.status!=='active'} onClick={()=>setAbandon(true)}>Abandon</button></nav>}>
  <div className="mega-game-plane" data-canonical-felt-interaction-layer>
   <div className="mega-score-strip"><svg className="mega-hole-flag" role="img" aria-label={'Hole '+view.hole+' of '+view.config.holes} viewBox="0 0 80 76"><path d="M14 70V7M4 70h36" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M16 8h58L62 26l12 18H16z" fill="#f8db82"/><text x="43" y="34" textAnchor="middle" fill="#153b32" fontSize="25" fontWeight="800">{view.hole}</text></svg>
    <div className="mega-hole-tally" aria-label="Running hole score" aria-live="polite"><small>{scoring?'HOLE SCORE':''}</small><strong>{scoring?formatGolfScore(scoring.tally):''}</strong></div><div/>
   </div>
   <div className="mega-play-area"><div className="mega-hand-area">
    <p className="mega-turn-text" role="status">{presentation?.replacement?'Replaced card':scoring?scoring.revealing?'Revealing your hand…':scoring.finished?'Hole '+view.hole+' complete':scoring.indices.length===2?'Pair cancels · E':formatGolfScore(scoring.points):view.phase==='opening'?'Choose '+view.config.initialExposed+' opening cards':view.pending===null?'Tap the stock to draw':'Choose any card to replace'}</p>
    <div className="mega-tableau">{view.cards.map((card,i)=><MegaCard key={view.id+'/'+view.hole+'/'+i} course={view.config} card={card} label={'Card '+(i+1)} onClick={()=>choose(i)} disabled={!available||now>=view.deadline||(view.phase!=='opening'&&(!playable||view.pending===null))} selected={opening.includes(i)} highlight={scoring?.indices.includes(i)} stage={presentation?.replacement?.index===i?presentation.replacement.stage:undefined}/>)}</div>
   </div>
   <aside className="mega-draw-area"><div className="mega-counters"><div><strong>{view.stockRemaining}</strong><span>stock draws left</span></div><div><strong>{view.discardsRemaining}</strong><span>discards left</span></div></div>
    <div className="mega-draw-card"><MegaCard course={view.config} card={view.pending} label={view.pending===null?'Draw stock':'Drawn card'} onClick={()=>onIntent({type:'draw'})} disabled={!available||!playable||view.pending!==null}/></div>
    {view.phase==='opening'&&<button className="mega-start" disabled={!available||now>=view.deadline||opening.length!==view.config.initialExposed} onClick={()=>onIntent({type:'open',indices:opening})}>Reveal selected</button>}
    {view.pending!==null&&<button className="mega-secondary" disabled={!available||!playable||view.discardsRemaining===0} onClick={()=>onIntent({type:'discard'})}>Discard</button>}
   </aside></div>
   <div className="mega-scorecard" aria-label="Hole scorecard">{Array.from({length:view.config.holes},(_,i)=><div key={i} data-current={i+1===view.hole||undefined}><small>{i+1}</small><b>{formatGolfScore(view.results[i]&&(i+1<view.hole||scoring?.finished)?view.results[i].score:null)}</b></div>)}<div className="mega-course-total"><small>Total</small><b>{formatGolfScore(total)}</b></div></div>
  </div>
  <AlertDialog open={!!tapIn&&canConfirm} onOpenChange={open=>{if(!open)setTapIn(null);}}><AlertDialogContent><AlertDialogTitle>Tap In?</AlertDialogTitle><AlertDialogDescription>This replacement exposes your last concealed card and ends the hole.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={!canConfirm} onClick={()=>{if(canConfirm&&tapIn){onIntent({type:'replace',index:tapIn.index});setTapIn(null);}}}>Tap In?</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  <AlertDialog open={abandon&&view.status==='active'} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. Clocks continue while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={!available||!canAbandon} onClick={()=>{onExit();setAbandon(false);}}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell></div>;
}
