import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {NotificationBell} from '@/components/delayed/NotificationBell';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,Gamepad2,Info} from 'lucide-react';
import {useIsAdmin} from '@/hooks/useIsAdmin';
import {ArcadeTile} from './ArcadeTile';
import {loadArtwork,type Artwork,type ArcadeGame} from '@/lib/arcade/artwork';
import {ARCADE_GAMES} from '@/lib/gameCatalog';
import {visibleSections} from '@/lib/arcade/lobbyLayout';
import {useArcadeLobbyLayout} from '@/hooks/useArcadeLobbyLayout';
import '@/lib/arcade/arcade.css';
export function ArcadeSwitchboard({userId}:{userId:string}){
 const layout=useArcadeLobbyLayout(userId);
 const {isAdmin}=useIsAdmin(userId),[artwork,setArtwork]=useState<Artwork[]>([]),[error,setError]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(()=>{
  const ticket=++generation.current;
  void loadArtwork().then(rows=>{if(ticket===generation.current){setArtwork(rows);setError('');}}).catch(e=>{if(ticket===generation.current)setError(e.message);});
 },[]);
 useEffect(()=>{refresh();window.addEventListener('focus',refresh);return()=>{generation.current++;window.removeEventListener('focus',refresh);};},[refresh]);
 const updated=(row:Artwork)=>{generation.current++;setArtwork(rows=>rows.map(old=>old.game===row.game?row:old));};
 return <main className="arcade-page"><Link className="arcade-back" to="/"><ArrowLeft size={18}/>Main Lobby</Link>
  <header className="arcade-heading"><Gamepad2 size={36}/><div><h1>Arcade Mode</h1><GameplaySoundButton/><NotificationBell/><p>Pick a game. Chase your personal best.</p></div></header>
  <p className="arcade-rules-hint"><Info size={22} aria-hidden="true"/><span>Click the info icon to view game rules</span></p>
  {!layout.snapshot&&!layout.error&&<p role="status">Loading games…</p>}
  {layout.snapshot&&visibleSections(layout.snapshot.layout,ARCADE_GAMES).filter(section=>section.games.length>0).map(section=><section className="arcade-section" key={section.id} aria-labelledby={'arcade-section-'+section.id}>
  <h2 id={'arcade-section-'+section.id} className="arcade-section-heading">{section.label}</h2>
  <div className="arcade-tiles">{section.games.map(g=>{
   const row=artwork.find(item=>item.game===g.id);
   return <ArcadeTile key={g.id} game={g.id as ArcadeGame} name={g.name} admin={isAdmin} artwork={row} onArtwork={updated} onOpen={refresh}/>;
  })}</div></section>)}
  {layout.error&&<p role="alert">{layout.error} <button className="underline" onClick={layout.refresh}>Retry ordering</button></p>}
  {error&&<p role="alert">{error} <button className="underline" onClick={refresh}>Retry artwork</button></p>}</main>;
}
