import { describe, expect, it } from 'vitest';
import { assertRun21AppTestEnvironment, run21AppTestRequested, type Run21AppTestEnvironment } from './appTestEnvironment';

const testRef = 'abcdefghijklmnopqrst';
const safe: Run21AppTestEnvironment = {
  lane: true, enabled: 'false', projectRef: testRef,
  supabaseUrl: `https://${testRef}.supabase.co`, deploymentEnvironment: 'preview',
};

describe('Run21 app-test environment boundary', () => {
  it('preserves existing-game builds outside the test lane', () => {
    expect(() => assertRun21AppTestEnvironment({ lane: false })).not.toThrow();
  });
  it('keeps release discovery disabled by default', () => {
    expect(run21AppTestRequested({ ...safe, enabled: undefined })).toBe(false);
    expect(run21AppTestRequested(safe)).toBe(false);
    expect(run21AppTestRequested({ ...safe, enabled: 'true' })).toBe(true);
  });
  it.each(['xvhmbuppghwmwpwrkzao', 'ajjbrxlnrhchhtlfbtgz'])('rejects production %s even when explicitly matched and release is disabled', ref => {
    expect(() => assertRun21AppTestEnvironment({ ...safe, projectRef: ref, supabaseUrl: `https://${ref}.supabase.co` })).toThrow();
  });
  it.each([
    { supabaseUrl: undefined }, { projectRef: undefined }, { projectRef: 'zyxwvutsrqponmlkjihg' },
    { supabaseUrl: `http://${testRef}.supabase.co` },
    { supabaseUrl: `https://${testRef}.supabase.co.evil.example` },
    { supabaseUrl: `https://${testRef}.supabase.co/path` },
    { supabaseUrl: `https://user:secret@${testRef}.supabase.co` },
    { supabaseUrl: `https://${testRef}.supabase.co?token=secret` },
    { supabaseUrl: `https://${testRef}.supabase.co#fragment` },
    { supabaseUrl: `https://${testRef}.supabase.co:1234` },
    { deploymentEnvironment: 'production' }, { enabled: 'TRUE' },
  ])('fails closed for invalid configuration %j', changes => {
    expect(() => assertRun21AppTestEnvironment({ ...safe, ...changes })).toThrow();
  });
  it('enabling outside the branch still enforces the environment boundary', () => {
    expect(() => assertRun21AppTestEnvironment({ lane: false, enabled: 'true' })).toThrow();
  });
  it('allows explicit local qualification without calling it a verified target', () => {
    expect(() => assertRun21AppTestEnvironment({ ...safe, projectRef: 'local', supabaseUrl: 'http://127.0.0.1:54321' })).not.toThrow();
    expect(() => assertRun21AppTestEnvironment({ ...safe, projectRef: 'local', supabaseUrl: 'http://127.0.0.1:65321' })).not.toThrow();
    expect(() => assertRun21AppTestEnvironment({ ...safe, projectRef: 'local', supabaseUrl: 'http://127.0.0.1:8080' })).toThrow();
  });
  it('does not include URL credentials in its error', () => {
    try { assertRun21AppTestEnvironment({ ...safe, supabaseUrl: 'https://secret:password@example.com' }); }
    catch (error) { expect(String(error)).not.toMatch(/secret|password|example/); }
  });
});
