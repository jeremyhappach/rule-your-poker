export const ACCOUNT_CHECK_WAIT_MS=10000;
/** A stalled request cannot leave the launch gate without a recovery action. */
export async function accountCheckTimeout<T>(request:PromiseLike<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;
 try{return await Promise.race([Promise.resolve(request),new Promise<never>((_,reject)=>{
  timer=setTimeout(()=>reject(Error('Account check timed out.')),ACCOUNT_CHECK_WAIT_MS);
 })]);}finally{clearTimeout(timer!);}
}
