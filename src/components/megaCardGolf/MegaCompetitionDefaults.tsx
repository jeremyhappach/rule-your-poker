import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useMegaCompetitionConfig} from '@/hooks/useMegaCompetitionConfig';
import type {MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';
import {MegaCompetitionSettings} from './MegaCompetitionConfig';
export function MegaCompetitionDefaults(){
 const catalog=useMegaCompetitionConfig(),[value,setValue]=useState<MegaCompetitionConfig|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(catalog)setValue(catalog.defaults);},[catalog]);
 if(!catalog||!value)return null;
 return <section><h3>Multiplayer and Async defaults</h3><MegaCompetitionSettings courses={catalog.courses} value={value} disabled={busy} onChange={setValue}/>
  <button disabled={busy} onClick={()=>{setBusy(true);setError('');void (supabase.from('game_defaults') as any).update({mega_course:value.course.id,mega_holes:value.course.holes}).eq('game_type','mega-card-golf').select('game_type').single().then(({error}:{error:{message:string}|null})=>{setBusy(false);if(error)setError(error.message);});}}>{busy?'Saving…':'Save match defaults'}</button>{error&&<p role="alert">{error}</p>}</section>;
}
