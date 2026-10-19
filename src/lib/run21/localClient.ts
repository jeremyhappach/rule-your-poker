import {UncertainRun21Action} from './actionPresentation';
import {run21Timing,run21TimingEnabled} from './diagnostics';
import { supabase } from '@/integrations/supabase/client';
import type { Projection } from './model';
import type { VisibleEvent } from './history';
import type { ReplayPackageV1 } from '../replay/contractV1';

export interface Run21Snapshot { revision: number; serverAt: number; view: Projection; balances: Record<string, number>; finished: boolean; events?: VisibleEvent[]; eventSequence?: number; requestId?: string }
export interface Run21HistoryRecord {dealerGameId: string; balances: Record<string, number>; events: VisibleEvent[]; replay: ReplayPackageV1 | null}
export async function run21Fetch(gameId: string, path: string, options: RequestInit = {}, requestId='') {
  const {data} = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sign in to reconnect to Run21.');
  run21Timing('session-ready',requestId);run21Timing('fetch-dispatch',requestId);
  return fetch(`/__run21/${gameId}/${path}`, {...options, headers: {...options.headers,
    Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json',...(run21TimingEnabled()?{'x-run21-timing':'1'}:{})}});
}
export async function run21Request<T>(gameId: string, path: string, body?: unknown): Promise<T> {
  const action=body!==undefined,id=(body as {requestId?:string})?.requestId??'state';
  let lost=false;run21Timing('request-start',id);
  for(let attempt=0;attempt<(action?2:1);attempt++){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    let response:Response;
    try{response=await run21Fetch(gameId,path,action?{method:'POST',body:JSON.stringify(body),signal:controller.signal}:{signal:controller.signal},id);}
    catch(e){clearTimeout(timeout);if(!(e instanceof TypeError)&&!(e instanceof DOMException&&e.name==='AbortError'))throw e;lost=true;if(action&&attempt===0)continue;throw new UncertainRun21Action('Response lost.');}
    run21Timing('response-headers',id,undefined,response.headers.get('X-Run21-Timing')??undefined);
    let result:any;try{result=await response.json();}catch{throw new UncertainRun21Action('Response lost.');}finally{clearTimeout(timeout);}
    if(response.status>=500||lost&&!response.ok)throw new UncertainRun21Action('Response uncertain.');
    if(!response.ok)throw new Error(result.error??'Run21 connection failed.');
    run21Timing('response-parsed',id);return result as T;
  }
  throw new UncertainRun21Action('Response lost.');
}
/** Reject regression and equal-revision disagreement; the server alone advances state. */
export function acceptRun21Snapshot(prior: Run21Snapshot | null, incoming: Run21Snapshot, dealerGameId: string) {
  if (incoming.view.identity.dealerGameId !== dealerGameId) return prior;
  if (!prior) return incoming;
  if (incoming.revision < prior.revision) return prior;
  if (incoming.revision === prior.revision && JSON.stringify([incoming.view, incoming.balances]) !== JSON.stringify([prior.view, prior.balances]))
    throw new Error('Run21 received conflicting state; reconnect required.');
  return incoming;
}
