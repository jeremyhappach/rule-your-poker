import {installArtworkStorage} from './artwork.fixture.mjs';
import {readFileSync} from 'node:fs';
// Test-only HTTP substitute. Every metadata/object operation uses authenticated SQL
// policies; bytes remain in memory and no request reaches production Storage.
export async function artworkTransport(db,connect,admin){
 await installArtworkStorage(db);
 await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[admin]);
 await db.query(readFileSync('supabase/migrations/20261016220546_arcade_artwork.sql','utf8'));
 const bytes=new Map();
 return async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw),c=await connect();
  try{
   await c.query('BEGIN');await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[req.headers['x-fixture-user']]);await c.query('SET LOCAL ROLE authenticated');
   let data,error=null;
   if(body.op==='role')data=(await c.query("SELECT 'admin' role WHERE public.is_admin(auth.uid())")).rows[0]??null;
   else if(body.op==='rules')data=(await c.query('SELECT public.arcade_rules_help($1) data',[body.ruleset])).rows[0].data;
   else if(body.op==='list')data=(await c.query('SELECT game,object_path,updated_at FROM public.arcade_game_artwork')).rows;
   else if(body.op==='save')data=(await c.query('UPDATE public.arcade_game_artwork SET object_path=$1 WHERE game=$2 AND object_path IS NOT DISTINCT FROM $3 RETURNING game,object_path,updated_at',[body.path,body.game,body.previous])).rows[0]??null;
   else if(body.op==='upload'){
    if(body.fail)throw Error('Injected upload failure');
    if(body.size>2097152||!['image/png','image/jpeg','image/webp'].includes(body.type))throw Error('Invalid file');
    await c.query("INSERT INTO storage.objects(bucket_id,name) VALUES('arcade-artwork',$1)",[body.path]);bytes.set(body.path,{body:body.bytes,type:body.type});data={path:body.path};
   }else if(body.op==='download'){
    const allowed=(await c.query("SELECT 1 FROM storage.objects WHERE bucket_id='arcade-artwork' AND name=$1",[body.path])).rowCount;
    if(!allowed)throw Error('Forbidden');data=bytes.get(body.path);
   }else if(body.op==='remove'){
    data=[];for(const path of body.paths){const removed=await c.query("DELETE FROM storage.objects WHERE bucket_id='arcade-artwork' AND name=$1 RETURNING name",[path]);if(removed.rowCount){bytes.delete(path);data.push({name:path});}}
   }
   await c.query('COMMIT');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error}));
  }catch(e){await c.query('ROLLBACK');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{message:e.message}}));}
  finally{await c.end();}
 };
}
