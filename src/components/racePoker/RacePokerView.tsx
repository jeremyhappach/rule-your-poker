import {RacePokerRules} from '@/components/rules/RacePokerRules';
export {RacePokerRules} from '@/components/rules/RacePokerRules';
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {racePokerPlayWindow,type RacePokerIntent,type RacePokerSnapshot} from '@/lib/racePoker/model';
import {useRacePokerAudio} from '@/hooks/useRacePokerAudio';
import './racePoker.css';
const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const,suits=['♣','♦','♥','♠'] as const;
export const raceCardName=(id:number)=>`${ranks[id%13]}${suits[Math.floor(id/13)]}`;
function Card({id}:{id:number|undefined}){
 const root=useRef<HTMLSpanElement>(null),[width,setWidth]=useState(24);
 useLayoutEffect(()=>{const o=new ResizeObserver(([e])=>setWidth(Math.min(e.contentRect.width,e.contentRect.height/1.5)));if(root.current)o.observe(root.current);return()=>o.disconnect();},[]);
 const valid=id!==undefined&&Number.isInteger(id)&&id>=0&&id<52;
 return <span className="race-card" ref={root}>{valid&&<PlayingCard frontStyle="cartoon" cartoonLayout="royal" card={{rank:ranks[id%13],suit:suits[Math.floor(id/13)]}} faceFillPx={width} size="sm" style={{width,height:width*1.5}}/>}</span>;
}
function Horse({index,moving}:{index:number;moving:boolean}){
 return <svg className="race-horse" data-moving={moving} viewBox="0 0 160 105" aria-hidden="true">
  <ellipse cx="73" cy="95" rx="53" ry="5" fill="#164b24" opacity=".3"/>
  <g fill={index===0?'#ad532c':'#d9943f'} stroke="#512e26" strokeWidth="3" strokeLinejoin="round">
   <path className="race-leg-a" d="M52 60 41 80 26 88 32 94 53 82 66 61"/><path className="race-leg-b" d="M90 59 103 76 124 82 126 89 101 85 78 65"/>
   <path d="M35 45Q17 34 8 53Q22 46 35 56" fill="#38271f"/>
   <path d="M34 48Q56 35 91 45L108 23 115 8 121 20 137 28 147 40 140 48 122 44 111 67Q87 78 48 67Q31 62 34 48Z"/>
   <path d="m107 24-7 17 10-3 8-17" fill="#38271f"/>
  </g>
  <path d="M63 42 87 43 88 62 62 61Z" fill={index===0?'#38bdf8':'#fb7185'} stroke="#fff4c8" strokeWidth="3"/>
  <text x="75" y="57" textAnchor="middle" fill="#172554" fontSize="15" fontWeight="900">{index+1}</text>
  <path d="m70 39 10-15 20 4 12 13-6 4-14-11-7 10 9 12-10 5-13-15Z" fill={index===0?'#0284c7':'#e11d48'} stroke="#fff0c7" strokeWidth="2"/>
  <circle cx="90" cy="17" r="8" fill="#ffd4a3"/><path d="M81 16q1-13 15-5l4 7Z" fill={index===0?'#facc15':'#a3e635'}/>
  <circle cx="134" cy="32" r="2.3" fill="#161616"/><path d="m119 31 17 13-28-4" fill="none" stroke="#f8e6bc" strokeWidth="2"/>
 </svg>;
}
const resultSequence={namespace:'race-poker',clearMs:0,clearCueAt:()=>null,seekOnRecovery:true,
 timeline:(elapsed:number)=>({center:0,progress:Math.max(0,Math.min(1,elapsed/1000)),crest:0}),
 countWindow:()=>({start:0,end:1000})};
