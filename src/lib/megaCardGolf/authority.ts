import {INITIAL_COURSES,changesCompetition,settings,type CourseConfig,type CourseId,type CourseSettings} from './config';
import {applyIntent,createRun,projectRun,recoverRun,type Intent,type MegaRun} from './engine';
export interface BoardResult {runId:string;owner:string;name:string;courseId:CourseId;boardId:string;configId:string;score:number;completedAt:number}
export interface Store {courses:CourseConfig[];configs:CourseConfig[];runs:Record<string,MegaRun>;results:BoardResult[];receipts:Record<string,{fingerprint:string;runId:string}>}
export const freshStore=():Store=>({courses:structuredClone(INITIAL_COURSES),configs:structuredClone(INITIAL_COURSES),runs:{},results:[],receipts:{}});
export function rankBoard(rows:BoardResult[],courseId:CourseId,boardId:string){
 const ordered=rows.filter(r=>r.courseId===courseId&&r.boardId===boardId).sort((a,b)=>a.score-b.score||a.completedAt-b.completedAt||a.runId.localeCompare(b.runId));
 let rank=0;return ordered.map((r,i)=>{if(i===0||r.score!==ordered[i-1].score)rank=i+1;return {...r,rank};});
}
/** Local single-process authority fixture. Production must replace its transaction/store with locked SQL. */
export class MegaAuthority {
 constructor(public data:Store,private uuid:()=>string,private shuffle:()=>number[],private persist:(s:Store)=>void=()=>{}){}
 private transaction<T>(fn:()=>T):T {const old=this.data;this.data=structuredClone(old);try{const result=fn();this.persist(this.data);return result;}catch(e){this.data=old;throw e;}}
 private finish(run:MegaRun){
  if(run.status==='completed'&&!this.data.results.some(r=>r.runId===run.id))this.data.results.push({runId:run.id,owner:run.owner,name:'Local player',courseId:run.config.id,boardId:run.config.boardId,configId:run.config.configId,score:run.score,completedAt:run.completedAt!});
 }
 tick(at:number){
  if(!Object.values(this.data.runs).some(r=>r.status==='active'&&r.deadline<=at))return;
  this.transaction(()=>{for(const run of Object.values(this.data.runs)){const next=recoverRun(run,at);this.data.runs[run.id]=next;this.finish(next);}});
 }
 state(owner:string,id:string,at:number){this.tick(at);const run=this.data.runs[id];if(!run||run.owner!==owner)throw Error('Run not found for this player');return projectRun(run,at);}
 start(owner:string,courseId:CourseId,requestId:string,at:number){
  this.tick(at);return this.transaction(()=>{
   const key=owner+'/'+requestId,fingerprint='start/'+courseId,receipt=this.data.receipts[key];
   if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('Request identity reused');return this.state(owner,receipt.runId,at);}
   const course=this.data.courses.find(c=>c.id===courseId);if(!course?.enabled)throw Error('Course is unavailable');
   const active=Object.values(this.data.runs).find(r=>r.owner===owner&&r.status==='active');
   if(active&&active.config.id!==courseId)throw Error('Finish or abandon your active course first');
   const run=active??createRun(this.uuid(),owner,course,Array.from({length:course.holes},()=>this.shuffle()),at);
   this.data.runs[run.id]=run;this.data.receipts[key]={fingerprint,runId:run.id};return projectRun(run,at);
  });
 }
 action(owner:string,id:string,requestId:string,revision:number,hole:number,intent:Intent,at:number){
  this.tick(at);return this.transaction(()=>{
   const run=this.data.runs[id];if(!run||run.owner!==owner)throw Error('Run not found for this player');
   const key=owner+'/'+requestId,fingerprint=JSON.stringify({id,revision,hole,intent}),receipt=this.data.receipts[key];
   if(receipt){if(receipt.fingerprint!==fingerprint)throw Error('Request identity reused');return projectRun(run,at);}
   if(run.revision!==revision||run.hole!==hole)throw Error('Stale action. Reconnect to continue.');
   const next=applyIntent(run,intent,at);this.data.runs[id]=next;this.finish(next);this.data.receipts[key]={fingerprint,runId:id};return projectRun(next,at);
  });
 }
 saveCourse(id:CourseId,revision:number,input:CourseSettings,boardChoice:'retain'|'archive'|undefined){return this.transaction(()=>{
  const index=this.data.courses.findIndex(c=>c.id===id),old=this.data.courses[index];if(!old||old.revision!==revision)throw Error('Course settings changed. Reload Defaults.');
  const nextSettings=settings(input);
  if(changesCompetition(old,nextSettings)&&!['retain','archive'].includes(boardChoice??''))throw Error('Choose retain or archive explicitly');
  if(boardChoice!==undefined&&!['retain','archive'].includes(boardChoice))throw Error('Invalid leaderboard choice');
  const next={...nextSettings,id,revision:old.revision+1,configId:this.uuid(),boardId:boardChoice==='archive'?this.uuid():old.boardId};
  this.data.courses[index]=next;this.data.configs.push(next);return next;
 });}
}
