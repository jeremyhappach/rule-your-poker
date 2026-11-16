// This module replaces the network Supabase SDK only in the local browser proof.
// The API handlers still parse and validate their bearer token via getUser.
export const isAuthError=()=>false;
export const isAuthSessionMissingError=()=>false;
export function createClient(){
 const fixture=(globalThis as typeof globalThis&{fiveAliveFixture:{actor:(token:string)=>string|null;rpc:(name:string,args:Record<string,unknown>)=>Promise<unknown>}}).fiveAliveFixture;
 if(!fixture)throw Error('local fixture missing');
 return {
  auth:{getUser:async(token:string)=>{const id=fixture.actor(token);return {data:{user:id?{id}:null},error:id?null:{message:'invalid token'}};}},
  rpc:async(name:string,args:Record<string,unknown>)=>{try{return {data:await fixture.rpc(name,args),error:null,status:200};}catch(e){return {data:null,error:{message:e instanceof Error?e.message:'database error',code:'fixture'},status:400};}},
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:{username:'Fixture'},error:null})})})}),
 };
}
