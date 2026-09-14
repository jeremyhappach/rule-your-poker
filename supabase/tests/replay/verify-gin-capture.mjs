// Offline proof from actual SQL-captured fixtures. No network/database library.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconstructReplayPrefixV1 } from '../../../src/lib/replay/contractV1.ts';
import { projectRecordedVisibilityV1 } from '../../../src/lib/replay/visibilityV1.ts';
const fixtures = JSON.parse(readFileSync(process.argv[2] ?? 'artifacts/replay-baseline/gin-captured-proof.json', 'utf8'));
function cards(value, result = []) {
  if (!value || typeof value !== 'object') return result;
  if (value.kind === 'card') { result.push(value); return result; }
  for (const item of Object.values(value)) cards(item, result);
  return result;
}
for (const fixture of Object.values(fixtures)) {
  const prefix = { contract: 'ptown-replay/1', sessionId: fixture.sessionId, steps: fixture.steps };
  assert.deepEqual(reconstructReplayPrefixV1(prefix), fixture.expected);
  for (const perspective of [{ kind: 'public' }, { kind: 'participant', userId: fixture.ownerUserId }, { kind: 'participant', userId: fixture.otherUserId }]) {
    const projected = projectRecordedVisibilityV1(prefix, perspective);
    assert.deepEqual(reconstructReplayPrefixV1(projected), projectRecordedVisibilityV1(fixture.expected, perspective));
    for (const card of cards(projected)) {
      const allowed = card.visibleTo.includes('public') || (perspective.kind === 'participant' && card.visibleTo.includes(perspective.userId));
      assert.equal(Object.hasOwn(card, 'face'), allowed);
    }
    const opening = projected.steps[0].opening.state.gameState;
    assert.equal(cards(opening.stockPile).filter(c => c.face).length, 0);
    const hands = Object.values(opening.playerStates).flatMap(p => cards(p.hand));
    assert.equal(hands.filter(c => c.face).length, perspective.kind === 'public' ? 0 : 10);
    // Later public reveal must never backfill the opening hand's faces.
    assert.equal(new Set(hands.map(c => c.objectId)).size, 20);
  }
  assert.equal(fixture.coverage, 'pilot_partial');
  assert.equal(fixture.steps.some(step => step.closing?.completeness === 'complete'), false);
  console.log(`${fixture.mode}: raw + public + both participant perspectives reconstruct exactly; historical faces preserved; prefix remains partial.`);
}
