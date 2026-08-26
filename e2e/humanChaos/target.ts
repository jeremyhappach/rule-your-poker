export const HUMAN_CHAOS_PRODUCTION_BASE_URL = 'https://holm357.com';
export const HUMAN_CHAOS_PRODUCTION_SUPABASE_PROJECT_REF = 'xvhmbuppghwmwpwrkzao';

export type HumanChaosTarget = {
  baseUrl: string;
  supabaseProjectRef: string;
};

/**
 * Human-chaos evidence is meaningful only when both browsers exercise the
 * deployed production application and its owned Supabase project.  The source
 * cutover project intentionally remains write-locked, so falling back to a
 * local Vite server would produce a false application failure.
 */
export function resolveHumanChaosTarget(environment: NodeJS.ProcessEnv = process.env): HumanChaosTarget {
  const baseUrl = environment.PTOWN_E2E_BASE_URL?.trim() || HUMAN_CHAOS_PRODUCTION_BASE_URL;
  const supabaseProjectRef = environment.PTOWN_E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim()
    || HUMAN_CHAOS_PRODUCTION_SUPABASE_PROJECT_REF;
  const parsedBaseUrl = new URL(baseUrl);

  if (parsedBaseUrl.protocol !== 'https:') {
    throw new Error('Human-chaos tests require an HTTPS deployed frontend; local Vite is not an admissible target.');
  }
  if (supabaseProjectRef !== HUMAN_CHAOS_PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('Human-chaos tests must target the owned production Supabase project.');
  }

  return { baseUrl: parsedBaseUrl.toString().replace(/\/$/, ''), supabaseProjectRef };
}

export function assertHumanChaosRuntimeTarget(
  runtimeUrl: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  const { supabaseProjectRef } = resolveHumanChaosTarget(environment);
  const observedProjectRef = new URL(runtimeUrl).hostname.split('.')[0];
  if (observedProjectRef !== supabaseProjectRef) {
    throw new Error(
      `Human-chaos target mismatch: expected Supabase project ${supabaseProjectRef}, observed ${observedProjectRef}.`,
    );
  }
}
