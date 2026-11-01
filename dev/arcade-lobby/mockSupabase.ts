import {supabase as original} from '../lobby-catalog/mockSupabase';
export const supabase = {...original, rpc:async (name:string,args:any)=>
  name==='arcade_rules_help'&&args.p_ruleset==='quintzee/1'
    ? {data:{version:'quintzee/1'},error:null} : original.rpc(name,args)};
