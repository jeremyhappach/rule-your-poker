import { defineConfig, devices } from '@playwright/test';
import './liveness/support/env';
export default defineConfig({ testDir: '.', testMatch: 'cardVisibility.spec.ts', workers: 1, retries: 0, timeout: 120_000,
  outputDir: '../test-results/card-visibility', reporter: 'line', use: { baseURL: 'http://127.0.0.1:4792', screenshot: 'only-on-failure' },
  projects: [{ name: 'android-chrome', use: { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chrome' } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }] });
