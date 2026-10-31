import {useCompletionRetry} from '@/hooks/useCompletionRetry';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {usePtownWords} from '@/hooks/usePtownWords';
import {wordsTransport,wordsRpc} from '@/lib/ptownWords/client';
import {PtownWordsView,PtownWordsRulesLabel} from './PtownWordsView';
import PtownWordsRules from '@/components/rules/PtownWordsRules';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {usePresentationPlayerChipBalance,useChipPresentationCursorState,useChipTransferPresentationAdmission} from '@/lib/canonicalShell/ChipTransportProvider';
import type {ChipPresentationBatch} from '@/lib/canonicalShell/ChipPresentationLedger';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {WordsSnapshot} from '@/lib/ptownWords/model';
import {playedWord,wordPresentation} from '@/lib/ptownWords/presentation';
import {useWordRevealTimeline} from '@/lib/ptownWords/useWordRevealTimeline';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
export function isWordsTerminalBatch(b:ChipPresentationBatch,v:WordsSnapshot){
 if(!v.settlement||!v.financial.resultId||b.id!==v.financial.batch?.id||b.game_id!==v.identity.sessionId||b.dealer_game_id!==v.identity.dealerGameId)return false;
 const delta:Record<string,number>={};for(const t of b.transfers){if(t.from.kind!=='player'||t.to.kind!=='player'||!t.from.playerId||!t.to.playerId||!(t.amount>0))return false;delta[t.from.playerId]=(delta[t.from.playerId]??0)-t.amount;delta[t.to.playerId]=(delta[t.to.playerId]??0)+t.amount;}
 return Object.keys(delta).every(id=>v.players.some(p=>p.id===id))&&v.players.every(p=>(delta[p.id]??0)===(v.settlement![p.id]??0));
}
function Balance({id,fallback,seat}:{id:string;fallback:number;seat:number}){const chips=usePresentationPlayerChipBalance(id,fallback);return <small data-chip-center={seat} data-chip-reaction-target={seat}>{chips} chips</small>;}
export function PtownWordsTable(props:Props){
 const transport=useMemo(()=>wordsTransport(props.dealerGameId),[props.dealerGameId]),game=usePtownWords(props.dealerGameId,props.userId,transport),revealed=useWordRevealTimeline(game.snapshot,game.now),v=revealed?.identity.dealerGameId===props.dealerGameId?revealed:null;
 const chat=useGameChatContext(),announcements=useAnnouncements(),[error,setError]=useState(''),[pausePending,setPausePending]=useState(false);
 const closing=useCompletionRetry(props.dealerGameId+':'+props.userId),terminal=useRef(false),winAnnounced=useRef(false),complete=useRef(false),sawLive=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const presentation=v?wordPresentation(v,game.now):null;
 const request=v&&!v.paused&&!v.finished&&v.phase==='playing'?v.pauseRequest:null;
 const emitNotice=announcements.emit,clearAmbient=announcements.clearAmbient;
 useEffect(()=>{terminal.current=false;winAnnounced.current=false;complete.current=false;sawLive.current=!!v&&!v.settlement;setError('');},[props.dealerGameId,props.userId]);
 useEffect(()=>{
  if(!v||!request)return;
  const name=v.players.find(p=>p.id===request.playerId)?.name??'Player';
  emitNotice({id:`words:pause-request:${request.id}`,type:'gameplay_notice',behavior:'ambient',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{title:`${name} is requesting a pause`}});
  return()=>clearAmbient('gameplay_notice');
 },[request?.id,emitNotice,clearAmbient]);
 const togglePause=async()=>{
  if(!v||pausePending||v.hostUserId!==props.userId)return;setPausePending(true);setError('');
  try{const result=await wordsRpc<{outcome:string}>('set_game_paused',{p_game_id:v.identity.sessionId,p_paused:!v.paused,p_expected_dealer_game_id:v.identity.dealerGameId,p_expected_pause_version:v.pauseVersion});if(!['paused','resumed','already_set'].includes(result.outcome))throw Error(`Pause unavailable: ${result.outcome}`);}
  catch(e){setError((e as Error).message);}finally{await game.reconnect();setPausePending(false);}
 };
 if(v&&!v.settlement)sawLive.current=true;
 const narrated=useRef<number|null>(null);
 const retireNotice=announcements.retireTransientScope;
 useEffect(()=>{const scope=`words:reveal:${props.dealerGameId}`;if(!presentation)retireNotice(scope);return()=>retireNotice(scope);},[presentation?.id,props.dealerGameId,retireNotice]);
 useEffect(()=>{
  if(!v||props.sessionEnded)return;
  if(v.movePresentation){narrated.current=v.turn;if(!presentation?.opponent||v.paused||presentation.at<presentation.announceAt||presentation.at>=presentation.announceAt+presentation.noticeMs)return;
   const key=`ptown:words:narrated:${v.identity.dealerGameId}:${v.viewerId}`;if(Number(sessionStorage.getItem(key))>=presentation.turn)return;
   sessionStorage.setItem(key,String(presentation.turn));
   announcements.emit({id:`words:move:${presentation.id}`,type:'gameplay_notice',transientScope:`words:reveal:${props.dealerGameId}`,scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{title:`${v.players.find(p=>p.id===presentation.playerId)?.name??'Player'} played ${playedWord(v)?.word??v.event.label} +${presentation.move.points}`},ttlMs:presentation.announceAt+presentation.noticeMs-presentation.at});return;
  }
  if(narrated.current===null){narrated.current=v.turn;return;}if(narrated.current===v.turn)return;narrated.current=v.turn;const move=v.moves[v.moves.length-1];if(!move||v.phase==='complete')return;announcements.emit({id:`words:move:${v.identity.dealerGameId}:${move.turn}`,type:'gameplay_notice',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{title:`${v.players.find(p=>p.id===move.playerId)?.name} · ${v.event.label}${move.action==='place'?` · ${move.points}`:''}`},ttlMs:3500});
 },[v,announcements,props.sessionEnded,game.now]);
 const batch=v?.financial.batch,valid=!!batch&&!!v&&isWordsTerminalBatch(batch,v);
 const admit=useCallback((b:ChipPresentationBatch)=>b.dealer_game_id!==v?.identity.dealerGameId||!!v&&!presentation&&!props.sessionEnded&&isWordsTerminalBatch(b,v),[v,!!presentation,props.sessionEnded]);useChipTransferPresentationAdmission(admit);
 const cursor=useChipPresentationCursorState(valid?batch.cursor:null),ready=!!v?.settlement&&(v.players.every(p=>(v.settlement![p.id]??0)===0)||valid&&['settled','reconciled'].includes(cursor));
 useEffect(()=>{if(v?.settlement&&!props.sessionEnded&&!terminal.current){terminal.current=true;callbacks.current.onTerminalActive(true);}},[v?.settlement,props.sessionEnded]);
 useEffect(()=>{if(!v?.settlement||presentation||props.sessionEnded||winAnnounced.current)return;winAnnounced.current=true;
  if(v.terminal&&game.now<v.terminal.deadline){const names=v.players.filter(p=>v.terminal!.winnerIds.includes(p.id)).map(p=>p.name);announcements.emit({id:`match_win:ptown-words:${v.terminal.resultId}`,type:'match_win',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{text:`${names.join(' & ')} ${names.length===1?'wins':'tie'} with ${v.terminal.score}`},ttlMs:Math.max(1,v.terminal.deadline-game.now)});celebrateCanonicalWinner(v.terminal.resultId,v.viewerId,v.terminal.winnerIds,sawLive.current&&(v.settlement[v.viewerId]??0)>0);}
 },[v,!!presentation,props.sessionEnded,announcements,game.now]);
 useEffect(()=>{
  if(v?.paused)return;if(!v?.settlement||!ready||props.sessionEnded||complete.current||game.now<(v.terminal?.deadline??0))return;
  if(v.finished){complete.current=true;callbacks.current.onTerminalComplete(`ptown-words|winseq|${v.identity.sessionId}|${v.identity.dealerGameId}|1|${v.financial.resultId}|${v.identity.roundId}`);callbacks.current.onTerminalActive(false);return;}
  const receipt=closing.begin();if(!receipt)return;void wordsRpc('ptown_words_close',{p_dealer_game_id:v.identity.dealerGameId}).then(()=>receipt.succeed(()=>{setError('');void game.reconnect();})).catch(e=>receipt.fail(()=>setError((e as Error).message)));
 },[v,ready,props.sessionEnded,game.now,closing.revision]);
 if(!v)return <FullscreenGameShell className="words-shell" title="Ptown Words" description="" activeTab={props.activeTab} setActiveTab={props.setActiveTab} sessionLabel={<PtownWordsRulesLabel/>} panelTitle={props.activeTab==='lobby'?'Rules':undefined} panel={<PtownWordsRules version={v?.rules.version}/>} ready={false}><div role="status">{game.error||'Loading game…'}<button onClick={()=>void game.reconnect()}>Reconnect</button></div></FullscreenGameShell>;
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v.moves.map(m=><p key={m.turn}>{v.players.find(p=>p.id===m.playerId)?.name} · {m.action==='place'?m.words.map(w=>w.word).join(', '):m.action==='exchange'?`Exchanged ${m.count}`:'Passed'} · {m.points}</p>)}</div>:<PtownWordsRules version={v?.rules.version}/>;
 return <PtownWordsView onPause={()=>void togglePause()} pausePending={pausePending} view={v} now={game.now} pending={game.pending} connected={game.connected} error={error||game.error} errorVersion={game.errorVersion} activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={panel} sessionEnded={props.sessionEnded} onIntent={game.act} onReconnect={()=>{closing.reset();setError('');void game.reconnect();}} balance={id=>{const p=v.players.find(p=>p.id===id)!;return <Balance id={id} seat={p.seat} fallback={v.financial.balances[id]??0}/>;}}/>;
}
