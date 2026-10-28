import {useEffect,useMemo,useState} from 'react';
import {MegaArcade} from '@/components/megaCardGolf/MegaArcade';
import {MegaAuthority,freshStore} from '@/lib/megaCardGolf/authority';
import {MEGA_SEQUENTIAL_RULESET} from '@/lib/megaCardGolf/config';
import type {AudioManager} from '@/lib/audio/audioManager';

/** Real Arcade controller with a disposable local authority and an explicit fixture clock. */
export function SequencePreview({audio}:{audio:AudioManager}){
 const [sound,setSound]=useState(false);
 useEffect(()=>{const uninstall=audio.install();audio.setUser('local-fixture');return uninstall;},[audio]);
 const mode=useMemo(()=>new URLSearchParams(location.search).get('sequence')??'hole-end',[]);
 const fixture=useMemo(()=>{
  const data=freshStore();data.courses.forEach(c=>{c.enabled=true;});
  const faces=[4,6,9,1,19,22],deck=[...faces,...Array.from({length:52},(_,i)=>i).filter(c=>!faces.includes(c))];
  const authority=new MegaAuthority(data,()=>crypto.randomUUID(),()=>deck,()=>{},MEGA_SEQUENTIAL_RULESET);
  let offset=0,notify=()=>{};
  const now=()=>Date.now()+offset;
  const request=async<T,>(body:any):Promise<T>=>{
   if(body.op==='catalog')return {courses:authority.data.courses,boards:[],archives:[],active:Object.values(authority.data.runs).find(r=>r.status==='active')?.id??null} as T;
   if(body.op==='leaderboard'){const completed=Object.values(authority.data.runs).filter(r=>r.status==='completed');return {rows:completed.map(r=>({runId:r.id,name:'Local player',score:r.score,rank:1})),self:null,personalBest:completed[0]?.score??null} as T;}
   if(body.op==='start'){
    const pastHoles=mode==='game-end'?8:mode==='hole-start'?3:1;
    const started=authority.start('local-fixture',body.courseId,body.requestId,now()-pastHoles*308200);
    return authority.state('local-fixture',started.id,now()) as T;
   }
   if(body.op==='state')return authority.state('local-fixture',body.runId,now()) as T;
   if(body.op==='action')return authority.action('local-fixture',body.runId,body.requestId,body.revision,body.hole,body.intent,now()) as T;
   throw Error('Unsupported local preview operation');
  };
  return {request,subscribe:(_id:string,cb:()=>void)=>{notify=cb;return()=>{notify=()=>{};};},finish:()=>{const run=Object.values(authority.data.runs).find(r=>r.status==='active');if(run){offset=run.deadline-Date.now();notify();}}};
 },[mode]);
 return <><nav className="polish-gameplay-tools"><a href="?sequence=hole-start">Hole start</a><a href="?sequence=hole-end">Hole end</a><a href="?sequence=game-end">Game end</a><button onClick={()=>{setSound(!sound);audio.setPreference('local-fixture',!sound);audio.unlock(true);}}>Sound {sound?'on':'off'}</button><button onClick={fixture.finish}>Finish current hole (local clock)</button><a href={'?sequence='+mode}>Reset</a></nav><div className="polish-sequence-host"><MegaArcade request={fixture.request} subscribe={fixture.subscribe} audio={audio} userId="local-fixture"/></div></>;
}
