// Invalidation only: successful commands never manufacture/decrement obligations.
const listeners=new Set<()=>void>();
export function invalidateAsyncActivity(){for(const listener of listeners)listener();}
export function onAsyncActivityInvalidated(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
