/** Immutable data contract. This module has no game-engine, transport, or UI imports. */
export const REPLAY_CONTRACT_V1 = 'ptown-replay/1' as const;

export type ReplayJson = null | boolean | number | string | ReplayJson[] | { [key: string]: ReplayJson };
export type ReplayObject = { [key: string]: ReplayJson };
export type ReplayPath = string[];

export type ReplayDeltaV1 =
  | { op: 'set'; path: ReplayPath; existed: boolean; before: ReplayJson; value: ReplayJson }
  | { op: 'remove'; path: ReplayPath; before: ReplayJson }
  | { op: 'splice'; path: ReplayPath; index: number; removed: ReplayJson[]; inserted: ReplayJson[] };

export interface ReplayIdentityV1 {
  sessionId: string;
  dealerGameId: string | null;
  handNumber: number | null;
  roundId: string | null;
}

export interface ReplayTransferV1 {
  id: string;
  from: string;
  to: string;
  amount: number;
  reason: string;
}

export interface ReplayScoreChangeV1 {
  counter: string;
  before: number;
  delta: number;
  after: number;
  reason: string;
}

export interface ReplaySubstepV1 {
  type: string;
  source: string;
  actorId: string | null;
  targets: string[];
  origin: 'player' | 'bot' | 'deadline' | 'recovery' | 'system';
  operands: ReplayObject;
  delta: ReplayDeltaV1[];
  transfers: ReplayTransferV1[];
  scores: ReplayScoreChangeV1[];
}

export interface ReplayClosingV1 {
  scope: 'hand' | 'session';
  identity: ReplayIdentityV1;
  finalSequence: string;
  disposition: string;
  completeness: 'complete' | 'partial';
  endingState: ReplayObject;
  balances: Record<string, number>;
  scores: Record<string, number>;
}

export interface ReplayStepV1 {
  sequence: string;
  sourceKey: string;
  identity: ReplayIdentityV1;
  opening?: {
    state: ReplayObject;
    coverage: 'session_genesis' | 'hand_boundary';
    rules: ReplayObject;
  };
  substeps: ReplaySubstepV1[];
  closing?: ReplayClosingV1;
}

export interface ReplayPackageV1 {
  contract: typeof REPLAY_CONTRACT_V1;
  sessionId: string;
  perspective: { kind: 'participant'; userId: string } | { kind: 'public' };
  coverage: 'session_genesis' | 'hand_boundary' | 'legacy_partial';
  steps: ReplayStepV1[];
  seal: { finalSequence: string; stepCount: number; completeness: 'complete' | 'partial' };
}

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function fail(message: string): never {
  throw new Error(`replay_v1:${message}`);
}

/** Structural equality does not depend on JSON object key order. */
export function equalReplayJson(a: ReplayJson, b: ReplayJson): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key =>
    own(b, key) && equalReplayJson((a as ReplayObject)[key], (b as ReplayObject)[key]));
}

function validateJson(value: ReplayJson): void {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('non_finite_number');
  if (value === null || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (forbiddenKeys.has(key)) fail('unsafe_key');
    validateJson((value as ReplayObject)[key]);
  }
}

function objectAt(state: ReplayObject, path: ReplayPath): ReplayObject | ReplayJson[] {
  let value: ReplayJson = state;
  for (const key of path) {
    if (forbiddenKeys.has(key)) fail('unsafe_path');
    if (value === null || typeof value !== 'object' || !own(value, key)) fail('missing_parent');
    value = (value as ReplayObject)[key];
  }
  if (value === null || typeof value !== 'object') fail('non_container_parent');
  return value;
}

/** Applies only recorded operands. No scores, random outcomes, or rules are recalculated. */
export function applyReplayDeltaV1(input: ReplayObject, delta: readonly ReplayDeltaV1[]): ReplayObject {
  validateJson(input);
  const state = structuredClone(input);
  for (const operation of delta) {
    if (!Array.isArray(operation.path) || operation.path.some(key => typeof key !== 'string' || forbiddenKeys.has(key))) fail('unsafe_path');
    if (operation.op === 'splice') {
      const target = objectAt(state, operation.path);
      if (!Array.isArray(target)) fail('splice_requires_array');
      if (!Number.isSafeInteger(operation.index) || operation.index < 0 || operation.index > target.length) fail('splice_index');
      if (operation.index + operation.removed.length > target.length ||
          !equalReplayJson(target.slice(operation.index, operation.index + operation.removed.length), operation.removed)) fail('splice_precondition');
      validateJson(operation.inserted);
      target.splice(operation.index, operation.removed.length, ...structuredClone(operation.inserted));
      continue;
    }
    if (!operation.path.length) fail('root_replacement_requires_checkpoint');
    const parent = objectAt(state, operation.path.slice(0, -1));
    if (Array.isArray(parent)) fail('array_changes_require_splice');
    const key = operation.path[operation.path.length - 1];
    const exists = own(parent, key);
    if (operation.op === 'set') {
      if (exists !== operation.existed || (exists && !equalReplayJson(parent[key], operation.before))) fail('set_precondition');
      validateJson(operation.value);
      parent[key] = structuredClone(operation.value);
    } else if (operation.op === 'remove') {
      if (!exists || !equalReplayJson(parent[key], operation.before)) fail('remove_precondition');
      delete parent[key];
    } else {
      fail('unsupported_delta');
    }
  }
  return state;
}

