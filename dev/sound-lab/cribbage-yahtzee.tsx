import {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from './labAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import {presentQuintzeeHold} from '@/lib/audio/quintzeeHoldCue';
import {useYahtzeeRollSound} from '@/hooks/useYahtzeeRollSound';
import {CribbageCutCardReveal} from '@/components/CribbageCutCardReveal';
import {CribbagePlayCardAnimation} from '@/components/CribbagePlayCardAnimation';
import {CribbageDiscardToCribAnimation} from '@/components/CribbageDiscardToCribAnimation';
import {CribbagePegBoard} from '@/components/CribbagePegBoard';
import {CribbageCountingPhase} from '@/components/CribbageCountingPhase';
import {DiceRollAnimation} from '@/components/DiceRollAnimation';
import {HorsesDie} from '@/components/HorsesDie';
import type {CribbageState} from '@/lib/cribbageTypes';
import '@/index.css';
const players=[{id:'p1',user_id:LAB_USER,position:0},{id:'p2',user_id:'u2',position:1}];
const cut={rank:'K',suit:'spades' as const,value:10};
const base={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',cribOwnerPlayerId:'p2',cutCard:cut,playerStates:{p1:{pegScore:0},p2:{pegScore:0}}};
const hand=[{rank:'2',suit:'clubs'},{rank:'4',suit:'diamonds'},{rank:'6',suit:'hearts'},{rank:'8',suit:'spades'}];
const zeros={...base,crib:hand,pegging:{playedCards:players.flatMap(p=>hand.map(card=>({playerId:p.id,card})))}} as CribbageState;
const pairs={...zeros,pegging:{...zeros.pegging,playedCards:players.flatMap(p=>[{rank:'2',suit:'clubs'},{rank:'2',suit:'hearts'},{rank:'8',suit:'clubs'},{rank:'8',suit:'hearts'}].map(card=>({playerId:p.id,card})))}} as CribbageState;
platformAudio.install();platformAudio.setUser(LAB_USER);void preloadApprovedSounds();
(window as any).soundManager=platformAudio;
const nativePresent=platformAudio.present.bind(platformAudio);
(window as any).cueRequests=[];platformAudio.present=(event,...args)=>{(window as any).cueRequests.push({id:event.id,cue:!!event.cue,at:performance.now()});return nativePresent(event,...args);};
function App(){
 const [ready,setReady]=useState(false),[event,setEvent]=useState({kind:'none',id:0}),[scores,setScores]=useState({p1:0,p2:0}),[rolling,setRolling]=useState(false),[held,setHeld]=useState(false),[,refresh]=useState(0);
 const root=useRef<HTMLDivElement>(null),tray=useRef<HTMLDivElement>(null);
 const id='native:'+event.id;
 useYahtzeeRollSound(event.kind==='local'?'yahtzee:p1:'+id:null,rolling,true,tray);
 useEffect(()=>{preloadApprovedSounds().then(()=>setReady(true));return platformAudio.acquireGameplay();},[]);
 useEffect(()=>{if(!rolling)return;const t=setTimeout(()=>setRolling(false),1300);return()=>clearTimeout(t);},[rolling]);
 const emit=(kind:string)=>{setEvent(e=>({kind,id:e.id+1}));setScores({p1:0,p2:0});};
 const state=event.kind==='zero'?zeros:pairs;
 const timing={frame:{gameId:'native',dealerGameId:'d',roundId:id,handNumber:1,pauseVersion:0,paused:false,state},current:()=>true,elapsed:()=>0,releaseDelay:()=>0};
 return <main style={{padding:20,background:'#12432f',color:'white',minHeight:'100vh'}}>
 <p data-ready={ready}>Cribbage / Yahtzee actual component audio proof</p>
 <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
 <button onClick={()=>{platformAudio.setPreference(LAB_USER,true);platformAudio.unlock(true);}}>Unmute</button>
 <button onClick={()=>platformAudio.setPreference(LAB_USER,false)}>Mute</button>
 <button onClick={()=>refresh(n=>n+1)}>Rerender</button>
 {['cut','cold-cut','self-play','opponent-play','self-discard','opponent-discard','zero','pairs','opponent'].map(kind=><button key={kind} onClick={()=>emit(kind)}>{kind}</button>)}
 {[1,2,4,12].map(points=><button key={points} onClick={()=>setScores(s=>({...s,p1:s.p1+points}))}>Award {points}</button>)}
 <button onClick={()=>setScores(s=>({...s,p2:s.p2+2}))}>Opponent pair</button>
 <button onClick={()=>{emit('local');setRolling(true);}}>Local roll</button>
 <button onClick={()=>{setHeld(h=>!h);presentQuintzeeHold(LAB_USER,id,!held,tray.current);}}>Toggle hold</button>
 </div>
 <section ref={root} style={{width:600,height:400,position:'relative',marginTop:20}}>
 <CribbagePegBoard players={players} playerStates={zeros.playerStates} winningScore={121} overrideScores={scores} audioScope={id} audioActive={event.kind!=='zero'&&event.kind!=='pairs'}/>
 <div ref={tray} style={{display:'flex',width:350,height:90}}>{[1,2,3,4,5].map(n=><HorsesDie key={n} value={n} isHeld={held&&n===1} isRolling={rolling&&!(held&&n===1)} size="md"/>)}</div>
 <div data-card-anchor="opp-stack-1" style={{position:'absolute',left:440,top:100,width:40,height:60}}/>
 {[1,2].map(n=><div key={n} data-card-anchor={'crib-slot-'+n} style={{position:'absolute',left:200+n*45,top:200,width:40,height:60}}/>)}
 {(event.kind==='cut'||event.kind==='cold-cut')&&<CribbageCutCardReveal key={id} card={cut} audioLive={event.kind==='cut'} handBoundaryKey={id} widthPx={60} cardBackColors={{color:'#123',darkColor:'#012'}}/>}
 {event.kind.endsWith('-play')&&<CribbagePlayCardAnimation key={id} intent={{id,mode:event.kind==='self-play'?'self':'opponent',card:cut,opponentPosition:1,sourceRect:event.kind==='self-play'?{x:100,y:400,width:40,height:60}:null,destRect:{x:300,y:300,width:40,height:60}}} onSettled={()=>{}}/>}
 {event.kind.endsWith('-discard')&&<CribbageDiscardToCribAnimation key={id} intent={{id,mode:event.kind==='self-discard'?'self':'opponent',cardCount:2,opponentPosition:1,sourceRects:event.kind==='self-discard'?[{x:100,y:400,width:40,height:60},{x:150,y:400,width:40,height:60}]:undefined}} onSettled={()=>{}}/>}
 {(event.kind==='zero'||event.kind==='pairs')&&<CribbageCountingPhase key={id} cribbageState={state} players={players} initialScores={{p1:0,p2:0}} onScoreUpdate={setScores} countingTime={timing} cardBackColors={{color:'#123',darkColor:'#012'}} onCountingComplete={()=>{}} audioActive debugContext={{gameId:'native',roundId:id,userId:LAB_USER,handNumber:1}}/>}
 {event.kind==='opponent'&&<DiceRollAnimation key={id} audioIdentity={'yahtzee:p2:'+id} runKey={id} dice={[{value:6,isHeld:false}]} animatingIndices={[0]} targetPositions={[{x:200,y:200,rotate:0}]} originPosition={{x:450,y:100}} onComplete={()=>{}}/>}
 </section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
