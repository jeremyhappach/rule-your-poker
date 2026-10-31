import {useCompletionRetry} from '@/hooks/useCompletionRetry';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRacePoker} from '@/hooks/useRacePoker';
import {racePokerTransport,racePokerRpc} from '@/lib/racePoker/client';
import {RacePokerLoading,RacePokerView,RacePokerRules} from './RacePokerView';
import {useRacePokerFinancial} from './useRacePokerFinancial';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {RacePokerSnapshot} from '@/lib/racePoker/model';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({player:p}:{player:RacePokerSnapshot['players'][number]}){const chips=usePresentationPlayerChipBalance(p.id,p.chips??0);return <small data-chip-center={p.seat} data-chip-reaction-target={p.seat}>{chips} chips</small>;}
export function RacePokerTable(props:Props){
 const transport=useMemo(()=>racePokerTransport(props.dealerGameId),[props.dealerGameId,props.userId]),game=useRacePoker(props.dealerGameId,props.userId,transport);
 const v=game.snapshot?.id===props.dealerGameId?game.snapshot:null,ready=useRacePokerFinancial(v,props.sessionEnded),chat=useGameChatContext(),announcements=useAnnouncements();
 const [error,setError]=useState(''),closing=useCompletionRetry(props.dealerGameId+':'+props.userId),terminal=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const previous=useRef<{settled:boolean;epoch:number;connected:boolean}|null>(null);
 const complete=()=>{if(!v||completed.current)return;completed.current=true;callbacks.current.onTerminalComplete(`race-poker|winseq|${v.identity!.sessionId}|${v.id}|1|${v.financial?.resultId}|${v.identity!.roundId}`);callbacks.current.onTerminalActive(false);};
 useEffect(()=>{terminal.current=false;completed.current=false;previous.current=null;setError('');},[props.dealerGameId,props.userId]);
 useEffect(()=>{
  const prior=previous.current;if(v)previous.current={settled:v.settled,epoch:game.epoch,connected:game.connected};
  if(!v?.settled||props.sessionEnded)return;
  if(terminal.current)return;terminal.current=true;callbacks.current.onTerminalActive(true);
  if(v.terminal&&game.now<v.terminal.deadline){
   const winners=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id));
   const text=`${winners.map(p=>p.name).join(' & ')} ${winners.length===1?'wins':'tie'} with ${v.terminal.score.toLocaleString()}`;
   announcements.emit({id:`match_win:race-poker:${v.terminal.resultId}`,type:'match_win',scope:{dealerGameId:v.id,roundId:v.identity!.roundId},payload:{text},ttlMs:Math.max(1,v.terminal.deadline-game.now)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId??'',v.terminal.winnerIds,prior?.settled===false&&prior.epoch===game.epoch&&prior.connected&&game.connected&&(v.settlement?.[v.viewerId??'']??0)>0);
  }
 },[v,ready,props.sessionEnded,announcements,game.epoch,game.connected]);
 useEffect(()=>{
  if(v?.paused)return;
  if(!v?.settled||!ready||props.sessionEnded||completed.current||game.now<(v.terminal?.deadline??0))return;
  if(v.finished){complete();return;}
  const receipt=closing.begin();if(!receipt)return;
  void racePokerRpc('race_poker_close',{p_dealer_game_id:v.id}).then(()=>receipt.succeed(()=>{setError('');void game.reconnect();})).catch(e=>receipt.fail(()=>setError((e as Error).message)));
 },[v,ready,props.sessionEnded,game.now,closing.revision]);
 if(!v)return <RacePokerLoading activeTab={props.activeTab} setActiveTab={props.setActiveTab} error={game.error} onReconnect={game.reconnect}/>;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.results?.map(r=><p key={r.id}>{v.players.find(p=>p.id===r.playerId)?.name} · Round {r.stage} · {r.label} · {r.stageScore.toLocaleString()} · Total {r.score.toLocaleString()}</p>)}</div>:<RacePokerRules version={v.board.rules.version}/>;
 return <RacePokerView view={v} userId={props.userId} now={game.now} pending={game.pending} connected={game.connected} error={error||game.error} epoch={game.epoch} liveEntry={props.liveEntry} onIntent={game.act} onReconnect={()=>{closing.reset();setError('');game.reconnect();}} activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionEnded={props.sessionEnded} terminalPresenting={v.settled&&!completed.current} panel={panel} balance={p=><Balance player={p}/>}/>;
}
