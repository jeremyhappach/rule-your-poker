import {createClient} from '@supabase/supabase-js';
import {NetworkSimWebSocket,simulatedSupabaseFetch} from '@/lib/networkSimTransport';
import config from '../../qualification.local/five-alive/hosted/browser.public.json';
export const supabase=createClient(config.url,config.key,{global:{fetch:simulatedSupabaseFetch},realtime:{transport:NetworkSimWebSocket}});
const session=sessionStorage.getItem('five-alive-session');
if(session)await supabase.auth.setSession(JSON.parse(session));
