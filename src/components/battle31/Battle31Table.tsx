import {useEffect,useMemo,useRef,useState} from 'react';
import {useBattle31} from '@/hooks/useBattle31';
import {battle31Transport,battle31Rpc} from '@/lib/battle31/client';
import {Battle31Loading,Battle31View,Battle31Rules} from './Battle31View';
import {useBattle31Financial} from './useBattle31Financial';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {Battle31Snapshot} from '@/lib/battle31/model';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';

interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({player:p}:{player:Battle31Snapshot['players'][number]}){const chips=usePresentationPlayerChipBalance(p.id,p.chips??0);return <small data-chip-center={p.seat} data-chip-reaction-target={p.seat}>{chips} chips</small>;}
export function Battle31Table(props:Props){
 const transport=useMemo(()=>battle31Transport(props.dealerGameId),[props.dealerGameId,props.userId]),game=useBattle31(props.dealerGameId,props.userId,transport);
 const v=game.snapshot,ready=useBattle31Financial(v,props.sessionEnded),chat=useGameChatContext(),announcements=useAnnouncements();
 const [error,setError]=useState(''),closing=useRef(false),terminal=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const sawLive=useRef(false);if(v&&!v.settled)sawLive.current=true;
 const complete=()=>{if(!v||completed.current)return;completed.current=true;callbacks.current.onTerminalComplete(`battle-31|winseq|${v.identity!.sessionId}|${v.id}|1|${v.financial?.resultId}|${v.identity!.roundId}`);callbacks.current.onTerminalActive(false);};
 useEffect(()=>{
  if(!v?.settled||props.sessionEnded)return;
  if(terminal.current)return;terminal.current=true;callbacks.current.onTerminalActive(true);
  if(v.terminal&&game.now<v.terminal.deadline){
   const winners=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id));
   const text=v.terminal.outcome==='aborted'?'Match aborted':winners.length===1?`${winners[0].name} wins Battle 31`:'Battle 31 drawn';
   announcements.emit({id:`match_win:battle31:${v.terminal.resultId}`,type:'match_win',scope:{dealerGameId:v.identity!.sessionId,roundId:v.identity!.roundId},payload:{text},ttlMs:Math.max(1,v.terminal.deadline-game.now)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId??'',v.terminal.winnerIds,sawLive.current&&game.epoch===0&&(v.settlement?.[v.viewerId??'']??0)>0);
  }
 },[v,ready,props.sessionEnded,announcements]);
 useEffect(()=>{
  if(!v?.settled||!ready||props.sessionEnded||completed.current||game.now<(v.terminal?.deadline??0))return;
  if(v.finished){complete();return;}
  if(closing.current)return;
  closing.current=true;
  void battle31Rpc('battle31_close',{p_dealer_game_id:v.id}).then(()=>game.reconnect()).catch(e=>setError((e as Error).message));
 },[v,ready,props.sessionEnded,game.now]);
 if(!v)return <Battle31Loading activeTab={props.activeTab} setActiveTab={props.setActiveTab} error={game.error} onReconnect={game.reconnect}/>;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.results.map(r=><p key={r.round}>Round {r.round} · {r.values.join(' / ')} · {r.loser===null?'Draw':`${v.players[r.loser].name} lost a life`}</p>)}</div>:<Battle31Rules/>;
 return <Battle31View view={v} userId={props.userId} now={game.now} pending={game.pending} connected={game.connected} error={error||game.error} epoch={game.epoch} liveEntry={props.liveEntry} onIntent={game.act} onReconnect={()=>{closing.current=false;setError('');game.reconnect();}} activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionEnded={props.sessionEnded} terminalPresenting={v.settled&&!completed.current} panel={panel} balance={p=><Balance player={p}/>}/>;
}
