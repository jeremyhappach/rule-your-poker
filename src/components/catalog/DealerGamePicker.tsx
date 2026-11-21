import './catalog.css';
import {GameArtwork} from '@/components/midnight/GameArtwork';
import {useState} from 'react';
import {GAME_CATALOG,findGame,isDiscovered,eligibility,type Availability,type Roster,type Category} from '@/lib/gameCatalog';
import {CategoryNavigation} from './CategoryNavigation';
export function DealerGamePicker({previousGame,roster,access,onSelect,harnesses={}}:{previousGame?:string;roster:Roster;access:Availability;onSelect:(id:string)=>void;harnesses?:Record<string,{active:boolean;label:string}>}) {
 const [category,setCategory]=useState<Category>(findGame(previousGame)?.category??'cards');
 const games=GAME_CATALOG.filter(game=>game.modes.includes('multiplayer')&&game.category===category&&isDiscovered(game,access));
 return <div className="dealer-catalog space-y-3" data-category={category}><CategoryNavigation value={category} onChange={setCategory}/>
 <div className="midnight-tile-grid" aria-label="Choose a game">{games.map(game=>{const reason=eligibility(game,roster,access);return <button type="button" key={game.id} data-dealer-game-option={game.id} disabled={!!reason} aria-describedby={reason&&reason!=='Humans only'?'eligibility-'+game.id:undefined} onClick={()=>onSelect(game.id)} className={'midnight-tile'+(category==='other'?'':' midnight-tile-large')}>
 <GameArtwork game={game.id} surface="picker"/><span className="break-words">{game.name}</span>{harnesses[game.id]?.active&&<span title={harnesses[game.id].label} aria-label={'Harness active: '+harnesses[game.id].label} className="ml-1 rounded bg-red-600 px-1 text-xs text-white">H</span>}
 {reason&&reason!=='Humans only'&&<span id={'eligibility-'+game.id} className="midnight-eligibility">{reason}</span>}</button>})}</div>
 {!games.length&&<p role="status" className="text-sm text-amber-100">No games currently available in this category.</p>}</div>;
}
