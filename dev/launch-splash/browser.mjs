// Real compiled App; local synthetic HTTP authority, no production writes.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const out = 'qualification.local/launch-splash'; mkdirSync(out, { recursive: true });
const root = resolve('dist'), origin = 'http://127.0.0.1:15427';
const authority = [...new Set(readdirSync(root + '/assets').filter(n => /^index-.*\.js$/.test(n))
  .flatMap(n => readFileSync(root + '/assets/' + n, 'utf8').match(/https:\/\/[a-z0-9-]+\.supabase\.co/g) ?? []))];
assert.equal(authority.length, 1);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = createServer((req, res) => {
  let file = resolve(root, '.' + new URL(req.url, origin).pathname);
  if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || !extname(file)) file = root + '/index.html';
  const body = readFileSync(file); res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.headers.range) {
    const [, lo, hi] = /bytes=(\d+)-(\d*)/.exec(req.headers.range); const start = +lo, end = hi ? +hi : body.length - 1;
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 }); return res.end(body.subarray(start, end + 1));
  }
  res.end(body);
});
await new Promise(r => server.listen(15427, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'splash@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic'].join('.');
const results = [];
const cases = [
  { name: 'ios-cold', width: 390, height: 844, ios: true, show: true },
  { name: 'android-cold', width: 412, height: 915, show: true },
  { name: 'compact', width: 320, height: 568, show: true },
  { name: 'landscape', width: 844, height: 390, show: true },
  { name: 'tablet', width: 1024, height: 1366, show: true },
  { name: 'browser', browser: true }, { name: 'legacy-install', path: '/' },
  { name: 'cold-push-turn', path: '/delayed/22222222-2222-4222-8222-222222222222' },
  { name: 'cold-push-table', path: '/notifications/table/22222222-2222-4222-8222-222222222222' },
  { name: 'results', path: '/?sessions=completed' },
  { name: 'game-recovery', path: '/game/22222222-2222-4222-8222-222222222222' },
  { name: 'arcade-recovery', path: '/arcade/run21/run/22222222-2222-4222-8222-222222222222' },
  { name: 'real-money-seat', seat: true }, { name: 'membership-failure', fail: true },
  { name: 'restored-document', restored: true }, { name: 'slow-lobby', slow: true },
  { name: 'reduced-motion', reduced: true, show: true, fallback: true },
  { name: 'autoplay-rejected', reject: true, show: true, fallback: true },
  { name: 'unsupported', unsupported: true, show: true, fallback: true },
  { name: 'media-failure', mediaFail: true, show: true, fallback: true },
];
try {
  for (const c of cases) {
    const context = await browser.newContext({ viewport: { width: c.width ?? 390, height: c.height ?? 844 }, reducedMotion: c.reduced ? 'reduce' : 'no-preference' });
    await context.routeWebSocket('**', ws => ws.close());
    const queries = [], errors = [];
    await context.addInitScript(({ c, user, token, key }) => {
      localStorage.setItem(key, JSON.stringify({ user, access_token: token, refresh_token: 'synthetic', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer' }));
      if (c.restored) sessionStorage.setItem('ptown:launch-document:v1', '1');
      const media = window.matchMedia.bind(window);
      window.matchMedia = q => q === '(display-mode: standalone)' ? { ...media(q), matches: !c.browser && !c.ios } : media(q);
      if (c.ios) Object.defineProperty(navigator, 'standalone', { value: true });
      if (c.reject) HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
      if (c.unsupported) HTMLMediaElement.prototype.canPlayType = () => '';
      window.splashEvidence = [];
      window.splashMedia = [];
      let last;
      const observe = () => {
        const overlay = document.querySelector('[data-launch-splash]');
        const phase = overlay?.getAttribute('data-launch-splash') ?? 'none';
        const video = overlay?.querySelector('video');
        if (video && !video.dataset.observed) {
          video.dataset.observed = 'true';
          for (const event of ['loadedmetadata', 'playing', 'timeupdate', 'ended']) video.addEventListener(event, () => {
            window.splashMedia.push({ event, at: performance.now(), time: video.currentTime, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
          });
        }
        if (phase !== last) {
          const v = overlay?.querySelector('video');
          window.splashEvidence.push({ phase, at: performance.now(), lobby: document.body?.textContent.includes('Game Lobby'), balance: document.body?.textContent.includes('$125.00'), muted: v?.muted, inline: v?.playsInline }); last = phase;
        }
      };
      new MutationObserver(observe).observe(document, { childList: true, subtree: true, attributes: true });
    }, { c, user, token, key: 'sb-' + new URL(authority[0]).hostname.split('.')[0] + '-auth-token' });
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      const send = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (path.startsWith('/auth/v1/')) return send(path.endsWith('/user') ? user : { user, access_token: token });
      if (path.startsWith('/rest/v1/rpc/')) {
        if (path.endsWith('/account_statement')) return send({ balance: '125.00', transactions: [], has_more: false, next_cursor: null });
        if (path.endsWith('/platform_notification_center')) return send({ actionable: 0, items: [] });
        return send([]);
      }
      if (path.startsWith('/rest/v1/')) {
        const table = path.split('/').at(-1), single = (req.headers().accept ?? '').includes('object');
        if (table === 'players' && url.searchParams.get('select') === 'id,games!inner(status)') {
          queries.push(url.search);
          assert.equal(req.method(), 'GET'); assert.equal(url.searchParams.get('user_id'), 'eq.' + user.id);
          assert.equal(url.searchParams.get('games.status'), 'neq.session_ended'); assert.equal(url.searchParams.get('limit'), '1');
          if (c.fail) return route.fulfill({ status: 503, body: '{}' });
          return send(c.seat ? [{ id: 'active-real-money-seat', games: { status: 'in_progress' } }] : []);
        }
        if (table === 'games' && c.slow) await new Promise(r => setTimeout(r, 3300));
        const value = table === 'profiles' ? { id: user.id, username: 'Splash Player', is_active: true, is_superuser: false, play_sounds: false } : null;
        return send(single ? value : value ? [value] : []);
      }
      if (url.origin !== origin) return route.abort();
      if (path.startsWith('/api/')) return send({});
      if (c.mediaFail && path.endsWith('.mp4')) return route.abort();
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(origin + (c.path ?? '/?launch=home'), { waitUntil: 'domcontentloaded' });
      if (c.show && !c.fallback) {
        await page.locator('[data-launch-splash="showing"]').waitFor({ timeout: 3500 });
        const art = await page.locator('.fresh-launch-splash-art').first().evaluate(el => ({ fit: getComputedStyle(el).objectFit, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
        assert.equal(art.fit, 'contain'); assert.equal(art.width, c.width); assert.equal(art.height, c.height);
        await page.screenshot({ path: `${out}/${c.name}.png` });
      }
      await page.waitForTimeout(3500);
      let evidence = await page.evaluate(() => window.splashEvidence);
      const media = await page.evaluate(() => window.splashMedia);
      assert.equal(evidence.some(e => e.phase === 'showing' || e.phase === 'fading'), !!c.show, JSON.stringify({ c, evidence, errors, body: (await page.locator('body').innerText()).slice(0, 500) }));
      assert.equal(await page.locator('[data-launch-splash]').count(), 0);
      if (c.show) {
        assert(evidence.filter(e => e.phase !== 'none').every(e => e.lobby && e.balance));
        assert(evidence.at(-1).at < 3450, JSON.stringify(evidence));
        assert.deepEqual(errors, []);
        if (!c.fallback) {
          assert(media.some(m => m.event === 'playing'), JSON.stringify(media));
          assert(media.some(m => m.time > 2.4 && m.width === 720 && m.height === 1280 && Math.abs(m.duration - 3) < 0.1), JSON.stringify(media));
        }
      }
      if (c.name === 'ios-cold') {
        await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(700);
        assert(!(await page.evaluate(() => window.splashEvidence)).some(e => e.phase !== 'none'));
        await page.evaluate(() => { window.dispatchEvent(new Event('app:page-resumed')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
        await page.getByRole('button', { name: /Arcade/ }).click(); await page.goBack();
        assert.equal(await page.locator('[data-launch-splash]').count(), 0);
        await page.goto(origin + '/delayed/22222222-2222-4222-8222-222222222222'); await page.waitForTimeout(400);
        assert(!(await page.evaluate(() => window.splashEvidence)).some(e => e.phase !== 'none'));
      }
      results.push({ name: c.name, evidence, media, membershipReads: queries.length, passed: true });
      console.log('PASS', c.name);
    } finally { await context.close(); }
  }
  writeFileSync(out + '/results.json', JSON.stringify({ actualCompiledApp: true, syntheticHttpOnly: true, results }, null, 2));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
