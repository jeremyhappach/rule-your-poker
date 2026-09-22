import {waitUntil} from '@vercel/functions';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createRun21Handler} from '../../server/run21/handler';

export function createProductionAdapter(env: NodeJS.ProcessEnv, retain: typeof waitUntil = waitUntil) {
 let runtime: ReturnType<typeof createRun21Handler> | undefined;
 const handler = async (req: IncomingMessage, res: ServerResponse) => {
  if (!/^Bearer \S+$/.test(req.headers.authorization ?? '')) {
    res.writeHead(401, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'run21:authentication_required'})); return;
  }
  const url = env.RUN21_SUPABASE_URL;
  const key = env.RUN21_SUPABASE_SERVICE_ROLE_KEY;
  const localProof = !env.VERCEL && env.NODE_ENV === 'test' && url === 'http://127.0.0.1:65321';
  if ((!localProof && url !== 'https://xvhmbuppghwmwpwrkzao.supabase.co') || !key) {
    res.writeHead(503, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({error: 'run21:release_unavailable'})); return;
  }
  runtime ??= createRun21Handler({url: url!, key, waitUntil: retain, loopbackOnly: localProof});
  await runtime.handler(req, res);
 };
 return {handler, dispose: () => runtime?.dispose()};
}
export default createProductionAdapter(process.env).handler;
