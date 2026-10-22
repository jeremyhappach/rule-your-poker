import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
// Deployed dispatcher capture includes the released Golf branch. Remove only
// Canasta for local reinstallation; the original registration hash still gates it.
const installed=readFileSync(new URL('ante.installed-20261022.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
const branch="    WHEN v_game.game_type='canasta' THEN\n      SELECT private.canasta_begin(p_game_id,p_expected_dealer_game_id) INTO v_start;\n";
assert.equal(installed.split(branch).length,2,'exactly one installed Canasta dispatch branch');
export const baseline=installed.replace(branch,'');
export const dispatchProof="DO $$ BEGIN IF md5(replace(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure),chr(13),'')) <> 'ed70e8608f4a04b72cab66d55dcd9970' THEN RAISE EXCEPTION 'canasta:installed_ante_mismatch'; END IF; END $$;";
const owners=JSON.parse(readFileSync(new URL('authority.installed-20261022.json',import.meta.url),'utf8'));
export const authorityProof=owners.map(({identity,hash})=>{
 const qualified=identity.startsWith('private.')?identity:'public.'+identity;
 return `DO $$ BEGIN IF md5(replace(pg_get_functiondef('${qualified}'::regprocedure),chr(13),'')) <> '${hash}' THEN RAISE EXCEPTION 'canasta:forward_baseline_changed:${qualified}'; END IF; END $$;`;
}).join('\n');
