import {installArtworkStorage} from './artwork.fixture.mjs';
import pg from '../../qualification.local/tri-towers/tools/node_modules/pg/lib/index.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const opts={host:'127.0.0.1',port:55439,user:'tri_test'},name='arcade_artwork_'+Date.now();
const root=new pg.Client({...opts,database:'template1'});await root.connect();await root.query('CREATE DATABASE '+name+' TEMPLATE postgres');
const db=new pg.Client({...opts,database:name});await db.connect();
try{
 // Disposable Storage policy fixture: production bucket/name uniqueness and exact
 // existing policy expressions. Object service byte validation is tested separately.
 await installArtworkStorage(db);
 await db.query(` CREATE TABLE private.arcade_rulesets(id text PRIMARY KEY,game text,config jsonb,enabled boolean);
 CREATE FUNCTION private.arcade_allowed(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT actor IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_active)$$;`);
 await db.query("INSERT INTO private.arcade_rulesets VALUES('run21/2','run21','{\"preset\":\"run21/2\"}',true),('run21/arcade-1','run21','{\"speed\":{\"start\":250}}',false)");
 const users=[randomUUID(),randomUUID()];
 for(const user of users){await db.query('INSERT INTO auth.users(id) VALUES($1)',[user]);await db.query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true)",[user,'Artwork '+user]);}
 await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[users[0]]);
 const sql=readFileSync('supabase/migrations/20261016220546_arcade_artwork.sql','utf8');
 await db.query('BEGIN');await db.query(sql);await db.query('ROLLBACK');
 assert.equal((await db.query("SELECT to_regclass('public.arcade_game_artwork') value")).rows[0].value,null);
 await db.query(sql);
 await db.query(readFileSync('dev/arcade/artwork.proof.sql','utf8'));
 assert.equal((await db.query('SELECT count(*)::int n FROM storage.objects')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM public.arcade_game_artwork WHERE object_path IS NOT NULL')).rows[0].n,0);
 // Referenced-object cleanup must be impossible even for admins.
 await db.query('BEGIN');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[users[0]]);await db.query('SET LOCAL ROLE authenticated');
 const path='run21/'+randomUUID()+'.png';
 await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('arcade-artwork',$1)",[path]);await db.query("UPDATE public.arcade_game_artwork SET object_path=$1 WHERE game='run21'",[path]);
 assert.equal((await db.query('DELETE FROM storage.objects WHERE name=$1',[path])).rowCount,0);
 await db.query('ROLLBACK');
 writeFileSync('dev/arcade/artwork.proof.evidence.json',JSON.stringify({passed:['transactional DDL rollback','admin/normal/ineligible/anonymous access','path and upload existence','compare-and-swap conflict','immutable objects','referenced image deletion denied','current/legacy rules help','proof rollback removes all synthetic data'],scope:'Disposable database with inspected production role helpers and Storage policy boundary; no Storage byte service',productionWrites:0},null,2));
 console.log('PASS artwork database authorization and replacement proof');
}finally{await db.end();await root.query('DROP DATABASE '+name+' WITH(FORCE)');await root.end();}
