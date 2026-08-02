# P-Town Poker

P-Town Poker is a multiplayer React/Vite application backed by a
Supabase-compatible PostgreSQL service.

## Runtime

- Production frontend: <https://ptown-poker.vercel.app>
- Source and release branch: GitHub `main`
- Publication: Vercel automatically builds and publishes each push to `main`
- Backend: the existing Lovable Cloud database and authentication service
  during the first cutover phase

The planned second phase moves the database and authentication service to an
owned Supabase project. The frontend no longer requires Lovable publication.

## Local development

Install Node.js, then run:

```sh
npm ci
npm run dev
```

The Vite client requires these local environment variables:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
```

Do not commit their values. The corresponding production values are managed in
the Vercel project.

## Delivery

Approved changes are validated, committed, and pushed to `origin/main` by
Codex. Vercel then publishes the production build automatically. Database
migrations are applied and verified before a dependent frontend commit reaches
`main`.

See `AGENTS.md` and `docs/codex/WORKFLOW.md` for the engineering workflow.
