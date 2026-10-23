import {useMemo} from 'react';
import {MegaArcade} from '@/components/megaCardGolf/MegaArcade';
import {MEGA_SEQUENTIAL_RULESET} from '@/lib/megaCardGolf/config';
import {MegaAuthority,freshStore} from '@/lib/megaCardGolf/authority';
import type {AudioManager} from '@/lib/audio/audioManager';

/** Actual controller with an in-memory authority; the reset link starts a fresh demo. */
export function ControllerPreview({audio}:{audio:AudioManager}){
 const request=useMemo(()=>{
  const data=freshStore();data.courses.forEach(c=>{c.enabled=true;});
  const authority=new MegaAuthority(data,()=>crypto.randomUUID(),()=>Array.from({length:52},(_,i)=>i),()=>{},MEGA_SEQUENTIAL_RULESET);
  return async <T,>(body:any):Promise<T>=>{
   await new Promise(resolve=>setTimeout(resolve,60));
   if(body.op==='catalog')return {courses:authority.data.courses,boards:[],archives:[],active:Object.values(authority.data.runs).find(r=>r.status==='active')?.id??null} as T;
   if(body.op==='leaderboard')return {rows:[],self:null,personalBest:null} as T;
   if(body.op==='start')return authority.start('local-fixture',body.courseId,body.requestId,Date.now()) as T;
   if(body.op==='state')return authority.state('local-fixture',body.runId,Date.now()) as T;
   if(body.op==='action')return authority.action('local-fixture',body.runId,body.requestId,body.revision,body.hole,body.intent,Date.now()) as T;
   throw Error('Unsupported local fixture operation');
  };
 },[]);
 return <><a href="?controller" style={{position:'fixed',top:0,right:0,zIndex:10001,fontSize:10,background:'#ffe393',padding:'3px 6px'}}>Reset local demo</a><MegaArcade request={request} audio={audio} userId="local-fixture" preview/></>;
}
