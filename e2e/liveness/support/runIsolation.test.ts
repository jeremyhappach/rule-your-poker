import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { acquireIdentityLease, resolveTestRunIsolation } from './runIsolation';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('identity lease', () => {
  it('fails closed when a second concurrent worker selects the same identities', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptown-e2e-lease-'));
    temporaryRoots.push(root);
    const previousLeaseDir = process.env.PTOWN_E2E_LEASE_DIR;
    process.env.PTOWN_E2E_LEASE_DIR = root;
    try {
      const isolation = resolveTestRunIsolation({
        PTOWN_E2E_REQUIRE_ISOLATION: '1',
        PTOWN_E2E_IDENTITY_SLOT: 'cribbage',
        PTOWN_E2E_RUN_NAMESPACE: 'cribbage-baseline',
      });
      const credentials = {
        player1: { email: 'one@example.test', password: 'one' },
        player2: { email: 'two@example.test', password: 'two' },
      };
      const first = acquireIdentityLease(credentials, isolation);
      expect(() => acquireIdentityLease(credentials, isolation)).toThrow(/already leased/);
      first?.release();
      expect(acquireIdentityLease(credentials, isolation)).not.toBeNull();
    } finally {
      if (previousLeaseDir === undefined) delete process.env.PTOWN_E2E_LEASE_DIR;
      else process.env.PTOWN_E2E_LEASE_DIR = previousLeaseDir;
    }
  });
});
