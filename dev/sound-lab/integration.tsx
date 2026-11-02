import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from './labAudio';
import {preloadApprovedSounds,approvedSound} from '@/lib/audio/approvedSounds';
import {presentSound} from '@/lib/audio/presentationSound';
import {DiceRollAnimation} from '@/components/DiceRollAnimation';
import {HolmChuckyRevealCard} from '@/components/HolmChuckyRevealCard';
import {CribbagePegBoard} from '@/components/CribbagePegBoard';
import {CribbageCountingPhase} from '@/components/CribbageCountingPhase';
import {MegaCard} from '@/components/megaCardGolf/MegaCardGolfGame';
import '@/components/megaCardGolf/megaCardGolf.css';
import {ChoppedAnimation} from '@/components/ChoppedAnimation';
import type {CribbageState} from '@/lib/cribbageTypes';
import '@/index.css';
const players=[{id:'p1',user_id:LAB_USER,position:0,profiles:{username:'One'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Two'}}];
const cards=[{rank:'2',suit:'clubs'},{rank:'2',suit:'hearts'},{rank:'8',suit:'clubs'},{rank:'8',suit:'hearts'}];
const cribState={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',crib:[],cutCard:{rank:'K',suit:'spades'},playerStates:{p1:{pegScore:0},p2:{pegScore:0}},pegging:{playedCards:cards.map(card=>({playerId:'p1',card}))}} as unknown as CribbageState;
const dispose=platformAudio.install();platformAudio.setUser(LAB_USER);void preloadApprovedSounds();
(window as any).integrationDebug={manager:platformAudio,approvedSound,presentSound};
if(import.meta.hot)import.meta.hot.dispose(dispose);
function App(){
 const [ready,setReady]=useState(false),[event,setEvent]=useState({id:0,kind:'none',count:1}),[flip,setFlip]=useState(false),[score,setScore]=useState(0),[hidden,setHidden]=useState(false),[,rerender]=useState(0);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{void preloadApprovedSounds().then(()=>setReady(true));return platformAudio.acquireGameplay();},[]);
 const emit=(kind:string,count=1)=>{setFlip(false);setEvent(e=>({id:e.id+1,kind,count}));};
 const id='integration:'+event.id;
 return <main style={{padding:20,color:'white',background:'#122820',minHeight:'100vh'}}>
  <h1>Sound integration qualification</h1><p data-ready={ready}>Local fixtures · no server gameplay or financial writes</p>
  <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
   <button onClick={()=>emit('dice',1)}>One die</button><button onClick={()=>emit('dice',5)}>Five dice</button>
   <button onClick={()=>emit('mega-flip')}>Prepare Mega flip</button><button onClick={()=>emit('mega-slide')}>Prepare Mega slide</button>
   <button onClick={()=>emit('holm')}>Prepare flip</button><button onClick={()=>setFlip(true)}>Flip</button>
   <button onClick={()=>setScore(s=>s+2)}>Move peg</button><button onClick={()=>emit('count')}>Score pairs</button>
   <button onClick={()=>emit('cracked')}>Cracked</button><button onClick={()=>presentSound('winner','winner:'+performance.now(),root.current)}>Winner</button>
   <button onClick={()=>platformAudio.setPreference(LAB_USER,false)}>Mute</button><button onClick={()=>{platformAudio.setPreference(LAB_USER,true);platformAudio.unlock(true);}}>Unmute</button>
   <button onClick={()=>setHidden(h=>!h)}>Hide surface</button><button onClick={()=>rerender(n=>n+1)}>Rerender</button>
   <button onClick={()=>{for(let n=0;n<20;n++)presentSound('slide',`burst:${event.id}:${n}`,root.current);}}>Dense deal</button>
  </div>
  <section ref={root} data-integration-surface style={{display:hidden?'none':'block',position:'relative',width:560,height:420,background:'#174c32',marginTop:24,padding:20}}>
   <CribbagePegBoard players={players} playerStates={cribState.playerStates} winningScore={121} overrideScores={{p1:score,p2:0}} audioScope="integration:pegs" audioActive/>
   {event.kind==='dice'&&<DiceRollAnimation key={id} audioIdentity={id} runKey={id} dice={Array.from({length:5},()=>({value:6,isHeld:false}))} animatingIndices={Array.from({length:event.count},(_,i)=>i)} targetPositions={Array.from({length:event.count},(_,i)=>({x:100+i*55,y:150,rotate:0}))} originPosition={{x:200,y:0}} onComplete={()=>{}} revealOnLanding/>}
   {event.kind==='holm'&&<div style={{width:70,height:105,margin:35}}><HolmChuckyRevealCard presentationKey={id} card={{rank:'K',suit:'♠'}} revealed={flip}/></div>}
   {event.kind==='count'&&<CribbageCountingPhase key={id} cribbageState={cribState} players={players} cardBackColors={{color:'#123',darkColor:'#012'}} initialScores={{p1:0,p2:0}} onCountingComplete={()=>{}} audioActive debugContext={{gameId:'integration',roundId:id,userId:LAB_USER,handNumber:1}}/>}
   {event.kind.startsWith('mega-')&&<div className="mega-game-plane" style={{position:'relative',width:400,height:230}}><div className="mega-draw-card" style={{width:80,height:120}}><MegaCard card={8} label="Source" disabled/></div><div style={{position:'absolute',left:150,top:30,width:80,height:120}}><MegaCard card={flip?9:null} label="Target" audioIdentity={id} onSound={presentSound} stage={flip?(event.kind==='mega-flip'?'reveal':'arrive'):undefined}/></div></div>}
   {event.kind==='cracked'&&<ChoppedAnimation key={id} show resultIdentity={id}/>}
  </section>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
