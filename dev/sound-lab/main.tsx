import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Toaster} from 'sonner';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {useSoundPreference} from '@/hooks/useSoundPreference';
import {LAB_USER, platformAudio} from './labAudio';
import {LabConductor, auditionId, type Sound} from './conductor';
import {decodePCM, pcmCue, type PCM} from './pcm';
import {references} from './references';
import catalog from './catalog.json';
import './style.css';

const assetUrls=import.meta.glob('./assets/*.wav',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const loaded=new Map<string,PCM>();
const conductor=new LabConductor();
const sound=(entry:typeof catalog[number]):Sound=>({...entry,cue:pcmCue(loaded.get(entry.id)!)});
const uninstall=platformAudio.install(); platformAudio.setUser(LAB_USER);
window.addEventListener('pagehide',()=>conductor.stop());
if(import.meta.hot) import.meta.hot.dispose(()=>{conductor.stop();uninstall();});

function App(){
 const preference=useSoundPreference();
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const [section,setSection]=useState('All sounds'),[playing,setPlaying]=useState<string|null>(null);
 const [elapsed,setElapsed]=useState(0),[duration,setDuration]=useState(1),[status,setStatus]=useState('Loading the local sample collection…');
 const [picks,setPicks]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('ptown-lab-picks')??'[]');}catch{return[];}});
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const frame=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stop=()=>{conductor.stop();cancelAnimationFrame(frame.current);if(timer.current)clearTimeout(timer.current);timer.current=null;setPlaying(null);setElapsed(0);};
 useEffect(()=>{
  let active=true;
  Promise.all(catalog.map(async entry=>{const response=await fetch(assetUrls['./assets/'+entry.file]);if(!response.ok)throw Error('Unable to load '+entry.title);loaded.set(entry.id,decodePCM(await response.arrayBuffer()));})).then(()=>{if(active){setReady(true);setStatus('Ready · tap a sample to listen.');}}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;conductor.stop();cancelAnimationFrame(frame.current);if(timer.current)clearTimeout(timer.current);};
 },[]);
 useEffect(()=>{if(preference.enabled===false){stop();setStatus('Muted · interrupted sounds will not resume.');}},[preference.enabled]);
 useEffect(()=>{const hide=()=>{if(document.hidden){stop();setStatus('Playback stopped in the background. Tap a sample to start fresh.');}};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);};},[]);
 function animate(id:string,ms:number){
  cancelAnimationFrame(frame.current);setPlaying(id);setDuration(ms);setElapsed(0);const start=performance.now();
  const tick=()=>{const at=performance.now()-start;setElapsed(Math.min(at,ms));if(at<ms)frame.current=requestAnimationFrame(tick);else setPlaying(null);};
  frame.current=requestAnimationFrame(tick);
 }
 function play(entry:typeof catalog[number]){
  stop();platformAudio.unlock(true);
  setStatus('Preparing '+entry.title+'…');
  if(!conductor.play({...sound(entry),onStart:()=>{animate(entry.id,entry.durationMs);setStatus('Playing '+entry.title);}}))setStatus('Sounds are muted. Use the speaker to unmute.');
 }
 function diceDemo(){
  stop();platformAudio.unlock(true);const roll=catalog.find(x=>x.id==='dice-roll')!,land=catalog.find(x=>x.id==='dice-land')!;
  conductor.play({...sound(roll),onStart:()=>{
   animate(roll.id,roll.durationMs);setStatus('Rolling → landing · cancellation stops both parts.');
   timer.current=setTimeout(()=>{conductor.play({...sound(land),onStart:()=>{animate(land.id,land.durationMs);setStatus('Dice landed.');}},auditionId(),false);},roll.durationMs);
  }});
 }
 function priorityDemo(){
  stop();platformAudio.unlock(true);const win=catalog.find(x=>x.id==='winner-a')!,deal=catalog.find(x=>x.id==='deal-felt')!;
  if(!conductor.play({...sound(win),onStart:()=>animate(win.id,win.durationMs)}))return;
  let suppressed=0;
  for(let i=0;i<12;i++)if(!conductor.play(sound(deal),auditionId(),false))suppressed++;
  setStatus('Winner playing · '+suppressed+' competing deal requests suppressed.');
 }
 function pick(id:string){const next=picks.includes(id)?picks.filter(x=>x!==id):[...picks,id];setPicks(next);localStorage.setItem('ptown-lab-picks',JSON.stringify(next));}
 function exportPicks(){const blob=new Blob([JSON.stringify({date:new Date().toISOString(),approvedForGameplay:false,picks},null,2)],{type:'application/json'});const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download='ptown-sound-shortlist.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
 const selected=catalog.find(x=>x.id===playing),progress=elapsed/duration;
 const kind=playing?.startsWith('dice')?'dice':playing?.startsWith('holm')?'glass':playing?.startsWith('leg')?'leg':playing?.startsWith('count')||playing==='current-count'?'count':playing?.startsWith('winner')||playing==='major-win'?'win':'card';
 const disabled=!ready||preference.enabled!==true;
 return <><header><a className="brand" href="#"><span className="brand-mark">P</span><span>P-TOWN <small>SOUND LAB / 01</small></span></a><div className="sound-control"><span>Audition sounds</span><GameplaySoundButton/></div></header>
 <main><section className="intro"><p className="eyebrow">THE SOUND OF A GOOD HAND</p><h1>A little texture.<br/><em>A little triumph.</em></h1><p>Quiet cards. Real table sounds. Just enough celebration.<br/> Listen, compare, and save your favorites.</p><span className="pill">Private audition · no gameplay changes</span></section>
 <section className="listening"><div className={'stage '+(playing&&!reduced?'active ':'')+kind} aria-hidden="true">
   <span className="stage-label">{playing?'TIMING PREVIEW':'THE LISTENING TABLE'}</span>
   {kind==='dice'?<div className="dice-art">⚄ ⚂ ⚅</div>:kind==='glass'?<div className="crack-art">✧<b>YOU GOT CRACKED</b></div>:kind==='count'?<div className="score-art">{Math.round(progress*1000).toLocaleString()}</div>:kind==='leg'?<div className="leg-art">L<small>LEG EARNED</small></div>:kind==='win'?<div className="win-art">✦<small>WELL PLAYED</small></div>:<div className="card-art">A<span>♠</span></div>}
   <span className="stage-caption">{selected?.title??references.find(x=>x.id===playing)?.title??'Every sample is played at its proposed level.'}</span>
   <div className="progress" style={{transform:`scaleX(${playing?progress:0})`}}/>
 </div><div className="listening-controls"><button onClick={()=>{stop();setStatus('Stopped.');}}>■ Stop playback</button><label><input type="checkbox" checked={reduced} onChange={e=>setReduced(e.target.checked)}/> Reduce motion</label></div><p className="status" role="status">{error||status}</p><p className="local-note">The speaker uses P-Town’s existing audio manager and control. This lab saves its own local preference; your account’s Sounds setting is unchanged.</p></section>
 <nav className="filters" aria-label="Sound categories">{['All sounds','Table textures','Signature moments','Celebrations','Existing sounds'].map(name=><button key={name} aria-pressed={section===name} onClick={()=>setSection(name)}>{name}</button>)}</nav>
 {['Table textures','Signature moments','Celebrations'].filter(name=>section==='All sounds'||section===name).map(name=><section className="collection" key={name}><div className="section-head"><h2>{name}</h2><span>{name==='Table textures'?'Frequent & exceptionally quiet':name==='Signature moments'?'Distinctive, with a short decay':'Rare moments, a little more color'}</span></div><div className="grid">{catalog.filter(x=>x.section===name).map(entry=><article key={entry.id} className={playing===entry.id?'is-playing':''}><div className="sample-top"><span className="event">{entry.event}</span><button className="favorite" aria-pressed={picks.includes(entry.id)} aria-label={'Shortlist '+entry.title} onClick={()=>pick(entry.id)}>{picks.includes(entry.id)?'★':'☆'}</button></div><h3>{entry.title}</h3><p className="spec">{(entry.durationMs/1000).toFixed(2)} s <span>·</span> {entry.peakDb} dBFS peak</p><div className="actions"><button className="play" disabled={disabled} onClick={()=>play(entry)} aria-label={'Play '+entry.title}>▶ Listen</button><a href={assetUrls['./assets/'+entry.file]} download={entry.file}>WAV ↓</a></div><details><summary>Timing & source</summary><p>{entry.trigger}</p><p>{entry.source.author}<br/>{entry.source.license}</p>{entry.source.url&&<a href={entry.source.url} target="_blank" rel="noreferrer">Source & license ↗</a>}<p>RMS: {entry.rmsDb} dBFS. Levels are proposed, not perceptual loudness certification.</p></details></article>)}</div></section>)}
 {(section==='All sounds'||section==='Existing sounds')&&<section className="collection"><div className="section-head"><h2>Existing sounds</h2><span>Original generators · unchanged reference</span></div><div className="references">{references.map(ref=><button key={ref.id} disabled={disabled} onClick={()=>{stop();platformAudio.unlock(true);if(conductor.play({id:ref.id,priority:50,group:'reference',cooldownMs:0,cue:ref.cue,onStart:()=>animate(ref.id,ref.cue.durationMs)})){setStatus('Playing unchanged reference: '+ref.title);}}}>▶ {ref.title}</button>)}</div><p className="local-note">The shared score count-up is the preferred Cribbage starting point. The mellow sample is an alternative for comparison.</p></section>}
 <section className="checks"><div><p className="eyebrow">TRY THE TRANSITIONS</p><h2>Listen in context.</h2><p>These local demonstrations do not run a game.</p></div><div className="check-buttons"><button disabled={disabled} onClick={diceDemo}>Dice roll → landing</button><button disabled={disabled} onClick={priorityDemo}>Winner + 12 competing deals</button><button onClick={exportPicks}>Export shortlist ({picks.length})</button></div></section>
 <footer>Phase 1 · Audition checkpoint · November 1, 2026<br/>No production deployment. Physical iPhone and Android listening checks are still needed.</footer>
 </main><Toaster/></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
