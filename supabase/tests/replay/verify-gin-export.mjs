import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { reconstructReplayV1, reconstructReplayPrefixV1 } from '../../../src/lib/replay/contractV1.ts';
const proof = JSON.parse(readFileSync(process.argv[2] ?? 'artifacts/replay-baseline/gin-phase-two-export-proof.json', 'utf8'));
function inspect(value, perspective, inFace = false) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.hasOwn(value, 'privateCatalog'), false);
  assert.equal(Object.hasOwn(value, 'cardIds'), false);
  if (value.kind === 'card') {
    const allowed = value.visibleTo.includes('public') || (perspective.kind === 'participant' && value.visibleTo.includes(perspective.userId));
    assert.equal(Object.hasOwn(value, 'face'), allowed);
    assert.match(value.objectId, /^[0-9a-f-]{36}$/);
    return;
  }
  assert.equal(Object.hasOwn(value, 'rank') && Object.hasOwn(value, 'suit') && !inFace, false, 'Unclassified card face in export');
  for (const item of Object.values(value)) inspect(item, perspective, inFace);
}
for (const { category, package: replay } of proof.exports) {
  const state = replay.seal.completeness === 'complete' ? reconstructReplayV1(replay) : reconstructReplayPrefixV1(replay);
  if (process.argv.includes('--require-complete')) assert.equal(replay.seal.completeness, 'complete');
  assert.deepEqual(state, replay.steps.at(-1).closing.endingState);
  inspect(replay, replay.perspective);
  const opening = replay.steps[0].opening.state.gameState;
  for (const card of opening.stockPile) assert.equal(Object.hasOwn(card, 'face'), false);
  for (const player of Object.values(opening.playerStates)) for (const card of player.hand) {
    const isOwner = replay.perspective.kind === 'participant' && card.visibleTo.includes(replay.perspective.userId);
    assert.equal(Object.hasOwn(card, 'face'), isOwner);
  }
  if (category === 'settlement_terminal') {
    assert.equal(state.session.status, 'session_ended');
    assert.equal(replay.steps.flatMap(s => s.substeps.flatMap(x => x.transfers)).length, 1);
  }
}
assert.equal(proof.liveRowsRemovedDuringProof, true);
assert.equal(proof.fixturesRolledBack, true);
console.log(`${proof.exports.length} actual database exports reconstruct offline, reconcile scores/edges, contain no private catalog or ungranted card faces, and survive removal of live state.`);
