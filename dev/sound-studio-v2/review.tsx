import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from './labAudio';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {LabConductor,auditionId} from './conductor';
import {decodePCM,pcmCue,type PCM} from '../sound-lab/pcm';
import {RollDemos} from './RollDemos';
import additions from './pass2-catalog.json';
import revision from './review-catalog.json';
import palette from '../sound-lab/catalog.json';
import auditUrl from '../../docs/codex/SOUND_PASS2_APPROVAL_MATRIX.md?url';
import './style.css';
const samples=[...additions,...revision,...palette],pcm=new Map<string,PCM>(),conductor=new LabConductor();
const urls=import.meta.glob(['./assets/*.wav','../sound-lab/assets/*.wav'],{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const stop=()=>{window.dispatchEvent(new Event('studio-stop'));conductor.stop();};
platformAudio.install();platformAudio.setUser(LAB_USER);
function Review(){
 const [ready,setReady]=useState(false),[picks,setPicks]=useState<Record<string,string>>(()=>{try{return JSON.parse(localStorage.getItem('ptown-pass2-final-picks')??'{}');}catch{return{};}});
 useEffect(()=>{const wanted=['quintzee-roll-b2','cup-roll-c','dice-land','dice-land-soft','chip-single','pot-gather',...['drop-countdown','farkle-bust','upper-bonus','all-filled'].flatMap(id=>['a','b','c'].map(t=>id+'-'+t))];
  void Promise.all(samples.filter(s=>wanted.includes(s.id)).map(async s=>{const key=(palette.some(p=>p.id===s.id)?'../sound-lab/assets/':'./assets/')+s.file;const r=await fetch(urls[key]);pcm.set(s.id,decodePCM(await r.arrayBuffer()));})).then(()=>setReady(true));return stop;},[]);
 const select=(group:string,id:string)=>{const next={...picks,[group]:id};setPicks(next);localStorage.setItem('ptown-pass2-final-picks',JSON.stringify(next));};
 const play=(id:string)=>{stop();platformAudio.unlock(true);conductor.play({id,group:'review',priority:60,cooldownMs:0,cue:pcmCue(pcm.get(id)!)},auditionId());};
 const choice=(group:string,id:string,label:string)=><div className="example-buttons" key={id}><button disabled={!ready} onClick={()=>play(id)}>▶ {label}</button><button aria-pressed={picks[group]===id} onClick={()=>select(group,id)}>{picks[group]===id?'Selected ✓':'Select'}</button></div>;
 return <main><header><p className="eyebrow">P-TOWN POKER · FINAL REVIEW</p><h1>Only the remaining decisions.</h1><p>18 sound approvals verified. Seven decisions remain unverified. Published sounds stay unchanged until these are resolved.</p><div className="example-buttons"><GameplaySoundButton/><button onClick={stop}>Stop</button><a href={auditUrl}>Full approval matrix</a></div></header>
 <section id="quintzee"><h2>1 · Revised Quintzee B2</h2><p>Same 264 Hz pitch. Slower 34 Hz pulses with sharper gaps. No landing sound. Use the roll preview to judge the complete motion.</p><RollDemos fixed={{kind:'quintzee-roll',take:'b2'}} samples={samples} pcm={pcm} conductor={conductor} volume={100} disabled={!ready} beforePlay={stop}/><button aria-pressed={picks.quintzee==='quintzee-roll-b2'} onClick={()=>select('quintzee','quintzee-roll-b2')}>{picks.quintzee?'Selected ✓':'Select revised B2'}</button></section>
 <section id="cup"><h2>2 · Reuse Cup C for Horses and SCC?</h2><p>C is already approved and integrated locally for Yahtzee. Its use in Horses and SCC was suggested, but no approval was found.</p><RollDemos fixed={{kind:'cup-roll',take:'c'}} samples={samples} pcm={pcm} conductor={conductor} volume={100} disabled={!ready} beforePlay={stop}/><button aria-pressed={picks.cup==='cup-roll-c'} onClick={()=>select('cup','cup-roll-c')}>{picks.cup?'Selected ✓':'Select C for both games'}</button></section>
 {([['drop-countdown','3 · 357 descending countdown'],['farkle-bust','4 · Farkle bust'],['upper-bonus','5 · Quintzee Upper Bonus +35'],['all-filled','6 · Quintzee All Filled +35']] as const).map(([id,title])=><section id={id} key={id}><h2>{title}</h2><p>No explicit selection was found. Take A is the starting recommendation.</p>{choice(id,id+'-a','Take A')}<details><summary>Hear B and C</summary>{choice(id,id+'-b','Take B')}{choice(id,id+'-c','Take C')}</details></section>)}
 <section id="chips"><h2>7 · Chip transfer</h2><p>The earlier palette explicitly excluded unselected candidates. Neither chip recording was approved. Choose one for future admitted transfers, taxes and reantes.</p>{choice('chips','chip-single','Single chip — recommended')}{choice('chips','pot-gather','Gathered chips')}</section>
 <section><h2>Already resolved</h2><p>Box Drop and live/Async Words reuse the approved Wooden Peg A at visible placement. The original eight and nine V2 choices remain intact. Run21 Pass, exact-21 and bust retain their existing sounds.</p><h2>Your saved choices</h2><p>Selections save in this browser. Copy this list into the chat to confirm the remaining sound choices.</p><pre>{Object.entries(picks).map(([k,v])=>k+': '+v).join('\n')||'No new choices yet.'}</pre></section></main>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
