import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,Gamepad2} from 'lucide-react';
import {useIsAdmin} from '@/hooks/useIsAdmin';
import {ArcadeArtwork,ArcadeInfo} from './ArcadeInfo';
import {loadArtwork,type Artwork,type ArcadeGame} from '@/lib/arcade/artwork';
import {ARCADE_GAMES,ARCADE_PLACEHOLDERS} from '@/lib/gameCatalog';
import '@/lib/arcade/arcade.css';
const games=[...ARCADE_GAMES.map(g=>({id:g.id as ArcadeGame,name:g.name,ready:true})),...ARCADE_PLACEHOLDERS.map(g=>({...g,ready:false}))];
export function ArcadeSwitchboard({userId}:{userId:string}){
 const {isAdmin}=useIsAdmin(userId),[artwork,setArtwork]=useState<Artwork[]>([]),[error,setError]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(()=>{
  const ticket=++generation.current;
  void loadArtwork().then(rows=>{if(ticket===generation.current){setArtwork(rows);setError('');}}).catch(e=>{if(ticket===generation.current)setError(e.message);});
 },[]);
 useEffect(()=>{refresh();window.addEventListener('focus',refresh);return()=>{generation.current++;window.removeEventListener('focus',refresh);};},[refresh]);
 const updated=(row:Artwork)=>{generation.current++;setArtwork(rows=>rows.map(old=>old.game===row.game?row:old));};
 return <main className="arcade-page"><Link className="arcade-back" to="/"><ArrowLeft size={18}/>Main Lobby</Link>
  <header className="arcade-heading"><Gamepad2 size={36}/><div><h1>Arcade Mode</h1><p>Pick a game. Chase your personal best.</p></div></header>
  <div className="arcade-tiles">{games.map(g=>{
   const row=artwork.find(item=>item.game===g.id);
   return <article key={g.id} className="arcade-tile">
    <div className="arcade-tile-copy"><h2>{g.ready?<Link className="arcade-card-link" to={'/arcade/'+g.id} aria-label={g.name+' leaderboard'}>{g.name}</Link>:g.name}</h2>{!g.ready&&<span className="arcade-soon">Coming Soon</span>}</div>
    <ArcadeArtwork path={row?.object_path??null}/>
    <ArcadeInfo game={g.id} name={g.name} admin={isAdmin} artwork={row} onArtwork={updated} onOpen={refresh}/>
   </article>;
  })}</div>{error&&<p role="alert">{error} <button className="underline" onClick={refresh}>Retry artwork</button></p>}</main>;
}
