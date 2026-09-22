import { isUuid } from './model';

export function acceptsRun21Capability(
  raw: unknown, userId: string, sessionId: string | null, projectRef: string,
): boolean {
  if (!isUuid(userId) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const capability = raw as Record<string, unknown>;
  return capability.version === 1 && capability.enabled === true &&
    capability.fake_money_only === true && capability.user_id === userId &&
    capability.session_id === sessionId && capability.project_ref === projectRef && !!projectRef;
}
