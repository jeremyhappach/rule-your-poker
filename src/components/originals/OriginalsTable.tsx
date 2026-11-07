import {useEffect,useRef,useState} from 'react';
import {useOriginalsMatch} from '@/hooks/useOriginalsMatch';
import {OriginalsBoard} from './OriginalsBoard';
import {useMegaFinancial} from '@/components/megaCardGolf/useMegaFinancial';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';

interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({id,seat,chips}:{id:string;seat:number;chips:number}){const shown=usePresentationPlayerChipBalance(id,chips);return <small data-chip-center={seat} data-chip-reaction-target={seat}>{shown} chips</small>;}
export function OriginalsTable(props:Props){
 const game=useOriginalsMatch(props.dealerGameId,props.userId,props.liveEntry),v=game.snapshot,announcements=useAnnouncements(),chat=useGameChatContext();
 const [presented,setPresented]=useState(false),seen=useRef(!!props.liveEntry),done=useRef(false),announced=useRef('');
 const callbacks=useRef(props);callbacks.current=props;
 const ready=useMegaFinancial(v,presented,props.sessionEnded,props.dealerGameId);
 useEffect(()=>{setPresented(false);done.current=false;seen.current=!!props.liveEntry;announced.current='';},[props.dealerGameId]);
 useEffect(()=>{if(v&&!v.settled)seen.current=true;if(v?.settled)callbacks.current.onTerminalActive(true);},[v?.settled]);
 useEffect(()=>{setPresented(false);},[v?.scope]);
 useEffect(()=>{
  if(!v?.settled||!presented||v.paused)return;
  if(announced.current!==v.financial.resultId){announced.current=v.financial.resultId;announcements.emit({id:'originals-win:'+v.financial.resultId,type:'match_win',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{text:v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')+' win with '+v.terminal?.score.toLocaleString()},ttlMs:3000});}
  celebrateCanonicalWinner(v.financial.resultId,v.viewerId??'',v.terminal?.winnerIds??[],seen.current);
 },[v,presented,announcements]);
 useEffect(()=>{
  if(!v?.settled||!presented||!ready||v.paused||game.now<(v.terminal?.deadline??0)||done.current||!v.finished)return;
  done.current=true;callbacks.current.onTerminalComplete(`${v.game}|winseq|${v.identity.sessionId}|${v.id}|1|${v.financial.resultId}|${v.identity.roundId}`);callbacks.current.onTerminalActive(false);
 },[v,presented,ready,game.now]);
 const title=v?.game==='crib-lab'?'Crib Lab':'Chucky Showdown';
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v?.results.map(r=><p key={r.actor+':'+r.round}>{v.players.find(p=>p.id===r.actor)?.name} · Round {r.round} · {r.score.toLocaleString()}</p>)}</div>:undefined;
 const scores=<div className="originals-scores">{v?.players.map(p=><div key={p.id} data-active={p.id===v.actor||undefined}><strong>{p.name}</strong><span>{(v.scores[p.id]??0).toLocaleString()}</span><Balance id={p.id} seat={p.seat} chips={p.chips}/></div>)}</div>;
 if(!v?.board||props.sessionEnded)return <FullscreenGameShell gameplay={false} title={title} description="" activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={panel} announcement={false} scores={scores}>{!props.sessionEnded&&<p>{game.error||'Preparing the game…'}</p>}</FullscreenGameShell>;
 return <OriginalsBoard game={v.game} board={v.board} userId={props.userId} now={v.paused?v.pausedAt!:game.now} pending={game.pending} canAct={v.canAct&&game.connected&&!game.error}
  live={game.audioLive&&game.connected&&!v.paused&&props.activeTab==='cards'} epoch={game.epoch} error={game.error} reconnect={()=>void game.reconnect()} onIntent={game.act}
  activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={panel} scores={scores} onPresentationDone={()=>setPresented(true)}/>;
}
