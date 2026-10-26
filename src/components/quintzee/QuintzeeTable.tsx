import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useQuintzee} from '@/hooks/useQuintzee';
import {quintzeeTransport,quintzeeRpc,type QuintzeeProductionSnapshot} from '@/lib/quintzee/client';
import {QuintzeeView} from './QuintzeeView';
import QuintzeeRules from '@/components/rules/QuintzeeRules';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission,usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function validBatch(batch:ChipPresentationBatch,v:QuintzeeProductionSnapshot){
 if(!v.settlement||!v.financial?.resultId||batch.id!==v.financial.batch?.id||batch.game_id!==v.identity?.sessionId||batch.dealer_game_id!==v.id)return false;
 const deltas:Record<string,number>={};
 for(const t of batch.transfers){if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!(t.amount>0))return false;deltas[t.from.playerId]=(deltas[t.from.playerId]??0)-t.amount;deltas[t.to.playerId]=(deltas[t.to.playerId]??0)+t.amount;}
 return Object.keys(deltas).every(id=>v.state.players.includes(id))&&v.state.players.every(id=>(deltas[id]??0)===(v.settlement![id]??0));
}
function Balance({id,seat,chips}:{id:string;seat?:number;chips?:number}){const value=usePresentationPlayerChipBalance(id,chips??0);return <small data-chip-center={seat} data-chip-reaction-target={seat}>{value} chips</small>;}
export function QuintzeeTable(props:Props){
 const transport=useMemo(()=>quintzeeTransport(props.dealerGameId,props.userId,false),[props.dealerGameId,props.userId]),game=useQuintzee(props.dealerGameId,props.userId,transport);
 const v=game.snapshot as QuintzeeProductionSnapshot|null,chat=useGameChatContext(),announcements=useAnnouncements();
 const batch=v?.financial?.batch,valid=!!batch&&!!v&&validBatch(batch,v);
 const admit=useCallback((b:ChipPresentationBatch)=>b.dealer_game_id!==v?.id||!!v&&!props.sessionEnded&&validBatch(b,v),[v,props.sessionEnded]);
 useChipTransferPresentationAdmission(admit);
 const cursor=useChipPresentationCursorState(valid?batch.cursor:null);
 const ready=!!v?.settlement&&(v.state.players.every(id=>(v.settlement![id]??0)===0)||valid&&['settled','reconciled'].includes(cursor));
 const [error,setError]=useState(''),closing=useRef(false),terminal=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const sawLive=useRef(false);if(v&&!v.settlement)sawLive.current=true;
 useEffect(()=>{
  if(!v?.settlement||props.sessionEnded||terminal.current)return;
  terminal.current=true;callbacks.current.onTerminalActive(true);
  if(v.terminal&&game.now<v.terminal.deadline){
   const names=v.terminal.winnerIds.map(id=>v.playerNames?.[id]??'Player');
   announcements.emit({id:`match_win:quintzee:${v.terminal.resultId}`,type:'match_win',scope:{dealerGameId:v.identity!.sessionId,roundId:v.identity!.roundId},payload:{text:`${names.join(' & ')} ${names.length===1?'wins':'tie'} with ${v.terminal.score.toLocaleString()}`},ttlMs:Math.max(1,v.terminal.deadline-game.now)});
   celebrateCanonicalWinner(v.terminal.resultId,v.viewerId??'',v.terminal.winnerIds,sawLive.current&&(v.settlement[v.viewerId??'']??0)>0);
  }
 },[v,props.sessionEnded,announcements]);
 useEffect(()=>{
  if(!v?.settlement||!ready||props.sessionEnded||completed.current||game.now<(v.terminal?.deadline??0))return;
  if(v.closed){completed.current=true;callbacks.current.onTerminalComplete(`quintzee|winseq|${v.identity!.sessionId}|${v.id}|1|${v.financial?.resultId}|${v.identity!.roundId}`);callbacks.current.onTerminalActive(false);return;}
  if(closing.current)return;closing.current=true;
  void quintzeeRpc('quintzee_close',{p_dealer_game_id:v.id}).then(()=>game.reconnect()).catch(e=>setError((e as Error).message));
 },[v,ready,props.sessionEnded,game.now]);
 if(!v)return <div role="status">{game.error||'Loading Quintzee…'}{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</div>;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.state.results.map((r,i)=><p key={i}>{v.playerNames?.[r.playerId??'']} · Round {r.round} · {r.stageScore.toLocaleString()}</p>)}</div>:<QuintzeeRules/>;
 return <QuintzeeView snapshot={v} userId={props.userId} actor={v.viewerId??''} now={game.now} pending={game.pending} error={error||game.error} onIntent={game.act} onReconnect={()=>{closing.current=false;setError('');void game.reconnect();}} activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionEnded={props.sessionEnded} panel={panel} balance={id=>{const p=v.participants?.find(p=>p.id===id);return p?<Balance id={id} seat={p.seat} chips={p.chips}/>:null;}}/>;
}
