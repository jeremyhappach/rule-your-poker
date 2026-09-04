import { describe, expect, it, vi } from 'vitest';
import { retiredPasswordResetResponse } from '../../supabase/functions/reset-password/handler';

describe('retired password replacement endpoint', () => {
  it('returns Gone without reading an account identity or request body', async () => {
    const req = new Request('https://example.test/reset-password', {
      method: 'POST', body: JSON.stringify({ email: 'unrelated@example.test' }),
    });
    const readBody = vi.spyOn(req, 'json');
    const response = retiredPasswordResetResponse(req);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'This endpoint is retired. Use Forgot password on the sign-in page.',
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  it('admits CORS preflight without account activity', () => {
    const response = retiredPasswordResetResponse(new Request('https://example.test/reset-password', { method: 'OPTIONS' }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
