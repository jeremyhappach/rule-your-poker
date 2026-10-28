import {readFileSync as read,writeFileSync as write} from 'node:fs';
// The scheduler scans every live match; hosted proofs must target only their fixture.
const source=read('supabase/delayed/proof.sql','utf8');
const bounded=source.replace('PERFORM private.delayed_words_recover();answer:=',
 'SELECT * INTO c FROM private.delayed_children WHERE id=c.id; PERFORM private.delayed_expire(c.id,c.segment,c.expires_at);answer:=');
if(bounded===source||bounded.includes('PERFORM private.delayed_words_recover()'))throw Error('Recovery scope mismatch');
write('qualification.local/async-words/release-proof.sql',bounded+'\n'+read('supabase/delayed/polish-proof.sql','utf8'));
