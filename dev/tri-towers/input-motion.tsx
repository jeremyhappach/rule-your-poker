// Controlled presentation/transport fixture, not a gameplay or scoring authority.
import {useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {TriTowersBoard} from '@/components/triTowers/TriTowersBoard';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {VisualPreferencesProvider} from '@/hooks/useVisualPreferences';
import {useTriIntentBuffer} from '@/hooks/useTriIntentBuffer';
import {create,project} from '@/lib/triTowers/referenceEngine';
import rules from '@/lib/triTowers/rules-v2.json';
import type {Intent,Projection} from '@/lib/triTowers/model';
import '@/index.css';import '@/lib/arcade/arcade.css';import '@/components/triTowers/triTowers.css';
const params=new URLSearchParams(location.search),baseline=params.get('baseline')==='1',multiplayer=params.get('mode')==='multiplayer';
const players=Array.from({length:multiplayer?7:2},(_,i)=>({id:'p'+i,userId:'u'+i,name:i?'Player '+(i+1):'Jeremy',seat:i+1}));
const initial={...project(create({sessionId:'offline',dealerGameId:'offline',roundId:'r'},players,Array.from({length:52},(_,i)=>i),0),'p0'),rules:{...rules,version:'tri-towers/3',roundIntroMs:2500},phase:'playing',deadline:121000,revision:1} as Projection;
function Fixture(){
 const [view,setView]=useState(initial),[pending,setPending]=useState(false),[rows,setRows]=useState<string[]>([]);const latest=useRef(view);latest.current=view;const started=useRef(0),responseAt=useRef(0);
 const normalized=(v:Projection)=>({scope:'fixture',actor:'fixture',roundId:'r',revision:v.revision,phase:v.phase,waste:v.waste,cards:v.cards,removed:v.removed,allowed:true});
 async function send(intent:Intent,requestId:string){
  const start=performance.now();const response=await fetch('/__tri_transport',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseline,multiplayer,board:latest.current,intent,requestId})});const value=await response.json();responseAt.current=performance.now()-start;latest.current=value;setView(value);return normalized(value);
 }
 const buffer=useTriIntentBuffer('fixture:'+location.search,()=>normalized(latest.current),c=>send(c.intent as Intent,c.requestId));
 useLayoutEffect(()=>{if(view.revision===1)return;const commit=performance.now()-started.current;requestAnimationFrame(()=>requestAnimationFrame(()=>setRows(r=>[...r,JSON.stringify({revision:view.revision,responseMs:+responseAt.current.toFixed(1),commitMs:+commit.toFixed(1),paintMs:+(performance.now()-started.current).toFixed(1)})])));},[view.revision]);
 const act=(intent:Intent)=>{started.current=performance.now();if(!baseline){buffer.enqueue(intent);return;}setPending(true);void send(intent,crypto.randomUUID()).finally(()=>setPending(false));};
 return <><div style={{position:'fixed',bottom:0,left:0,zIndex:1000,background:'#102c3a',color:'white',fontSize:11,maxWidth:'60%'}}><details><summary>Controlled fixture: {baseline?'baseline':'optimized'} · {multiplayer?'multiplayer':'Arcade'}</summary><p>40 ms per simulated remote hop; real local HTTP and React rendering. No production data or scoring.</p>{rows.map((row,i)=><output key={i} data-sample={i}>{row}<br/></output>)}</details></div><div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className="tri-scene" title="TriTowers" description="Controlled input fixture" activeTab="cards" setActiveTab={()=>{}} panel={null} announcement={false}><div className="tri-game"><TriTowersBoard input={baseline?undefined:buffer} view={view} now={1000} roundKey="fixture" result={null} canAct={!pending} onIntent={act} scores={(multiplayer?players:players.slice(0,1)).map(p=>({id:p.id,name:multiplayer?p.name:undefined,score:0,active:p.id==='p0'}))}/></div></FullscreenGameShell></div></>;
}
createRoot(document.getElementById('root')!).render(<VisualPreferencesProvider><ResponsiveGeometryProvider><Fixture/></ResponsiveGeometryProvider></VisualPreferencesProvider>);
