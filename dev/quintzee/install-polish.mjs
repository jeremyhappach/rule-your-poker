import {readFileSync as read} from 'node:fs';
export async function installPolish(c){
await c.query(read('supabase/quintzee/version-two.sql','utf8'));await c.query(read('supabase/quintzee/polish-v2.sql','utf8'));await c.query("UPDATE private.arcade_rulesets SET enabled=(id='quintzee/2') WHERE game='quintzee';UPDATE private.quintzee_release SET enabled=true,admission_enabled=true");}
