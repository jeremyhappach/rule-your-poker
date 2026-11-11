import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function openWordsDatabase(template) {
  assert.match(template ?? '', /^(ptown_polish|async_words)_\d+$/, 'Use an isolated Words fixture database as the template');
  assert(process.env.PTOWN_WORDS_PG_MODULE, 'Set PTOWN_WORDS_PG_MODULE to the existing pg module entry point');
  const {default: pg} = await import(pathToFileURL(resolve(process.env.PTOWN_WORDS_PG_MODULE)).href);
  const config = {host:'127.0.0.1',port:Number(process.env.PTOWN_WORDS_PG_PORT ?? 55439),user:'tri_test'};
  const root = new pg.Client({...config,database:'postgres'});
  await root.connect();
  const database = 'words_gestures_' + Date.now();
  let created = false;
  let pool;
  try {
    await root.query('CREATE DATABASE ' + database + ' TEMPLATE ' + template);
    created = true;
    pool = new pg.Pool({...config,database});
    await pool.query('UPDATE private.ptown_words_release SET enabled=true,admission_enabled=true');
    await pool.query("UPDATE private.game_recovery_dispatch_state SET last_completed_at=clock_timestamp(),last_outcome='completed'");
    await pool.query('UPDATE private.delayed_words_health SET enabled=true,last_tick=clock_timestamp()');
  } catch (error) {
    if (pool) await pool.end();
    if (created) await root.query('DROP DATABASE ' + database);
    await root.end();
    throw error;
  }

  const sql = (query, args = []) => pool.query(query, args).then(result => result.rows[0]);
  async function rpc(user, name, args) {
    assert.match(name, /^(ptown_words_|delayed_|submit_ante_decision$)/);
    const entries = Object.entries(args);
    const values = entries.map(([, value]) => value && typeof value === 'object' ? JSON.stringify(value) : value);
    const params = entries.map(([key], index) => {
      assert.match(key, /^p_[a-z_]+$/);
      return key + '=>$' + (index + 1);
    }).join(',');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [user, JSON.stringify({sub:user,role:'authenticated'})]);
      await client.query('SET LOCAL ROLE authenticated');
      const result = await client.query('SELECT public.' + name + '(' + params + ') AS value', values);
      await client.query('COMMIT');
      return result.rows[0].value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function prepare(mode) {
    const users = [randomUUID(), randomUUID()];
    for (const [i,user] of users.entries()) {
      await sql('INSERT INTO auth.users(id) VALUES($1)', [user]);
      await sql('UPDATE public.account_access SET enabled=true,ever_enabled=true WHERE user_id=$1', [user]);
      await sql('UPDATE public.profiles SET is_active=true,username=$2 WHERE id=$1', [user, ['Alex','Mara'][i] + ' ' + user.slice(0,6)]);
    }
    let match, id, user, other, state;
    if (mode === 'live') {
      match = randomUUID();
      const players = [randomUUID(),randomUUID()];
      const configDeadline = new Date(Date.now()+600000).toISOString();
      await sql("INSERT INTO public.games(id,status,real_money,dealer_position,config_deadline,pot,is_paused,pending_session_end,current_host) VALUES($1,'game_selection',false,2,$2,0,false,false,$3)", [match,configDeadline,users[0]]);
      for (const [i,player] of players.entries()) {
        await sql('INSERT INTO public.players(id,game_id,user_id,position,chips,is_bot) VALUES($1,$2,$3,$4,100,false)', [player,match,users[i],2-i]);
      }
      const game = await rpc(users[0], 'ptown_words_configure', {
        p_game_id:match,p_dealer_player_id:players[0],p_expected_dealer_position:2,p_game_type:'ptown-words',
        p_config:{ante_amount:5},p_expected_config_deadline:configDeadline,
      });
      id = game.dealer_game.id;
      await rpc(users[1], 'submit_ante_decision', {p_game_id:match,p_expected_dealer_game_id:id,p_player_id:players[1],p_decision:'ante_up'});
      ({state} = await sql('SELECT state FROM private.ptown_words_matches WHERE dealer_game_id=$1', [id]));
      user = state.players[state.turnIndex].userId;
    } else {
      match = await rpc(users[0], 'delayed_create', {p_request:randomUUID(),p_opponent:users[1],p_real_money:false,p_lineup:[{game:'ptown-words',stake:7}]});
      const {offer_hash} = await sql('SELECT offer_hash FROM private.delayed_matches WHERE id=$1', [match]);
      await rpc(users[1], 'delayed_respond', {p_match:match,p_request:randomUUID(),p_offer_hash:offer_hash,p_action:'accept'});
      const child = await sql('SELECT * FROM private.delayed_children WHERE match_id=$1', [match]);
      ({id,actor:user,state} = child);
    }
    other = users.find(value => value !== user);
    // Keep every dealt tile's identity. Draw a deterministic opening rack for gesture and dictionary coverage.
    const actor = state.players[state.turnIndex].id;
    const opponent = state.players.find(player => player.id !== actor).id;
    const tiles = [...state.bag, ...Object.values(state.racks).flat()];
    const rack = faces => [...faces].map(face => {
      const index = tiles.findIndex(tile => tile.face === face);
      assert(index >= 0, 'Fixture tile available: ' + face);
      return tiles.splice(index,1)[0];
    });
    state.racks[actor] = rack('CATQERS');
    state.racks[opponent] = rack('?UIZLNT');
    const blankIndex = state.racks[opponent].findIndex(tile => tile.face === '?');
    const swap = state.racks[actor][6];
    state.racks[actor][6] = state.racks[opponent][blankIndex];
    state.racks[opponent][blankIndex] = swap;
    state.bag = tiles;
    const table = mode === 'live' ? 'ptown_words_matches' : 'delayed_children';
    const key = mode === 'live' ? 'dealer_game_id' : 'id';
    await sql('UPDATE private.' + table + ' SET state=$2 WHERE ' + key + '=$1', [id, JSON.stringify(state)]);
    const fixture = {mode,id,match,user,other,actor,opponent,table,key};
    return fixture;
  }

  async function setDeadline(fixture, remainingMs) {
    const {mode,table,key,id} = fixture;
    const at = Date.now() + remainingMs;
    const asyncDeadline = mode === 'async' ? ',gameplay_due_at=to_timestamp($2::bigint/1000.0)' : '';
    await sql("UPDATE private." + table + " SET state=jsonb_set(state,'{deadline}',to_jsonb($2::bigint)),revision=revision+1" + asyncDeadline + ' WHERE ' + key + '=$1', [id, at]);
    return at;
  }

  return {
    sql,rpc,prepare,setDeadline,
    row: fixture => sql('SELECT * FROM private.' + fixture.table + ' WHERE ' + fixture.key + '=$1',[fixture.id]),
    async close() { await pool.end(); await root.query('DROP DATABASE ' + database); await root.end(); },
  };
}
