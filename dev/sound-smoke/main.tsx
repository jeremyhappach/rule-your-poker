import {THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING} from '@/lib/threeFiveSeven/decisionReveal';
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from '../sound-studio-v2/labAudio';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {HolmChuckyRevealCard} from '@/components/HolmChuckyRevealCard';
import {useChuckyRevealAudio} from '@/hooks/useChuckyRevealAudio';
import {decodePCM,pcmCue,type PCM} from '@/lib/audio/pcm';
import catalog from './catalog.json';
import timing from './timing.json';
import './style.css';
platformAudio.install();platformAudio.setUser(LAB_USER);
const urls=import.meta.glob('./assets/*.wav',{query:'?url',import:'default',eager:true}) as Record<string,string>;
// Audition revisions must not reuse a cached recording from an earlier mix.
const audioUrl=(id:string)=>urls['./assets/'+id+'.wav']+'?v='+catalog.find(item=>item.id===id)!.sha256;
// Explicit auditions are new events even after reload. getRandomValues also works on the phone's HTTP LAN URL.
const auditionSession=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
function Preview({id,serial,onEnd}:{id:string;serial:string;onEnd:()=>void}){
 const [pcm,setPCM]=useState<PCM|null>(null),[shown,setShown]=useState(0),[beat,setBeat]=useState('Ready');
 const chucky=id.startsWith('chucky');
 const heartbeat=id==='chucky-heartbeat';
 const cue=pcm?{...pcmCue(pcm,0,heartbeat?400:Infinity),policy:{priority:60,group:'chucky',intervalMs:0}}:undefined;
 const sound=useChuckyRevealAudio(id+':'+serial,cue,heartbeat);
 useEffect(()=>{let live=true;fetch(audioUrl(id)).then(r=>r.arrayBuffer()).then(b=>{if(live)setPCM(decodePCM(b));});return()=>{live=false;};},[id]);
 useEffect(()=>{if(!pcm)return;let raf=0;const start=performance.now()+250;let last=-1;
  if(heartbeat){sound.armReveal(0,4,timing.chuckyPreviewCardIntervalMs);sound.armReveal(3,4,start+3*timing.chuckyPreviewCardIntervalMs-performance.now());}
  const tick=(now:number)=>{const elapsed=now-start;
   if(chucky){setShown(Math.min(4,Math.max(0,Math.floor(elapsed/timing.chuckyPreviewCardIntervalMs)+1)));if(elapsed>3500){onEnd();return;}}
   else {const index=Math.floor(elapsed/THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.countBeatMs);if(index!==last&&index>=0){last=index;setBeat(index<3?String(3-index):'DROP');if(index<3)platformAudio.present({userId:LAB_USER,id:`audition:${id}:${serial}:${index}`,cue:{...pcmCue(pcm,index*THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.countBeatMs,400),policy:{priority:35,group:'countdown',intervalMs:0}}});}if(elapsed>THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.countBeatMs*4){onEnd();return;}}
   raf=requestAnimationFrame(tick);
  };raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[pcm,id,serial,chucky,onEnd]);
 return chucky?<div className="cards">{(['A','K','Q','J'] as const).map((rank,i)=><div className="card" key={i}><HolmChuckyRevealCard card={{rank,suit:'♠'}} presentationKey={id+':'+serial+':'+i} revealed={shown>i} onRevealStart={i===0?sound.start:i===3?sound.stop:undefined} onRevealComplete={i===3?sound.stop:undefined} signatureActive={sound.active}/></div>)}</div>:<div className="count" aria-live="polite">{beat}</div>;
}
function App(){const [playing,setPlaying]=useState<string|null>(null),[serial,setSerial]=useState(0),[choices,setChoices]=useState<Record<string,string>>(()=>JSON.parse(localStorage.getItem('ptown-smoke-choices')??'{}'));
 useEffect(()=>{const stop=()=>setPlaying(null);const hidden=()=>{if(document.hidden)stop();};window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',stop);document.removeEventListener('visibilitychange',hidden);};},[]);
 const choose=(id:string)=>{const next={...choices,[id.split('-')[0]]:id};setChoices(next);localStorage.setItem('ptown-smoke-choices',JSON.stringify(next));};
 return <main><header><div><small>P-TOWN POKER · SOUND REVIEW</small><h1>Four focused auditions</h1></div><GameplaySoundButton/></header><p>Compare the new Chucky reveal and 357 countdown ideas. Your choices stay on this review device until you confirm them in chat.</p><div className="grid">{catalog.map(item=><section id={item.id} key={item.id}><h2>{item.title}</h2><p>{item.id==='chucky-heartbeat'?'Independent, slightly faster pulse. The last beat fades before the final flip.':item.id==='chucky-sting'?'One restrained 1.4-second sting at the first reveal.':item.id==='357-beeps'?'Three identical dry beeps. DROP is silent.':'Speaker-balanced recorded lub-dub per number. DROP is silent.'}</p><div className="stage">{playing===item.id?<Preview key={serial} id={item.id} serial={auditionSession+':'+serial} onEnd={()=>setPlaying(null)}/>:<span>{item.id.startsWith('chucky')?'♠  ♥  ♦  ♣':'3 · 2 · 1 · DROP'}</span>}</div><div className="controls"><button onClick={()=>{platformAudio.unlock(true);setSerial(n=>n+1);setPlaying(p=>p===item.id?null:item.id);}}>{playing===item.id?'Stop':'Play preview'}</button><button aria-pressed={choices[item.id.split('-')[0]]===item.id} onClick={()=>choose(item.id)}>{choices[item.id.split('-')[0]]===item.id?'Selected for review':'Prefer this'}</button><a href={audioUrl(item.id)} download>WAV</a></div></section>)}</div><p className="note">Audition only. No candidate is assigned to production. Heartbeats use a real recording by <a href="https://freesound.org/people/JonasTisell/sounds/670465/" target="_blank" rel="noreferrer">Andy Jack (CC0)</a>. Use your normal phone volume.</p></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
