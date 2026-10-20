import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PlayingCard} from '@/components/PlayingCard';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useGolf} from '@/hooks/useGolf';
import {golfTransport,golfRpc} from '@/lib/golf/client';
import {golfCard,golfWarning,type GolfSnapshot} from '@/lib/golf/model';
import {useGolfFinancial} from './useGolfFinancial';
import GolfRules from '@/components/rules/GolfRules';
import {usePublishShellFelt} from '@/lib/canonicalShell/ShellOwnedFeltHost';
import {useCanonicalFeltInteractionLayerElement} from '@/lib/canonicalShell/useCanonicalFeltInteractionLayerElement';
import {ShellHudGrid} from '@/lib/canonicalShell/ShellHudGrid';
import {ShellTimerRail,useShellTimer} from '@/lib/canonicalShell/ShellTimerRail';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {GameplayOpponentSeatLayer} from '@/lib/canonicalShell/GameplayOpponentSeatLayer';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {PresentationChipBalance} from '@/lib/canonicalShell/PresentationChipBalance';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import './golf.css';
interface Props {dealerGameId:string;retentionRoundId?:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(token:string)=>void}
export function GolfTable(props:Props) {
 const transport=useMemo(()=>golfTransport(props.dealerGameId),[props.dealerGameId]),game=useGolf(props.dealerGameId,props.userId,transport);
 const v=game.snapshot,ready=useGolfFinancial(v,props.sessionEnded),layer=useCanonicalFeltInteractionLayerElement(!props.sessionEnded);
 const [selected,setSelected]=useState<number[]>([]),[discard,setDiscard]=useState(false),[error,setError]=useState('');
 const [rulesOpen,setRulesOpen]=useState(false);
 const announced=useRef(''),closing=useRef(false),completed=useRef(false),sawLive=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const chat=useGameChatContext(),announcements=useAnnouncements();
 const self=v?.players.find(p=>p.id===v.viewerId),actor=v?.players[v.turnIndex];
 const acting=!!v?.canAct&&!game.pending&&game.connected&&!v.paused&&game.now<v.deadline&&!props.sessionEnded;
 if(v&&!v.settled)sawLive.current=true;
 useEffect(()=>{setSelected([]);setDiscard(false);},[v?.scope,v?.turnIndex,v?.revision]);
 usePublishShellFelt({gameKind:'six-card-golf',anteAmount:v?.stake??0,publisherLabel:'GolfTable'});
 useShellTabBar({cardsIcon:"spade",activeTab:props.activeTab,setActiveTab:props.setActiveTab,cardsFlashing:acting?'green':null,isPaused:!!v?.paused});
 useShellTimer(v&&!v.settled&&v.phase!=='hole_complete'?{secondsRemaining:Math.max(0,Math.ceil((v.deadline-(v.paused?v.pausedAt??game.now:game.now))/1000)),totalSeconds:30,paused:v.paused,actorLabel:actor?.name,activePlayerId:actor?.id,identityKey:v.scope+':'+v.turnIndex+':'+v.deadline}:null);
 useEffect(()=>{
  if(!v)return;
  const key=v.scope+':'+v.phase+':'+v.finalReason;
  if(announced.current===key)return;
  const first=!announced.current;announced.current=key;
  if(!first&&v.finalReason&&v.phase==='playing')announcements.emit({id:'golf-final:'+v.scope,type:'gameplay_notice',scope:{dealerGameId:v.id,roundId:v.scope},payload:{text:v.finalReason==='prolonged_play'?'Ptown house rule: one final turn each':'Final turns'},ttlMs:2500});
  if(v.settled&&v.terminal&&!props.sessionEnded) {
   callbacks.current.onTerminalActive(true);
   const names=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id)).map(p=>p.name).join(' & ');
   announcements.emit({id:'golf-win:'+v.terminal.resultId,type:'match_win',scope:{dealerGameId:v.id,roundId:v.scope},payload:{text:names+' win with '+v.terminal.score},ttlMs:Math.max(1,v.terminal.deadline-game.now)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId,v.terminal.winnerIds,sawLive.current&&game.epoch===0);
  }
 },[v,props.sessionEnded,announcements]);
 useEffect(()=>{
  if(!v?.settled||!ready||props.sessionEnded||completed.current||game.now<(v.terminal?.deadline??0))return;
  if(v.finished) {
   completed.current=true;
   callbacks.current.onTerminalComplete('six-card-golf|winseq|'+v.identity.sessionId+'|'+v.id+'|1|'+v.financial.resultId+'|'+(callbacks.current.retentionRoundId??v.holes[0]?.roundId??v.scope));
   callbacks.current.onTerminalActive(false);return;
  }
  if(closing.current)return;closing.current=true;
  void golfRpc('golf_close',{p_dealer_game_id:v.id}).then(()=>game.reconnect()).catch(e=>{setError((e as Error).message);});
 },[v,ready,props.sessionEnded,game.now]);
 const choose=(i:number)=>{
  if(!v||!acting)return;
  if(v.phase==='opening'){setSelected(old=>old.includes(i)?old.filter(x=>x!==i):old.length<2?[...old,i]:[old[1],i]);return;}
  if(v.pending)void game.act({type:'replace',items:[i]});
  else if(discard)void game.act({type:'discard',items:[i]});
 };
 const status=!v?'Connecting to table…':v.settled?'Match complete':v.phase==='hole_complete'?'Hole '+v.hole+' complete':v.phase==='opening'?(acting?'Choose two cards to reveal':actor?.name+' is choosing two cards'):acting?(v.pending?'Replace a card or discard your draw':discard?'Choose a card to replace':'Choose stock or discard'):actor?.name+"'s turn";
 const warning=v?golfWarning(v):null;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v?.holes.map(h=><p key={h.hole}>Hole {h.hole}: {v.players.map(p=>p.name+' '+h.scores[p.id]).join(' · ')}</p>)}</div>:<GolfRules/>;
 return <>
  <Dialog open={rulesOpen} onOpenChange={setRulesOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Six-Card Golf rules</DialogTitle><DialogDescription>six-card-golf/1 · frozen for this match</DialogDescription></DialogHeader><div className="catalog-scroll"><GolfRules/></div></DialogContent></Dialog>
  <div aria-hidden data-canonical-shell-play-top-spacer="" style={{flex:'0 0 var(--play-top-safe-area, 0px)',pointerEvents:'none'}}/>
  <div style={{position:'relative',height:'var(--shell-felt-h)',flex:'0 0 var(--shell-felt-h)',pointerEvents:'none'}}>
  {v&&!props.sessionEnded&&<GameplayOpponentSeatLayer family="six-card-golf" participants={v.players.filter(p=>p.id!==self?.id).map(p=>({...p,position:p.seat}))} presentation={{
   dealerPip:p=>p.id===v.players[v.dealerIndex]?.id,
   scoreLine:p=>'Total '+v.scores[p.id],
   publicTableau:p=>v.tableaus[p.id].cards.map(golfCard),
   activeTimer:p=>p.id===actor?.id&&!v.paused&&!v.settled?{timeLeft:Math.max(0,Math.ceil((v.deadline-game.now)/1000)),maxTime:30,activePlayerId:p.id}:null,
  }}/>}
  </div>
  {layer&&v&&!props.sessionEnded&&createPortal(<div className="golf-felt" data-golf-phase={v.phase}>
   <div className="golf-summary"><strong>Hole {v.hole} / 9</strong><span>Completed-hole totals</span>{v.players.map(p=><span key={p.id}>{p.id===v.viewerId?'You':p.name}: {v.scores[p.id]}</span>)}</div>
   {v.phase==='hole_complete'||v.settled?<div className="golf-hole-result"><strong>{v.settled?'Match complete':'Hole '+v.hole+' scored'}</strong>{v.players.map(p=><div key={p.id}>{p.name}: {v.holes.at(-1)?.scores[p.id]} · total {v.scores[p.id]}</div>)}</div>:<div className="golf-piles">
    <button data-golf-stock disabled={!acting||v.phase!=='playing'||v.hasPending} onClick={()=>void game.act({type:'draw'})} aria-label={'Draw stock, '+v.stockCount+' cards'}><PlayingCard isHidden style={{width:'100%',height:'100%'}}/><small>Stock {v.stockCount}</small></button>
    <button data-golf-discard disabled={!acting||v.phase!=='playing'||v.hasPending} onClick={()=>setDiscard(x=>!x)} aria-pressed={discard} aria-label="Take discard"><PlayingCard card={golfCard(v.discardTop)} style={{width:'100%',height:'100%'}} highlight={discard?'gold':null}/><small>Discard</small></button>
    {v.pending&&<button data-golf-pending disabled={!acting} onClick={()=>void game.act({type:'reject'})} aria-label="Discard drawn card"><PlayingCard card={golfCard(v.pending.card)} style={{width:'100%',height:'100%'}}/><small>Discard draw</small></button>}
   </div>}
   {self&&<div className="golf-local" aria-label="Your six-card tableau"><div className="golf-tableau">{v.tableaus[self.id].cards.map((card,i)=><button key={i} data-golf-position={i} disabled={!acting||v.phase==='playing'&&!v.pending&&!discard} aria-pressed={selected.includes(i)} aria-label={'Row '+(i<3?1:2)+', column '+(i%3+1)+(card===null?', face down':', '+golfCard(card)?.rank)} onClick={()=>choose(i)}><PlayingCard card={golfCard(card)} isHidden={card===null} highlight={selected.includes(i)?'gold':null} style={{width:'100%',height:'100%'}}/></button>)}</div></div>}
  </div>,layer)}
  <div aria-hidden data-canonical-shell-play-bottom-spacer="" style={{flex:'0 0 var(--play-bottom-safe-area, 0px)',pointerEvents:'none'}}/>
  <ShellHudGrid timer={<ShellTimerRail/>} pane={props.activeTab==='cards'?<div className="golf-controls">
   <p role="status">{props.sessionEnded?'Session ended':status}</p>{warning&&!props.sessionEnded&&<p className="golf-warning">{warning}</p>}
   <button onClick={()=>setRulesOpen(true)}>Rules</button>
   {v?.phase==='opening'&&acting&&<button disabled={selected.length!==2} onClick={()=>void game.act({type:'open',items:selected})}>Reveal selected two</button>}
   {(error||game.error)&&<button onClick={()=>{setError('');closing.current=false;game.reconnect();}}>{error||game.error} · Reconnect</button>}
  </div>:<div className="golf-panel">{panel}</div>} identity={self?<span>{self.name} · <PresentationChipBalance playerId={self.id} rawBalance={self.chips}/></span>:<span>Observer</span>}/>
 </>;
}
