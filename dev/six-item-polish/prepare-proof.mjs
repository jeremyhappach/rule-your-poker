import {readFileSync as read,writeFileSync as write} from 'node:fs';
import {createHash} from 'node:crypto';
const path='supabase/ptown-words/placement-preview.sql';
const sql=read(path,'utf8'),baseline=read('dev/six-item-polish/reducer-before.sql','utf8');
const definition=text=>text.trim().replace(/;$/,'').trimEnd()+'\n';
const hash=text=>createHash('md5').update(definition(text)).digest('hex');
const reducer=sql.match(/CREATE OR REPLACE FUNCTION private\.ptown_words_reduce[\s\S]*?END \$function\$\s*;/)?.[0];
if(!reducer)throw Error('Missing candidate reducer');
const before=hash(baseline),after=hash(reducer);
const guard=`-- Refuse to overwrite a changed authority; an exact repeat is idempotent.
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('private.ptown_words_reduce(jsonb,text,jsonb,bigint)'::regprocedure))
  NOT IN ('${before}','${after}') THEN
  RAISE EXCEPTION 'Words reducer preimage changed; requalify before applying';
 END IF;
END $guard$;
`;
if(!sql.startsWith('-- Refuse'))write(path,guard+sql);
const proof=read('supabase/ptown-words/placement-preview-proof.sql','utf8').replace('five frozen versions','four supported frozen versions').replace('five frozen versions','four supported frozen versions');
write('supabase/ptown-words/placement-preview-proof.sql',proof);
const baselineFunction=baseline.replace('private.ptown_words_reduce(','pg_temp.words_baseline(');
const checks=baselineFunction+'\n'+read('supabase/ptown-words/core-proof.sql','utf8')+'\n'+proof;
write('qualification.local/six-item-polish/candidate-proof.sql',"BEGIN; SET LOCAL statement_timeout='30s';\n"+read(path,'utf8')+'\n'+checks+'\nROLLBACK;');
write('qualification.local/six-item-polish/installed-proof.sql',"BEGIN; SET LOCAL statement_timeout='30s';\n"+checks+'\nROLLBACK;');
console.log(JSON.stringify({before,after}));
