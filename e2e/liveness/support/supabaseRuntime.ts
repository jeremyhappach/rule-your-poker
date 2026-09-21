/** Exact local opt-in for isolated qualification; never infer a database from
 * the frontend host or accept arbitrary localhost traffic. Credentials still
 * come from an observed browser request, not this setting. */
export function createSupabaseRuntimeMatcher(
  localOrigin = process.env.PTOWN_E2E_LOCAL_SUPABASE_ORIGIN,
): (rawUrl: string) => boolean {
  let expectedOrigin: string | null = null;
  if (localOrigin?.trim()) {
    const url = new URL(localOrigin.trim());
    if (!['http:', 'https:'].includes(url.protocol)
      || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PTOWN_E2E_LOCAL_SUPABASE_ORIGIN must be an exact loopback HTTP origin');
    }
    expectedOrigin = url.origin;
  }
  return (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      if (url.protocol === 'ws:') url.protocol = 'http:';
      if (url.protocol === 'wss:') url.protocol = 'https:';
      return expectedOrigin !== null
        ? url.origin === expectedOrigin
        : url.hostname.endsWith('.supabase.co');
    } catch {
      return false;
    }
  };
}
