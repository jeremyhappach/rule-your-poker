// @vitest-environment node
import {afterEach, expect, it, vi} from 'vitest';

afterEach(() => {vi.unstubAllGlobals();vi.resetModules();});

it('returns success after PostgREST acknowledges completion with an empty body', async () => {
  let handler!: (request: Request) => Promise<Response>;
  vi.stubGlobal('Deno', {env: {get: (name: string) => name === 'SUPABASE_URL' ? 'https://example.invalid' : 'test-service-key'},
    serve: (fn: typeof handler) => {handler = fn;}});
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({accepted: true, games: []}))
    .mockResolvedValueOnce(new Response(null, {status: 204}));
  vi.stubGlobal('fetch', fetch);
  await import('../../../supabase/functions/run21-recovery/index');
  const response = await handler(new Request('https://example.invalid/recovery', {method: 'POST',
    headers: {'x-run21-dispatch': '00000000-0000-4000-8000-000000000090'}}));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({processed: 0, failures: []});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe('https://example.invalid/rest/v1/rpc/run21_recovery_complete');
  expect((await handler(new Request('https://example.invalid/recovery', {method: 'POST'}))).status).toBe(403);
  expect(fetch).toHaveBeenCalledTimes(2);
});
