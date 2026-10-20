import {lazy,Suspense} from 'react';
import {findGame} from '@/lib/gameCatalog';
import type {Config} from '@/lib/run21/model';
import type {Rules} from '@/lib/triTowers/model';
const Traditional=lazy(()=>import('./TraditionalRules'));
const Versioned=lazy(()=>import('./VersionedRules'));
export function RulesContent({game,version,mode,config}:{game:string;version?:string;mode?:'arcade'|'multiplayer';config?:Config|Rules}) {
 const entry=findGame(game);
 if(!entry)return <p>Rules are not available.</p>;
 return <div className="catalog-rules-copy"><Suspense fallback={<p role="status">Loading rules…</p>}>
 {entry.rules.kind==='traditional'?<Traditional article={entry.rules.key}/>:<Versioned key={game+':'+(version??'current')} game={entry.id} version={version} mode={mode} config={config}/>}
 </Suspense></div>;
}
