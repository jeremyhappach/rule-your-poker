export const supabase={
 rpc:async(name:string,args:object)=>(await fetch('/fixture-rpc',{method:'POST',body:JSON.stringify({name,args})})).json(),
 channel:()=>{const channel={on:()=>channel,subscribe:(cb?:(s:string)=>void)=>{queueMicrotask(()=>cb?.('SUBSCRIBED'));return channel;},track:async()=>{},untrack:async()=>{},presenceState:()=>({})};return channel;},
 removeChannel:()=>{}
};
