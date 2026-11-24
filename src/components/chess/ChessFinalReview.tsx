import {useCallback,useEffect,useRef,useState} from 'react';
import {usePlayback} from '@/lib/delayed/usePlayback';
import {CHESS_FORFEIT_ANNOUNCE_MS,CHESS_FORFEIT_SETTLEMENT_MS} from '@/lib/chess/forfeitPresentation';
import {chessResultText} from '@/lib/chess/result';
import {Link} from 'react-router-dom';
import {ChevronLeft} from 'lucide-react';
import type {ChessSnapshot} from '@/lib/chess/client';
import {ChessView} from './ChessView';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
export function ChessFinalReview({view,matchId,onContinue}:{view:ChessSnapshot;matchId:string;onContinue:()=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards'),[ready,setReady]=useState(view.reason!=='checkmate'),complete=useCallback(()=>setReady(true),[]);
 const forfeit=view.reason==='resignation',automatic=forfeit||view.reason==='timeout',identity=view.identity.dealerGameId+':'+view.viewerId+':'+view.turn+':'+view.fen;
 const playback=usePlayback(automatic?CHESS_FORFEIT_SETTLEMENT_MS:0,identity),continued=useRef<string|null>(null);
 useEffect(()=>{if(automatic&&playback.done&&tab==='cards'&&continued.current!==identity){continued.current=identity;onContinue();}},[automatic,playback.done,tab,identity,onContinue]);
 const announcement=forfeit&&playback.elapsed>=CHESS_FORFEIT_ANNOUNCE_MS?<div className="chess-forfeit-announcement" role="status"><small>FORFEIT</small><strong>{chessResultText(view)}</strong></div>:forfeit?false:undefined;
 return <div className="async-words-turn"><ChessView readOnly={view.reason!=='checkmate'} view={{...view,canAct:false}} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={null} onIntent={async()=>false} onReconnect={()=>{}} announceOpponentMove onMovePresentationComplete={complete} onContinue={automatic?undefined:onContinue} reviewReady={ready} forfeitElapsed={forfeit?playback.elapsed:null} announcement={announcement} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" to={'/delayed/'+matchId}><ChevronLeft size={20}/></Link><button onClick={()=>setTab('history')}>History</button></nav>}/></div>;
}
