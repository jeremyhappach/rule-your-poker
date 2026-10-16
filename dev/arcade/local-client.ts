const user=()=>({id:(window as any).__ARCADE_USER__});
const query:any=new Proxy(()=>query,{get:(_,key)=>key==='then'?Promise.resolve({data:null,error:null}).then.bind(Promise.resolve({data:null,error:null})):()=>query,apply:()=>query});
export const supabase:any={
 auth:{getSession:async()=>({data:{session:{access_token:user().id,user:user()}}}),getUser:async()=>({data:{user:user()}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:()=>query,rpc:async()=>({data:null,error:null}),
 channel:()=>{let callback=()=>{},stream:EventSource;const channel={on:(_e:any,_f:any,fn:any)=>{callback=fn;return channel;},subscribe:(status:any)=>{stream=new EventSource('/__arcade-events');stream.onmessage=()=>callback();stream.onopen=()=>status?.('SUBSCRIBED');return channel;},unsubscribe:()=>stream?.close()};return channel;},
 removeChannel:(channel:any)=>channel.unsubscribe()
};