function counters(state: ReplayObject, name: 'balances' | 'scores'): Record<string, number> {
  const result = state[name];
  if (result === null || Array.isArray(result) || typeof result !== 'object') fail(`missing_${name}`);
  for (const amount of Object.values(result)) if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) fail(`invalid_${name}`);
  return result as Record<string, number>;
}

function reconcileSubstep(before: ReplayObject, after: ReplayObject, substep: ReplaySubstepV1, transferIds: Set<string>): void {
  const expectedBalances = { ...counters(before, 'balances') };
  const actualBalances = counters(after, 'balances');
  for (const transfer of substep.transfers) {
    if (!transfer.id || transferIds.has(transfer.id)) fail('duplicate_transfer');
    transferIds.add(transfer.id);
    if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0 || transfer.from === transfer.to) fail('invalid_transfer');
    for (const endpoint of [transfer.from, transfer.to]) if (!own(expectedBalances, endpoint)) fail('unknown_transfer_endpoint');
    expectedBalances[transfer.from] -= transfer.amount;
    expectedBalances[transfer.to] += transfer.amount;
    if (!Number.isSafeInteger(expectedBalances[transfer.from]) || !Number.isSafeInteger(expectedBalances[transfer.to])) fail('balance_overflow');
  }
  // Endpoints must be explicitly introduced with zero balance; initial balances
  // belong in a checkpoint. External sources/sinks are explicit ledger endpoints.
  for (const key of Object.keys(actualBalances)) if (!own(expectedBalances, key) && actualBalances[key] === 0) expectedBalances[key] = 0;
  if (!equalReplayJson(expectedBalances, actualBalances)) fail('financial_reconciliation');

  const expectedScores = { ...counters(before, 'scores') };
  for (const score of substep.scores) {
    if (![score.before, score.delta, score.after].every(Number.isSafeInteger) ||
        score.before + score.delta !== score.after || expectedScores[score.counter] !== score.before) fail('score_precondition');
    expectedScores[score.counter] = score.after;
  }
  const actualScores = counters(after, 'scores');
  for (const key of Object.keys(actualScores)) if (!own(expectedScores, key) && actualScores[key] === 0) expectedScores[key] = 0;
  if (!equalReplayJson(expectedScores, actualScores)) fail('score_reconciliation');
}

/** Applies a captured prefix without claiming the hand/session is complete. */
export function reconstructReplayPrefixV1(replay: Pick<ReplayPackageV1, 'contract' | 'sessionId' | 'steps'>): ReplayObject {
  if (replay.contract !== REPLAY_CONTRACT_V1) fail('unsupported_contract');
  if (!replay.steps.length) fail('step_count');
  let state: ReplayObject | undefined;
  let previous = 0n;
  const sources = new Set<string>();
  const transfers = new Set<string>();
  for (const step of replay.steps) {
    if (!/^[1-9]\d*$/.test(step.sequence)) fail('invalid_sequence');
    const sequence = BigInt(step.sequence);
    if (sequence <= previous) fail('sequence_order');
    previous = sequence;
    if (!step.sourceKey || sources.has(step.sourceKey)) fail('duplicate_source');
    sources.add(step.sourceKey);
    if (step.identity.sessionId !== replay.sessionId) fail('session_identity');
    if (step.opening) {
      validateJson(step.opening.state);
      if (!Object.keys(step.opening.rules).length) fail('missing_rules_contract');
      // A checkpoint may reset hand artifacts, but cannot conceal a financial or
      // score mutation between committed transitions.
      if (state && (!equalReplayJson(counters(state, 'balances'), counters(step.opening.state, 'balances')) ||
                    !equalReplayJson(counters(state, 'scores'), counters(step.opening.state, 'scores')))) fail('checkpoint_reconciliation');
      state = structuredClone(step.opening.state);
    }
    if (!state) fail('missing_opening');
    for (const substep of step.substeps) {
      const after = applyReplayDeltaV1(state, substep.delta);
      reconcileSubstep(state, after, substep, transfers);
      state = after;
    }
    if (step.closing) {
      if (step.closing.finalSequence !== step.sequence || step.closing.identity.sessionId !== replay.sessionId) fail('closing_identity');
      if (!equalReplayJson(state, step.closing.endingState)) fail('ending_state');
      if (!equalReplayJson(counters(state, 'balances'), step.closing.balances) ||
          !equalReplayJson(counters(state, 'scores'), step.closing.scores)) fail('closing_reconciliation');
    }
  }
  return state!;
}

/** Headless acceptance verifier. It intentionally has no lookup/callback parameter. */
export function reconstructReplayV1(replay: ReplayPackageV1): ReplayObject {
  if (replay.coverage === 'legacy_partial' || replay.seal.completeness !== 'complete') fail('incomplete_package');
  if (replay.seal.stepCount !== replay.steps.length) fail('step_count');
  const state = reconstructReplayPrefixV1(replay);
  const last = replay.steps[replay.steps.length - 1];
  if (replay.seal.finalSequence !== last.sequence || last.closing?.completeness !== 'complete') fail('unsealed_tail');
  return state;
}
