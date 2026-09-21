import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/farkle', workers: 1, fullyParallel: false, retries: 0,
  timeout: 180_000, expect: { timeout: 30_000 }, reporter: 'line',
  outputDir: 'test-results/farkle-local',
  use: { baseURL: 'http://127.0.0.1:5177', channel: 'chrome',
    screenshot: 'only-on-failure' },
});
