import './catalog.css';
import {useState} from 'react';
import {GAME_CATALOG,findGame,isDiscovered,eligibility,type Availability,type Roster,type Category} from '@/lib/gameCatalog';
import {CategoryNavigation} from './CategoryNavigation';
export function DealerGamePicker({previousGame,roster,access,onSelect,harnesses={}}:{previousGame?:string;roster:Roster;access:Availability;onSelect:(id:string)=>void;harnesses?:Record<string,{active:boolean;label:string}>}) {
 const [category,setCategory]=useState<Category>(findGame(previousGame)?.category??'cards');
 const games=GAME_CATALOG.filter(game=>game.category===category&&isDiscovered(game,access));
 return <div className="dealer-catalog space-y-3"><CategoryNavigation value={category} onChange={setCategory}/>
 <div className="grid grid-cols-2 gap-2" aria-label="Choose a game">{games.map(game=>{const reason=eligibility(game,roster,access);return <button type="button" key={game.id} data-dealer-game-option={game.id} disabled={!!reason} aria-describedby={reason?'eligibility-'+game.id:undefined} onClick={()=>onSelect(game.id)} className="min-h-12 min-w-0 rounded-lg border-2 border-poker-gold bg-amber-900/30 px-2 py-2 text-base font-bold leading-snug text-poker-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-poker-gold disabled:border-gray-500 disabled:text-gray-300">
 <span className="break-words">{game.name}</span>{harnesses[game.id]?.active&&<span title={harnesses[game.id].label} aria-label={'Harness active: '+harnesses[game.id].label} className="ml-1 rounded bg-red-600 px-1 text-xs text-white">H</span>}
 {reason&&<span id={'eligibility-'+game.id} className="mt-1 block text-xs font-normal">{reason}</span>}</button>})}</div>
 {!games.length&&<p role="status" className="text-sm text-amber-100">No games currently available in this category.</p>}</div>;
}
