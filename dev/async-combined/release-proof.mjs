import {readFileSync as read,writeFileSync as write} from 'node:fs';
const old=read('supabase/delayed/proof.sql','utf8');
const bounded=old.replace('PERFORM private.delayed_words_recover();answer:=','SELECT * INTO c FROM private.delayed_children WHERE id=c.id; PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);answer:=');
if(bounded===old||bounded.includes('PERFORM private.delayed_words_recover()'))throw Error('Recovery proof must target only its fixture');
const body=bounded+'\n'+read('supabase/delayed/polish-proof.sql','utf8')+'\n'+read('supabase/delayed/combined-proof.sql','utf8');
const head="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n";
write('qualification.local/async-combined/hosted-candidate.sql',head+read('supabase/migrations/20261029002655_async_combined_five_games.sql','utf8')+'\n'+body+'\nROLLBACK;');
write('qualification.local/async-combined/hosted-installed.sql',head+body+'\nROLLBACK;');
console.log('Prepared rollback-contained candidate and installed proofs; nothing executed.');
