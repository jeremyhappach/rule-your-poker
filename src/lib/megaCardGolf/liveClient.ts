import {supabase} from '@/integrations/supabase/client';
import type {projectLive} from '../../../server/megaCardGolf/multiplayer';
export type MegaLiveView=ReturnType<typeof projectLive>;
export async function megaLiveRequest(body:Record<string,unknown>):Promise<MegaLiveView>{
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('mega:authentication_required');
 const response=await fetch('/api/mega-golf',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok||result.error)throw Error(response.status>=500?'Connection uncertain. Reconnect to retry.':result.error??'mega:request_failed');return result;
}
