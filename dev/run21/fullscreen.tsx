// Offline presentation fixture. No authentication, session creation or financial writes.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistentTableShell } from '@/lib/canonicalShell/PersistentTableShell';
import { ResponsiveGeometryProvider } from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import { VisualPreferencesProvider } from '@/hooks/useVisualPreferences';
import { Run21FullscreenView } from '@/components/run21/Run21FullscreenView';
import { Run21ScoringReference } from '@/components/run21/Run21ScoringHelp';
import { Run21Announcement } from '@/components/run21/Run21Announcement';
import { ShellHudGrid } from '@/lib/canonicalShell/ShellHudGrid';
import { useChipTransport } from '@/lib/canonicalShell/ChipTransportProvider';
import { act, fixtureMatch, PLAYERS, simulateRound, uuid } from '@/lib/run21/fixtures';
import { project } from '@/lib/run21/engine';
import { standardDeck } from '@/lib/run21/rules';
import { resolvePresentationMode } from '@/lib/canonicalShell/presentationMode';
import type {PresentationMode} from '@/lib/canonicalShell/presentationMode';
import {usePresentationSurfaceReady} from '@/lib/canonicalShell/CinematicPresentation';
import {DEFAULT_CONFIG} from '@/lib/run21/model';
import type { ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';

const query=new URLSearchParams(location.search),scene=query.get('scene')??'active',type=query.get('game')??'run21';
const mode=resolvePresentationMode([{game_type:type,presentation_mode:type==='run21'?'fullscreen':'table'}],type,'offline','in_progress');
function Preview({mode,ready=true}:{mode:PresentationMode;ready?:boolean}){
  const introScene=scene.startsWith('intro');
  const [now,setNow]=useState(introScene?0:1000);
  useEffect(()=>{if(!introScene)return;const origin=performance.now(),timer=setInterval(()=>setNow(performance.now()-origin),25);return()=>clearInterval(timer);},[introScene]);
  usePresentationSurfaceReady('table',mode==='table'&&ready);
  const [match,setMatch]=useState(()=>{
    const deck=standardDeck().filter(c=>['10','J','Q','K'].includes(c.rank));
    let m=act(fixtureMatch(introScene?{...DEFAULT_CONFIG,firstPlacementSeconds:30,roundIntroMs:2500}:DEFAULT_CONFIG,deck,21,1),PLAYERS[0].id,{type:'ready'},0);
    if(scene==='bust')for(let i=0;i<3;i++)m=act(m,PLAYERS[0].id,{type:'place',column:0},i+1);
    if(scene==='qualified'||scene==='success')for(let i=0;i<10;i++)m=act(m,PLAYERS[0].id,{type:'place',column:Math.floor(i/2)},i+1);
    if(scene==='no-qualify'||scene==='success')m=act(m,PLAYERS[0].id,{type:'collect'},20);
    return m;
  });
  const [tab,setTab]=useState<ShellTabId>('cards');
  const transport=useChipTransport();
  const view=project(scene==='reveal'?simulateRound(match):match,scene==='observer'?null:scene==='inactive'||scene==='intro-opponent'?PLAYERS[1].id:PLAYERS[0].id);
  if(scene==='maximum-depth')view.boards[PLAYERS[0].id]!.columns[0]=standardDeck().filter(c=>['A','2'].includes(c.rank)).concat(standardDeck().filter(c=>c.rank==='3').slice(0,3));
  const snapshot={view,revision:1,serverAt:1000,finished:false,balances:{[PLAYERS[0].id]:-10,[PLAYERS[1].id]:10}};
  const panel=<><Run21ScoringReference/><button onClick={()=>transport.dispatch({id:uuid(990),amount:10,reason:'transfer',variant:'canonicalWinTransfer',from:{kind:'seat',position:PLAYERS[0].seat},to:{kind:'seat',position:PLAYERS[1].seat}}, {onSettled:()=>document.body.dataset.transportSettled='true'})}>Test presentation transfer</button></>;
  if(mode==='table')return <><div style={{height:'var(--shell-felt-h)'}}/><ShellHudGrid pane={<p>Original table fixture: {type}</p>}/></>;
  return <><Run21Announcement view={view} dealerGameScope={null}/><Run21FullscreenView snapshot={ready?snapshot:null} now={now}
    activeTab={tab} setActiveTab={setTab} panel={panel} error={null} replay={null} onReturnLive={()=>{}}
    sessionEnded={scene==='ended'} onIntent={intent=>{document.body.dataset.lastIntent=intent.type;setMatch(m=>act(m,PLAYERS[0].id,intent,Math.floor(now)));}}/></>;
}
function App(){
  const [surface,setSurface]=useState({mode:scene==='transition'?'table' as PresentationMode:mode,ready:true,blocked:false});
  useEffect(()=>{const update=(event:Event)=>setSurface((event as CustomEvent).detail);document.addEventListener('preview-surface',update);return()=>document.removeEventListener('preview-surface',update);},[]);
  return <VisualPreferencesProvider><ResponsiveGeometryProvider>
  <PersistentTableShell gameType={type} presentationMode={surface.mode} presentationTransitionBlocked={surface.blocked} header={<div className="flex items-center justify-between px-3"><span>Offline session</span><button>Options</button></div>}>
    <Preview mode={surface.mode} ready={surface.ready}/>
  </PersistentTableShell>
</ResponsiveGeometryProvider></VisualPreferencesProvider>;
}
createRoot(document.getElementById('root')!).render(<App/>);
