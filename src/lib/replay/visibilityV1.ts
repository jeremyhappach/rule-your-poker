import type { ReplayJson, ReplayObject, ReplayPackageV1 } from './contractV1';

/** Historical occurrence, not a permanent grant for every use of this object. */
export interface ReplayCardOccurrenceV1 extends ReplayObject {
  kind: 'card';
  objectId: string;
  visibleTo: string[];
  face?: ReplayObject;
}

/**
 * Pure server-side projection primitive; NOT an authenticated export endpoint.
 * The future exporter must authorize its perspective from durable membership.
 * Never ship the input/private journal to a client to run this function there.
 */
export function projectRecordedVisibilityV1(
  input: ReplayJson,
  perspective: ReplayPackageV1['perspective'],
): ReplayJson {
  if (input === null || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(value => projectRecordedVisibilityV1(value, perspective));
  if (input.kind === 'card') {
    if (typeof input.objectId !== 'string' || !input.objectId || !Array.isArray(input.visibleTo) ||
        input.visibleTo.some(value => typeof value !== 'string')) throw new Error('replay_v1:invalid_card_occurrence');
    const allowed = input.visibleTo.includes('public') ||
      (perspective.kind === 'participant' && input.visibleTo.includes(perspective.userId));
    // Only these fields are admitted. A face can never escape through an alias.
    const output: ReplayObject = { kind: 'card', objectId: input.objectId, visibleTo: input.visibleTo.slice() };
    if (allowed && input.face !== undefined) output.face = structuredClone(input.face);
    return output;
  }
  if (('rank' in input && 'suit' in input) || 'face' in input) throw new Error('replay_v1:unclassified_card_face');
  // Card occurrences are atomic delta operands. A patch into a card's face or
  // grant would otherwise release a scalar detached from its historical grant.
  if ('op' in input && Array.isArray(input.path) && input.path.some(key => ['face', 'visibleTo', 'objectId'].includes(String(key)))) {
    throw new Error('replay_v1:non_atomic_card_delta');
  }
  const output: ReplayObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('replay_v1:unsafe_key');
    output[key] = projectRecordedVisibilityV1(value, perspective);
  }
  return output;
}
