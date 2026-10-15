// Offline presentation fixture. No authentication, session creation or financial writes.
import { useState } from 'react';
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
import {DEFAULT_CONFIG} from '@/lib/run21/model';
import type { ShellTabId } from '@/lib/canonicalShell/ShellTabBar';
import '@/index.css';

const query=new URLSearchParams(location.search),scene=query.get('scene')??'active',type=query.get('game')??'run21';
const mode=resolvePresentationMode([{game_type:type,presentation_mode:type==='run21'?'fullscreen':'table'}],type,'offline','in_progress');
function Preview(){
  const [match,setMatch]=useState(()=>{
    const deck=standardDeck().filter(c=>['10','J','Q','K'].includes(c.rank));
    let m=act(fixtureMatch(DEFAULT_CONFIG,deck),PLAYERS[0].id,{type:'ready'},0);
    if(scene==='bust')for(let i=0;i<3;i++)m=act(m,PLAYERS[0].id,{type:'place',column:0},i+1);
    if(scene==='qualified'||scene==='success')for(let i=0;i<10;i++)m=act(m,PLAYERS[0].id,{type:'place',column:Math.floor(i/2)},i+1);
    if(scene==='no-qualify'||scene==='success')m=act(m,PLAYERS[0].id,{type:'collect'},20);
    return m;
  });
  const [tab,setTab]=useState<ShellTabId>('cards');
  const transport=useChipTransport();
  const view=project(scene==='reveal'?simulateRound(match):match,scene==='observer'?null:scene==='inactive'?PLAYERS[1].id:PLAYERS[0].id);
  if(scene==='maximum-depth')view.boards[PLAYERS[0].id]!.columns[0]=standardDeck().filter(c=>['A','2'].includes(c.rank)).concat(standardDeck().filter(c=>c.rank==='3').slice(0,3));
  const snapshot={view,revision:1,serverAt:1000,finished:false,balances:{[PLAYERS[0].id]:-10,[PLAYERS[1].id]:10}};
  const panel=<><Run21ScoringReference/><button onClick={()=>transport.dispatch({id:uuid(990),amount:10,reason:'transfer',variant:'canonicalWinTransfer',from:{kind:'seat',position:PLAYERS[0].seat},to:{kind:'seat',position:PLAYERS[1].seat}}, {onSettled:()=>document.body.dataset.transportSettled='true'})}>Test presentation transfer</button></>;
  if(mode==='table')return <><div style={{height:'var(--shell-felt-h)'}}/><ShellHudGrid pane={<p>Original table fixture: {type}</p>}/></>;
  return <><Run21Announcement view={view} dealerGameScope={null}/><Run21FullscreenView snapshot={snapshot} now={1000}
    activeTab={tab} setActiveTab={setTab} panel={panel} error={null} replay={null} onReturnLive={()=>{}}
    sessionEnded={scene==='ended'} onIntent={intent=>{document.body.dataset.lastIntent=intent.type;setMatch(m=>act(m,PLAYERS[0].id,intent,1000));}}/></>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider>
  <PersistentTableShell gameType={type} presentationMode={mode} header={<div className="flex items-center justify-between px-3"><span>Offline session</span><button>Options</button></div>}>
    <Preview/>
  </PersistentTableShell>
</ResponsiveGeometryProvider></VisualPreferencesProvider>);
