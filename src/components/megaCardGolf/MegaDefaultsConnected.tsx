import {useEffect,useState} from 'react';
import {MegaDefaultsEditor} from './MegaDefaultsEditor';
import {arcadeRequest} from '@/lib/arcade/client';
import type {CourseConfig} from '@/lib/megaCardGolf/config';
import './megaCardGolf.css';
export function MegaDefaultsConnected(){
 const [courses,setCourses]=useState<CourseConfig[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const reload=async()=>{const data=await arcadeRequest<{courses:CourseConfig[];isAdmin:boolean}>({game:'mega-card-golf',op:'catalog'});if(!data.isAdmin)throw Error('Administrator access required');setCourses(data.courses);};
 useEffect(()=>{void reload().catch(e=>setError(e.message));},[]);
 return <div className="mega-defaults-embedded">{error&&<p role="alert">{error}</p>}{courses.length?<MegaDefaultsEditor key={courses.map(c=>c.revision).join(',')} courses={courses} busy={busy} onSave={async(c,draft,choice)=>{setBusy(true);setError('');try{await arcadeRequest({game:'mega-card-golf',op:'defaults',id:c.id,revision:c.revision,settings:draft,boardChoice:choice});await reload();}catch(e){setError(e instanceof Error?e.message:'Save failed');}finally{setBusy(false);}}}/>:<p>Loading course defaults…</p>}</div>;
}
