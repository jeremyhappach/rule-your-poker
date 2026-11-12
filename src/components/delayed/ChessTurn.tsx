import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {useChess} from '@/hooks/useChess';
import {chessTransport} from '@/lib/chess/client';
import {ChessView} from '@/components/chess/ChessView';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
export function ChessTurn({childId,matchId,userId}:{childId:string;matchId:string;userId:string}){
 const transport=useMemo(()=>chessTransport(childId,userId,'async'),[childId,userId]),game=useChess(childId,userId,transport,'ptown:async-chess:1'),[tab,setTab]=useState<ShellTabId>('cards');
 const v=game.snapshot;
 useEffect(()=>{if(v?.identity.sessionId===matchId&&v.canAct&&!v.opened&&!v.paused&&game.connected&&!game.pending)void game.act({type:'open'});},[v?.revision,v?.opened,game.connected,game.pending,matchId]);
 if(v&&v.identity.sessionId!==matchId)return <p role="alert">Match identity mismatch.</p>;
 return <div className="async-words-turn"><ChessView {...game} view={v} activeTab={tab} setActiveTab={setTab} onIntent={game.act} onReconnect={game.reconnect} navigation={<nav><Link to={'/delayed/'+matchId+(v?.finished?'?review='+childId:'')}>Match Home</Link><button onClick={()=>setTab('history')}>History</button></nav>} panel={<>{v?.moves.map(m=><p key={m.ply}>{m.from} → {m.to}</p>)}</>}/></div>;
}
