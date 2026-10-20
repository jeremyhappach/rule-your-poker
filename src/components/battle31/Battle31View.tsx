import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {PlayingCard} from '@/components/PlayingCard';
import type {Card} from '@/lib/cardUtils';
import {Battle31Rules} from '@/components/rules/Battle31Rules';
import type {Battle31Intent,Battle31Snapshot} from '@/lib/battle31/model';
import {platformAudio} from '@/lib/audio/platformAudio';
import {battle31Cue} from '@/lib/battle31/audio';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';
import './battle31.css';
export {Battle31Rules};
function cardFace(id:number|null):Card|undefined {if(id===null)return undefined;return {rank:['7','8','9','10','J','Q','K','A'][id%8],suit:['clubs','diamonds','hearts','spades'][Math.floor(id/8)]} as Card;}
export function Battle31Loading({error,onReconnect,activeTab='cards',setActiveTab=()=>{}}:{error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(t:ShellTabId)=>void}){return <FullscreenGameShell className="battle-scene" ready={false} title="Battle 31" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={<Battle31Rules/>}><div role="status">{error||'Loading Battle 31…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div></FullscreenGameShell>;}
interface Props {view:Battle31Snapshot;userId:string;now:number;pending:boolean;connected?:boolean;error:string;epoch:number;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;sessionEnded:boolean;panel:ReactNode;balance:(p:Battle31Snapshot['players'][number])=>ReactNode;onIntent:(i:Battle31Intent)=>void|Promise<void>;onReconnect:()=>void;liveEntry?:boolean;terminalPresenting?:boolean}
export function Battle31View({view:v,userId,now,pending,connected=true,error,epoch,activeTab,setActiveTab,sessionEnded,panel,balance,onIntent,onReconnect}:Props){
 const b=v.board,root=useRef<HTMLDivElement>(null),[layer,setLayer]=useState<Element|null>(null),[selection,setSelection]=useState<{revision:number;own:number|null;center:number|null}|null>(null),[resign,setResign]=useState(false);
 useLayoutEffect(()=>{setLayer(root.current?.closest('[data-fullscreen-board-slot]')?.querySelector('[data-canonical-felt-interaction-layer]')??null);},[]);
 const selected=selection?.revision===v.revision?selection:null;
 const me=v.players.findIndex(p=>p.id===v.viewerId),bottom=me<0?0:me,top=1-bottom,at=v.paused?(v.pausedAt??v.serverAt):now;
 const active=v.canAct&&connected&&!pending&&!v.paused&&!error&&b.phase==='playing'&&at<b.deadline&&activeTab==='cards'&&!sessionEnded;
 const prior=useRef({scope:v.scope,revision:v.revision,epoch});
 useEffect(()=>{const p=prior.current;prior.current={scope:v.scope,revision:v.revision,epoch};if(p.scope!==v.scope||p.epoch!==epoch||p.revision>=v.revision||!connected||v.paused||activeTab!=='cards'||document.hidden)return;return platformAudio.request({userId,id:`battle31:${v.scope}:${v.revision}`,expiresAt:performance.now()+400,cue:battle31Cue(b.event.label)});},[v.scope,v.revision,epoch,connected,v.paused,activeTab,userId,b.event.label]);
 const send=(intent:Battle31Intent)=>{setSelection(null);void onIntent(intent);};
 const card=(id:number|null,index:number,zone:'own'|'center'|'other')=><button key={`${v.scope}:${zone}:${id??index}`} className="battle-card" data-selected={selected?.[zone==='center'?'center':'own']===id&&id!==null&&zone!=='other'} disabled={!active||zone==='other'||id===null} aria-label={id===null?'Hidden card':`${zone==='center'?'Center':'Hand'} ${cardFace(id)?.rank} of ${cardFace(id)?.suit}`} onClick={()=>{if(!active||id===null)return;setSelection(s=>({revision:v.revision,own:s?.revision===v.revision?s.own:null,center:s?.revision===v.revision?s.center:null,[zone]:id}));}}><PlayingCard card={cardFace(id)} isHidden={id===null} size="lg" frontStyle="canonical" className="battle-card-face"/></button>;
 const seat=(i:number,zone:'own'|'other')=><section className={`battle-seat battle-${zone}`} data-seat-position={v.players[i].seat} data-player-id={v.players[i].id}><header><strong>{v.players[i].name}{v.players[i].active&&b.phase==='playing'?' · Turn':''}</strong><span aria-label={`${v.players[i].losses} losses`}>{v.players[i].losses>=4?'Eliminated':v.players[i].losses===3?'Last chance':'●'.repeat(3-v.players[i].losses)}</span>{balance(v.players[i])}</header><div className="battle-hand">{b.hands[i].map((id,j)=>card(id,j,zone))}</div><output>{b.values[i]===null?'Hidden hand':`Hand ${b.values[i]}`}</output></section>;
 const title=v.terminal?.outcome==='aborted'?'Match aborted':v.terminal?.winnerIds.length===1?`${v.players.find(p=>p.id===v.terminal?.winnerIds[0])?.name} wins`:'Match drawn';
 return <FullscreenGameShell className="battle-scene" title="Battle 31" description={`Round ${v.round}/12 · Match stake ${v.stake}`} activeTab={activeTab} setActiveTab={setActiveTab} sessionEnded={sessionEnded} panel={panel}>
 <div ref={root}>{layer&&createPortal(<div className="battle-plane" data-battle31="">
 {sessionEnded?<div className="battle-ended"><h2>{title}</h2><p>Session Ended</p></div>:<>
 {seat(top,'other')}
 <section className="battle-center"><p>{b.phase==='intro'?'Dealing':b.phase==='round_result'?'Round complete':b.phase==='complete'?title:b.closing?'Final response':b.turn>=7?'Last turn each':`Decision ${b.turn}/8`}</p><div className="battle-hand">{b.center.map((id,i)=>card(id,i,'center'))}</div></section>
 {seat(bottom,'own')}
 <footer className="battle-controls"><div className="battle-clock" role="timer">{v.paused?'Paused':b.phase==='playing'?`${Math.max(0,Math.ceil((b.deadline-at)/1000))}s`:b.phase==='intro'?'Ready':b.event.label}</div>
 <div className="battle-buttons"><button disabled={!active||selected?.own==null||selected.center==null} onClick={()=>{if(selected?.own!=null&&selected.center!=null)send({type:'swap',items:[selected.own,selected.center]});}}>Swap selected</button><button disabled={!active} onClick={()=>send({type:'take_pot'})}>TAKE POT<small>Swap all three</small></button><button disabled={!active} onClick={()=>send({type:'pass'})}>{b.closing||b.turn>=7?'STAND':'PASS'}<small>{b.closing||b.turn>=7?'Keep this hand':'Opponent’s last turn'}</small></button></div>
 <p role="status">{error?<>{error} <button onClick={onReconnect}>Reconnect</button></>:pending?'Confirming…':!connected?'Reconnecting…':b.event.label}</p>
 {!v.settled&&<button className="battle-resign" disabled={!connected||pending||v.paused} onClick={()=>setResign(true)}>Resign match</button>}
 </footer></>}
 </div>,layer)}</div>
 <AlertDialog open={resign} onOpenChange={setResign}><AlertDialogContent><AlertDialogTitle>Resign this match?</AlertDialogTitle><AlertDialogDescription>You will lose the match and its {v.stake}-chip stake. The game clock continues.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel><AlertDialogAction disabled={pending||v.settled} onClick={()=>send({type:'resign'})}>Resign match</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>;
}
