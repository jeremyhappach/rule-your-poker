export async function arcadeRequest<T>(body:object):Promise<T>{
 const response=await fetch('/__mega',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
