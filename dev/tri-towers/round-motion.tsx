// Offline presentation fixture. No RPCs, admission, scoring or production data writes.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PersistentTableShell} from '@/lib/canonicalShell/PersistentTableShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {TriTowersView} from '@/components/triTowers/TriTowersView';
import {TriTowersBoard} from '@/components/triTowers/TriTowersBoard';
import {create,project} from '@/lib/triTowers/referenceEngine';
import rules from '@/lib/triTowers/rules-v2.json';
import {stagePresentation} from '@/lib/triTowers/stagePresentation';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {Projection} from '@/lib/triTowers/model';
import '@/index.css';
import '@/lib/arcade/arcade.css';
const query=new URLSearchParams(location.search),solo=query.get('mode')==='arcade';
const players=Array.from({length:7},(_,i)=>({id:'p'+i,userId:'u'+i,name:i?'Player '+(i+1):'Jeremy',seat:i+1}));
const initial=project(create({sessionId:'offline',dealerGameId:'offline',roundId:'r'},players,Array.from({length:52},(_,i)=>i),0),'p0');
function Preview(){
 const [tab,setTab]=useState<ShellTabId>('cards'),[phase,setPhase]=useState<Projection['phase']>('playing'),[now,setNow]=useState(1000),[round,setRound]=useState(1),[reason,setReason]=useState('cleared'),[epoch,setEpoch]=useState(0);
 const end={id:'result:'+round,playerId:'p0',stage:round,reason,scoreBefore:20000,score:48300,stageScore:28300,timeBonus:300,stockBonus:13000,completedAt:2000};
 const view:Projection={...initial,rules:{...rules,version:'tri-towers/4',roundIntroMs:2500,clearCelebrationMs:3000},phase,stage:round,deadline:phase==='intro'?2500:phase==='ready'?32500:phase==='stage_complete'?(reason==='cleared'?10000:7000):121000,score:phase==='stage_complete'?end.score:35000,
  scores:Object.fromEntries(players.map(p=>[p.id,35000])),highRun:9,removed:phase==='stage_complete'&&reason==='cleared'?Array.from({length:28},(_,i)=>i):[],
  stages:phase==='stage_complete'?[end]:[],serverAt:now,canAct:true};
 const result=stagePresentation(view,now);
 const controls=<details style={{position:'fixed',bottom:0,left:0,zIndex:1000,background:'#142632',color:'white',fontSize:12}}><summary>Fixture controls</summary><div style={{display:'flex',gap:4,flexWrap:'wrap',padding:4}}>
  {(['intro','ready','playing','stage_complete'] as const).map(p=><button key={p} onClick={()=>{setPhase(p);setNow(p==='stage_complete'?2600:p==='ready'?2500:1000);}}>{p}</button>)}
  <button onClick={()=>{setRound(r=>r+1);setPhase('intro');setNow(500);}}>Next round</button>
  <button onClick={()=>setReason(r=>r==='cleared'?'take_score':'cleared')}>{reason}</button><button onClick={()=>setEpoch(n=>n+1)}>Recover</button>
  <label>Server time<input aria-label="Server time" type="range" min="0" max="10000" step="100" value={now} onChange={e=>setNow(Number(e.target.value))}/>{now}</label>
 </div></details>;
 const board=<TriTowersBoard view={view} now={now} roundKey={'r:'+round} recoveryEpoch={epoch} result={result} canAct={false} onIntent={()=>{}} scores={[{id:'p0',score:view.score,active:true}]}/>;
 return <>{controls}{solo?<div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className="tri-scene" title="TriTowers" activeTab={tab} setActiveTab={setTab} panel={null} announcement={false}><div className="tri-game">{board}</div></FullscreenGameShell></div>:<PersistentTableShell gameType="tri-towers" presentationMode="fullscreen"><TriTowersView view={view} now={now} presentationEpoch={epoch} activeTab={tab} setActiveTab={setTab} panel={null} onIntent={()=>{}}/></PersistentTableShell>}</>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider><Preview/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
