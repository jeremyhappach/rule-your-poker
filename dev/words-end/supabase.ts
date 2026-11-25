// This presentation fixture never connects to a hosted account or database.
export const supabase={
 auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})}),
 rpc:async()=>({data:null,error:null}),
 channel:()=>({on(){return this;},subscribe(){return this;},unsubscribe(){}}),removeChannel:async()=>{},
};
