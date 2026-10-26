import {useNavigate} from 'react-router-dom';
import {MegaArcade} from './MegaArcade';
import {arcadeRequest} from '@/lib/arcade/client';
import {platformAudio} from '@/lib/audio/platformAudio';
import {supabase} from '@/integrations/supabase/client';
const request=<T,>(body:object)=>arcadeRequest<T>({...body,game:'mega-card-golf'});
const subscribe=(runId:string,changed:(revision?:number)=>void)=>{const channel=supabase.channel('mega:'+runId+':'+crypto.randomUUID()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'arcade_revisions',filter:'run_id=eq.'+runId},payload=>{
 const row=payload.new;if(row.run_id!==runId)return;
 changed(typeof row.revision==='number'&&Number.isSafeInteger(row.revision)&&row.revision>=0?row.revision:undefined);
}).subscribe(status=>{if(status==='SUBSCRIBED')changed();});return()=>{void supabase.removeChannel(channel);};};
export function MegaArcadePage({userId}:{userId:string}){const navigate=useNavigate();return <MegaArcade key={userId} request={request} audio={platformAudio} userId={userId} subscribe={subscribe} onBack={()=>navigate('/arcade')}/>;}
