import {connect} from './local.mjs';import {randomUUID} from 'node:crypto';import {readFileSync as read,writeFileSync as write} from 'node:fs';
const ctx=JSON.parse(read('qualification.local/async-words/browser-context.json')),db=await connect(ctx.database),game=randomUUID(),players=[randomUUID(),randomUUID()];
try{await db.query('BEGIN');await db.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'; UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true");
 const deadline=new Date(Date.now()+600000);await db.query("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',false,1,$2,0,false,false,$3)",[game,deadline,ctx.users[0]]);
 for(let i=0;i<2;i++)await db.query('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)',[players[i],game,ctx.users[i],i+1]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ctx.users[0]]);
 const config=(await db.query("SELECT public.ptown_words_configure($1,$2,1,'ptown-words','{\"ante_amount\":5}', $3) v",[game,players[0],deadline])).rows[0].v,dealer=config.dealer_game.id;
 for(let i=0;i<2;i++){await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ctx.users[i]]);await db.query("SELECT public.submit_ante_decision($1,$2,$3,'ante_up')",[game,dealer,players[i]]);}
 await db.query('SELECT public.advance_ante_phase($1,$2)',[game,dealer]);
 const state=(await db.query('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1',[dealer])).rows[0].state,actor=state.players[state.turnIndex],pool=[...state.bag,...Object.values(state.racks).flat()],rack=['C','A','T'].map(face=>pool.splice(pool.findIndex(t=>t.face===face),1)[0]);rack.push(...pool.splice(0,4));const other=players.find(id=>id!==actor.id);state.racks={[actor.id]:rack,[other]:pool.splice(0,7)};state.bag=pool;
 await db.query('UPDATE private.ptown_words_matches SET state=$2 WHERE dealer_game_id=$1',[dealer,state]);await db.query('COMMIT');
 write('qualification.local/async-words/polish-live-fixture.json',JSON.stringify({game,dealer,actor,players,...ctx},null,2));console.log('Live local fixture',dealer);
}finally{await db.query('ROLLBACK');await db.end();}
