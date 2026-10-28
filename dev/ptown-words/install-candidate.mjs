import {readFileSync as read} from 'node:fs';import {candidate} from './database.mjs';
export async function installCandidate(c){
 const source=read('supabase/migrations/20260905025936_isolate_recovery_sessions_and_restore_context.sql','utf8');
 for(const signature of ['private.capture_recovery_context()','private.restore_recovery_context(p_context jsonb)']){const start=source.indexOf('CREATE FUNCTION '+signature);const end=source.indexOf('$$;',start)+3;if(start<0||end<start)throw Error('Missing context helper');await c.query(source.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));}
 await c.query(read('dev/ptown-words/reference-pause.sql','utf8'));
 for(const f of JSON.parse(read('dev/ptown-words/deployed-contract.json','utf8')).functions.filter(f=>['megatouch_begin','advance_ante_phase_exact','megatouch_frozen_stake'].includes(f.name)))await c.query(f.definition);
 await c.query(candidate());
}
