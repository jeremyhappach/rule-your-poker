import { expect, type Page } from '@playwright/test';
import type { TwoClientSession } from '../../liveness/support/twoClientSession';

/** Fault only the test host's optional chunk; never alter a deployment or DB row. */
export async function armOptionalDiagnosticFault(session: TwoClientSession) {
  const requests = { host: 0, peer: 0 };
  const errors: string[] = [];
  for (const [role, page] of [['host', session.hostPage], ['peer', session.peerPage]] as const) {
    page.on('pageerror', error => errors.push(`${role}: ${error.message}`));
    await page.route(/\/assets\/h1r3ToH2r1-[^/]+\.js(?:\?.*)?$/, async route => {
      requests[role]++;
      if (role === 'host') {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Obsolete diagnostic asset</title>' });
      } else await route.continue();
    });
    await page.evaluate(enabled => {
      const key = 'ptp_wartime_debug_enabled';
      if (enabled) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: enabled ? '1' : null, storageArea: localStorage }));
      const state = { errorToasts: 0 };
      (window as unknown as { __optionalDiagnosticFault: typeof state }).__optionalDiagnosticFault = state;
      const observer = new MutationObserver(() => {
        if ([...document.querySelectorAll('[data-sonner-toast], [role="alert"], [role="status"]')]
          .some(node => node.textContent?.includes('An error occurred. Please try again.'))) state.errorToasts++;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, role === 'host');
  }
  return {
    async verify() {
      expect(requests.host, 'enabled host attempts the unavailable module once across both hands and successor').toBe(1);
      expect(requests.peer, 'disabled peer never loads optional diagnostics').toBe(0);
      expect(errors, 'optional loading never reaches unhandled page errors').toEqual([]);
      const toastCounts = await Promise.all([session.hostPage, session.peerPage].map((page: Page) => page.evaluate(() =>
        (window as unknown as { __optionalDiagnosticFault: { errorToasts: number } }).__optionalDiagnosticFault.errorToasts)));
      expect(toastCounts, 'no generic failure toast during render/deal/round transitions').toEqual([0, 0]);
      return { requests, errors, toastCounts, fault: 'host-only HTTP 200 text/html optional module' };
    },
  };
}
