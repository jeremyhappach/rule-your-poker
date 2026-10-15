// Bundled from this source with the existing esbuild installation. No rules fork.
import {recoverRun21} from '../../../server/run21/recovery.ts';

declare const Deno: {
  env: {get(name: string): string | undefined};
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, {status: 405});
  const token = request.headers.get('x-run21-dispatch');
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) return new Response(null, {status: 403});
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response(null, {status: 503});
  try {
    const result = await recoverRun21(async <T>(name: string, args: Record<string, unknown>) => {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {method: 'POST',
        headers: {'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`},
        body: JSON.stringify(args), signal: AbortSignal.timeout(10_000)});
      if (!response.ok) throw new Error('run21:recovery_database_rejected');
      // PostgREST returns an empty successful response for void RPCs, including
      // the completion acknowledgement. Do not turn that committed success
      // into a JSON parse failure and a misleading HTTP 503.
      const body = await response.text();
      return (body ? JSON.parse(body) : null) as T;
    }, token);
    return Response.json(result, {status: result.failures.length ? 503 : 200});
  } catch { return new Response(null, {status: 503}); }
});
