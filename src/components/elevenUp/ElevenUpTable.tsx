import {useEffect,useMemo,useRef,useState} from 'react';
import {useElevenUp} from '@/hooks/useElevenUp';
import {elevenTransport,elevenRpc} from '@/lib/elevenUp/client';
import {ElevenUpView,ElevenUpRules} from './ElevenUpView';
import {useElevenFinancial} from './useElevenFinancial';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {ElevenSnapshot} from '@/lib/elevenUp/model';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({player:p}:{player:ElevenSnapshot['players'][number]}){const chips=usePresentationPlayerChipBalance(p.id,p.chips??0);return <small data-chip-center={p.seat} data-chip-reaction-target={p.seat}>{chips} chips</small>;}
export function ElevenUpTable(props:Props){
 const transport=useMemo(()=>elevenTransport(props.dealerGameId,props.userId,false),[props.dealerGameId,props.userId]),game=useElevenUp(props.dealerGameId,props.userId,transport);
 const v=game.snapshot,ready=useElevenFinancial(v,props.sessionEnded),chat=useGameChatContext(),announcements=useAnnouncements();
 const [error,setError]=useState(''),[closing,setClosing]=useState(false),terminal=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const complete=()=>{if(!v||completed.current)return;completed.current=true;callbacks.current.onTerminalComplete(`eleven-up|winseq|${v.identity!.sessionId}|${v.id}|1`);callbacks.current.onTerminalActive(false);};
 useEffect(()=>{
  if(!v?.settled||props.sessionEnded)return;
  if(v.finished&&ready){complete();return;}
  if(terminal.current)return;terminal.current=true;callbacks.current.onTerminalActive(true);
  announcements.emit({id:`match_win:eleven-up:${v.id}`,type:'match_win',scope:{dealerGameId:v.identity!.sessionId,roundId:v.identity!.roundId},payload:{text:`11 Up complete · ${v.players.map(p=>`${p.name}: ${p.score.toLocaleString()}`).join(' · ')}`},ttlMs:10000});
 },[v,ready,props.sessionEnded,announcements]);
 if(!v)return <p role="status">{game.error||'Restoring 11 Up…'} <button onClick={game.reconnect}>Reconnect</button></p>;
 const close=async()=>{if(!ready||closing)return;setClosing(true);try{await elevenRpc('eleven_up_close',{p_dealer_game_id:v.id});complete();}catch(e){setError((e as Error).message);}finally{setClosing(false);}};
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.results?.map(r=><p key={r.id}>{v.players.find(p=>p.id===r.playerId)?.name} · Round {r.stage} · {r.reason.replace(/_/g,' ')} · {r.stageScore.toLocaleString()} · Total {r.score.toLocaleString()}</p>)}</div>:<ElevenUpRules/>;
 return <ElevenUpView view={v} userId={props.userId} now={game.now} pending={game.pending} error={error||game.error} epoch={game.epoch} liveEntry={props.liveEntry} onIntent={game.act} onReconnect={game.reconnect} onFinish={v.settled&&ready&&!closing&&!props.sessionEnded?()=>void close():undefined} activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionEnded={props.sessionEnded} panel={panel} balance={p=><Balance player={p}/>}/>;
}
