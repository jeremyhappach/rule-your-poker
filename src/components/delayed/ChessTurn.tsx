import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {ChevronLeft} from 'lucide-react';
import {useChess} from '@/hooks/useChess';
import {useChessLobbyReturn} from '@/hooks/useChessLobbyReturn';
import {acceptChessSnapshot,chessTransport,inspectAsyncChess,type ChessSnapshot,type ChessTransport} from '@/lib/chess/client';
import {ChessFinalReview} from '@/components/chess/ChessFinalReview';
import {ChessView} from '@/components/chess/ChessView';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
type Props={childId:string;matchId:string;userId:string};
// Inspect ownership before mounting subscription/command recovery, as in Words.
// Each visit admits one authoritative turn; later turns require lobby entry.
export function ChessTurn(props:Props){
 const {childId,matchId,userId}=props;
 const transport=useMemo(()=>chessTransport(childId,userId,'async'),[childId,userId]);
 const [entry,setEntry]=useState<ChessSnapshot|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let cancelled=false;setEntry(null);setError('');
  void inspectAsyncChess(childId).then(v=>{acceptChessSnapshot(null,v,childId);if(v.identity.sessionId!==matchId||v.viewerId!==userId)throw Error('Match identity mismatch.');if(!cancelled)setEntry(v);}).catch(e=>{if(!cancelled)setError((e as Error).message);});
  return()=>{cancelled=true;};
 },[transport,childId,matchId,userId,attempt]);
 if(!entry||entry.identity.dealerGameId!==childId||entry.identity.sessionId!==matchId||entry.viewerId!==userId)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role="status">{error||'Restoring Chess…'}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>Retry</button>}</main>;
 if(entry.phase==='complete')return <FinishedChessTurn view={entry} matchId={matchId} childId={childId}/>;
 if(entry.finished)return <Navigate replace to={'/delayed/'+matchId+'?review='+childId}/>;
 if(entry.players[entry.turnIndex].id!==userId)return <ChessInspection view={entry} matchId={matchId}/>;
 return <ActiveChessTurn key={childId+':'+userId} {...props} entry={entry} transport={transport}/>;
}
function ChessInspection({view,matchId}:{view:ChessSnapshot;matchId:string}){
 const [tab,setTab]=useState<ShellTabId>('cards'),[forfeit,setForfeit]=useState<number|null>(null);
 if(forfeit!==null)return <ConfirmedInspectionForfeit entry={view} matchId={matchId} revision={forfeit}/>;
 return <div className="async-words-turn"><ChessView readOnly allowForfeit view={view} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} onIntent={async(intent,revision)=>{if(intent.type!=='resign'||revision!==view.revision)return false;setForfeit(revision);return true;}} onReconnect={()=>{}} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" title="Match Home" to={'/delayed/'+matchId}><ChevronLeft size={20} aria-hidden="true"/></Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{view.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}
function ActiveChessTurn({childId,matchId,userId,entry,transport}:Props&{entry:ChessSnapshot;transport:ChessTransport}){
 const game=useChess(childId,userId,transport,'ptown:async-chess:1'),[tab,setTab]=useState<ShellTabId>('cards');
 // Pending-command replay can briefly deliver an older receipt before its
 // follow-up read. Keep recovery mounted, but do not present or act on that receipt.
 const v=game.snapshot&&game.snapshot.revision>=entry.revision?game.snapshot:null;
 const leftTurn=!!v&&(v.turn!==entry.turn||v.phase==='complete'||v.finished||v.players[v.turnIndex].id!==userId);
 useEffect(()=>{if(!leftTurn&&v?.identity.sessionId===matchId&&v.canAct&&!v.opened&&!v.paused&&game.connected&&!game.pending)void game.act({type:'open'});},[leftTurn,v?.revision,v?.opened,game.connected,game.pending,matchId]);
 if(v&&v.identity.sessionId!==matchId)return <p role="alert">Match identity mismatch.</p>;
 // Guard rendering too: never paint a later opponent move while navigation commits.
 if(leftTurn)return <SubmittedChessTurn snapshot={v!} entry={entry} matchId={matchId} childId={childId}/>;
 return <div className="async-words-turn"><ChessView {...game} announceOpponentMove view={v} activeTab={tab} setActiveTab={setTab} onIntent={game.act} onReconnect={game.reconnect} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" title="Match Home" to={'/delayed/'+matchId}><ChevronLeft size={20} aria-hidden="true"/></Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{v?.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}

// Freeze the accepted own move through its animation and requested lobby hold. Later
// subscription snapshots never enter this presentation or become a new turn.
function SubmittedChessTurn({snapshot,entry,matchId,childId}:{snapshot:ChessSnapshot;entry:ChessSnapshot;matchId:string;childId:string}){
 const [view]=useState(snapshot),[tab,setTab]=useState<ShellTabId>('cards'),navigate=useNavigate();
 const home='/delayed/'+matchId+(view.finished?'?review='+childId:'');
 const goHome=useCallback(()=>navigate(home,{replace:true}),[home,navigate]);
 const {holding,complete}=useChessLobbyReturn(goHome);
 const move=view.moves.at(-1),ownColor=entry.players[0].id===entry.viewerId?'w':'b';
 if(view.phase==='complete')return <FinishedChessTurn view={view} matchId={matchId} childId={childId}/>;
 if(view.turn!==entry.turn+1||view.moves.length!==entry.moves.length+1||move?.color!==ownColor)return <Navigate replace to={home}/>;
 return <div className="async-words-turn"><ChessView allowForfeit={false} view={{...view,canAct:false}} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} onIntent={async()=>false} onReconnect={()=>{}} onMovePresentationComplete={complete} returningToLobby={holding} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" title="Match Home" to={home}><ChevronLeft size={20} aria-hidden="true"/></Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{view.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}

function FinishedChessTurn({view,matchId,childId}:{view:ChessSnapshot;matchId:string;childId:string}){const navigate=useNavigate(),go=useCallback(()=>navigate('/delayed/'+matchId+'?review='+childId+'&chess-reviewed=1',{replace:true}),[navigate,matchId,childId]);return <ChessFinalReview view={view} matchId={matchId} onContinue={go}/>;}

// Inspection stays read-only until the player explicitly confirms forfeiting.
// Only then mount the existing durable command owner; never auto-open a turn here.
function ConfirmedInspectionForfeit({entry,matchId,revision}:{entry:ChessSnapshot;matchId:string;revision:number}){
 const transport=useMemo(()=>chessTransport(entry.id,entry.viewerId,'async'),[entry.id,entry.viewerId]);
 const game=useChess(entry.id,entry.viewerId,transport,'ptown:async-chess:1'),submitted=useRef(false);
 const [tab,setTab]=useState<ShellTabId>('cards'),[changed,setChanged]=useState('');
 const v=game.snapshot;
 useEffect(()=>{
  if(submitted.current||!v||!game.connected||game.pending)return;
  submitted.current=true;
  if(v.revision!==revision){setChanged('The game changed. Review it before confirming again.');return;}
  void game.act({type:'resign'},revision);
 },[v?.revision,game.connected,game.pending,revision]);
 if(v?.phase==='complete')return <FinishedChessTurn view={v} matchId={matchId} childId={entry.id}/>;
 return <div className="async-words-turn"><ChessView {...game} readOnly allowForfeit view={v} activeTab={tab} setActiveTab={setTab} panel={null} error={game.error||changed} onIntent={async(intent,expected)=>intent.type==='resign'?game.act(intent,expected):false} onReconnect={game.reconnect} navigation={<Link to={'/delayed/'+matchId}>Match Home</Link>}/></div>;
}
