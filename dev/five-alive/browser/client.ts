// Browser-only synthetic session. The local server validates its bearer token.
const params=new URLSearchParams(location.search);
const token=params.get('token'),user=params.get('user');
const streams=new WeakMap<object,EventSource>();
export const supabase={
 auth:{getSession:async()=>({data:{session:token?{access_token:token,user:{id:user}}:null}})},
 from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{play_sounds:true},error:null})})})}),
 channel:()=>{
  const listeners:{table:string;changed:()=>void}[]=[];
  const channel={on:(_event:string,filter:{table:string},changed:()=>void)=>{listeners.push({table:filter.table,changed});return channel;},
   subscribe:(callback?:(value:string)=>void)=>{const stream=new EventSource('/fixture/events');streams.set(channel,stream);
    stream.onopen=()=>callback?.('SUBSCRIBED');stream.onmessage=event=>{const message=JSON.parse(event.data);for(const listener of listeners)if(listener.table===message.table)listener.changed();};return channel;}};
  return channel;
 },
 removeChannel:async(channel:object)=>{streams.get(channel)?.close();},
};
