import {supabase} from '@/integrations/supabase/client';
let currentUser:string|null=null,lastSent=0,dispose:(()=>void)|null=null;
/** Visible authenticated app entry, interaction and foreground return; never a login event. */
export function setActivityUser(userId:string|null){
 if(userId===currentUser)return;dispose?.();dispose=null;currentUser=userId;lastSent=0;if(!userId)return;
 const record=()=>{const now=performance.now();if(document.hidden||lastSent&&now-lastSent<60000)return;lastSent=now||1;
  void Promise.resolve(supabase.rpc('record_app_activity' as never)).then(({error})=>{if(error&&currentUser===userId)lastSent=0;}).catch(()=>{if(currentUser===userId)lastSent=0;});};
 const gesture=(event:Event)=>{if(event.isTrusted)record();};
 document.addEventListener('pointerdown',gesture,{passive:true});document.addEventListener('keydown',gesture);document.addEventListener('visibilitychange',record);window.addEventListener('focus',record);record();
 dispose=()=>{document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',record);window.removeEventListener('focus',record);};
}
