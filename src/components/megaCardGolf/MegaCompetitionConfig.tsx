import {useId} from 'react';
import type {CourseConfig} from '@/lib/megaCardGolf/config';
import {competitionConfig,MEGA_HOLE_COUNTS,type MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';
import './competition.css';
export function MegaCompetitionSettings({courses,value,onChange,disabled=false}:{courses:readonly CourseConfig[];value:MegaCompetitionConfig;onChange:(value:MegaCompetitionConfig)=>void;disabled?:boolean}){
 const id=useId();
 return <div className="mega-competition-config"><label htmlFor={id+'-course'}>Course<select id={id+'-course'} disabled={disabled} value={value.course.id} onChange={e=>{const course=courses.find(c=>c.id===e.target.value);if(course)onChange(competitionConfig(course,value.course.holes,value.version));}}>{courses.filter(c=>c.enabled).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  <label htmlFor={id+'-holes'}>Number of Holes<select id={id+'-holes'} disabled={disabled} value={value.course.holes} onChange={e=>onChange(competitionConfig(value.course,Number(e.target.value),value.version))}>{MEGA_HOLE_COUNTS.map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>;
}
