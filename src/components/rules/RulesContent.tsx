import {lazy,Suspense} from 'react';
import {findGame} from '@/lib/gameCatalog';
import type {RulesMode} from '@/lib/gameCatalog/types';
import type {Config} from '@/lib/run21/model';
import type {Rules} from '@/lib/triTowers/model';
const Traditional=lazy(()=>import('./TraditionalRules'));
const Versioned=lazy(()=>import('./VersionedRules'));
export function RulesContent({game,version,mode='multiplayer',config}:{game:string;version?:string;mode?:RulesMode;config?:Config|Rules}) {
 const entry=findGame(game);
 if(!entry)return <p>Rules are not available.</p>;
 return <div className="catalog-rules-copy">
 {mode==='arcade'&&<p>Arcade is solo play without stakes. Finish the run to enter its leaderboard. Abandoning excludes the run; leaving or backgrounding does not pause an active gameplay clock.</p>}
 {mode==='async'&&<div className="space-y-2"><p>Async is a two-player match. Play when your turn is available; the other player does not need to be online. A missed 36-hour availability deadline forfeits that game.</p>{entry.id!=='ptown-words'&&<p>Choose Start to begin your {entry.id==='mega-card-golf'?'hole':'round'}. Once started, its normal gameplay clock keeps running even if you leave. Players alternate {entry.id==='mega-card-golf'?'holes':'rounds'} using the same game rules and their own deals.</p>}<p>Each game’s result contributes to the match. Real-money matches post one net amount after every game finishes; fake-money matches leave real balances unchanged.</p></div>}
 <Suspense fallback={<p role="status">Loading rules…</p>}>
 {entry.rules.kind==='traditional'?<Traditional article={entry.rules.key}/>:<Versioned key={game+':'+(version??'current')} game={entry.id} version={version} mode={mode} config={config}/>}
 </Suspense></div>;
}
