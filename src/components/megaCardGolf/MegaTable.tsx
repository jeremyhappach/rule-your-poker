import {usePresentationPlayerChipBalance} from '@/lib/canonicalShell/ChipTransportProvider';
import {useEffect,useRef,useState} from 'react';
import {useMegaMatch} from '@/hooks/useMegaMatch';
import {MegaCompetitionBoard} from './MegaCompetitionBoard';
import {MegaCompetitionScorecard} from './MegaCompetitionScorecard';
import {useMegaFinancial} from './useMegaFinancial';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {useGameChatContext} from '@/hooks/GameChatContext';
import {MobileChatPanel} from '@/components/MobileChatPanel';
import {useAnnouncements} from '@/lib/canonicalShell/announcements';
import {formatGolfScore} from '@/lib/megaCardGolf/presentation';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
interface Props {dealerGameId:string;userId:string;activeTab:ShellTabId;setActiveTab:(tab:ShellTabId)=>void;liveEntry?:boolean;sessionEnded:boolean;onTerminalActive:(active:boolean)=>void;onTerminalComplete:(id:string)=>void}
function Balance({id,seat,chips}:{id:string;seat:number;chips:number}){const shown=usePresentationPlayerChipBalance(id,chips);return <small data-chip-center={seat} data-chip-reaction-target={seat}>{shown} chips</small>;}
export function MegaTable(props:Props){
 const game=useMegaMatch(props.dealerGameId,props.userId),v=game.snapshot,chat=useGameChatContext(),announcements=useAnnouncements();
 const announced=useRef('');
 const [presented,setPresented]=useState(false),done=useRef(false),seen=useRef(false),callbacks=useRef(props);callbacks.current=props;
 const ready=useMegaFinancial(v,presented,props.sessionEnded,props.dealerGameId);
 useEffect(()=>{setPresented(false);done.current=false;seen.current=false;},[props.dealerGameId]);
 useEffect(()=>{setPresented(false);},[v?.scope]);
 useEffect(()=>{if(v&&!v.settled)seen.current=true;if(v?.settled)callbacks.current.onTerminalActive(true);},[v?.settled]);
 useEffect(()=>{
  if(!v?.settled||!presented||v.paused)return;
  if(announced.current!==v.financial.resultId){announced.current=v.financial.resultId;announcements.emit({id:'mega-win:'+v.financial.resultId,type:'match_win',scope:{dealerGameId:v.identity.sessionId,roundId:v.identity.roundId},payload:{text:v.players.filter(p=>v.terminal?.winnerIds.includes(p.id)).map(p=>p.name).join(' & ')+' win with '+formatGolfScore(v.terminal?.score)},ttlMs:3000});}
  celebrateCanonicalWinner(v.financial.resultId,v.viewerId??'',v.terminal?.winnerIds??[],seen.current);
 },[v,presented,announcements]);
 useEffect(()=>{
  if(!v?.settled||!presented||!ready||v.paused||game.now<(v.terminal?.deadline??0)||done.current||!v.finished)return;
  done.current=true;callbacks.current.onTerminalComplete(`mega-card-golf|winseq|${v.identity.sessionId}|${v.id}|1|${v.financial.resultId}|${v.identity.roundId}`);callbacks.current.onTerminalActive(false);
 },[v,presented,ready,game.now]);
 const panel=props.activeTab==='chat'?<MobileChatPanel messages={chat.allMessages} onSend={chat.sendMessage} isSending={chat.isSending} currentUserId={props.userId}/>:props.activeTab==='history'?<div>{v?.results.map(r=><p key={r.actor+':'+r.hole}>{v.players.find(p=>p.id===r.actor)?.name} · Hole {r.hole} · {formatGolfScore(r.score)}</p>)}</div>:<p>Mega Card Golf · Lowest signed total wins. Course and hole count are frozen for this game.</p>;
 if(!v?.board||props.sessionEnded)return <FullscreenGameShell gameplay={false} title="Mega Card Golf" description="" activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={panel} announcement={false}>{!props.sessionEnded&&<p>{game.error||'Preparing the course…'}{game.error&&<button onClick={()=>void game.reconnect()}>Reconnect</button>}</p>}</FullscreenGameShell>;
 return <><MegaCompetitionBoard view={v.board} userId={props.userId} paused={v.paused} now={v.paused?v.pausedAt!:game.now} canAct={v.canAct&&game.connected&&!game.error} pending={game.pending} onIntent={game.act} playerName={board=>v.players.find(p=>p.id===board.id.split(':').at(-1))?.name??''} onPresentationDone={()=>setPresented(true)} activeTab={props.activeTab} setActiveTab={props.setActiveTab} panel={panel}
  scorecard={frame=><MegaCompetitionScorecard course={v.rules.course.name} holes={v.rules.course.holes} hole={v.hole} players={v.players} balance={id=>{const p=v.players.find(p=>p.id===id)!;return <Balance id={p.id} seat={p.seat} chips={p.chips}/>;}} results={v.results.filter(r=>r.at<=frame.view.serverAt&&(r.hole<frame.view.hole||r.hole===frame.view.hole&&(r.actor!==frame.view.id.split(':').at(-1)||frame.scoring?.finished)))} write={frame.scoring?.finished?{actor:frame.view.id.split(':').at(-1)!,hole:frame.view.hole}:undefined}/>} />
  {game.error&&<p role="alert">{game.error}<button onClick={()=>void game.reconnect()}>Reconnect</button></p>}{v.paused&&<p role="status">Game paused</p>}</>;
}
