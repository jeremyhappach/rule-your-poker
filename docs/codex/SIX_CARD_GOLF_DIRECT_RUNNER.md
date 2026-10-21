# Golf bounded direct runner — local preparation, October 21, 2026

Historical record: the [later connector retry](SIX_CARD_GOLF_CONNECTOR_RETRY.md)
supersedes the connection requirement and retired-wrapper status below. Corrected
single-request MCP execution passed 14/16 hosted units without new credentials.
Release is now blocked by the mixed-real-3 Run Back liveness proof, not by a
missing PostgreSQL binding. Do not request a new credential for this path.

The enclosing-statement limitation is corrected locally. Hosted qualification
remains blocked on an approved existing PostgreSQL connection binding and the
owner's production-slot decision. This continuation performed no hosted SQL,
installation, push, deployment, grant, credential creation or persistent setup.

## Cause and correction

The historical MCP adapter wrapped all original statements in one `DO` block so
the connector could return both evidence rows. That made the 15-second statement
limit apply to the complete unit. Production's four-human unit reached the final
existing-record comparison but ran out of that combined budget.

`dev/six-card-golf/direct-proof.mjs` sends the original, hash-checked SQL unit
unchanged over one dedicated PostgreSQL connection. It uses a simple query with
no values or prepared name. node-postgres retains all result sets, so both the
candidate and post-rollback evidence are collected without wrapping, splitting,
reordering or dropping SQL. Each unit gets its own connection. Errors stop the
campaign, request ROLLBACK and close the connection; later units do not execute.

PostgreSQL 13+ applies `statement_timeout` separately to statements in a simple
query message ([official PostgreSQL documentation](https://www.postgresql.org/docs/17/runtime-config-client.html)).
The original per-statement 15-second, lock 100-ms and idle-transaction 20-second
limits remain. The migration's own statement settings remain byte-for-byte intact.
There is no whole-unit client query timer and no server-wide timeout change.

The runner rejects MCP wrapper manifests, wrong unit hashes, incomplete coverage,
missing/duplicate/mismatched receipts, wrong migration bytes, unknown database
targets, transaction-mode port 6543 and TLS verification overrides. It requires
all 16 original units and the existing complete evidence validator. It never
turns partial results into a pass or skips financial or existing-record checks.
The historical wrapper remains importable for local diagnosis; its CLI refuses
new wrapper generation.

## Executed local evidence

`node --test dev/six-card-golf/direct-proof.test.mjs`: **5 tests pass**.

On the existing loopback-only PostgreSQL 17.10 disposable Golf database:

- The historical wrapper failed with SQLSTATE `57014` after **15,020 ms**.
- The same SQL statements through the corrected runner passed after **16,209 ms**.
- Both actual receipts were captured; the changed test row rolled back to its
  initial value. Statement/lock/idle settings remained **15s / 100ms / 20s**.
- Executing the actual generated core unit still rejected the missing real
  live-service prerequisites. No cron extension or health receipt was fabricated,
  and no Golf authority persisted.

Other tests prove rejection before connection on changed artifacts, rollback and
connection closure after SQL/cleanup failure, receipt completeness, missing
credential refusal without an evidence file, and target/TLS protections.
`node --test dev/six-card-golf/production-proof.test.mjs`: **6 tests pass**, retaining
the complete matrix, exact migration hash and evidence rejection behavior.
Invoking `direct-proof.mjs` without `--run` prints preparation status and makes no
connection. These results do not replace a full hosted qualification run.

## Connection discovery and concrete setup requirement

Only documented project locations and variable names were inspected:

- Main checkout `.env` and `.env.e2e.local`.
- Isolated Golf checkout `.env` and current process environment variable names.
- `dev/battle31/README.md` and `dev/battle31/hosted-qualification.mjs`.
- Supabase project configuration and relevant repository connection references.

Available names are HTTPS public-client configuration (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, corresponding Vite names/project ID) and the two E2E
sign-in email/password pairs. None supplies a PostgreSQL login. Battle documents
an externally supplied `BATTLE31_QUALIFICATION_URL`, but it is not set here and
the documentation names no populated secret location. No database URL/password
or PostgreSQL qualification binding was found in these locations. The disposable
local connection is not a production connection. No credential values were
printed, no unrelated credential stores were searched, and no binding was created.

The concrete requirement is an operator-approved, already-existing PostgreSQL
credential for project `xvhmbuppghwmwpwrkzao`, supplied transiently as
`GOLF_QUALIFICATION_URL` through the approved secret channel. Do not paste the
value into chat, a command argument, documentation or an evidence file. The
runner accepts the verified project's direct endpoint or its explicitly supplied
session-pooler endpoint on port 5432, database `postgres`, with the existing
privileged `postgres` login and verified TLS. The session endpoint must come from
the project's connection configuration; it is not inferred from region. A public
API key, Auth user password, or management access token is not a database login.
No password reset, new role, new secret, or persistent environment configuration
is authorized by this task.

If direct IPv6 connectivity is unavailable, an existing supported session-pooler
binding is the documented alternative; transaction mode is not used for this
session-owned proof. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Exact later hosted step

Only after the production slot is approved and the existing connection binding
is supplied, recheck current main/deployed authority and all eight preimages.
Keep admission closed. Generate fresh original units locally and execute the
whole candidate campaign with the corrected transport:

```text
node dev/six-card-golf/production-proof.mjs
node dev/six-card-golf/direct-proof.mjs --run qualification.local/six-card-golf/production-candidate/manifest.json qualification.local/six-card-golf/direct-candidate-evidence.json
node dev/six-card-golf/production-evidence.mjs qualification.local/six-card-golf/production-candidate/manifest.json qualification.local/six-card-golf/direct-candidate-evidence.json qualification.local/six-card-golf/direct-reviewed-candidate.json
```

The evidence output must be a new path; prior evidence is never overwritten.
The runner verifies connection role/database/version and session limits before
the original unit's live-service, authority and containment gates. A connection
failure, remaining individual-statement timeout, mismatched fingerprint or any
failed assertion stops qualification. Do not increase limits or waive a check.

Only complete validated candidate evidence permits the separately authorized
installation step. Installed proofs and live transport/race/scheduler checks
remain subsequent gates. No conclusion about their success is made here.

The product candidate remains `f2f2d20b68f893664440a8f12836b1b6d79e6b6f`.
Migration `20261021011905_six_card_golf_v1.sql` is unchanged at SHA-256
`95c20197069e1139da8ea7b1b1d786fb5672f40e02573ab2be9189bc654be41e`.
The two-account, fake-only 24-hour smoke scope is unchanged and unstarted.
