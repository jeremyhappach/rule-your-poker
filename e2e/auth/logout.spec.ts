import { test, expect, chromium, webkit, type Browser, type Page } from '@playwright/test';

// Run against the local dev server with VITE_SUPABASE_URL equal to its base URL
// and a dummy publishable key. All backend traffic is intercepted; no real users
// or tables are created. These checks do not replace physical-device smoke.
const storageKey = 'sb-127-auth-token';
const user1 = '00000000-0000-4000-8000-000000000001';
const user2 = '00000000-0000-4000-8000-000000000002';
const makeSession = (device: string, id = user1) => ({
  access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, session_id: device, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
  refresh_token: `offline-${device}`, expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600, token_type: 'bearer',
  user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});

async function device(browser: Browser, baseURL: string, name: string) {
  if (!baseURL.startsWith('http://127.0.0.1:')) throw new Error('Auth proof requires a local dev server');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const initial = makeSession(name);
  const state = { revoked: false, unavailable: false, userUnavailable: false, current: initial, authRequests: [] as string[], forbidden: [] as string[], errors: [] as string[] };
  await context.addInitScript(({ key, session }) => {
    if (!sessionStorage.getItem('auth-proof-seeded')) {
      localStorage.setItem(key, JSON.stringify(session));
      sessionStorage.setItem('auth-proof-seeded', 'true');
    }
  }, { key: storageKey, session: initial });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) {
      if (url.hostname.endsWith('.supabase.co')) state.forbidden.push(url.origin);
      return route.abort();
    }
    if (!/^\/(auth|rest|realtime)\/v1\//.test(url.pathname)) return route.continue();
    const headers = {
      'access-control-allow-origin': new URL(baseURL).origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*',
      'x-supabase-api-version': '2024-01-01',
      'access-control-expose-headers': 'x-supabase-api-version',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers });
    if (url.pathname.startsWith('/auth/v1/')) {
      state.authRequests.push(url.pathname + url.search);
      if (state.unavailable || (state.userUnavailable && url.pathname.endsWith('/user'))) return json({ message: 'Temporary outage' }, 503);
      if (url.pathname.endsWith('/token')) {
        state.current = makeSession(`${name}-account-2`, user2); state.revoked = false;
        return json(state.current);
      }
      if (state.revoked) return json({ code: 'session_not_found', message: 'Session not found' }, 403);
      if (url.pathname.endsWith('/logout')) {
        expect(url.searchParams.get('scope')).toBe('local');
        state.revoked = true;
        return route.fulfill({ status: 204, headers });
      }
      if (url.pathname.endsWith('/user')) return json(state.current.user);
      throw new Error(`Unexpected auth request: ${url.pathname}`);
    }
    if (url.pathname.endsWith('/account_statement')) return json({ balance: '0', transactions: [], has_more: false, next_cursor: null });
    if (url.pathname.endsWith('/profiles')) {
      const profile = { id: state.current.user.id, username: 'Offline auth proof', is_active: true, is_superuser: false };
      return json(request.headers().accept?.includes('object') ? profile : [profile]);
    }
    return json([]);
  });
  const page = await context.newPage();
  page.on('pageerror', error => {
    // WebKit's mocked runtime-registration request can be rejected across
    // navigation. Record this fixture limitation; never suppress auth errors.
    if (browser.browserType().name() === 'webkit' && /\/rest\/v1\/client_runtime_instances\?.*access control checks/.test(error.message)) {
      test.info().annotations.push({ type: 'fixture-warning', description: error.message });
    } else state.errors.push(error.message);
  });
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  return { page, context, state };
}

async function verifyLoggedOut(page: Page) {
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await page.reload();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth$/);
}

for (const engine of ['chrome', 'webkit'] as const) {
  test.describe(engine, () => {
    let browser: Browser;
    test.beforeAll(async () => {
      browser = engine === 'chrome'
        ? await chromium.launch({ channel: 'chrome' })
        : await webkit.launch({ executablePath: process.env.PTOWN_WEBKIT_EXECUTABLE || undefined });
    });
    test.afterAll(async () => { await browser?.close(); });

    test('local logout retains the peer session and allows Account 2 login', async ({ baseURL }) => {
      const a = await device(browser, baseURL!, 'A');
      const b = await device(browser, baseURL!, 'B');
      try {
        await b.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await verifyLoggedOut(b.page);
        expect(b.state.authRequests).toContain('/auth/v1/logout?scope=local');
        await expect(a.page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
        expect(await a.page.evaluate(key => JSON.parse(localStorage.getItem(key)!).user.id, storageKey)).toBe(user1);
        expect(a.state.revoked).toBe(false);
        await b.page.getByLabel('Email', { exact: true }).fill('account2@example.invalid');
        await b.page.getByLabel('Password', { exact: true }).fill('offline-test-password');
        await b.page.getByRole('button', { name: 'Login', exact: true }).click();
        await expect(b.page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
        expect(await b.page.evaluate(key => JSON.parse(localStorage.getItem(key)!).user.id, storageKey)).toBe(user2);
        expect([...a.state.errors, ...b.state.errors, ...a.state.forbidden, ...b.state.forbidden]).toEqual([]);
      } finally { await a.context.close(); await b.context.close(); }
    });

    test('already-revoked session clears through getUser without an Auth loop', async ({ baseURL }, info) => {
      const d = await device(browser, baseURL!, 'revoked');
      try {
        d.state.revoked = true;
        await d.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await verifyLoggedOut(d.page);
        expect(d.state.authRequests).toEqual(['/auth/v1/logout?scope=local', '/auth/v1/user']);
        expect([...d.state.errors, ...d.state.forbidden]).toEqual([]);
        await d.page.screenshot({ path: info.outputPath(`${engine}-logged-out.png`) });
      } finally { await d.context.close(); }
    });

    test('confirmed revocation blocks lobby actions if cleanup hits a network error', async ({ baseURL }) => {
      const d = await device(browser, baseURL!, 'cleanup-outage');
      try {
        d.state.revoked = true; d.state.userUnavailable = true;
        await d.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await expect(d.page.getByText('Your session has ended. Finish logging out to sign in again.')).toBeVisible();
        await expect(d.page.getByText('Could not log out', { exact: true })).toBeVisible();
        await expect(d.page.getByRole('button', { name: 'Create New Game', exact: true })).toHaveCount(0);
        d.state.userUnavailable = false;
        await d.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await verifyLoggedOut(d.page);
        expect([...d.state.errors, ...d.state.forbidden]).toEqual([]);
      } finally { await d.context.close(); }
    });

    test('transient logout failure survives simulated resume and then recovers', async ({ baseURL }) => {
      const d = await device(browser, baseURL!, 'resume');
      try {
        d.state.unavailable = true;
        await d.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await expect(d.page.getByText('Could not log out', { exact: true })).toBeVisible();
        expect(await d.page.evaluate(key => JSON.parse(localStorage.getItem(key)!).user.id, storageKey)).toBe(user1);
        expect(await d.page.evaluate(async () => {
          const modulePath = '/src/lib/authInvalidationCause.ts';
          return (await import(modulePath)).peekIntentionalSignOut();
        })).toBeNull();
        await d.page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
        });
        await expect(d.page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
        d.state.unavailable = false;
        await d.page.getByRole('button', { name: 'Logout', exact: true }).click();
        await verifyLoggedOut(d.page);
        expect([...d.state.errors, ...d.state.forbidden]).toEqual([]);
      } finally { await d.context.close(); }
    });
  });
}
