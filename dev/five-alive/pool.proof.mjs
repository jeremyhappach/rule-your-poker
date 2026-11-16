import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {connect} from '../async-words/local.mjs';

// Disposable local database only; never point this runner at production.
const name = 'five_alive_pool_candidate';
const db = await connect(name);
const peers = [];
try {
  await db.query('DROP SCHEMA IF EXISTS private CASCADE');
  await db.query('CREATE SCHEMA private');
  await db.query(readFileSync('supabase/five-alive/pool.sql', 'utf8'));
  await db.query("INSERT INTO private.five_alive_answers(version,word,difficulty) VALUES ('test/1','APPLE',1),('test/1','BREAD',2),('test/1','CLOUD',3),('test/1','DREAM',4),('test/1','EARTH',5),('test/1','FRUIT',2),('test/1','GRAPE',2)");
  await db.query("INSERT INTO private.five_alive_pool(version) VALUES ('test/1')");
  await assert.rejects(db.query("INSERT INTO private.five_alive_answers VALUES ('test/1','WATER',1)"), /answers_frozen/);
  await assert.rejects(db.query("UPDATE private.five_alive_answers SET version='other/1' WHERE word='APPLE'"), /answers_frozen/);
  const ids = Array.from({length: 8}, () => randomUUID());
  for (let i = 0; i < ids.length; i++) peers.push(await connect(name));
  const results = await Promise.all(peers.map((peer, i) => peer.query("SELECT private.five_alive_allocate('arcade',$1,'test/1') value", [ids[i]])));
  for (const row of results) assert.equal(new Set(row.rows[0].value.map(a => a.word)).size, 3);
  const stored = await db.query('SELECT epoch,position,word FROM private.five_alive_shuffle ORDER BY epoch,position');
  const allocations = await db.query('SELECT owner_id,round,word FROM private.five_alive_allocations ORDER BY owner_id,round');
  assert.equal(allocations.rowCount, 24);
  for (const epoch of new Set(stored.rows.map(row => row.epoch))) {
    const words = stored.rows.filter(row => row.epoch === epoch).map(row => row.word);
    assert.equal(words.length, 7);
    assert.equal(new Set(words).size, 7);
  }
  for (let i = 1; i < stored.rows.length; i++) {
    if (stored.rows[i].epoch !== stored.rows[i - 1].epoch) assert.notEqual(stored.rows[i].word, stored.rows[i - 1].word);
  }
  const before = await db.query('SELECT epoch,cursor,last_word FROM private.five_alive_pool');
  const replay = await db.query("SELECT private.five_alive_allocate('arcade',$1,'test/1') value", [ids[0]]);
  assert.deepEqual(replay.rows[0].value, results[0].rows[0].value);
  assert.deepEqual((await db.query('SELECT epoch,cursor,last_word FROM private.five_alive_pool')).rows, before.rows);
  const rolledBack = randomUUID();
  await db.query('BEGIN');
  await db.query("SELECT private.five_alive_allocate('async',$1,'test/1')", [rolledBack]);
  await db.query('ROLLBACK');
  assert.equal((await db.query('SELECT count(*)::int n FROM private.five_alive_allocations WHERE owner_id=$1', [rolledBack])).rows[0].n, 0);
  assert.deepEqual((await db.query('SELECT epoch,cursor,last_word FROM private.five_alive_pool')).rows, before.rows);
  console.log('PASS local allocation replay, eight concurrent games, rollover uniqueness, bank freeze and rollback');
} finally {
  await Promise.all(peers.map(peer => peer.end()));
  await db.end();
}
