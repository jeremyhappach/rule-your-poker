import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
export function useOriginalsAccess(sessionId:string){
 const [access,setAccess]=useState<Record<string,boolean>>({});
 useEffect(()=>{let alive=true;setAccess({});void supabase.rpc('originals_capabilities' as never,{p_session_id:sessionId} as never).then(({data,error})=>{if(alive&&!error)setAccess(data as Record<string,boolean>);});return()=>{alive=false;};},[sessionId]);
 return access;
}
