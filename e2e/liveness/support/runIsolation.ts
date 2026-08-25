import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { PlayerCredentials } from './env';

export type TestRunIsolation = {
  identitySlot: string | null;
  runNamespace: string | null;
  required: boolean;
};

export type IdentityLease = {
  release: () => void;
};

const validToken = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function optionalToken(raw: string | undefined, name: string): string | null {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  if (!validToken.test(value)) {
    throw new Error(`${name} must contain only letters, numbers, underscores, or hyphens.`);
  }
  return value;
}

export function resolveTestRunIsolation(environment: NodeJS.ProcessEnv = process.env): TestRunIsolation {
  const identitySlot = optionalToken(environment.PTOWN_E2E_IDENTITY_SLOT, 'PTOWN_E2E_IDENTITY_SLOT');
  const runNamespace = optionalToken(environment.PTOWN_E2E_RUN_NAMESPACE, 'PTOWN_E2E_RUN_NAMESPACE');
  const required = environment.PTOWN_E2E_REQUIRE_ISOLATION === '1';
  if (required && (!identitySlot || !runNamespace)) {
    throw new Error(
      'Parallel E2E execution requires both PTOWN_E2E_IDENTITY_SLOT and PTOWN_E2E_RUN_NAMESPACE.',
    );
  }
  return { identitySlot, runNamespace, required };
}

function identityLeaseKey(player1: PlayerCredentials, player2: PlayerCredentials): string {
  return crypto.createHash('sha256')
    .update([player1.email.toLowerCase(), player2.email.toLowerCase()].sort().join('|'))
    .digest('hex');
}

function activeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A local fail-closed lease prevents two concurrent workers from accidentally
 * using the same authenticated human pair. The hash never exposes emails in
 * artifact paths or test output.
 */
export function acquireIdentityLease(
  credentials: { player1: PlayerCredentials; player2: PlayerCredentials },
  isolation: TestRunIsolation,
): IdentityLease | null {
  if (!isolation.required) return null;

  const leaseRoot = path.resolve(process.env.PTOWN_E2E_LEASE_DIR?.trim() || 'test-results/.identity-leases');
  fs.mkdirSync(leaseRoot, { recursive: true });
  const leasePath = path.join(leaseRoot, `${identityLeaseKey(credentials.player1, credentials.player2)}.json`);
  const payload = JSON.stringify({ pid: process.pid, namespace: isolation.runNamespace, startedAt: new Date().toISOString() });

  try {
    fs.writeFileSync(leasePath, payload, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    try {
      const existing = JSON.parse(fs.readFileSync(leasePath, 'utf8')) as { pid?: number };
      if (typeof existing.pid === 'number' && !activeProcess(existing.pid)) {
        fs.rmSync(leasePath, { force: true });
        fs.writeFileSync(leasePath, payload, { encoding: 'utf8', flag: 'wx' });
      } else {
        throw new Error('The selected E2E identity pair is already leased by another active worker.');
      }
    } catch (retryError) {
      if (retryError instanceof Error && retryError.message.includes('already leased')) throw retryError;
      throw new Error('Could not acquire the selected E2E identity lease.');
    }
  }

  return {
    release: () => fs.rmSync(leasePath, { force: true }),
  };
}
