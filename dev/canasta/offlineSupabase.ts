export const supabase = new Proxy({}, {get(_target,key) {
  throw new Error(`Canasta mobile review blocks database/auth access: ${String(key)}`);
}});
