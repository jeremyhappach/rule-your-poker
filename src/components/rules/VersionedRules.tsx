import {GAME_CATALOG,findGame} from '@/lib/gameCatalog';
import {useEffect,useState,lazy,Suspense} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {arcadeRequest} from '@/lib/arcade/client';
import type {Leaderboard} from '@/lib/arcade/model';
import type {Config} from '@/lib/run21/model';
import type {Rules} from '@/lib/triTowers/model';
const renderers=new Map(GAME_CATALOG.filter(game=>game.rules.load).map(game=>[game.id,lazy(game.rules.load!)]));
export default function VersionedRules({game,version,mode='multiplayer',config}:{game:string;version?:string;mode?:'arcade'|'multiplayer';config?:Config|Rules}) {
 // Multiplayer-only frozen help must not query the unrelated Arcade lifecycle.
 const fixedVersion=findGame(game)?.rules.fixedVersion;
 const [loaded,setLoaded]=useState<{version:string;config:Config|Rules}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoaded(null);setError('');
 if(config||fixedVersion)return;
 void (async()=>{
  const selected=version??(await arcadeRequest<Leaderboard>({op:'leaderboard',game,window:'all'})).currentRuleset;
  if(!selected)throw Error('Current rules are unavailable.');
  const {data,error}=await supabase.rpc('arcade_rules_help',{p_ruleset:selected});
  if(error||!data)throw Error('Rules could not be loaded. Please reopen to retry.');
  if(alive)setLoaded({version:selected,config:data as unknown as Config|Rules});
 })().catch(e=>{if(alive)setError(e.message);});return()=>{alive=false};},[game,version,config,fixedVersion]);
 const resolved=config??loaded?.config, selected=version??(resolved as {version?:string}|undefined)?.version??loaded?.version??fixedVersion;
 if(fixedVersion&&selected!==fixedVersion&&!findGame(game)?.rules.supportedVersions?.includes(selected??''))return <p role="alert">Rules are unavailable for this version.</p>;
 if(error)return <p role="alert">{error}</p>;
 if(!resolved&&!fixedVersion)return <p role="status">Loading rules…</p>;
 const solo=mode==='arcade',Content=renderers.get(game);
 if(!Content)return <p>Rules are unavailable.</p>;
 return <Suspense fallback={<p role="status">Loading rules…</p>}>
 <Content config={resolved} version={selected} solo={solo}/>
 </Suspense>;
}
