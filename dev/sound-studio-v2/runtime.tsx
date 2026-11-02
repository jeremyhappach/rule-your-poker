import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from './labAudio';
import {preloadApprovedSounds,approvedSound,type ApprovedSound} from '@/lib/audio/approvedSounds';
import {presentSound} from '@/lib/audio/presentationSound';
import {useLiveSoundEvent} from '@/hooks/useLiveSoundEvent';
import {DiceRollAnimation} from '@/components/DiceRollAnimation';
import {LegEarnedAnimation} from '@/components/LegEarnedAnimation';
import {SweepTheLegsAnimation} from '@/components/SweepTheLegsAnimation';
import {useQuintzeeScorePresentation} from '@/components/quintzee/useQuintzeeScorePresentation';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import '@/index.css';
const dispose=platformAudio.install();platformAudio.setUser(LAB_USER);
if(import.meta.hot)import.meta.hot.dispose(dispose);
function App(){
 const [ready,setReady]=useState(false),[event,setEvent]=useState({id:0,sound:'scorePost' as ApprovedSound}),[visible,setVisible]=useState(true);
 const [sweep,setSweep]=useState(false),[leg,setLeg]=useState(false),[quintzee,setQuintzee]=useState(0);
 const surface=useRef<HTMLDivElement>(null);
 const id=event.id?'runtime:'+event.id:null;
 const start=useLiveSoundEvent(id,!['sweep','myLeg','opponentLeg','fiveOnes'].includes(event.sound),event.sound,()=>surface.current);
 const snapshot={scope:'runtime:quintzee',revision:quintzee+1,state:{board:{phase:'playing',rules:{version:'quintzee/3'},scores:quintzee?{yahtzee:50}:{},baseScore:quintzee?50:0,upperBonusAwarded:0}}} as QuintzeeSnapshot;
 useQuintzeeScorePresentation(snapshot,1000,LAB_USER,true,surface);
 useEffect(()=>{void preloadApprovedSounds().then(()=>setReady(true));return platformAudio.acquireGameplay();},[]);
 (window as any).runtimeDebug={approvedSound,manager:platformAudio,present:(sound:ApprovedSound,key:string)=>presentSound(sound,key,surface.current)};
 const emit=(sound:ApprovedSound)=>{setLeg(false);setSweep(false);setEvent(e=>({id:e.id+1,sound}));};
 return <main style={{padding:18,background:'#122820',color:'white',minHeight:'100vh'}}>
  <h1>V2 presentation qualification</h1><p data-ready={ready}>Local fixtures. No server or financial writes.</p>
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   <button onClick={()=>{platformAudio.setPreference(LAB_USER,true);platformAudio.unlock(true);}}>Unmute</button>
   <button onClick={()=>platformAudio.setPreference(LAB_USER,false)}>Mute</button>
   <button onClick={()=>setVisible(v=>!v)}>Visibility</button>
   {(['noQualify','midnight','fiveOnes','scorePost','yahtzee','myLeg','opponentLeg','sweep','chucky'] as ApprovedSound[]).map(sound=><button key={sound} onClick={()=>emit(sound)}>{sound}</button>)}
   <button onClick={()=>{setSweep(true);setLeg(true);}}>Start animation</button>
   <button onClick={()=>{setLeg(false);setSweep(false);}}>Finish</button>
   <button onClick={()=>setQuintzee(1)}>Post Quintzee</button>
  </div>
  <div ref={surface} style={{display:visible?'block':'none',minHeight:400,position:'relative',background:'#16462c',marginTop:30}}>
   {event.sound==='fiveOnes'&&<DiceRollAnimation key={id} audioIdentity={'horses:'+id} runKey={id!} dice={Array.from({length:5},()=>({value:1,isHeld:false}))} animatingIndices={[0,1,2,3,4]} targetPositions={Array.from({length:5},(_,i)=>({x:50+i*45,y:100,rotate:0}))} originPosition={{x:120,y:0}} onComplete={()=>{}} revealOnLanding/>}
   <LegEarnedAnimation show={leg&&['myLeg','opponentLeg'].includes(event.sound)} playerName="Fixture" onSoundStart={()=>start()}/>
  </div>
  <SweepTheLegsAnimation show={sweep&&event.sound==='sweep'} onSoundStart={node=>start(visible?node:null)}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
