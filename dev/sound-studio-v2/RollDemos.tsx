import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {DiceRollAnimation} from '@/components/DiceRollAnimation';
import {QuintzeeDie} from '@/components/quintzee/QuintzeeDie';
import {useQuintzeeRumble,QUINTZEE_RUMBLE_MS} from '@/components/quintzee/useQuintzeeRumble';
import {THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING} from '@/lib/threeFiveSeven/decisionReveal';
import {platformAudio} from './labAudio';
import {LabConductor,auditionId} from './conductor';
import {pcmCue,type PCM} from '../sound-lab/pcm';
import type {AudioCue} from '@/lib/audio/audioManager';
import './rollDemos.css';
type Sample={id:string;category?:string;title:string;priority:number};
type Props={samples:Sample[];pcm:Map<string,PCM>;conductor:LabConductor;volume:number;disabled:boolean;beforePlay:()=>void};
const values=[2,5,3,6,4];
function QuintzeeRoll({serial,held,active,land}:{serial:number;held:number[];active:boolean;land:()=>void}){
 const rumble=useQuintzeeRumble('studio-roll',serial,5,held,active,land);
 return <div className="studio-dice-row" data-quintzee-rolling={!!rumble}>{values.map((v,i)=><div key={i} className="studio-die-box" data-held={held.includes(i)} data-rolling={!!rumble&&!held.includes(i)}><QuintzeeDie value={v} rolling={!!rumble&&!held.includes(i)}/><small>{held.includes(i)?'HELD':' '}</small></div>)}</div>;
}
export function RollDemos({samples,pcm,conductor,volume,disabled,beforePlay}:Props){
 const [kind,setKind]=useState('quintzee-roll'),[take,setTake]=useState('a'),[held,setHeld]=useState<number[]>([]);
 const [run,setRun]=useState<{kind:string;id:string;serial:number;held:number[]}|null>(null),[serial,setSerial]=useState(0),[phase,setPhase]=useState('Ready'),[count,setCount]=useState<number|null>(null);
 const surface=useRef<HTMLDivElement>(null),current=useRef(run),frame=useRef(0);current.current=run;
 const stopLoop=useRef<()=>void>(()=>{});
 const cancel=()=>{current.current=null;stopLoop.current();conductor.stop();cancelAnimationFrame(frame.current);setRun(null);setCount(null);setPhase('Stopped — no landing');};
 useEffect(()=>{const hidden=()=>{if(document.hidden)cancel();};window.addEventListener('studio-stop',cancel);window.addEventListener('pagehide',cancel);window.addEventListener('offline',cancel);document.addEventListener('visibilitychange',hidden);return()=>{conductor.stop();cancelAnimationFrame(frame.current);window.removeEventListener('studio-stop',cancel);window.removeEventListener('pagehide',cancel);window.removeEventListener('offline',cancel);document.removeEventListener('visibilitychange',hidden);};},[]);
 const scaled=(id:string)=>{const p=pcm.get(id)!;return {...p,samples:volume===100?p.samples:p.samples.map(x=>x*volume/100)};};
 const finish=()=>{const r=current.current;if(!r)return;current.current=null;stopLoop.current();conductor.stop();setRun(null);if(r.kind==='quintzee-roll'){setPhase('Stopped cleanly — no landing');return;}
  const id=5-r.held.length===1?'dice-land-soft':'dice-land',s=samples.find(x=>x.id===id)!;setPhase('Landed — '+(id==='dice-land'?'Dice Landing A':'Dice Landing B'));
  conductor.play({id,group:'landing',priority:25,cooldownMs:0,cue:pcmCue(scaled(id))},r.id+':landing');
 };
 const latestFinish=useRef(finish);latestFinish.current=finish;
 // This development-only adapter observes the actual production renderer's landing
 // commit, not its later onComplete callback. No production component is patched.
 useLayoutEffect(()=>{if(run?.kind!=='cup-roll'||!surface.current)return;const observer=new MutationObserver(()=>{
  const nodes=surface.current?.querySelectorAll('[data-die-final-value]');
  if(nodes?.length&&Array.from(nodes).every(n=>n.getAttribute('data-die-final-value')==='true'))latestFinish.current();
 });observer.observe(surface.current,{subtree:true,attributes:true,attributeFilter:['data-die-final-value']});return()=>observer.disconnect();},[run?.id]);
 function start(){beforePlay();platformAudio.unlock(true);const s=samples.find(x=>x.id===kind+'-'+take)!;const p=scaled(s.id),next=serial+1,id=auditionId();setPhase('Preparing…');
  const cue:AudioCue={durationMs:8000,schedule(ctx,dest,track){const b=ctx.createBuffer(1,p.samples.length,p.rate);b.copyToChannel(p.samples,0);const n=track(ctx.createBufferSource());n.buffer=b;n.loop=true;n.connect(dest);n.start();stopLoop.current=()=>{try{n.stop();}catch{}stopLoop.current=()=>{};};return true;}};
  conductor.play({id:s.id,priority:25,group:'rolling',cooldownMs:0,cue,onStart:()=>{setSerial(next);setRun({kind,id,serial:next,held:[...held]});setPhase('Rolling');}},id);
 }
 function countdown(){beforePlay();platformAudio.unlock(true);const s=samples.find(x=>x.id==='drop-countdown-'+take)!;conductor.play({id:s.id,priority:35,group:'countdown',cooldownMs:0,cue:pcmCue(scaled(s.id)),onStart:()=>{
  const start=performance.now(),beat=THREE_FIVE_SEVEN_DECISION_REVEAL_TIMING.countBeatMs;setPhase('3–2–1 Drop');const tick=()=>{const elapsed=performance.now()-start;setCount(elapsed>=3*beat?0:3-Math.floor(elapsed/beat));if(elapsed<3*beat)frame.current=requestAnimationFrame(tick);else setPhase('DROP — silent');};tick();
 }});}
 return <section className="roll-demos" id="rolling-demos"><p className="eyebrow">LISTEN IN MOTION</p><h2>Two rolls. Two personalities.</h2><p>Real Quintzee dice and rumble owner ({QUINTZEE_RUMBLE_MS} ms default), or the real shared physical-dice renderer (900 ms). Try holding four dice to hear Landing B.</p>
  <div className="roll-controls"><label>Experience<select aria-label="Roll experience" value={kind} onChange={e=>{beforePlay();setKind(e.target.value);}}><option value="quintzee-roll">Quintzee · electronic trill</option><option value="cup-roll">Yahtzee / Horses / SCC · cup</option></select></label><label>Take<select aria-label="Roll take" value={take} onChange={e=>{beforePlay();setTake(e.target.value);}}>{['a','b','c'].map(t=><option key={t} value={t}>Take {t.toUpperCase()}</option>)}</select></label></div>
  <div className="rolling-felt" ref={surface} data-demo-phase={phase}>
   {kind==='quintzee-roll'?<QuintzeeRoll serial={serial} held={run?.held??held} active={run?.kind==='quintzee-roll'} land={()=>latestFinish.current()}/>:<>
    {run?.kind==='cup-roll'?<DiceRollAnimation dice={values.map((value,i)=>({value,isHeld:held.includes(i)}))} animatingIndices={values.map((_,i)=>i).filter(i=>!run.held.includes(i))} targetPositions={values.map((_,i)=>({x:(i-2)*43,y:4,rotate:(i-2)*7})).filter((_,i)=>!run.held.includes(i))} originPosition={{x:0,y:-65}} scatterYOffset={0} runKey={run.id} revealOnLanding showWildHighlight={false} onComplete={()=>{}}/>:null}
    <div className="studio-dice-row">{values.map((v,i)=><div key={i} className="studio-die-box" style={{visibility:run&&!held.includes(i)?'hidden':'visible'}} data-held={held.includes(i)}><QuintzeeDie value={v} rolling={false}/><small>{held.includes(i)?'HELD':' '}</small></div>)}</div>
   </>}{count!==null&&<div className="countdown-demo" data-countdown={count}>{count||'DROP'}</div>}
  </div>
  <div className="hold-controls" aria-label="Held dice">{values.map((_,i)=><label key={i}><input type="checkbox" aria-label={'Hold die '+(i+1)} checked={held.includes(i)} disabled={!!run} onChange={()=>setHeld(h=>h.includes(i)?h.filter(n=>n!==i):[...h,i])}/> Hold {i+1}</label>)}</div>
  <div className="example-buttons"><button disabled={disabled||held.length===5} onClick={start}>▶ Roll selected take</button><button onClick={beforePlay}>Cancel roll</button><button disabled={disabled} onClick={countdown}>▶ 3–2–1 countdown</button></div><p className="demo-status" aria-live="polite">{phase}</p><p className="fine">The cup variations are edits of one real CC0 dice recording. Quintzee has no landing or tail. Held dice stay still. Speaker, Stop, leaving the page and interruption cancel the whole preview. These are studio demonstrations; gameplay has not been changed.</p>
 </section>;
}
