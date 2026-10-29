import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import '@/lib/delayed/delayed.css';

/** Presentation-only loading/intro in the existing shell; never starts gameplay. */
export function AsyncTurnStage({matchId,title,children}:{matchId?:string;title?:string;children?:ReactNode}){
 return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Async match" description="" activeTab="cards" setActiveTab={()=>{}} announcement={false} navigation={matchId?<Link to={'/delayed/'+matchId}>Match home</Link>:undefined} panel={null}>
  <div className="async-winner-overlay" role="status">{title&&<strong>{title}</strong>}{children}</div>
 </FullscreenGameShell></div>;
}
