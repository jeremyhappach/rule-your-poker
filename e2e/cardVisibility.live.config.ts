import { defineConfig } from '@playwright/test';
import './liveness/support/env';
process.env.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'xvhmbuppghwmwpwrkzao';
export default defineConfig({ testDir: '.', testMatch: 'cardVisibility.live.spec.ts', workers: 1, retries: 0,
  timeout: 180_000, expect: { timeout: 30_000 }, outputDir: '../test-results/card-visibility-live', reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4793', channel: 'chrome', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure' } });
