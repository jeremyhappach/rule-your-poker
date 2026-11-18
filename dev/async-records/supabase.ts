// Only the isolated browser runner aliases this module; production never imports it.
export const supabase={
 rpc:async(name:string,args:unknown)=>{const response=await fetch('/fixture/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});return response.json();},
};
