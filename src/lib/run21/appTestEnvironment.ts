/** Public configuration only. Never accepts a key, token, or password. */
export interface Run21AppTestEnvironment {
  lane: boolean;
  enabled?: string;
  supabaseUrl?: string;
  projectRef?: string;
  deploymentEnvironment?: string;
  productionAuthority?: 'vercel';
}

// These are known production projects, including the unrelated account project.
// A matching operator-supplied reference must never override this exclusion.
const PRODUCTION_PROJECTS = new Set([
  'xvhmbuppghwmwpwrkzao',
  'ajjbrxlnrhchhtlfbtgz',
]);

export function assertRun21AppTestEnvironment(env: Run21AppTestEnvironment): void {
  if (!env.lane && env.enabled !== 'true') return;
  if (env.deploymentEnvironment === 'production' && env.productionAuthority !== 'vercel') {
    throw new Error('Run21 app-test cannot be deployed to production.');
  }
  if (env.enabled !== undefined && env.enabled !== '' && !['true', 'false'].includes(env.enabled)) {
    throw new Error('Run21 app-test release setting must be true or false.');
  }
  let url: URL;
  try { url = new URL(env.supabaseUrl ?? ''); }
  catch { throw new Error('Run21 app-test requires an explicit test database URL.'); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Run21 app-test database URL must contain only its origin.');
  }
  // Local qualification may use an independently provisioned local Supabase.
  // This is not evidence that a database exists or that its proofs have passed.
  if (env.projectRef === 'local' && url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['54321', '65321'].includes(url.port)) return;
  const match = /^([a-z]{20})\.supabase\.co$/.exec(url.hostname);
  if (url.protocol !== 'https:' || url.port || !match ||
      (PRODUCTION_PROJECTS.has(match[1]) && !(match[1] === 'xvhmbuppghwmwpwrkzao' && env.productionAuthority === 'vercel')) || !env.projectRef || match[1] !== env.projectRef) {
    throw new Error('Run21 app-test requires a matching, non-production Supabase project reference.');
  }
}

/** Presentation gate only; authenticated database authorization remains required. */
export function run21AppTestRequested(env: Run21AppTestEnvironment): boolean {
  if (env.enabled !== 'true') return false;
  try { assertRun21AppTestEnvironment(env); return true; }
  catch { return false; }
}
