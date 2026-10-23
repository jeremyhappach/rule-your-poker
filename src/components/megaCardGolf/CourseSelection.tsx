import {useEffect,useState,type CSSProperties} from 'react';
import {COURSE_IDS,type CourseConfig,type CourseId} from '@/lib/megaCardGolf/config';
export interface ScoreRow {runId:string;name:string;score:number;rank:number;configId?:string}
export type MegaRequest = <T>(body:object)=>Promise<T>;
export const courseTheme=(id:CourseId)=>'theme-'+COURSE_IDS.indexOf(id);
export function courseArtwork(id:CourseId):CSSProperties {
 return id==='sunny-meadows'
  ? {backgroundImage:"url('/mega-card-golf/sunny-meadows-v2.png')",backgroundSize:'cover',backgroundPosition:'center 65%'}
  : {backgroundImage:"url('/mega-card-golf/courses-v1.png')",backgroundSize:'300% auto',backgroundPosition:id==='coastal-links'?'50% center':'100% center'};
}
function CourseTile({course,request,onSelect,busy}:{course:CourseConfig;request:MegaRequest;onSelect:(id:CourseId)=>void;busy:boolean}){
 const [record,setRecord]=useState<number|null|undefined>(),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let alive=true;setRecord(undefined);setFailed(false);
  void request<{rows:ScoreRow[]}>({op:'leaderboard',courseId:course.id,boardId:course.boardId,window:'all'})
   .then(board=>{if(alive)setRecord(board.rows[0]?.score??null);})
   .catch(()=>{if(alive)setFailed(true);});
  return()=>{alive=false;};
 },[course.id,course.boardId,request]);
 return <button className={'mega-course-tile '+courseTheme(course.id)} style={courseArtwork(course.id)} disabled={busy} onClick={()=>onSelect(course.id)} aria-label={'Select '+course.name}>
  <span className="mega-tile-top"><strong>{course.name}</strong><span className="mega-difficulty">{course.difficulty}</span></span>
  <span className="mega-record">Course record: {failed?'Unavailable':record===undefined?'Loading…':record===null?'—':record===0?'E':record>0?'+'+record:record}</span>
  <span className="mega-tile-limits"><span><b>{course.holes}</b> holes</span><span><b>{course.discardAllowance}</b> {course.discardAllowance===1?'discard':'discards'} per hole</span><span><b>{course.stockAllowance}</b> draws / hole</span></span>
 </button>;
}
export function CourseSelection({courses,request,onSelect,busy}:{courses:CourseConfig[];request:MegaRequest;onSelect:(id:CourseId)=>void;busy:boolean}){
 return <main className="mega-selection"><h1>Select a Course</h1><div className="mega-course-grid">{courses.map(course=><CourseTile key={course.id+'/'+course.boardId} course={course} request={request} onSelect={onSelect} busy={busy}/>)}</div></main>;
}
