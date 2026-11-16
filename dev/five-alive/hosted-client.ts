import {createClient} from '@supabase/supabase-js';
import config from '../../qualification.local/five-alive/hosted/browser.public.json';
export const supabase=createClient(config.url,config.key);
const session=sessionStorage.getItem('five-alive-session');
if(session)await supabase.auth.setSession(JSON.parse(session));
