import {useCallback,useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronLeft} from 'lucide-react';
import type {ChessSnapshot} from '@/lib/chess/client';
import {ChessView} from './ChessView';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
export function ChessFinalReview({view,matchId,onContinue}:{view:ChessSnapshot;matchId:string;onContinue:()=>void}){
 const [tab,setTab]=useState<ShellTabId>('cards'),[ready,setReady]=useState(view.reason!=='checkmate'),complete=useCallback(()=>setReady(true),[]);
 return <div className="async-words-turn"><ChessView readOnly={view.reason!=='checkmate'} view={{...view,canAct:false}} now={view.serverAt} pending={false} connected error="" activeTab={tab} setActiveTab={setTab} panel={null} onIntent={async()=>false} onReconnect={()=>{}} announceOpponentMove onMovePresentationComplete={complete} onContinue={onContinue} reviewReady={ready} navigation={<nav aria-label="Chess information"><Link aria-label="Match Home" to={'/delayed/'+matchId}><ChevronLeft size={20}/></Link><button onClick={()=>setTab('history')}>History</button></nav>}/></div>;
}
