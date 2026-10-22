import {useCanastaHelpers} from '@/hooks/useCanastaHelpers';
import {turnBudget} from '@/lib/canasta/config';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {httpTransport,type Snapshot,type Transport} from '@/lib/canasta/client';
import {CanastaGame} from './CanastaGame';
import {CanastaArtifacts,type CanastaPlayer} from './CanastaArtifacts';
import {CanonicalPlayerIdentityRow} from '@/lib/canonicalShell/CanonicalPlayerIdentityRow';
import {useShellTabBar,type ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {useChipPresentationCursorState,useChipTransferPresentationAdmission} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useCanastaCardPresentation} from './useCanastaCardPresentation';

export function isCanastaTerminalBatch(batch:ChipPresentationBatch|null|undefined,v:Snapshot){
 const s=v.settlement;if(!s||!batch||s.winner!==v.state.winner||!v.state.seats.some(p=>p.id===s.winner)||!v.state.seats.some(p=>p.id===s.loser)||batch.id!==s.transferBatchId||batch.game_id!==v.state.sessionId||batch.dealer_game_id!==v.state.id)return false;
 const deltas:Record<string,number>={};
 for(const t of batch.transfers){if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!(t.amount>0))return false;
  deltas[t.from.playerId]=(deltas[t.from.playerId]??0)-t.amount;deltas[t.to.playerId]=(deltas[t.to.playerId]??0)+t.amount;}
 return Object.keys(deltas).length===2&&deltas[s.winner]===s.amount&&deltas[s.loser]===-s.amount&&s.amount===v.state.stake;
}
interface Props {dealerGameId:string;userId:string;players:CanastaPlayer[];activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(token:string)=>void;transport?:Transport;onFirstRound?:(id:string)=>void}
export function CanastaTable(props:Props){
 const help=useCanastaHelpers(props.userId,!props.transport);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[now,setNow]=useState(Date.now());
 const offset=useRef(0),sawLive=useRef(false),announced=useRef(false),completed=useRef(false),callbacks=useRef(props);callbacks.current=props;
 useEffect(()=>()=>callbacks.current.onTerminalActive(false),[]);
 const transport=useMemo(()=>props.transport??httpTransport(props.dealerGameId,async()=>{
  const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in again');return data.session.access_token;
 },refresh=>{
  const channel=supabase.channel(`canasta:${props.dealerGameId}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'canasta_revisions',filter:`dealer_game_id=eq.${props.dealerGameId}`},refresh)
   .subscribe(status=>{if(status==='SUBSCRIBED')refresh();});
  const reconnect=()=>refresh();window.addEventListener('online',reconnect);
  return()=>{void supabase.removeChannel(channel);window.removeEventListener('online',reconnect);};
 }),[props.dealerGameId,props.transport]);
 const observe=useCallback((v:Snapshot)=>{offset.current=v.serverAt-Date.now();setNow(v.serverAt);setSnapshot(v);if(v.firstRoundId)callbacks.current.onFirstRound?.(v.firstRoundId);if(!v.settlement)sawLive.current=true;},[]);
 useCanastaCardPresentation(snapshot,props.userId);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()+offset.current),250);return()=>clearInterval(id);},[]);
 useShellTabBar({cardsIcon:'spade',activeTab:props.activeTab,setActiveTab:props.setActiveTab});
 const announcements=useAnnouncements(),chat=useGameChatContext(),s=snapshot?.settlement;
 const admit=useCallback((batch:ChipPresentationBatch)=>batch.dealer_game_id!==props.dealerGameId||!!snapshot&&!props.sessionEnded&&isCanastaTerminalBatch(batch,snapshot),[snapshot,props.dealerGameId,props.sessionEnded]);
 useChipTransferPresentationAdmission(admit);
 const cursor=useChipPresentationCursorState(s&&snapshot&&isCanastaTerminalBatch(s.batch,snapshot)?s.batch.cursor:null);
 useEffect(()=>{
  if(!snapshot||!s||announced.current||props.sessionEnded)return;announced.current=true;callbacks.current.onTerminalActive(true);
  if(now<s.deadline){
   const name=props.players.find(p=>p.id===s.winner)?.profiles?.username??'Winner';
   announcements.emit({id:`match_win:canasta:${s.resultId}`,type:'match_win',scope:{dealerGameId:snapshot.state.id,roundId:snapshot.firstRoundId??null},payload:{text:`${name} wins Canasta with ${s.scores[s.winner].toLocaleString()}`},ttlMs:Math.max(1,s.deadline-now)});
   celebrateCanonicalWinner(s.resultId,snapshot.state.viewer??'',[s.winner],sawLive.current);
  }
 },[snapshot,s,now,props.sessionEnded,props.players,announcements]);
 useEffect(()=>{
  if(!snapshot?.finished||!s||completed.current||props.sessionEnded||now<s.deadline||!['settled','reconciled'].includes(cursor))return;
  completed.current=true;callbacks.current.onTerminalComplete(`canasta|winseq|${snapshot.state.sessionId}|${snapshot.state.id}|1|${s.resultId}|${snapshot.firstRoundId}`);
  callbacks.current.onTerminalActive(false);
 },[snapshot,s,now,cursor,props.sessionEnded]);
 const viewer=props.players.find(p=>p.user_id===props.userId),state=snapshot?.state;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>
  :props.activeTab==='history'?<div className="h-full overflow-auto text-sm">{state?.seats.map(seat=><p key={seat.id}>{props.players.find(p=>p.id===seat.id)?.profiles?.username??'Player'}: {state.totals[seat.id]} · {state.hand?.players[seat.id].melds.map(m=>`${m.rank} × ${m.cards.length}`).join(' · ')}</p>)}</div>
  :props.activeTab!=='cards'?<div className="h-full overflow-auto text-sm">Classic two-player Canasta · Draw two, discard one. Two canastas to go out. Reach 5,000; tied qualifying totals continue. One accepted match stake. {state?turnBudget(state)/1000:120} seconds per turn · {state?.config?.mode??'expert'} pacing. No action resets. {help.error}</div>
  :props.sessionEnded?null:s?<div className="text-center text-sm">{`${props.players.find(p=>p.id===s.winner)?.profiles?.username??'Winner'} wins · ${s.scores[s.winner]} points`}</div>:undefined;
 return <>
  <CanastaArtifacts snapshot={snapshot} players={props.players} ended={props.sessionEnded}/>
  <CanastaGame helpers={help.helpers} onHelpersChange={value=>void help.setHelpers(value)} transport={transport} onSnapshot={observe} ended={props.sessionEnded} panel={panel} identity={viewer?<CanonicalPlayerIdentityRow playerId={viewer.id} name={viewer.profiles?.username??'You'} chips={viewer.chips} active={!props.sessionEnded&&state?.hand?.active===viewer.id}/>:null}/>
 </>;
}
