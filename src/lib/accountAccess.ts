import {supabase} from '@/integrations/supabase/client';
export interface AccountAccess {userId:string;enabled:boolean;status:'pending'|'enabled'|'suspended';revision:number;email:string;verified:boolean;admin:boolean}
export async function accountRpc<T>(name:string,args:Record<string,unknown>={}) {
 const {data,error}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(error.message);return data as T;
}
export async function sendVerification(targetId?:string) {
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw Error('Please sign in again.');
 const response=await fetch('/api/account-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({op:'resend',targetId})});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Could not send verification email.');
}
