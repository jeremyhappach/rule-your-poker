import type {ReactNode} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {GameBackground} from '@/components/GameBackground';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ChessIntent} from '@/lib/chess/rules';
import {chessResultText} from '@/lib/chess/result';
import {ChessForfeitControl} from './ChessForfeitControl';
import {ChessPauseControl} from './ChessPauseControl';
import {ChessBoard} from './ChessBoard';
import {ChessPlayers} from './ChessPlayers';
import {ChessFinalPosition} from './ChessHistory';
export function ChessView({view:v,now,pending,connected,error,activeTab,setActiveTab,panel,onIntent,onReconnect,sessionEnded=false,navigation,balance,onMovePresentationComplete,returningToLobby=false,announceOpponentMove=false,onContinue,reviewReady=false,readOnly=false,allowForfeit=!readOnly,onPause,pausePending=false}:{onPause?:()=>unknown;pausePending?:boolean;view:ChessSnapshot|null;now:number;pending:boolean;connected:boolean;error:string;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;panel:ReactNode;onIntent:(i:ChessIntent,expectedRevision?:number)=>Promise<boolean>;onReconnect:()=>unknown;sessionEnded?:boolean;navigation?:ReactNode;balance?:(id:string)=>ReactNode;onMovePresentationComplete?:()=>void;returningToLobby?:boolean;announceOpponentMove?:boolean;onContinue?:()=>void;reviewReady?:boolean;readOnly?:boolean;allowForfeit?:boolean}){
 const active=!readOnly&&v?.canAct&&now<v.deadline&&connected&&!pending&&!v.paused&&!sessionEnded&&!returningToLobby;
 const players=v&&<ChessPlayers view={v} balance={balance}/>;
 return <div className="chess-viewport"><GameBackground id={v?.backgroundId}/><FullscreenGameShell className={'chess-shell'+(navigation?' chess-match-header':'')} title="P-Town Chess" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={activeTab==='history'&&v?.phase==='complete'?<ChessFinalPosition view={v}/>:panel} panelDescription={activeTab==='history'&&v?.phase==='complete'?'Completed game · saved final position':undefined} navigation={navigation} sessionEnded={sessionEnded} ready={!!v}
 scores={readOnly&&v?.phase==='playing'?<strong role="status">Opponent's Turn — View Only · {v.players[v.turnIndex].name}</strong>:v?.phase==='complete'&&!sessionEnded&&(onContinue||!v.terminal||now>=v.terminal.startedAt)&&<strong>{chessResultText(v)}</strong>}
 timer={v&&v.phase==='playing'&&v.opened&&!sessionEnded&&<div className="chess-clock" role="timer" aria-label={v.players[v.turnIndex].name+"'s turn time remaining"}><CountdownDots remaining={Math.max(0,v.deadline-(v.paused?v.pausedAt??now:now))} duration={v.clockDuration}/></div>}
 actions={!sessionEnded&&<>{v&&allowForfeit&&!returningToLobby&&<ChessForfeitControl key={v.identity.dealerGameId+':'+v.viewerId} view={v} pending={pending} connected={connected} onIntent={onIntent}/>}{v&&!readOnly&&<ChessPauseControl view={v} pending={pending||pausePending} connected={connected} onPause={onPause} onIntent={onIntent}/>}{onContinue&&reviewReady&&<div className="chess-continue"><small>Take your time. The final board is saved in History.</small><button onClick={onContinue}>Continue</button></div>}{v&&!v.opened&&active?<button disabled={pending} onClick={()=>void onIntent({type:'open'})}>Open turn</button>:v?.phase==='playing'&&<div className="chess-banks">{[0,1].map(slot=><button key={slot} aria-label={`Use time bank ${slot+1}, add 3 minutes`} disabled={!active||!v.opened||v.banks[v.viewerId]?.includes(slot)} onClick={()=>void onIntent({type:'bank',slot})}>+3m</button>)}</div>}{(!connected||error)&&<button aria-label={error||'Reconnect'} onClick={()=>void onReconnect()}>Reconnect</button>}</>}
 >{v?.paused&&<div role="status">Paused</div>}{v&&sessionEnded&&<div className="chess-terminal" role="status">{chessResultText(v)}</div>}{v&&!sessionEnded&&<ChessBoard key={v.identity.dealerGameId+':'+v.viewerId} view={{...v,canAct:!!active}} now={now} pending={pending} onIntent={onIntent} players={players} onMovePresentationComplete={onMovePresentationComplete} returningToLobby={returningToLobby} announceOpponentMove={announceOpponentMove} readOnly={readOnly}/>}</FullscreenGameShell></div>;
}
