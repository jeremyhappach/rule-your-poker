import { isUuid } from './model';

export function acceptsRun21Capability(
  raw: unknown, userId: string, sessionId: string | null, projectRef: string,
): boolean {
  if (!isUuid(userId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const capability = raw as Record<string, unknown>;
  return capability.version === 2 && capability.enabled === true &&
    capability.fake_money_only === false && capability.user_id === userId &&
    capability.session_id === sessionId && capability.project_ref === projectRef && !!projectRef;
}

export function run21ProjectRef(url: string | undefined): string {
  try {return new URL(url ?? '').hostname.match(/^([a-z]{20})\.supabase\.co$/)?.[1] ?? '';}
  catch {return '';}
}