interface Props {view:RacePokerSnapshot;userId:string;now:number;pending:boolean;connected:boolean;error:string;epoch:number;liveEntry?:boolean;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;sessionEnded:boolean;terminalPresenting?:boolean;panel:ReactNode;balance:(p:RacePokerSnapshot['players'][number])=>ReactNode;onIntent:(i:RacePokerIntent)=>void|Promise<void>;onReconnect:()=>void}
export function RacePokerView({view:v,userId,now,pending,connected,error,epoch,liveEntry=false,activeTab,setActiveTab,sessionEnded,panel,balance,onIntent,onReconnect}:Props){
 const b=v.board,at=v.paused?(v.pausedAt??v.serverAt):now,window=racePokerPlayWindow(b,at),seconds=Math.ceil(window.remaining/1000);
 const result=b.phase==='stage_complete'&&b.result?{...b.result,displayScore:b.result.score,elapsed:Math.max(0,2000-(b.deadline-at))}:null;
 const presentation=useTriRoundPresentation({scope:v.scope,phase:b.phase,connected:connected&&!error,paused:v.paused,result,now:at,deadline:b.deadline,userId,active:activeTab==='cards'&&!sessionEnded,modern:true,liveEntry,recoveryEpoch:epoch,resultSequence});
 const root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),flight=useRef(false),[submitting,setSubmitting]=useState(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 const motion=useRef({scope:v.scope,revision:v.revision,epoch,count:b.hand.length});
 const [animatedCard,setAnimatedCard]=useState(-1);
 useLayoutEffect(()=>{
  const p=motion.current;motion.current={scope:v.scope,revision:v.revision,epoch,count:b.hand.length};
  const accepted=p.scope===v.scope&&p.epoch===epoch&&p.revision<v.revision&&b.hand.length===p.count+1&&connected&&!error;
  setAnimatedCard(accepted?b.hand.length-1:-1);
  if(accepted){const timer=setTimeout(()=>setAnimatedCard(-1),180);return()=>clearTimeout(timer);}
 },[v.scope,v.revision,epoch,b.hand.length,connected,error]);
 useRacePokerAudio(v,userId,epoch,seconds,connected,error,activeTab,sessionEnded,presentation.reduced);
 const canAct=v.canAct&&connected&&!error&&!v.paused&&window.playable&&!pending&&!submitting&&activeTab==='cards'&&!sessionEnded;
 const choose=(slot:number)=>{if(!canAct||flight.current)return;flight.current=true;setSubmitting(true);void Promise.resolve(onIntent({type:'choose',items:[slot]})).finally(()=>{flight.current=false;setSubmitting(false);});};
 const active=v.players.find(p=>p.active),winners=v.players.filter(p=>v.terminal?.winnerIds.includes(p.id));
 return <FullscreenGameShell className="race-scene" title="Race Poker" description={`Round ${v.round} / 16`} activeTab={activeTab} setActiveTab={setActiveTab} sessionEnded={sessionEnded} panel={panel}>
  <div ref={root}>{layer&&createPortal(<div className="race-plane">
   <div className="race-scoreband">{v.players.map((p,i)=><div className="race-score" data-active={p.active&&!sessionEnded} key={p.id}><span title={p.name}><i data-horse={i}/>{p.name}</span><strong>{(p.active&&result?(presentation.displayScore??p.score):p.score).toLocaleString()}</strong>{balance(p)}</div>)}</div>
   <div className="race-track" aria-label="Race to 48,000 points">
    <div className="race-finish" aria-hidden="true"/><span className="race-target">48,000</span>
    {v.players.map((p,i)=>{const score=p.active&&result?(presentation.displayScore??p.score):p.score;return <div className="race-lane" key={p.id}><div className="race-runner" style={{left:`${Math.min(1,score/48000)*83}%`}}><Horse index={i} moving={!!result&&p.active&&result.elapsed<1000&&!presentation.reduced}/></div></div>;})}
   </div>
   {sessionEnded||b.phase==='complete'?<div className="race-result" role="status"><strong>{winners.map(p=>p.name).join(' & ')} {winners.length===1?'wins':'draw'}</strong><span>Final scores · {v.players.map(p=>p.score.toLocaleString()).join(' — ')}</span></div>:<>
    <div className="race-clock" data-zone={seconds<=2?'red':seconds<=5?'amber':'green'} role="timer" aria-label={`${v.paused?'Paused, ':''}${seconds} seconds remaining`}>
     <div>{Array.from({length:30},(_,i)=><i key={i} data-lit={b.phase==='playing'&&i<seconds}/>)}</div><b>{v.paused?'PAUSED':b.phase==='stage_complete'?'RESULT':`${seconds}s`}</b>
    </div>
    <div className="race-message" role="status">{result?<><strong>{result.label}</strong>{result.points>0&&<span>+{result.points.toLocaleString()}</span>}</>:<><strong>{b.finalHand?'Final hand':v.canAct?'Your turn':`${active?.name??'Opponent'}’s turn`}</strong><span>Choose five cards</span></>}</div>
    <div className="race-choices" aria-label="Three card choices">{[0,1,2].map(i=><button key={i} disabled={!canAct} onClick={()=>choose(i)} aria-label={b.choices[i]===undefined?'No choice':`Choose ${raceCardName(b.choices[i])} from slot ${i+1}`}><Card id={b.choices[i]}/></button>)}</div>
    <div className="race-hand" aria-label="Your five-card hand">{[0,1,2,3,4].map(i=><div key={`${v.scope}:${i}:${b.hand[i]??'empty'}`} data-filled={b.hand[i]!==undefined} data-animate={animatedCard===i}><Card id={b.hand[i]}/></div>)}</div>
   </>}
   <div className="race-connection" role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:!connected?'Connecting live updates…':pending||submitting?'Selecting…':''}</div>
  </div>,layer)}</div>
 </FullscreenGameShell>;
}
export function RacePokerLoading({error,onReconnect,activeTab,setActiveTab}:{error:string;onReconnect:()=>void;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void}){
 return <FullscreenGameShell className="race-scene" ready={false} title="Race Poker" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={<RacePokerRules/>}><div role="status">{error||'Loading Race Poker…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;
}
