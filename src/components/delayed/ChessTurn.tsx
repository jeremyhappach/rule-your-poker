import {useCallback,useEffect,useMemo,useState} from 'react';
import {Link,Navigate,useNavigate} from 'react-router-dom';
import {ChevronLeft} from 'lucide-react';
import {useChess} from '@/hooks/useChess';
import {acceptChessSnapshot,chessTransport,type ChessSnapshot,type ChessTransport} from '@/lib/chess/client';
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
  void transport.load().then(v=>{acceptChessSnapshot(null,v,childId);if(v.identity.sessionId!==matchId||v.viewerId!==userId)throw Error('Match identity mismatch.');if(!cancelled)setEntry(v);}).catch(e=>{if(!cancelled)setError((e as Error).message);});
  return()=>{cancelled=true;};
 },[transport,childId,matchId,userId,attempt]);
 if(!entry||entry.identity.dealerGameId!==childId||entry.identity.sessionId!==matchId||entry.viewerId!==userId)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role="status">{error||'Restoring Chess…'}</p>{error&&<button onClick={()=>setAttempt(n=>n+1)}>Retry</button>}</main>;
 if(entry.finished||entry.phase==='complete'||entry.players[entry.turnIndex].id!==userId)return <Navigate replace to={'/delayed/'+matchId+(entry.finished?'?review='+childId:'')}/>;
 return <ActiveChessTurn key={childId+':'+userId} {...props} entry={entry} transport={transport}/>;
}
function ActiveChessTurn({childId,matchId,userId,entry,transport}:Props&{entry:ChessSnapshot;transport:ChessTransport}){
 const game=useChess(childId,userId,transport,'ptown:async-chess:1'),[tab,setTab]=useState<ShellTabId>('cards');
 const v=game.snapshot;
 const leftTurn=!!v&&(v.turn!==entry.turn||v.phase==='complete'||v.finished||v.players[v.turnIndex].id!==userId);
 useEffect(()=>{if(!leftTurn&&v?.identity.sessionId===matchId&&v.canAct&&!v.opened&&!v.paused&&game.connected&&!game.pending)void game.act({type:'open'});},[leftTurn,v?.revision,v?.opened,game.connected,game.pending,matchId]);
 if(v&&v.identity.sessionId!==matchId)return <p role="alert">Match identity mismatch.</p>;
 // Guard rendering too: never paint a later opponent move while navigation commits.
 if(leftTurn)return <SubmittedChessTurn snapshot={v!} entry={entry} matchId={matchId} childId={childId}/>;
 return <div className="async-words-turn"><ChessView {...game} view={v} activeTab={tab} setActiveTab={setTab} onIntent={game.act} onReconnect={game.reconnect} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" title="Match Home" to={'/delayed/'+matchId}><ChevronLeft size={20} aria-hidden="true"/></Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{v?.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}

// Freeze the accepted own move until its actual animation completes. Later
// subscription snapshots never enter this presentation or become a new turn.
function SubmittedChessTurn({snapshot,entry,matchId,childId}:{snapshot:ChessSnapshot;entry:ChessSnapshot;matchId:string;childId:string}){
 const [view]=useState(snapshot),[tab,setTab]=useState<ShellTabId>('cards'),navigate=useNavigate();
 const home='/delayed/'+matchId+(view.finished?'?review='+childId:'');
 const complete=useCallback(()=>navigate(home,{replace:true}),[home,navigate]);
 const move=view.moves.at(-1),ownColor=entry.players[0].id===entry.viewerId?'w':'b';
 if(view.turn!==entry.turn+1||view.moves.length!==entry.moves.length+1||move?.color!==ownColor)return <Navigate replace to={home}/>;
 return <div className="async-words-turn"><ChessView view={{...view,canAct:false}} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} onIntent={async()=>false} onReconnect={()=>{}} onMovePresentationComplete={complete} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" title="Match Home" to={home}><ChevronLeft size={20} aria-hidden="true"/></Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{view.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}
