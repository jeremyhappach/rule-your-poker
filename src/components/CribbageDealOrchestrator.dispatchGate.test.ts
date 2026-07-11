// Turn 1 Patch A — CribbageDealOrchestrator durable canonical dispatch
// gate. Source-level assertions verifying:
//
//   1. dispatchedRef mount-local guard remains (short-circuit for the
//      normal single-mount case).
//   2. In addition, the orchestrator consults `deal.phase` before
//      dispatching. When DealRuntime has already left PRE_DEAL for the
//      current handContextId — which is what happens when the
//      orchestrator remounts while DealRuntime (host-keyed by
//      handContextId, mounted higher in the tree via DealRuntimeMaybe)
//      persists — dispatch is suppressed. This uses the existing
//      canonical runtime owner instead of a parallel registry.
//   3. dispatchedRef is set to true when suppression fires from the
//      runtime gate, so any subsequent effect re-run within the same
//      remount also short-circuits.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(__dirname, 'CribbageDealOrchestrator.tsx'),
  'utf-8'
);

describe('CribbageDealOrchestrator — durable canonical dispatch gate', () => {
  it('keeps the mount-local dispatchedRef short-circuit', () => {
    expect(src).toMatch(/dispatchedRef\.current\s*=\s*true/);
    expect(src).toMatch(/if\s*\(\s*!deal\s*\|\|\s*dispatchedRef\.current\s*\)/);
  });

  it('consults DealRuntime.phase before dispatching (canonical durable gate)', () => {
    // Must gate on phase !== PRE_DEAL. The comment must explicitly
    // reference the canonical owner so future edits don't
    // reintroduce a parallel registry.
    expect(src).toMatch(/if\s*\(\s*deal\.phase\s*!==\s*'PRE_DEAL'\s*\)/);
    expect(src).toMatch(/Durable canonical gate/);
    expect(src).toMatch(/DealRuntime.*key=\{handContextId\}|host-keyed|higher in the tree/i);
  });

  it('runtime-gate suppression path sets dispatchedRef and emits duplicate_dispatch_suppressed_by_runtime', () => {
    // The gate block must set dispatchedRef.current = true BEFORE
    // returning so a subsequent re-run inside the same remount
    // also short-circuits via the mount-local guard.
    const gateBlock = src.match(
      /if\s*\(\s*deal\.phase\s*!==\s*'PRE_DEAL'\s*\)\s*\{[\s\S]*?return;\s*\}/
    );
    expect(gateBlock, 'runtime gate block not found').toBeTruthy();
    expect(gateBlock![0]).toMatch(/dispatchedRef\.current\s*=\s*true/);
    expect(gateBlock![0]).toMatch(/duplicate_dispatch_suppressed_by_runtime/);
  });

  it('runtime-gate path does NOT call beginDeal or dispatchMany', () => {
    const gateBlock = src.match(
      /if\s*\(\s*deal\.phase\s*!==\s*'PRE_DEAL'\s*\)\s*\{[\s\S]*?return;\s*\}/
    )![0];
    expect(gateBlock).not.toMatch(/beginDeal\s*\(/);
    expect(gateBlock).not.toMatch(/dispatchMany\s*\(/);
  });

  it('does not introduce a parallel module-level dispatch registry (uses canonical DealRuntime instead)', () => {
    // Reject re-appearance of shape patterns like a module-level Set
    // keyed on hand identity acting as a second dispatch ownership
    // layer. The canonical rule is: DealRuntime is the sole durable
    // owner across orchestrator remounts.
    expect(src).not.toMatch(/dispatchedHandContextIds\s*=\s*new Set/);
    expect(src).not.toMatch(/dispatchOwnershipRegistry/);
  });
});
