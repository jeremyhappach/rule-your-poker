import {NavLink} from 'react-router-dom';
import bridge from '@/assets/peoria-bridge-mobile.jpg';
import {useAsyncActionCount} from '@/components/delayed/NotificationBell';
import './midnight.css';
export type LobbyMode='multiplayer'|'async'|'arcade';
export function LobbyBanner({disabled=false}:{disabled?:boolean}){
  const count=useAsyncActionCount();
  return <section className="midnight-banner" aria-label="Peoria Poker League"><img src={bridge} alt="I-74 Bridge, Peoria Illinois"/><div className="midnight-brand"><span aria-hidden="true">♠</span><h1>Peoria Poker League</h1></div><nav className="midnight-mode-tabs" aria-label="Game modes">{[{path:'/',label:'Multiplayer'},{path:'/delayed',label:`Async${count>0?' ('+count+')':''}`},{path:'/arcade',label:'Arcade'}].map(tab=><NavLink key={tab.path} end to={tab.path} aria-disabled={disabled||undefined} onClick={e=>{if(disabled)e.preventDefault();}}>{tab.label}</NavLink>)}</nav></section>;
}
