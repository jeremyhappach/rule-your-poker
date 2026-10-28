import {useEffect,useState,useRef} from 'react';
import {supabase} from '@/integrations/supabase/client';
/** User-owned presentation preference, independent of the frozen match clock. */
export function useCanastaHelpers(userId:string,enabled=true){
 const generation=useRef(0);
 const [helpers,setHelpers]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let live=true;const token=++generation.current;setHelpers(true);setError('');if(userId&&enabled)void supabase.from('profiles').select('canasta_helpers').eq('id',userId).maybeSingle().then(({data,error})=>{if(live&&token===generation.current){if(error)setError('Help preference unavailable');else if(data)setHelpers(data.canasta_helpers);}});return()=>{live=false;};},[userId,enabled]);
 async function save(value:boolean){const token=++generation.current;if(!enabled){setHelpers(value);return;}const {error}=await supabase.from('profiles').update({canasta_helpers:value}).eq('id',userId);if(token!==generation.current)return;if(error){setError('Could not save help preference');return;}setHelpers(value);setError('');}
 return {helpers,setHelpers:save,error};
}
