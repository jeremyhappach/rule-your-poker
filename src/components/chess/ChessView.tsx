import type {ReactNode} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {GameBackground} from '@/components/GameBackground';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ChessIntent} from '@/lib/chess/rules';
import {ChessBoard} from './ChessBoard';
export function ChessView({view:v,now,pending,connected,error,activeTab,setActiveTab,panel,onIntent,onReconnect,sessionEnded=false,navigation,balance,onMovePresentationComplete,returningToLobby=false}:{view:ChessSnapshot|null;now:number;pending:boolean;connected:boolean;error:string;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;panel:ReactNode;onIntent:(i:ChessIntent)=>Promise<boolean>;onReconnect:()=>unknown;sessionEnded?:boolean;navigation?:ReactNode;balance?:(id:string)=>ReactNode;onMovePresentationComplete?:()=>void;returningToLobby?:boolean}){
 const active=v?.canAct&&now<v.deadline&&connected&&!pending&&!v.paused&&!sessionEnded&&!returningToLobby;
 const players=v&&<div className="chess-players">{[...v.players].sort((a,b)=>Number(b.id===v.viewerId)-Number(a.id===v.viewerId)).map(p=>{const i=v.players.findIndex(player=>player.id===p.id),color=i===0?'White':'Black';return <div key={p.id} className="chess-player" data-color={color.toLowerCase()} data-active={v.phase==='playing'&&v.turnIndex===i} aria-label={p.name+', '+color+(v.turnIndex===i?', to move':'')}><span>{p.name}</span>{balance?.(p.id)}</div>;})}</div>;
 return <div className="chess-viewport"><GameBackground id={v?.backgroundId}/><FullscreenGameShell className={'chess-shell'+(navigation?' chess-match-header':'')} title="P-Town Chess" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} navigation={navigation} sessionEnded={sessionEnded} ready={!!v}
 scores={v?.phase==='complete'&&!sessionEnded&&<strong>{v.winnerIds.length===2?'Draw':v.players.find(p=>p.id===v.winnerIds[0])?.name+' wins'}</strong>}
 timer={v&&v.phase==='playing'&&v.opened&&!sessionEnded&&<div className="chess-clock" role="timer" aria-label={v.players[v.turnIndex].name+"'s turn time remaining"}><CountdownDots remaining={Math.max(0,v.deadline-(v.paused?v.pausedAt??now:now))} duration={v.clockDuration}/></div>}
 actions={!sessionEnded&&<>{v&&!v.opened&&active?<button disabled={pending} onClick={()=>void onIntent({type:'open'})}>Open turn</button>:v?.phase==='playing'&&<div className="chess-banks">{[0,1].map(slot=><button key={slot} aria-label={`Use time bank ${slot+1}, add 3 minutes`} disabled={!active||!v.opened||v.banks[v.viewerId]?.includes(slot)} onClick={()=>void onIntent({type:'bank',slot})}>+3m</button>)}</div>}{(!connected||error)&&<button aria-label={error||'Reconnect'} onClick={()=>void onReconnect()}>Reconnect</button>}</>}
 >{v&&sessionEnded&&<div className="chess-terminal" role="status">{v.winnerIds.length===2?'Draw':v.players.find(p=>p.id===v.winnerIds[0])?.name+' wins'}</div>}{v&&!sessionEnded&&<ChessBoard key={v.identity.dealerGameId+':'+v.viewerId} view={{...v,canAct:!!active}} pending={pending} onIntent={onIntent} players={players} onMovePresentationComplete={onMovePresentationComplete} returningToLobby={returningToLobby}/>}</FullscreenGameShell></div>;
}
