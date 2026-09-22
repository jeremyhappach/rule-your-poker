/** Fail closed if a shared preview component ever attempts database or auth access. */
export const supabase = new Proxy({}, {get(_target,key){throw new Error(`Run21 offline lab blocks Supabase access: ${String(key)}`);}});
