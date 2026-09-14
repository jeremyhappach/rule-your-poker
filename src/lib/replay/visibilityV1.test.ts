import { describe, expect, it } from 'vitest';
import { applyReplayDeltaV1, type ReplayDeltaV1, type ReplayObject } from './contractV1';
import { projectRecordedVisibilityV1 } from './visibilityV1';

const hidden = { kind: 'card', objectId: 'opaque-random-id', visibleTo: ['owner'], face: { rank: 'A', suit: 'clubs' } };
const revealed = { ...hidden, visibleTo: ['public'] };

describe('historical replay visibility', () => {
  it('keeps stable identity/count without releasing a hidden face', () => {
    expect(projectRecordedVisibilityV1([hidden], { kind: 'public' })).toEqual([
      { kind: 'card', objectId: hidden.objectId, visibleTo: ['owner'] },
    ]);
    expect(projectRecordedVisibilityV1(hidden, { kind: 'participant', userId: 'owner' })).toEqual(hidden);
    expect(projectRecordedVisibilityV1(hidden, { kind: 'participant', userId: 'outsider' })).not.toHaveProperty('face');
  });

  it('applies a later grant without backfilling an earlier occurrence', () => {
    const opening = projectRecordedVisibilityV1({ card: hidden }, { kind: 'public' }) as ReplayObject;
    const delta = projectRecordedVisibilityV1([
      { op: 'set', path: ['card'], existed: true, before: hidden, value: revealed },
    ], { kind: 'public' }) as unknown as ReplayDeltaV1[];
    const ending = applyReplayDeltaV1(opening, delta);
    expect(ending.card).toEqual(revealed);
    expect(opening.card).not.toHaveProperty('face');
    expect(delta[0]).toHaveProperty('before.objectId', hidden.objectId);
    expect(delta[0]).not.toHaveProperty('before.face');
  });

  it('hides a historically public card when the next occurrence is hidden', () => {
    const delta = projectRecordedVisibilityV1([
      { op: 'set', path: ['card'], existed: true, before: revealed, value: hidden },
    ], { kind: 'public' }) as unknown as ReplayDeltaV1[];
    const ending = applyReplayDeltaV1({ card: revealed }, delta);
    expect(ending.card).not.toHaveProperty('face');
    expect(ending.card).toHaveProperty('objectId', hidden.objectId);
  });

  it('rejects unclassified faces and scalar patches detached from a grant', () => {
    expect(() => projectRecordedVisibilityV1(hidden.face, { kind: 'public' })).toThrow('unclassified_card_face');
    expect(() => projectRecordedVisibilityV1({ op: 'set', path: ['card', 'face', 'rank'], value: 'A' }, { kind: 'public' })).toThrow('non_atomic_card_delta');
    expect(() => projectRecordedVisibilityV1({ kind: 'card', objectId: 'x', visibleTo: [true] }, { kind: 'public' })).toThrow('invalid_card_occurrence');
  });
});
