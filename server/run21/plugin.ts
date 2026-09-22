import type {Plugin} from 'vite';
import {createRun21Handler} from './handler';

/** Development adapter for the same authenticated production transport. */
export function run21LocalServer(env: Record<string, string>): Plugin {
  return {name: 'run21-local-authority', apply: 'serve', configureServer(server) {
    if (env.RUN21_LOCAL_SERVER !== 'true') return;
    const url = new URL(env.VITE_SUPABASE_URL);
    if (process.env.VERCEL || env.VITE_RUN21_TEST_PROJECT_REF !== 'local' || url.origin !== 'http://127.0.0.1:65321' || !env.RUN21_LOCAL_SERVICE_KEY)
      throw new Error('Run21 development requires the dedicated local Supabase and server-only local key');
    const runtime = createRun21Handler({url: url.origin, key: env.RUN21_LOCAL_SERVICE_KEY, loopbackOnly: true});
    server.middlewares.use('/__run21', (req, res) => { void runtime.handler(req, res); });
    void runtime.authority.recover().catch(() => console.error('[Run21 authority] Local gate closed or database unavailable.'));
    server.httpServer?.once('close', runtime.dispose);
  }};
}
