import {createRoot} from 'react-dom/client';
import {useLayoutEffect,useState} from 'react';
import {BrowserRouter} from 'react-router-dom';
import {TooltipProvider} from '@/components/ui/tooltip';
import {ResponsiveGeometryProvider} from '@/lib/canonicalShell/ResponsiveGeometryProvider';
import {TriTowersBoard} from '@/components/triTowers/TriTowersBoard';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {useRun21FailureAudio} from '@/hooks/useRun21FailureAudio';
import {DEFAULT_CONFIG} from '@/lib/run21/model';
import rules from '@/lib/triTowers/rules-v2.json';
import {platformAudio} from '@/lib/audio/platformAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import '@/index.css';
import '@/components/triTowers/triTowers.css';
const w=window as any,p=new URLSearchParams(location.search),proof=w.proof;
w.manager=platformAudio;platformAudio.install();platformAudio.setUser('me');
void preloadApprovedSounds().then(()=>w.loaded=true);
const follow=platformAudio.follow.bind(platformAudio);platformAudio.follow=e=>{proof.events.push({id:e.id,at:performance.now(),visual:document.querySelector('[data-run21-scoring]')?.getAttribute('data-outcome')});return follow(e);};
function App(){
 const [reason,setReason]=useState<string|null>(p.get('old')),[round,setRound]=useState(1),[paint,setPaint]=useState(0);
 const mode=p.get('mode')??'run21',now=reason?5050+paint:4900;
 const result=reason?{reason,at:5000,score:0,aggregate:22,totals:[22,0,0,0,0],aceElevations:[],multiplier:0,speed:0}:null;
 const view:any={config:DEFAULT_CONFIG,roundId:String(round),roundNumber:1,viewerId:'me',players:[{id:'me',name:'Player'}],liveBoards:true,active_player_id:'me',revealed:false,cumulative:{me:0},pausedAt:null,
  scorePresentation:reason?{playerId:'me',startedAt:5000,endsAt:10000,from:0,to:0}:null,
  boards:{me:{playerId:'me',columns:[[{rank:'K',suit:'clubs'},{rank:'Q',suit:'hearts'},...(reason==='bust'?[{rank:'2',suit:'spades'}]:[])],[],[],[],[]],passesUsed:0,presented:[],current:null,cardIndex:3,revision:reason?2:1,startedAt:0,deadline:5000,result}}};
 useRun21FailureAudio('me',p.get('scope')??'arcade',view,now,0,mode==='run21');
 useLayoutEffect(()=>{if(reason){proof.visuals.push({reason,at:performance.now(),visible:!!document.querySelector('[data-run21-scoring]')});requestAnimationFrame(at=>proof.frames.push({reason,at}));}},[reason]);
 const tri:any={rules:{...rules,version:'tri-towers/5',roundIntroMs:2500,clearCelebrationMs:3000},phase:'playing',cards:Array.from({length:28},(_,i)=>i===18?5:i===19?9:i===21?6:null),removed:[],waste:4,stockRemaining:10,run:0,deadline:120000,highRun:0};
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><nav style={{display:'flex',gap:8,position:'relative',zIndex:100}}>
  <button onClick={()=>platformAudio.unlock()}>Arm</button><button onClick={()=>setReason('bust')}>Bust</button><button onClick={()=>setReason('timeout')}>Timeout</button><button onClick={()=>{setReason(null);setRound(r=>r+1);}}>Reset</button><button onClick={()=>setPaint(n=>n+1)}>Repaint</button><button onClick={()=>platformAudio.setPreference('me',false)}>Mute</button><button onClick={()=>platformAudio.setPreference('me',true)}>Unmute</button>
 </nav>{mode==='tri'?<div className="tri-game tri-scene" style={{height:650}}><TriTowersBoard view={tri} now={1000} canAct roundKey="preview" result={null} userId="me" onIntent={i=>proof.intents.push(i)}/></div>:<Run21Felt solo layout="fullscreen" view={view} now={now}/>}</div>;
}
createRoot(document.getElementById('root')!).render(<TooltipProvider><ResponsiveGeometryProvider><BrowserRouter><App/></BrowserRouter></ResponsiveGeometryProvider></TooltipProvider>);
