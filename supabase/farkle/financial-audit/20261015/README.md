# October 15 Farkle financial audit evidence

Overall: **FAIL**, inactive-account command authorization. These are audit
fixtures and captured results, not a migration or product correction.

See `docs/codex/FARKLE_FINANCIAL_AUDIT.md` for interpretation and limitations.
`evidence.json` includes 68 passing cases/assertions, two authorization failures,
four race observations, exact synthetic financial records, production hashes,
historical reconciliation, metadata parity and verified database removal.

The scripts require the existing local PostgreSQL runtime on
`127.0.0.1:55439` and its existing `pg` package. They never connect to production.
The ignored `qualification.local/farkle-audit-20261015/deployed-*.json` files are
captured production metadata/configuration, not a source-data dump. Their hashes
are retained in `evidence.json`. Do not substitute migrations or incomplete
metadata and claim deployed-authority coverage.

From the repository root, the executed workflow was:

```text
node supabase/farkle/financial-audit/20261015/create-empty.mjs
node supabase/farkle/financial-audit/20261015/proof.mjs
node supabase/farkle/financial-audit/20261015/supplement.mjs
node supabase/farkle/financial-audit/20261015/immutability.mjs
node supabase/farkle/financial-audit/20261015/attest.mjs
```

The source scripts were executed from the ignored working evidence directory;
the retained copies change only the relative import of the existing `pg` module.
The attestation copy also normalizes PostgreSQL `name[]` policy-role output to
JSON before comparison; the final evidence records the verified comparison.

The harness deliberately records observed authorization failures. Inspect
`cases`, `errors` and `overall`; a zero process exit does not mean qualification.
Most fixtures roll back. Independent-connection/COMMIT/backend-termination tests
commit only into a newly created disposable database. After any rerun, remove
only that exact loopback database identified by `local-db.json`, and verify it
is absent. Do not disable triggers, change cluster-wide roles, use production
credentials, or run any of these fixtures against production.

All four databases created during this audit were dropped; the retained cleanup
record has an empty `remaining` list. No production financial writes occurred.
