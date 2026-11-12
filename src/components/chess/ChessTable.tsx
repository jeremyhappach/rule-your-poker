import ChessRules from '@/components/rules/ChessRules';
import {useEffect,useMemo,useRef} from 'react';
import {useChess} from '@/hooks/useChess';
import {chessTransport} from '@/lib/chess/client';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission,usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {useCallback} from 'react';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import {ChessView} from './ChessView';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
interface Props{dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(b:boolean)=>void;onTerminalComplete:(t:string)=>void}
function Balance({id,seat,fallback}:{id:string;seat:number;fallback:number}){const chips=usePresentationPlayerChipBalance(id,fallback);return <small data-chip-center={seat} data-chip-reaction-target={seat}> {chips}</small>;}
export function ChessTable(props:Props){
 const transport=useMemo(()=>chessTransport(props.dealerGameId,props.userId,'live'),[props.dealerGameId,props.userId]),game=useChess(props.dealerGameId,props.userId,transport),v=game.snapshot;
 const chat=useGameChatContext(),announcements=useAnnouncements(),announced=useRef(false),sawLive=useRef(false),done=useRef(false),callbacks=useRef(props);callbacks.current=props;
 if(v&&!v.settled)sawLive.current=true;
 const valid=useCallback((b:ChipPresentationBatch)=>{if(!v?.settlement||b.id!==v.financial.batch?.id||b.game_id!==v.identity.sessionId||b.dealer_game_id!==v.id)return false;const d:Record<string,number>={};for(const t of b.transfers){if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||t.amount<=0)return false;d[t.from.playerId]=(d[t.from.playerId]??0)-t.amount;d[t.to.playerId]=(d[t.to.playerId]??0)+t.amount;}return Object.keys(d).every(id=>v.players.some(p=>p.id===id))&&v.players.every(p=>(d[p.id]??0)===(v.settlement![p.id]??0));},[v]);
 const admission=useCallback((b:ChipPresentationBatch)=>b.dealer_game_id!==props.dealerGameId||!props.sessionEnded&&valid(b),[props.dealerGameId,props.sessionEnded,valid]);useChipTransferPresentationAdmission(admission);
 const batch=v?.financial.batch,cursor=useChipPresentationCursorState(batch&&valid(batch)?batch.cursor:null),ready=v?.settlement&&(v.players.every(p=>!v.settlement![p.id])||['settled','reconciled'].includes(cursor));
 useEffect(()=>{if(v?.settled&&!props.sessionEnded)callbacks.current.onTerminalActive(true);},[v?.settled,props.sessionEnded]);
 useEffect(()=>{if(!v?.terminal||props.sessionEnded||announced.current)return;announced.current=true;if(game.now>=v.terminal.deadline)return;const winner=v.players.find(p=>p.id===v.winnerIds[0]);announcements.emit({id:'match_win:chess:'+v.terminal.resultId,type:'match_win',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{text:v.winnerIds.length===2?'Draw':winner?.name+' wins'},ttlMs:v.terminal.deadline-game.now});celebrateCanonicalWinner(v.terminal.resultId,v.viewerId,v.winnerIds,sawLive.current&&v.winnerIds.length===1&&v.winnerIds[0]===v.viewerId);},[v?.terminal,props.sessionEnded,game.now,announcements]);
 useEffect(()=>{if(!v?.settled||!ready||v.paused||props.sessionEnded||done.current||game.now<(v.terminal?.deadline??0))return;if(v.finished){done.current=true;callbacks.current.onTerminalComplete(`chess|winseq|${v.identity.sessionId}|${v.id}|1|${v.financial.resultId}|${v.identity.roundId}`);callbacks.current.onTerminalActive(false);}},[v,ready,props.sessionEnded,game.now]);
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='lobby'?<ChessRules/>:<>{v?.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>;
 return <ChessView {...game} view={v} {...props} panel={panel} onIntent={game.act} onReconnect={game.reconnect} balance={id=>{const p=v!.players.find(p=>p.id===id)!;return <Balance id={id} seat={p.seat} fallback={v!.financial.balances[id]??0}/>;}}/>;
}
