import { defineConfig } from '@playwright/test';
import path from 'node:path';

import './e2e/liveness/support/env';
import { resolveHumanChaosTarget } from './e2e/humanChaos/target';

const target = resolveHumanChaosTarget();
const runNamespace = process.env.PTOWN_E2E_RUN_NAMESPACE?.trim();
if (!runNamespace || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(runNamespace)) {
  throw new Error('Production terminal gauntlet requires a unique PTOWN_E2E_RUN_NAMESPACE.');
}

const outputRoot = process.env.PTOWN_E2E_OUTPUT_DIR?.trim() || 'test-results/terminal';
const outputDir = path.join(outputRoot, runNamespace);
const reportDir = path.join('playwright-report/terminal', runNamespace);

process.env.PTOWN_E2E_BASE_URL = target.baseUrl;
process.env.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF = target.supabaseProjectRef;
process.env.PTOWN_E2E_CONTINUOUS_OBSERVER = '1';
process.env.PTOWN_E2E_MAX_ACTION_TO_PEER_MS = '6000';

export default defineConfig({
  testDir: './e2e/terminal',
  testMatch: '**/*.terminal.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 20 * 60_000,
  expect: { timeout: 120_000 },
  retries: 0,
  outputDir,
  reporter: [['line'], ['html', { open: 'never', outputFolder: reportDir }]],
  use: {
    baseURL: target.baseUrl,
    channel: 'chrome',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
