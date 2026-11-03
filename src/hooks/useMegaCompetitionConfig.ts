import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import type {CourseConfig} from '@/lib/megaCardGolf/config';
import type {MegaCompetitionConfig} from '@/lib/megaCardGolf/competition';
export function useMegaCompetitionConfig(gameId:string|null=null){
 const [catalog,setCatalog]=useState<{courses:CourseConfig[];defaults:MegaCompetitionConfig;enabled:boolean}|null>(null);
 useEffect(()=>{let active=true;setCatalog(null);void supabase.rpc('mega_competition_catalog' as never,{p_game:gameId} as never).then(({data,error})=>{if(active&&!error)setCatalog(data as any);});return()=>{active=false;};},[gameId]);
 return catalog;
}
