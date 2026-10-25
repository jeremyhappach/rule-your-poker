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
import {battleFrame,battleResultText} from '@/lib/battle31/presentation';
import {platformAudio} from '@/lib/audio/platformAudio';
import {knockCue} from '@/lib/audio/platformCues';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';

interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({player:p}:{player:Battle31Snapshot['players'][number]}){const chips=usePresentationPlayerChipBalance(p.id,p.chips??0);return <small data-chip-center={p.seat} data-chip-reaction-target={p.seat}>{chips} chips</small>;}
export function Battle31Table(props:Props){
 const transport=useMemo(()=>battle31Transport(props.dealerGameId),[props.dealerGameId,props.userId]),game=useBattle31(props.dealerGameId,props.userId,transport);
 const v=game.snapshot,winnerReady=!!v&&battleFrame(v,game.now).winner,ready=useBattle31Financial(v,props.sessionEnded,winnerReady),chat=useGameChatContext(),announcements=useAnnouncements();
 const [revealedScope,setRevealedScope]=useState<string|null>(null);
 const events=useRef({identity:'',seen:new Set<string>()});
 useEffect(()=>{
  if(!v)return;const identity=v.id+':'+game.epoch,knock=v.board.knock,resultId=v.scope+':result';
  if(events.current.identity!==identity){events.current={identity,seen:new Set([...(knock?[knock.id]:[]),...(v.board.result?[resultId]:[])])};return;}
  if(document.hidden||!game.connected){if(knock)events.current.seen.add(knock.id);if(v.board.result)events.current.seen.add(resultId);return;}
  if(v.paused||props.sessionEnded)return;
  if(knock&&!events.current.seen.has(knock.id)){events.current.seen.add(knock.id);announcements.emit({id:knock.id,type:'gameplay_notice',scope:{dealerGameId:v.identity.sessionId,roundId:v.scope},payload:{title:v.players[knock.actor].name+' knocked · '+v.players[knock.responder].name+' has the final response'},ttlMs:2200});platformAudio.request({userId:props.userId,id:'battle31:'+knock.id,expiresAt:performance.now()+500,cue:knockCue});}
  const frame=battleFrame(v,game.now);
  if(revealedScope===v.scope&&frame.announce&&!frame.clear&&!events.current.seen.has(resultId)){events.current.seen.add(resultId);if(knock)announcements.dismiss(knock.id);announcements.emit({id:resultId,type:'gameplay_notice',scope:{dealerGameId:v.identity.sessionId,roundId:v.scope},payload:{title:battleResultText(v)},ttlMs:2600});}
 },[v,game.now,game.epoch,game.connected,props.sessionEnded,props.userId,announcements,revealedScope]);
 useEffect(()=>()=>{if(v){announcements.dismiss(v.scope+':knock');announcements.dismiss(v.scope+':result');}},[v?.scope,game.epoch,announcements.dismiss]);
 const [error,setError]=useState(''),closing=useRef(false),terminal=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const sawLive=useRef(false);if(v&&!v.settled)sawLive.current=true;
 const complete=()=>{if(!v||completed.current)return;completed.current=true;callbacks.current.onTerminalComplete(`battle-31|winseq|${v.identity!.sessionId}|${v.id}|1|${v.financial?.resultId}|${v.identity!.roundId}`);callbacks.current.onTerminalActive(false);};
 useEffect(()=>{
  if(!v?.settled||props.sessionEnded||!winnerReady)return;
  if(terminal.current)return;terminal.current=true;callbacks.current.onTerminalActive(true);
  if(v.terminal&&game.now<v.terminal.deadline){
   const winners=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id));
   const text=v.terminal.outcome==='aborted'?'Match aborted':winners.length===1?`${winners[0].name} wins Battle 31`:'Battle 31 drawn';
   announcements.emit({id:`match_win:battle31:${v.terminal.resultId}`,type:'match_win',scope:{dealerGameId:v.identity!.sessionId,roundId:v.identity!.roundId},payload:{text},ttlMs:Math.max(1,v.terminal.deadline-game.now)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId??'',v.terminal.winnerIds,sawLive.current&&game.epoch===0&&(v.settlement?.[v.viewerId??'']??0)>0);
  }
 },[v,ready,props.sessionEnded,announcements,winnerReady]);
 useEffect(()=>{
  if(!v?.settled||!ready||props.sessionEnded||completed.current||game.now<(v.terminal?.deadline??0))return;
  if(v.finished){complete();return;}
  if(closing.current)return;
  closing.current=true;
  void battle31Rpc('battle31_close',{p_dealer_game_id:v.id}).then(()=>game.reconnect()).catch(e=>setError((e as Error).message));
 },[v,ready,props.sessionEnded,game.now]);
 if(!v)return <Battle31Loading activeTab={props.activeTab} setActiveTab={props.setActiveTab} error={game.error} onReconnect={game.reconnect}/>;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.results.map(r=><p key={r.round}>Round {r.round} · {r.values.join(' / ')} · {r.loser===null?'Draw':`${v.players[r.loser].name} lost a life`}</p>)}</div>:<Battle31Rules/>;
 return <Battle31View onRevealReady={setRevealedScope} view={v} userId={props.userId} now={game.now} pending={game.pending} connected={game.connected} error={error||game.error} epoch={game.epoch} liveEntry={props.liveEntry} onIntent={game.act} onReconnect={()=>{closing.current=false;setError('');game.reconnect();}} activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionEnded={props.sessionEnded} terminalPresenting={v.settled&&!completed.current} panel={panel} balance={p=><Balance player={p}/>}/>;
}
