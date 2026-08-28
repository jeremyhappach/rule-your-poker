import { writeFile } from 'node:fs/promises';

import type { Page, TestInfo } from '@playwright/test';

/** Persist evidence beside Playwright's trace, independent of reporter attachments. */
export async function persistScenarioEvidence(
  info: TestInfo,
  name: string,
  evidence: Record<string, unknown>,
): Promise<void> {
  const path = info.outputPath(name);
  await writeFile(path, JSON.stringify(evidence, null, 2), 'utf8');
  await info.attach(name, { path, contentType: 'application/json' });
}

export async function capturePreCleanupScreenshots(
  info: TestInfo,
  pages: ReadonlyArray<{ label: string; page: Page }>,
): Promise<void> {
  await Promise.all(pages.map(async ({ label, page }) => {
    await page.screenshot({ path: info.outputPath(`${label}-before-cleanup.png`), fullPage: true });
  }));
}
