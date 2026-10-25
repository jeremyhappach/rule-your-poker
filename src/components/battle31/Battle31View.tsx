import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {TableauCard} from '@/lib/canonicalShell/TableauCard';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {usePublishShellFelt} from '@/lib/canonicalShell/ShellOwnedFeltHost';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {GameplayOpponentSeatLayer} from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import {CanonicalPlayerIdentityRow} from '@/lib/canonicalShell/CanonicalPlayerIdentityRow';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {CanonicalLifeMarkers} from '@/components/canonicalShell/CanonicalLifeMarkers';
import {CanonicalDealerTransition} from '@/components/canonicalShell/CanonicalDealerTransition';
import {DealerIndicator} from '@/components/canonicalShell/DealerIndicator';
import {Battle31Rules} from '@/components/rules/Battle31Rules';
import {battleCard,battleFrame,battleProgress,battleResultText} from '@/lib/battle31/presentation';
import type {Battle31Intent,Battle31Snapshot} from '@/lib/battle31/model';
import {useBattle31Movement} from './useBattle31Movement';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';
import './battle31.css';
export {Battle31Rules};
const spacer=(top:boolean)=><div aria-hidden style={{flex:`0 0 var(--play-${top?'top':'bottom'}-safe-area, 0px)`,pointerEvents:'none'}}/>;
export function Battle31Loading({error,onReconnect,activeTab='cards',setActiveTab=()=>{}}:{error:string;onReconnect:()=>void;activeTab?:ShellTabId;setActiveTab?:(t:ShellTabId)=>void}){
 usePublishShellFelt({gameKind:'battle-31',anteAmount:0,publisherLabel:'Battle31Table'});useShellTabBar({cardsIcon:'spade',activeTab,setActiveTab});
 return <>{spacer(true)}<div style={{flex:'0 0 var(--shell-felt-h)'}}/>{spacer(false)}<ShellHudGrid pane={<div role="status">{error||'Connecting to Battle 31…'}{error&&<button onClick={onReconnect}>Reconnect</button>}</div>}/></>;
}
interface Props {view:Battle31Snapshot;userId:string;now:number;pending:boolean;connected?:boolean;error:string;epoch:number;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;sessionEnded:boolean;panel:ReactNode;balance:(p:Battle31Snapshot['players'][number])=>ReactNode;onIntent:(i:Battle31Intent)=>void|Promise<void>;onReconnect:()=>void;liveEntry?:boolean;terminalPresenting?:boolean;onRevealReady?:(scope:string|null)=>void}
export function Battle31View({view:v,userId,now,pending,connected=true,error,epoch,activeTab,setActiveTab,sessionEnded,panel,onIntent,onReconnect,liveEntry=false,onRevealReady}:Props){
 const b=v.board,frame=battleFrame(v,now),layer=useCanonicalFeltInteractionLayerElement(!sessionEnded),movement=useBattle31Movement(sessionEnded?null:v,epoch,userId,liveEntry);
 const [selection,setSelection]=useState<{scope:string;revision:number;own:number|null;center:number|null}|null>(null),[resign,setResign]=useState(false);
 const observed=useRef({scope:v.scope,epoch,live:!frame.result});if(observed.current.scope!==v.scope||observed.current.epoch!==epoch)observed.current={scope:v.scope,epoch,live:!frame.result};
 const animate=observed.current.live&&!document.hidden&&!v.paused;
 const me=v.players.findIndex(p=>p.id===v.viewerId),self=v.players[me],actor=v.players.find(p=>p.active),opponent=1-Math.max(0,me);
 const selected=selection?.scope===v.scope&&selection.revision===v.revision?selection:null;
 const active=v.canAct&&connected&&!pending&&!v.paused&&!error&&b.phase==='playing'&&frame.at<b.deadline&&activeTab==='cards'&&!sessionEnded;
 const reveal=frame.reveal&&!movement.busy,clear=frame.clear&&!movement.busy;
 useEffect(()=>onRevealReady?.(reveal?v.scope:null),[reveal,v.scope,onRevealReady]);
 const dealer=clear?1-frame.dealer:frame.dealer;
 const lives=(i:number)=>({losses:frame.result&&!frame.life?(b.result?.previousLosses?.[i]??b.losses[i]):b.losses[i],previous:b.result?.previousLosses?.[i],dissolve:animate&&frame.life&&!!b.presentation&&frame.at-b.presentation.lifeAt<650,elapsed:b.presentation?frame.at-b.presentation.lifeAt:0});
 usePublishShellFelt({gameKind:'battle-31',anteAmount:v.stake,publisherLabel:'Battle31Table'});
 useShellTabBar({cardsIcon:'spade',activeTab,setActiveTab,cardsFlashing:active?'green':null,isPaused:v.paused});
 const seconds=Math.max(0,Math.ceil((b.deadline-frame.at)/1000));
 useShellTimer(!sessionEnded&&b.phase==='playing'?{secondsRemaining:seconds,totalSeconds:b.rules.turnMs/1000,paused:v.paused,actorLabel:actor?.name,activePlayerId:actor?.id,identityKey:v.scope+':'+b.turn+':'+b.deadline}:null);
 const send=(intent:Battle31Intent)=>{setSelection(null);void onIntent(intent);};
 const card=(id:number|null,index:number,zone:'own'|'center'|'result')=>{
  const seat=zone==='own'?me:opponent,highlight=reveal&&zone!=='center'&&id!==null&&b.result?.scoringCards?.[seat]?.includes(id);
  const hidden=zone==='result'?false:movement.hidden(zone==='center'?null:me,index);
  return <button key={index} data-battle-card={zone} data-card-anchor={zone==='center'?'community-'+index:'tableau-'+v.players[seat]?.id+'-'+index} aria-label={id===null?'Hidden card':`${zone==='center'?'Center':'Hand'} ${battleCard(id)?.rank} ${battleCard(id)?.suit}`} disabled={!active||zone==='result'||id===null||hidden} aria-pressed={zone==='own'?selected?.own===id:zone==='center'?selected?.center===id:undefined} onClick={()=>setSelection(s=>({scope:v.scope,revision:v.revision,own:s?.revision===v.revision?s.own:null,center:s?.revision===v.revision?s.center:null,[zone==='own'?'own':'center']:id}))}>
   <span style={{visibility:hidden?'hidden':'visible'}}><TableauCard card={battleCard(id)} isHidden={id===null} highlight={highlight?'gold':null} style={{width:'100%',height:'100%'}}/></span>
  </button>;
 };
 const status=v.paused?'Paused':!connected?'Reconnecting…':pending?'Confirming…':frame.result?(frame.announce&&reveal?battleResultText(v):'Revealing hands…'):self?.autoPlay?'Auto-play · uncheck to rejoin':active?'Select your card and a center card':actor?.name+' is playing';
 return <>
 {spacer(true)}<div style={{height:'var(--shell-felt-h)',flex:'0 0 var(--shell-felt-h)',pointerEvents:'none'}}>
 {!sessionEnded&&<GameplayOpponentSeatLayer family="battle-31" participants={v.players.filter(p=>p.id!==v.viewerId).map(p=>({...p,position:p.seat}))} presentation={{inwardSeatContent:true,cardBacks:()=>({count:3,visible:!reveal&&!clear&&!(b.phase==='intro'&&movement.busy),variant:'cribbage'}),dealerPip:p=>p.id===v.players[dealer]?.id&&!frame.movingDealer,scoreLine:p=>'Rounds lost: '+lives(v.players.findIndex(x=>x.id===p.id)).losses,scoreAutoPlay:p=>!!v.players.find(x=>x.id===p.id)?.autoPlay,lives:p=>lives(v.players.findIndex(x=>x.id===p.id)),activeTimer:p=>b.phase==='playing'&&p.id===actor?.id&&!v.paused?{timeLeft:seconds,maxTime:b.rules.turnMs/1000,activePlayerId:p.id}:null}}/>}
 </div>
 {layer&&!sessionEnded&&createPortal(<div className="battle-felt" data-battle-phase={b.phase} data-battle-result={reveal||undefined}>
  <div className="battle-chrome"><strong>Round {v.round}/12</strong><span>Rounds lost · {v.players.map((p,i)=>p.name+' '+lives(i).losses).join(' · ')}</span><small>{battleProgress(v)}</small></div>
  {!clear&&<div className="battle-middle"><div className="battle-tabled">{reveal&&<><span>{v.players[opponent].name} · {b.result?.values[opponent]}</span><div className="battle-cards">{b.hands[opponent].map((id,i)=>card(id,i,'result'))}</div></>}</div><div className="battle-exchange"><span>Exchange cards</span><div className="battle-cards">{movement.center.map((id,i)=>card(id,i,'center'))}</div></div></div>}
  {frame.movingDealer&&animate&&<CanonicalDealerTransition from={v.players[frame.dealer].seat} to={v.players[1-frame.dealer].seat} elapsed={frame.at-b.presentation!.clearAt}/>}

 </div>,layer)}
 {spacer(false)}
 <ShellHudGrid timer={<ShellTimerRail/>} pane={activeTab!=='cards'?<div className="battle-panel">{panel}</div>:sessionEnded?<span/>:<div className="battle-pane" data-battle-pane>
  <div className="battle-local-lives">{!frame.movingDealer&&self&&dealer===me&&<DealerIndicator size="sm"/>}{self&&<CanonicalLifeMarkers {...lives(me)}/>}<span role="status">{status}</span></div>
  <div className="battle-own-cards">{!clear&&self&&<div className="battle-cards">{(movement.hands[me]??b.hands[me]).map((id,i)=>card(id,i,'own'))}</div>}</div>
  <div className="battle-actions">{active&&<><button disabled={selected?.own==null||selected.center==null} onClick={()=>{if(selected?.own!=null&&selected.center!=null)send({type:'swap',items:[selected.own,selected.center]});}}>Swap selected</button><button onClick={()=>send({type:'take_pot'})}>Swap all three</button><button onClick={()=>send({type:'pass'})}>{b.closing||b.turn>=7?'Stand':'Knock'}</button></>}
   {self?.autoPlay&&!v.settled&&<label><input type="checkbox" checked disabled={!connected||pending} onChange={()=>send({type:'autoplay_off'})}/>Auto-play · uncheck to rejoin</label>}
   {error&&<button onClick={onReconnect}>{error} · Reconnect</button>}
   {!v.settled&&self&&!active&&!self.autoPlay&&<button className="battle-resign" disabled={!connected||pending||v.paused} onClick={()=>setResign(true)}>Resign match</button>}
  </div>
 </div>} identity={self?<CanonicalPlayerIdentityRow playerId={self.id} name={self.name} chips={self.chips} active={active}/>:<span>Observer</span>}/>
 <AlertDialog open={resign} onOpenChange={setResign}><AlertDialogContent><AlertDialogTitle>Resign this match?</AlertDialogTitle><AlertDialogDescription>You will lose the match and its {v.stake}-chip stake. The game clock continues.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep playing</AlertDialogCancel><AlertDialogAction disabled={pending||v.settled} onClick={()=>send({type:'resign'})}>Resign match</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </>;
}
