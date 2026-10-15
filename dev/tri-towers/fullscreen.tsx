// Offline only. Never enters the production bundle or talks to a live database.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {TriTowersView,TriTowersRules} from '@/components/triTowers/TriTowersView';
import {create,reduce,project} from '@/lib/triTowers/referenceEngine';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';
const deck=Array.from({length:52},(_,i)=>i),query=new URLSearchParams(location.search);
const players=[{id:'one',userId:'u1',name:'Jeremy',seat:2},{id:'two',userId:'u2',name:'Alex',seat:1}];
function Preview(){
 const [state,setState]=useState(()=>reduce(create({sessionId:'offline',dealerGameId:'offline-tri',roundId:'round'},players,deck,0),{type:'start'},0,()=>deck));
 const [tab,setTab]=useState<ShellTabId>('cards');
 const view=project(state,query.get('observer')?'two':state.players[state.turnIndex]?.id??'one',0,1000);
 return <TriTowersView view={view} now={1000} activeTab={tab} setActiveTab={setTab} panel={<TriTowersRules/>}
  onIntent={intent=>{document.body.dataset.lastIntent=intent.type;setState(s=>reduce(s,intent,1000,()=>[...deck].reverse()));}}/>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider>
 <PersistentTableShell gameType="tri-towers" presentationMode="fullscreen" header={<div className="flex justify-between px-3"><span>Offline TriTowers test</span><span>Session options</span></div>}><Preview/></PersistentTableShell>
</ResponsiveGeometryProvider></VisualPreferencesProvider>);
