const ident=x=>{if(!/^[a-z_][a-z_0-9]*$/.test(x))throw Error('fixture:invalid_identifier');return '"'+x+'"';};
export async function tableQuery(c,who,q){
 const args=[],where=[];let index=0;const bind=x=>{args.push(x);return '$'+(++index);};
 for(const {op,args:a} of q.filters){const key=ident(a[0]);
  if(['eq','neq','lt','lte','gt','gte'].includes(op))where.push(key+({eq:'=',neq:'<>',lt:'<',lte:'<=',gt:'>',gte:'>='}[op])+bind(a[1]));
  else if(op==='in')where.push(key+' IN ('+a[1].map(bind).join(',')+')');
  else if(op==='is')where.push(key+' IS '+(a[1]===null?'NULL':a[1]?'TRUE':'FALSE'));
  else if(op==='not'&&a[1]==='is'&&a[2]===null)where.push(key+' IS NOT NULL');
  else throw Error('fixture:unsupported_filter:'+op);
 }
 const predicate=where.length?' WHERE '+where.join(' AND '):'';
 await c.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[who]);await c.query('SET LOCAL ROLE authenticated');
 let rows;
 if(q.update){const set=Object.entries(q.update).map(([key,value])=>ident(key)+'='+bind(value));rows=(await c.query('UPDATE public.'+ident(q.table)+' SET '+set.join(',')+predicate+' RETURNING *',args)).rows;}
 else if(q.insert){if(q.table!=='debug_events')throw Error('fixture:unexpected_insert:'+q.table);rows=[];}
 else{const order=q.orders.length?' ORDER BY '+q.orders.map(o=>ident(o.key)+(o.ascending?' ASC':' DESC')).join(','):'';rows=(await c.query('SELECT * FROM public.'+ident(q.table)+predicate+order+(q.limit?' LIMIT '+Number(q.limit):'')+(q.offset?' OFFSET '+Number(q.offset):''),args)).rows;}
 if(q.table==='players')for(const row of rows){const p=(await c.query('SELECT * FROM public.profiles WHERE id=$1',[row.user_id])).rows[0];row.profiles=p;row.profile=p;}
 await c.query('RESET ROLE');return {data:q.single?rows[0]??null:rows,error:null,count:rows.length};
}
export async function installEvents(c){await c.query(`CREATE TEMP TABLE originals_browser_events(id bigint GENERATED ALWAYS AS IDENTITY,body jsonb);
CREATE FUNCTION pg_temp.originals_browser_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO originals_browser_events(body) VALUES(jsonb_build_object('schema',TG_TABLE_SCHEMA,'table',TG_TABLE_NAME,'eventType',TG_OP,'new',to_jsonb(NEW),'old',to_jsonb(OLD)));RETURN NEW;END $$;
CREATE TRIGGER originals_browser_game AFTER UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION pg_temp.originals_browser_event();
CREATE TRIGGER originals_browser_players AFTER UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION pg_temp.originals_browser_event();
CREATE TRIGGER originals_browser_transfers AFTER INSERT ON public.gameplay_transfer_batches FOR EACH ROW EXECUTE FUNCTION pg_temp.originals_browser_event();
CREATE TRIGGER originals_browser_revisions AFTER INSERT OR UPDATE ON public.originals_live_revisions FOR EACH ROW EXECUTE FUNCTION pg_temp.originals_browser_event();`);}
