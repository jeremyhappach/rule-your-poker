import type {ReactNode} from 'react';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {CountdownDots} from '@/components/ui/CountdownDots';
import {GameBackground} from '@/components/GameBackground';
import type {ChessSnapshot} from '@/lib/chess/client';
import type {ChessIntent} from '@/lib/chess/rules';
import {ChessBoard} from './ChessBoard';
export function ChessView({view:v,now,pending,connected,error,activeTab,setActiveTab,panel,onIntent,onReconnect,sessionEnded=false,navigation,balance}:{view:ChessSnapshot|null;now:number;pending:boolean;connected:boolean;error:string;activeTab:ShellTabId;setActiveTab:(t:ShellTabId)=>void;panel:ReactNode;onIntent:(i:ChessIntent)=>Promise<boolean>;onReconnect:()=>unknown;sessionEnded?:boolean;navigation?:ReactNode;balance?:(id:string)=>ReactNode}){
 const active=v?.canAct&&now<v.deadline&&connected&&!pending&&!v.paused&&!sessionEnded;
 return <div className="chess-viewport"><GameBackground id={v?.backgroundId}/><FullscreenGameShell className="chess-shell" title="P-Town Chess" description="" activeTab={activeTab} setActiveTab={setActiveTab} panel={panel} navigation={navigation} sessionEnded={sessionEnded} ready={!!v}
 scores={v&&<div className="chess-status">{v.players.map((p,i)=><span key={p.id} data-turn={v.phase==='playing'&&v.turnIndex===i}>{p.name}{balance?.(p.id)}</span>)}{v.phase==='complete'&&!sessionEnded&&<strong>{v.winnerIds.length===2?'Draw':v.players.find(p=>p.id===v.winnerIds[0])?.name+' wins'}</strong>}</div>}
 timer={v&&v.phase==='playing'&&v.opened&&!sessionEnded&&<div role="timer" aria-label="Turn time remaining"><CountdownDots remaining={Math.max(0,v.deadline-(v.paused?v.pausedAt??now:now))} duration={v.clockDuration}/></div>}
 actions={!sessionEnded&&<>{v&&!v.opened&&active?<button disabled={pending} onClick={()=>void onIntent({type:'open'})}>Open turn</button>:v?.phase==='playing'&&<div className="chess-banks">{[0,1].map(slot=><button key={slot} aria-label={`Use time bank ${slot+1}`} disabled={!active||!v.opened||v.banks[v.viewerId]?.includes(slot)} onClick={()=>void onIntent({type:'bank',slot})}>+3</button>)}</div>}{(!connected||error)&&<button aria-label={error||'Reconnect'} onClick={()=>void onReconnect()}>Reconnect</button>}</>}
 >{v&&sessionEnded&&<div className="chess-terminal" role="status">{v.winnerIds.length===2?'Draw':v.players.find(p=>p.id===v.winnerIds[0])?.name+' wins'}</div>}{v&&!sessionEnded&&<ChessBoard key={v.identity.dealerGameId+':'+v.viewerId} view={{...v,canAct:!!active}} pending={pending} onIntent={onIntent}/>}</FullscreenGameShell></div>;
}
