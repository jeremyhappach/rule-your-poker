import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {platformAudio,LAB_USER} from './labAudio';
import {preloadApprovedSounds} from '@/lib/audio/approvedSounds';
import {CribbageCountingPhase} from '@/components/CribbageCountingPhase';
import {CribbagePegBoard} from '@/components/CribbagePegBoard';
import {CanonicalAnnouncementProvider,useAnnouncements} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementProvider';
import {CanonicalAnnouncementLayer} from '@/lib/canonicalShell/announcements/CanonicalAnnouncementLayer';
import {createCountingClock} from '@/lib/cribbage/countingClock';
import {cribbageScoringScope,publishCribbageScoringNotice} from '@/lib/cribbage/scoringPresentation';
import type {CribbageState} from '@/lib/cribbageTypes';
import '@/index.css';

const players=[{id:'p1',user_id:LAB_USER,position:0,profiles:{username:'One'}},{id:'p2',user_id:'u2',position:1,profiles:{username:'Two'}}];
const crib=[{rank:'7',suit:'clubs',value:7},{rank:'7',suit:'diamonds',value:7},{rank:'7',suit:'hearts',value:7},{rank:'K',suit:'spades',value:10}];
const state={phase:'counting',turnOrder:['p1','p2'],dealerPlayerId:'p2',cribOwnerPlayerId:'p2',crib,
 cutCard:{rank:'A',suit:'spades',value:1},pegging:{playedCards:players.flatMap(p=>[{rank:'3',suit:'clubs',value:3},{rank:'6',suit:'diamonds',value:6},{rank:'10',suit:'hearts',value:10},{rank:'K',suit:'spades',value:10}].map(card=>({playerId:p.id,card})))},playerStates:{p1:{pegScore:0},p2:{pegScore:12}}} as unknown as CribbageState;
platformAudio.install();platformAudio.setUser(LAB_USER);
const evidence=(window as any).sequenceEvidence={cues:[],completedAt:null,successorAt:null};
const present=platformAudio.present.bind(platformAudio);
platformAudio.present=(event,...args)=>{
 if(event.id.startsWith('cribbage-score:'))evidence.cues.push({id:event.id,at:performance.now(),duration:event.cue?.durationMs,
   title:document.querySelector('[data-canonical-announcement-content]')?.textContent,
   highlighted:[...document.querySelectorAll('[data-card-highlighted="true"]')].map(e=>e.getAttribute('data-card-id'))});
 return present(event,...args);
};
function Sequence({id}:{id:number}){
 const rail=useAnnouncements(),railRef=useRef(rail);railRef.current=rail;
 const clock=useMemo(()=>{const c=createCountingClock(()=>{});c.accept(c.request(),performance.now(),new Date().toISOString(),{
   gameId:'sequence',dealerGameId:'dealer',roundId:'old-'+id,handNumber:1,pauseVersion:0,paused:false,state});return c;},[id]);
 useSyncExternalStore(clock.subscribe,clock.getSnapshot);
 const time=useRef(clock.getSnapshot()!).current;
 const [done,setDone]=useState(false),[scores,setScores]=useState({p1:0,p2:0});
 const advanced=useRef(false);
 useEffect(()=>{if(scores.p2!==6||advanced.current)return;advanced.current=true;evidence.successorAt=performance.now();
   clock.accept(clock.request(),performance.now(),new Date().toISOString(),{...time.frame,roundId:'next-'+id,handNumber:2});
 },[scores.p2,clock,time,id]);
 const announce=useCallback((text:string|null,label:string|null,key?:number,target?:number,category?:string,onRetired?:(reason:string)=>void)=>{
   const roundId='old-'+id;
   if(!text){railRef.current.retireTransientScope(cribbageScoringScope('sequence',roundId));return;}
   publishCribbageScoringNotice(railRef.current,{gameId:'sequence',roundId,id:[roundId,target,key,text].join(':'),title:label+': '+text,
     ttlMs:category==='total'?2500:0,onRetired});
 },[id]);
 return <><CanonicalAnnouncementLayer/><section data-current-hand={done?'next':'old'} style={{position:'relative',height:420,width:600}}>
   <CribbagePegBoard players={players} playerStates={state.playerStates} winningScore={121} overrideScores={done?undefined:scores}
     audioScope={advanced.current?'next-'+id:'old-'+id} audioActive={done}/>
   {done?<p>Next hand dealing</p>:<CribbageCountingPhase cribbageState={state} players={players} countingTime={time}
     onCountingComplete={()=>{evidence.completedAt=performance.now();setDone(true);}}
     onScoreUpdate={setScores} onAnnouncementChange={announce} initialScores={{p1:0,p2:0}}
     persistedTargetIndex={2} persistedBeatIndex={-1} persistedHandKey={'old-'+id}
     cardBackColors={{color:'#123',darkColor:'#012'}} audioActive
     debugContext={{gameId:'sequence',roundId:'old-'+id,handNumber:1,userId:LAB_USER}}/>}
 </section></>;
}
function App(){const [ready,setReady]=useState(false),[id,setId]=useState(0);
 useEffect(()=>{preloadApprovedSounds().then(()=>setReady(true));return platformAudio.acquireGameplay();},[]);
 return <main style={{padding:30,color:'white',background:'#12432f',minHeight:700}} data-ready={ready}>
   <button onClick={()=>{evidence.cues=[];evidence.completedAt=null;evidence.successorAt=null;platformAudio.setPreference(LAB_USER,true);platformAudio.unlock(true);setId(n=>n+1);}}>Start</button>
   <button onClick={()=>platformAudio.setPreference(LAB_USER,false)}>Mute</button>
   <CanonicalAnnouncementProvider dealerGameId="sequence">{id>0&&<Sequence key={id} id={id}/>}</CanonicalAnnouncementProvider>
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
