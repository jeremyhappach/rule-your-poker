import {supabase} from '@/integrations/supabase/client';
export interface AccountAccess {userId:string;enabled:boolean;status:'pending'|'enabled'|'suspended';revision:number;email:string;verified:boolean;admin:boolean;emailDelivery?:string}
export async function accountRpc<T>(name:string,args:Record<string,unknown>={}) {
 const {data,error}=await supabase.rpc(name as never,args as never);
 if(error)throw Error(error.message);return data as T;
}
export async function sendVerification(targetId?:string,initial=false,accessToken?:string) {
 const token=accessToken??(await supabase.auth.getSession()).data.session?.access_token;
 if(!token)throw Error('Please sign in again.');
 const response=await fetch('/api/account-access',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({op:initial?'initial':'resend',targetId})});
 const result=await response.json();if(!response.ok)throw Error(result.error??'Could not send verification email.');
}
export function emailDeliveryMessage(status?:string) {
 if(status==='failed')return 'Verification email could not be sent. Use Resend Verification Email to try again.';
 if(status==='accepted')return 'Verification email requested. Check your inbox and spam folder. If it has not arrived, use Resend Verification Email.';
 return 'Verify your email address. If no email has arrived, use Resend Verification Email.';
}
