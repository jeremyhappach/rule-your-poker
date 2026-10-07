// Read-only RCA proof: execute the current message helper against the installed
// Supabase client's actual non-2xx error shape. All HTTP is mocked locally.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const source = readFileSync(new URL('../../src/components/DealerGameSetup.tsx', import.meta.url), 'utf8');
const helper = source.match(/const dealerSetupFailureMessage = [\s\S]*?\n};/);
assert.ok(helper, 'Find the actual production error-message helper');
const compiled = ts.transpileModule(helper[0], {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const messageFor = new Function(`${compiled}\nreturn dealerSetupFailureMessage;`)();

const serverError = {
  code: '55000',
  message: 'real_money_liveness_unavailable:session_recovery_failure',
  details: JSON.stringify({ reason: 'session_recovery_failure', admission_allowed: false }),
  hint: null,
};
let requests = 0;
const client = createClient('https://local-proof.invalid', 'local-proof-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async () => {
    requests += 1;
    return new Response(JSON.stringify(serverError), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  } },
});
const response = await client.rpc('configure_dealer_game', {});
assert.equal(requests, 1);
assert.equal(response.status, 500);
assert.equal(response.error instanceof Error, false);
assert.equal(response.error.message, serverError.message);
assert.equal(String(response.error), '[object Object]');
assert.match(messageFor(response.error), /^Real-money deal blocked/);
assert.match(messageFor(new Error(serverError.message)), /^Real-money deal blocked/);
console.log(JSON.stringify({
  proof: 'PASS: current helper preserves the real-money recovery reason for actual Supabase error objects',
  network: 'mocked; no production request or mutation',
  responseStatus: response.status,
  errorCode: response.error.code,
  errorMessage: response.error.message,
  isErrorInstance: response.error instanceof Error,
  displayedMessage: messageFor(response.error),
}, null, 2));
