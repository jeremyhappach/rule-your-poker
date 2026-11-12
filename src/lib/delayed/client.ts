import {supabase} from '@/integrations/supabase/client';
export interface ChildSummary {holeResults?:{actor:string;hole:number;score:number;at:number}[];id:string;ordinal:number;game:'chess'|'crib-lab'|'chucky-showdown'|'run21'|'tri-towers'|'ptown-words'|'quintzee'|'boxdrop'|'mega-card-golf'|'take-two';stake:number;config:any;starter:string|null;actor:string|null;
 segment:number;revision:number;terminal:boolean;availableAt:string|null;lastCallAt:string|null;expiresAt:string|null;startedAt:string|null;playable?:boolean;playableDeadline?:string|null;scores?:Record<string,number|null>;pendingResults?:Record<string,number>;progress?:Record<string,string>;bagCount?:number;reviewId?:string;viewed?:boolean;lastMove?:{action:string;points:number};
 result:{reason:string;winner:string|null;delta:number;at:string}|null}
export interface Home {id:string;status:string;revision:number;realMoney:boolean;offerHash:string;organizer:string;opponent:string;
 players:{id:string;name:string}[];createdAt:string;invitationExpiresAt:string;acceptedAt:string|null;settledAt:string|null;held:boolean;
 runbackEligible?:boolean;opponentEligible?:boolean;policyVersion?:string;removedAt?:string|null;lineup:ChildSummary[];net:number;completed:number;exposure:number;unsettled?:number;finaleViewed?:boolean;reviewsComplete?:boolean;receipt:any;serverAt:number}
export async function delayedRpc<T>(name:string,args:Record<string,unknown>={}):Promise<T>{
 const {data,error}=await (supabase.rpc as any)(name,args);if(error)throw Error(error.message);return data;
}
export const gameName=(game:string)=>game==='chess'?'P-Town Chess':game==='crib-lab'?'Crib Lab':game==='chucky-showdown'?'Chucky Showdown':game==='take-two'?'Take 2':game==='mega-card-golf'?'Mega Card Golf':game==='ptown-words'?'Ptown Words':game==='run21'?'Run 21':game==='tri-towers'?'Tri Towers':game==='quintzee'?'Quintzee':game==='boxdrop'?'Box Drop':game;
export const signed=(amount:number)=>amount>0?'+'+amount:amount<0?'−'+Math.abs(amount):'0';

export class DelayedRequestError extends Error {constructor(message:string,readonly status:number){super(message);}}
export async function delayedRequest<T>(body:Record<string,unknown>):Promise<T>{
 const {data}=await supabase.auth.getSession();if(!data.session)throw Error('Sign in to continue.');
 const controller=body.game==='run21'?new AbortController():null;
 const timeout=controller?setTimeout(()=>controller.abort(),10000):undefined;
 try{
  const response=await fetch(body.game==='run21'?'/api/delayed-run21':'/api/delayed',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body),...(controller?{signal:controller.signal}:{})});
  const result=await response.json();if(!response.ok||result.error)throw new DelayedRequestError(result.error??'Unable to restore turn.',response.status);return result;
 }catch(error){
  // An abort is uncertain: DelayedTurn retains the original command for replay.
  if(controller?.signal.aborted)throw Error('Connection timed out. Reconnect to confirm your move.');
  throw error;
 }finally{clearTimeout(timeout);}
}
