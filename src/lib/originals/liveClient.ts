import {supabase} from '@/integrations/supabase/client';
import type {LabSnapshot} from '@/lib/cribLab/model';
import type {V2Snapshot} from '@/lib/chuckyShowdown/model';
import type {MegaLiveView} from '@/lib/megaCardGolf/liveClient';
export type OriginalsIntent={type:string;items?:number[];level?:number};
export type OriginalsLiveView=Pick<MegaLiveView,'id'|'identity'|'revision'|'scope'|'serverAt'|'players'|'actor'|'viewerId'|'scores'|'canAct'|'paused'|'pausedAt'|'settled'|'settlement'|'finished'|'terminal'|'financial'>&{
 game:'crib-lab'|'chucky-showdown';rules:{game:string;ruleset:string;gameplay:Record<string,unknown>;rounds:3};
 round:number;phase:'ready'|'playing'|'round_complete'|'complete';deadline:number;board:LabSnapshot|V2Snapshot|null;
 results:{actor:string;round:number;score:number;at:number}[];
};
export async function originalsLiveRequest(body:Record<string,unknown>):Promise<OriginalsLiveView>{
 const action=body.op==='action';
 const {data,error}=await supabase.rpc((action?'originals_live_action':'originals_live_snapshot') as never,
  {p_match:body.matchId,...(action?{p_request:body.requestId,p_revision:body.revision,p_intent:body.intent}:{})} as never);
 if(error)throw Error(error.message);return data as OriginalsLiveView;
}
