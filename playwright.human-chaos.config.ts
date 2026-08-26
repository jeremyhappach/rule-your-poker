import { defineConfig } from '@playwright/test';
import path from 'node:path';

import './e2e/liveness/support/env';
import { resolveHumanChaosTarget } from './e2e/humanChaos/target';

const target = resolveHumanChaosTarget();
const runNamespace = process.env.PTOWN_E2E_RUN_NAMESPACE?.trim();
if (runNamespace && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(runNamespace)) {
  throw new Error('PTOWN_E2E_RUN_NAMESPACE must contain only letters, numbers, underscores, or hyphens.');
}
const outputRoot = process.env.PTOWN_E2E_OUTPUT_DIR?.trim() || 'test-results';
const outputDir = runNamespace ? path.join(outputRoot, runNamespace) : outputRoot;
const reportDir = runNamespace ? path.join('playwright-report', runNamespace) : 'playwright-report';

process.env.PTOWN_E2E_BASE_URL = target.baseUrl;
process.env.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF = target.supabaseProjectRef;

export default defineConfig({
  testDir: './e2e/humanChaos',
  fullyParallel: false,
  workers: 1,
  timeout: 3 * 60_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  outputDir,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never', outputFolder: reportDir }]]
    : 'line',
  use: {
    baseURL: target.baseUrl,
    channel: process.env.CI ? undefined : 'chrome',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
