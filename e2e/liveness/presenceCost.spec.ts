import { expect, test, type Page, type Request, type WebSocketRoute } from '@playwright/test';
import { e2eEnvironment } from './support/env';
import { acquireIdentityLease } from './support/runIsolation';

// Passive lobby-only comparison. No game is created, joined or changed.
// Use separate output namespaces for the published baseline and candidate.
test('presence request cost with two authenticated lobby clients', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const verifyLobby = process.env.PTOWN_E2E_EXPECT_LOBBY_OPTIMIZATION === '1';
  const { player1, player2 } = e2eEnvironment;
  if (!player1 || !player2) throw new Error('Two configured test identities are required.');
  const lease = acquireIdentityLease({ player1, player2 }, {
    ...e2eEnvironment.isolation, required: true,
  });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const observations = pages.map(() => ({
    authUserRequests: 0, heartbeatRequests: 0, heartbeatSuccesses: 0,
    lobbyReads: 0, errors: [] as string[], pageErrors: [] as string[], heartbeatTimes: [] as number[],
  }));
  let measuring = false;
  const pendingHeartbeats = new Set<Request>();
  let lobbySocket: WebSocketRoute | undefined;
  let blockRealtime = false;
  let lobbyJoins = 0;
  let arrayProtocol = false;
  let lobbyJoinRef: string | null = null;
  const lobbyBindings = new Map<string, number>();
  const lobbyProofs: string[] = [];
  // Keep authentication headers only in memory for deleting these tabs' own
  // synthetic presence rows. Never attach headers, tokens or passwords.
  const cleanup = new Map<number, { url: string; headers: Record<string, string>; userId: string; tabId: string }>();
  const capture = (page: Page, index: number) => {
    page.on('pageerror', error => observations[index].pageErrors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      const heartbeat = url.pathname === '/rest/v1/voice_presence_heartbeats' && request.method() === 'POST';
      if (heartbeat) {
        const body = request.postDataJSON();
        const row = Array.isArray(body) ? body[0] : body;
        if (row?.user_id && row?.tab_id) {
          const headers = request.headers();
          cleanup.set(index, { url: `${url.origin}${url.pathname}`, userId: row.user_id, tabId: row.tab_id,
            headers: { apikey: headers.apikey, authorization: headers.authorization } });
        }
      }
      if (!measuring) return;
      const observation = observations[index];
      if (url.pathname === '/auth/v1/user') observation.authUserRequests++;
      if (heartbeat) {
        observation.heartbeatRequests++;
        observation.heartbeatTimes.push(Date.now());
        pendingHeartbeats.add(request);
      }
      if (request.method() === 'GET' && ['/rest/v1/games', '/rest/v1/players', '/rest/v1/session_player_snapshots'].includes(url.pathname)) observation.lobbyReads++;
    });
    page.on('response', response => {
      if (!pendingHeartbeats.delete(response.request())) return;
      if (response.ok()) observations[index].heartbeatSuccesses++;
      else observations[index].errors.push(`presence HTTP ${response.status()}`);
    });
    page.on('requestfailed', request => {
      if (pendingHeartbeats.delete(request)) observations[index].errors.push('presence request failed');
    });
  };
  try {
    if (verifyLobby) {
      await pages[0].routeWebSocket(url => url.pathname === '/realtime/v1/websocket', socket => {
        if (blockRealtime) { void socket.close(); return; }
        lobbySocket = socket;
        const server = socket.connectToServer();
        server.onMessage(message => {
          // Inspect only binding acknowledgements; never retain auth frames.
          const raw = JSON.parse(String(message));
          arrayProtocol = Array.isArray(raw);
          const frame = arrayProtocol ? { join_ref: raw[0], topic: raw[2], event: raw[3], payload: raw[4] } : raw;
          if (frame.topic === 'realtime:games-lobby-channel' && frame.event === 'phx_reply') {
            const bindings = frame.payload?.response?.postgres_changes;
            if (Array.isArray(bindings)) {
              lobbyJoins++;
              lobbyJoinRef = frame.join_ref ?? null;
              lobbyBindings.clear();
              for (const binding of bindings) lobbyBindings.set(binding.table, binding.id);
            }
          }
          socket.send(message);
        });
      });
    }
    pages.forEach(capture);
    await Promise.all(pages.map(async (page, index) => {
      const credentials = index === 0 ? player1 : player2;
      await page.goto('/auth', { waitUntil: 'domcontentloaded' });
      const expectedProject = process.env.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim();
      if (!expectedProject) throw new Error('Set the expected Supabase project before a matched cost comparison.');
      await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
        .map(entry => new URL(entry.name).hostname)
        .filter(host => host.endsWith('.supabase.co')))).toContain(`${expectedProject}.supabase.co`);
      await page.locator('#login-email').fill(credentials.email);
      await page.locator('#login-password').fill(credentials.password);
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByText('Game Lobby', { exact: true }).first()).toBeVisible();
      await expect.poll(() => cleanup.has(index)).toBe(true);
    }));
    await pages[0].waitForTimeout(8_000);
    const builds = await Promise.all(pages.map(page => page.evaluate(() =>
      (window as unknown as { __APP_BUILD_SHA__?: string }).__APP_BUILD_SHA__ ?? null)));
    const startedAt = Date.now();
    measuring = true;
    await pages[0].waitForTimeout(44_000);
    measuring = false;
    const durationMs = Date.now() - startedAt;
    await expect.poll(() => pendingHeartbeats.size, { timeout: 10_000 }).toBe(0);
    const report = { durationMs, builds, supabaseOrigins: [...cleanup.values()].map(row => new URL(row.url).origin), clients: observations.map(observation => ({
      ...observation,
      heartbeatIntervalsMs: observation.heartbeatTimes.slice(1).map((time, index) => time - observation.heartbeatTimes[index]),
    })) };
    await testInfo.attach('presence-cost', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    console.log(JSON.stringify(report));
    for (const observation of observations) {
      expect(observation.heartbeatRequests).toBeGreaterThanOrEqual(9);
      expect(observation.heartbeatSuccesses).toBe(observation.heartbeatRequests);
      expect(observation.errors).toEqual([]);
      expect(observation.pageErrors).toEqual([]);
      if (process.env.PTOWN_E2E_EXPECT_SESSION_HEARTBEAT === '1') expect(observation.authUserRequests).toBe(0);
      if (verifyLobby) expect(observation.lobbyReads, 'healthy idle has at most one reconciliation batch').toBeLessThanOrEqual(3);
    }
    if (verifyLobby) {
      const page = pages[0];
      const waitForList = () => page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/rest/v1/players' && url.searchParams.get('game_id')?.startsWith('in.') === true
          && response.request().method() === 'GET' && response.ok();
      }, { timeout: 20_000 });
      expect([...lobbyBindings.keys()].sort()).toEqual(['games', 'players', 'profiles', 'session_player_snapshots']);
      // Synthetic invalidations exercise the actual subscribed browser handler.
      // Each response comes from the live read-only DB; no game rows are changed.
      for (const [table, id] of lobbyBindings) {
        const refreshed = waitForList();
        const frame = { topic: 'realtime:games-lobby-channel', event: 'postgres_changes', ref: null,
          payload: { ids: [id], data: { schema: 'public', table, type: 'UPDATE',
            commit_timestamp: new Date().toISOString(), columns: [], record: {}, old_record: {} } } };
        lobbySocket!.send(JSON.stringify(arrayProtocol
          ? [lobbyJoinRef, null, frame.topic, frame.event, frame.payload] : frame));
        await refreshed;
        lobbyProofs.push(`${table} invalidation rereads live DB`);
      }
      const focused = waitForList();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await focused;
      lobbyProofs.push('focus catches up');
      blockRealtime = true;
      const fallback = waitForList();
      await lobbySocket!.close();
      await fallback;
      lobbyProofs.push('disconnected realtime retains HTTP fallback');
      const joinsBefore = lobbyJoins;
      const rejoined = waitForList();
      blockRealtime = false;
      await expect.poll(() => lobbyJoins, { timeout: 20_000 }).toBeGreaterThan(joinsBefore);
      await rejoined;
      lobbyProofs.push('rejoin catches up');
      await testInfo.attach('lobby-refresh-proofs', { body: JSON.stringify(lobbyProofs, null, 2), contentType: 'application/json' });
      console.log(JSON.stringify({ lobbyProofs }));
      expect(observations[0].pageErrors).toEqual([]);
    }
    // A session's client-provided identity must never grant cross-user writes.
    const first = cleanup.get(0)!;
    const second = cleanup.get(1)!;
    expect(first.userId).not.toBe(second.userId);
    const denied = await contexts[0].request.post(first.url, {
      headers: first.headers,
      data: [{ user_id: second.userId, tab_id: second.tabId, status: 'active' }],
    });
    expect(denied.status(), 'database rejects another user identity').toBe(403);
    const anonymous = await contexts[0].request.post(first.url, {
      headers: { apikey: first.headers.apikey },
      data: [{ user_id: first.userId, tab_id: first.tabId, status: 'active' }],
    });
    expect([401, 403], 'database rejects an unauthenticated write').toContain(anonymous.status());
    await Promise.all(pages.map((page, index) => page.screenshot({ path: testInfo.outputPath(`lobby-${index + 1}.png`) })));
  } finally {
    // Closing pages ends their timers before deleting only their exact leases.
    try {
      await Promise.all(pages.map(page => page.close()));
      for (const [index, row] of cleanup) {
        const url = `${row.url}?user_id=eq.${encodeURIComponent(row.userId)}&tab_id=eq.${encodeURIComponent(row.tabId)}`;
        const response = await contexts[index].request.delete(url, { headers: row.headers });
        expect(response.ok(), 'remove this test tab presence').toBe(true);
        const verification = await contexts[index].request.get(`${url}&select=id`, { headers: row.headers });
        expect(verification.ok()).toBe(true);
        expect(await verification.json()).toEqual([]);
      }
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      lease?.release();
    }
  }
});
