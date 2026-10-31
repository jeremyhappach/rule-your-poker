// Synthetic local transport and projected results only. No customer or hosted calls.
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TriTowersBoard,type TriTowersBoardView} from '@/components/triTowers/TriTowersBoard';
import {CurrentNet} from '@/components/delayed/CurrentNet';
import {useTriIntentBuffer} from '@/hooks/useTriIntentBuffer';
import {RejectedTriAction} from '@/lib/triTowers/intentBuffer';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {roundResultPresentation} from '@/lib/triTowers/stagePresentation';
import {evidence,platformAudio} from './polish-audio';
import rules from '@/lib/triTowers/rules-v2.json';
import '@/index.css';import '@/lib/arcade/arcade.css';import '@/components/triTowers/triTowers.css';import '@/lib/delayed/delayed.css';
const query=new URLSearchParams(location.search),net=query.has('net'),history=query.has('history');
const base:TriTowersBoardView={rules:{...rules,version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000},phase:'playing',cards:Array.from({length:28},(_,i)=>i<3?5+i:null),removed:Array.from({length:25},(_,i)=>i+3),waste:4,stockRemaining:12,run:5,deadline:Date.now()+120000,highRun:5};
function Preview(){
 const [round,setRound]=useState(1),[view,setView]=useState({...base,revision:1}),[epoch,setEpoch]=useState(0),[paused,setPaused]=useState(false),[muted,setMuted]=useState(false),[now,setNow]=useState(Date.now());
 const [end,setEnd]=useState<any>(null),reject=useRef(false),latest=useRef(view),flightStart=useRef(0);latest.current=view;
 const scope='local-polish:'+round,normalize=(v:typeof view)=>({scope,actor:'preview-player',roundId:scope,revision:v.revision,phase:v.phase,waste:v.waste,cards:v.cards,removed:v.removed,allowed:!paused});
 const input=useTriIntentBuffer(scope,()=>normalize(latest.current),async command=>{
  flightStart.current=performance.now();evidence.requests++;
  const response=await fetch('/__tri_polish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,view:latest.current,reject:reject.current})});reject.current=false;
  const data=await response.json();if(!response.ok)throw new RejectedTriAction(data.error);
  latest.current=data.view;setView(data.view);if(data.result)setEnd(data.result);return normalize(data.view);
 });
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),40);return()=>clearInterval(timer);},[]);
 useLayoutEffect(()=>{if(view.revision>1)evidence.commits.push({revision:view.revision,elapsed:performance.now()-flightStart.current});},[view.revision]);
 const result=end?roundResultPresentation(end,view.deadline,view.rules.holdMs,now,view.rules.clearCelebrationMs):null;
 const reset=()=>{setRound(r=>r+1);setView({...base,revision:1,deadline:Date.now()+120000});setEnd(null);setEpoch(0);setPaused(false);};
 if(net){const home={players:[{id:'a',name:'Alexandria Very Long Player Name'},{id:'b',name:'BlairWithAnExtremelyLongUnbrokenName'}],net:query.has('zero')?0:-1234567.89,unsettled:9876543.21,lineup:[]};
  return <main className="delayed-page delayed-match-page"><header><h1>Async Matches</h1></header><section className="delayed-match-home"><h2>Local projected results</h2><CurrentNet home={home} userId={query.get('viewer')??'a'}/><p>Local synthetic amounts · hidden-result projection unchanged</p><a href="/">Tri-Towers preview</a></section></main>;
 }
 return <><details style={{position:'fixed',bottom:0,left:0,zIndex:1000,background:'#142632',color:'white',fontSize:12,maxWidth:'100%'}}><summary>Local synthetic controls</summary>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',padding:8}}><button onClick={reset}>Reset round</button><button onClick={()=>{reject.current=true;}}>Reject next</button><button onClick={()=>setView(v=>({...v,removed:[...v.removed]}))}>Duplicate snapshot</button><button onClick={()=>{setEpoch(e=>e+1);setView(v=>({...v,removed:[...base.removed,0,1],waste:6}));}}>Reconnect with two cleared</button>
  <button onClick={()=>setPaused(p=>!p)}>{paused?'Resume':'Pause'}</button><button onClick={()=>{platformAudio.setPreference('local-preview',!muted?false:true);setMuted(m=>!m);}}>{muted?'Unmute':'Mute'}</button><a href="/?net=1">Current Net</a></div>
  <p>Remove 6, then 7, then 8. Local HTTP accepts or rejects after 40 ms. No production data.</p></details>
  <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className="tri-scene" title="TriTowers" description="Local presentation preview" activeTab="cards" setActiveTab={()=>{}} panel={null} announcement={false}><div className="tri-game"><TriTowersBoard view={view} now={now} roundKey={scope} diagnosticRevision={view.revision} recoveryEpoch={epoch} userId="local-preview" replay={history} paused={paused} result={result} input={input} canAct={!paused} onIntent={i=>input.enqueue(i)} scores={[{id:'preview-player',name:'You',score:end?.score??20000,active:true}]}/></div></FullscreenGameShell></div></>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider userId={undefined}><ResponsiveGeometryProvider><Preview/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
