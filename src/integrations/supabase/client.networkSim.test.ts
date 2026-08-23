import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');

describe('Supabase client network harness wiring', () => {
  it('applies the shared HTTP and Realtime transports beneath every consumer', () => {
    expect(source).toContain('fetch: simulatedSupabaseFetch');
    expect(source).toContain('transport: NetworkSimWebSocket');
  });
});
