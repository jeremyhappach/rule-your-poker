import {supabase} from '@/integrations/supabase/client';
export interface ChildSummary {id:string;ordinal:number;game:'run21'|'tri-towers'|'ptown-words';stake:number;config:any;starter:string|null;actor:string|null;
 segment:number;revision:number;terminal:boolean;availableAt:string|null;lastCallAt:string|null;expiresAt:string|null;startedAt:string|null;scores?:Record<string,number>;lastMove?:{action:string;points:number};
 result:{reason:string;winner:string|null;delta:number;at:string}|null}
export interface Home {id:string;status:string;revision:number;realMoney:boolean;offerHash:string;organizer:string;opponent:string;
 players:{id:string;name:string}[];createdAt:string;invitationExpiresAt:string;acceptedAt:string|null;settledAt:string|null;held:boolean;
 lineup:ChildSummary[];net:number;completed:number;exposure:number;receipt:any;serverAt:number}
export async function delayedRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await (supabase.rpc as any)(name,args);if(error)throw Error(error.message);return data;
}
export const gameName=(game:string)=>game==='ptown-words'?'Ptown Words':game==='run21'?'Run 21':game==='tri-towers'?'Tri Towers':game;
export const signed=(amount:number)=>amount>0?'+'+amount:amount<0?'−'+Math.abs(amount):'0';
