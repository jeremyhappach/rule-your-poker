// Additional installation/recovery proofs. Called only inside proof.mjs's
// uniquely named disposable localhost database; never an operational rollback.
import assert from 'node:assert/strict';

const ownerSignatures = [
  'private.guard_and_stamp_session_host()',
  'public.request_session_end(uuid,uuid,bigint)',
  'public.transfer_session_host(uuid,uuid,bigint)',
];
const candidateFunctions = ['session_host_eligible','session_longest_tenure_host',
  'track_session_table_tenure','reconcile_session_host_after_players',
  'reconcile_session_host_after_profile','resolve_and_stamp_session_host','session_inactivity_boundary'];
const triggers = [
  ['players','track_session_table_tenure'],
  ['players','reconcile_session_host_after_insert'],
  ['players','reconcile_session_host_after_update'],
  ['players','reconcile_session_host_after_delete'],
  ['profiles','reconcile_session_host_after_profile'],
  ['games','h_session_host_succession'],
  ['games','a_session_inactivity_boundary'],
];

export async function verifyInstallation({ query, val, pass, migration, peer }) {
  const database = await val('SELECT current_database() v');
  assert.match(database, /^session_membership_\d+$/);
  for (const signature of [...ownerSignatures,
    'private.capture_recovery_context()', 'private.restore_recovery_context(jsonb)']) {
    assert(await val('SELECT to_regprocedure($1)::text v', [signature]), signature);
  }
  const definitions = (await query(`SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition
    FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[]) ORDER BY 1`, [ownerSignatures])).rows;
  async function shape() {
    const owners = (await query(`SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) hash
      FROM pg_proc p WHERE p.oid=ANY($1::regprocedure[]) ORDER BY 1`, [ownerSignatures])).rows;
    const functions = (await query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND proname=ANY($1) ORDER BY 1`, [candidateFunctions])).rows;
    return {owners, functions,
      tables: (await query(`SELECT name,to_regclass(name)::text object FROM unnest(ARRAY[
        'private.session_table_tenure','private.session_inactivity_games','private.session_inactivity_cohort']) name`)).rows,
      setting: await val("SELECT value v FROM public.system_settings WHERE key='session_inactivity'") ?? null,
    };
  }
  const original = await shape();
  const baselineGames = await val('SELECT count(*)::integer v FROM public.games');
  for (const [status, paused] of [['waiting',false], ['waiting',true], ['in_progress',true], ['game_over',false]]) {
    await query('BEGIN');
    // Deliberately empty tables: no player count/presence exception in the gate.
    await query('INSERT INTO public.games(name,status,is_paused,real_money) VALUES($1,$2,$3,false)',
      ['Synthetic gate '+status, status, paused]);
    await assert.rejects(() => query(migration), /finish_existing_tables_before_install/);
    await query('ROLLBACK');
    assert.deepEqual(await shape(), original);
    assert.equal(await val('SELECT count(*)::integer v FROM public.games'), baselineGames);
  }
  pass('empty waiting, paused waiting/active and game_over all block with zero partial installation');

  await query('BEGIN');
  await query("INSERT INTO public.games(name,status,is_paused,real_money) VALUES('Synthetic terminal gate','completed',true,false),('Synthetic ended gate','session_ended',false,false)");
  const ended = await val('SELECT jsonb_agg(to_jsonb(g) ORDER BY id) v FROM public.games g');
  await query(migration);
  assert.deepEqual(await val('SELECT jsonb_agg(to_jsonb(g) ORDER BY id) v FROM public.games g'), ended);
  await query('ROLLBACK');
  assert.deepEqual(await shape(), original);
  pass('terminal rows permit installation even with a pause flag; historical rows remain byte-equivalent');

  for (const [signature, before, after, error] of [
    ['public.request_session_end(uuid,uuid,bigint)', 'coalesce(g.current_host,fallback_host)',
      'coalesce (g.current_host,fallback_host)', /end_authority_drift/],
    ['public.transfer_session_host(uuid,uuid,bigint)', 'IF NOT FOUND OR p.is_bot OR p.position',
      'IF NOT FOUND OR (p.is_bot) OR p.position', /transfer_authority_drift/],
  ]) {
    await query('BEGIN');
    const definition = await val('SELECT pg_get_functiondef($1::regprocedure) v', [signature]);
    assert(definition.includes(before));
    await query(definition.replace(before, after));
    await assert.rejects(() => query(migration), error);
    await query('ROLLBACK');
    assert.deepEqual(await shape(), original);
  }
  pass('both late RPC seam failures roll back prior DDL, configuration and replaced authority definitions');

  await query('BEGIN', [], peer);
  try {
    await query('LOCK TABLE public.games IN ROW EXCLUSIVE MODE', [], peer);
    await query('BEGIN');
    await assert.rejects(() => query(migration), error => error.code === '55P03');
    await query('ROLLBACK');
    assert.deepEqual(await shape(), original);
  } finally { await query('ROLLBACK', [], peer); }
  pass('concurrent session writer causes bounded lock failure before any candidate object is installed');

  await query('BEGIN');
  const finance = async () => {
    const result = {};
    for (const table of ['games','players','profiles','game_results','session_player_snapshots','gameplay_transfer_batches','player_transactions']) {
      result[table] = await val(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) v FROM public.${table} t`);
    }
    return result;
  };
  await query(migration);
  // A closed synthetic accounting session with a real canonical transfer and
  // account posting makes restoration preservation assertions non-vacuous.
  const ids = await val(`SELECT jsonb_build_object('game',gen_random_uuid(),'dealer',gen_random_uuid(),
    'a',gen_random_uuid(),'b',gen_random_uuid(),'pa',gen_random_uuid(),'pb',gen_random_uuid()) v`);
  for (const user of [ids.a, ids.b]) {
    await query('INSERT INTO auth.users(id) VALUES($1)', [user]);
    await query("INSERT INTO public.profiles(id,username,is_active) VALUES($1,$2,true) ON CONFLICT(id) DO UPDATE SET is_active=true", [user, 'Restoration '+user.slice(0,8)]);
  }
  await query("INSERT INTO public.games(id,name,status,game_type,current_host,real_money,pot,buy_in) VALUES($1,'Local restoration history','game_over','delayed-head-to-head',$2,true,0,0)", [ids.game,ids.a]);
  await query("INSERT INTO public.dealer_games(id,session_id,dealer_user_id,game_type) VALUES($1,$2,$3,'delayed-head-to-head')", [ids.dealer,ids.game,ids.a]);
  await query('UPDATE public.games SET current_game_uuid=$2 WHERE id=$1', [ids.game,ids.dealer]);
  await query("INSERT INTO public.players(id,game_id,user_id,position,chips,status) VALUES($1,$3,$4,1,0,'active'),($2,$3,$5,2,0,'active')", [ids.pa,ids.pb,ids.game,ids.a,ids.b]);
  await query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)", [ids.a]);
  await query("SELECT public.settle_gameplay_chip_transfers($1,jsonb_build_array(jsonb_build_object('from',jsonb_build_object('kind','player','playerId',$2::uuid),'to',jsonb_build_object('kind','player','playerId',$3::uuid),'amount',11)),'win')", [ids.game,ids.pb,ids.pa]);
  await query('SET CONSTRAINTS ALL IMMEDIATE');
  await query("INSERT INTO public.game_results(game_id,dealer_game_id,hand_number,game_type,winner_player_id,winner_username,pot_won,player_chip_changes) VALUES($1,$2,1,'delayed-head-to-head',$3::uuid,'Local restoration proof',11,jsonb_build_object(($3::uuid)::text,11,$4::text,-11))", [ids.game,ids.dealer,ids.pa,ids.pb]);
  await query("INSERT INTO public.session_player_snapshots(game_id,dealer_game_id,hand_number,player_id,user_id,username,chips,is_bot) SELECT game_id,$2,1,id,user_id,'Local restoration proof',chips,is_bot FROM public.players WHERE game_id=$1", [ids.game,ids.dealer]);
  await query("UPDATE public.games SET status='session_ended',session_ended_at=clock_timestamp() WHERE id=$1", [ids.game]);
  await query('SET CONSTRAINTS ALL IMMEDIATE');
  assert.equal(await val('SELECT count(*)::int v FROM public.gameplay_transfer_batches WHERE game_id=$1', [ids.game]), 1);
  assert.equal(await val("SELECT count(*)::int v FROM public.player_transactions WHERE source_game_id=$1 AND transaction_type='SessionResult'", [ids.game]), 2);
  assert.equal(await val('SELECT sum(chips) v FROM public.players WHERE game_id=$1', [ids.game]), '0');
  const financialBefore = await finance();
  // Rehearse a forward code restoration with no live sessions. Keep additive
  // private tables/configuration intact; never undo a committed seat/host/event.
  assert.equal(await val("SELECT count(*)::integer v FROM public.games WHERE status NOT IN ('completed','session_ended')"), 0);
  for (const [table, trigger] of triggers) await query(`DROP TRIGGER ${trigger} ON public.${table}`);
  for (const {definition} of definitions) await query(definition);
  assert.deepEqual((await shape()).owners, original.owners);
  assert.deepEqual(await finance(), financialBefore);
  assert.equal((await shape()).tables.filter(t => t.object).length, 3);
  await query('ROLLBACK');
  assert.deepEqual(await shape(), original);
  pass('forward code-restoration preserves nonzero canonical transfer, account postings, results and history hashes; private records retained');
}
