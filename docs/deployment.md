# Deployment runbook

The local app and existing Supabase project are verified. No Render/Vercel deployment, paid infrastructure or public production certification was performed. Review [current evidence and remaining owner actions](improvement-report.md) before publication.

## One local environment

Use **repository-root `.env`**, based on [.env.example](../.env.example). It is ignored and should be mode 0600. Backend/migrations and Vite read this file independently of the startup directory. Old `backend/.env`, `backend/.env.runtime` and `frontend/.env.local` are no longer active. Existing values were preserved in ignored, private migration backups; do not commit those backups.

Required local settings: runtime `DATABASE_URL` with Session Pooler TLS, `SUPABASE_URL`, public `SUPABASE_PUBLISHABLE_KEY`, `API_BASE_URL`, and exact `CORS_ALLOWED_ORIGINS`. Keep `MIGRATION_DATABASE_URL` only on a trusted local migration machine. Configure connection/mining/reconnect limits through the root example. Ordinary users authenticate with Supabase accounts; the historical operator token is not an application login credential.

Vite disables automatic prefix exposure and projects only API URL, public project URL and public publishable/anon key. It rejects `sb_secret_` and legacy service-role JWT keys in that public setting. Server settings also reject privileged Auth API keys without echoing their values. Never place database URLs, owner credentials or privileged Supabase keys in browser variables.

## Supabase Auth

1. Enable email/password Auth in the existing project. Use ES256/RS256 signing keys; this project's ES256 JWKS and live access-token verification were checked.
2. Authentication → URL Configuration: local Site URL `http://localhost:5173`; allow `http://localhost:5173/**`. Add the exact intended HTTPS production origin and reset-password route before deploying. Keep preview origins deliberately scoped.
3. The project still redirected a verification link to `localhost:3000` during testing. The owner must confirm the dashboard URL/allowlist change; public keys and database passwords cannot administer this hosted setting.
4. Signup requires inbox verification. Password reset requests have neutral responses, use the SDK's recovery session and update the password through Supabase. Use the newest email link; expired links offer resend/recovery guidance.
5. Configure suitable production email delivery/rate limits in Supabase and verify actual reset/verification round trips over HTTPS. Do not disable email verification to make tests pass. There is no shared account password.

Live signup, verified login, refresh restoration, authenticated data access and a full-data mining submission were verified locally. Two-account isolation is verified in disposable database/API tests; a second live verified Supabase account and a complete live reset-link round trip remain separate checks.

## Existing database and new installations

**Existing project: preserve its schema, records and current runtime role.** Do not reset Supabase, recreate tables or rotate database credentials automatically. Three legacy runs remain ownerless/restricted; assign them only after explicit owner identification or a separately reviewed demonstration policy.

For a new installation only:

```bash
.venv/bin/python backend/scripts/setup_env.py
.venv/bin/python backend/scripts/check_db.py
cd backend
../.venv/bin/alembic upgrade head
cd ..
.venv/bin/python backend/scripts/configure_role.py
.venv/bin/python backend/scripts/activate_runtime.py
.venv/bin/python backend/scripts/download_dataset.py
.venv/bin/python backend/scripts/import_dataset.py 'data/raw/Online Retail.xlsx'
```

The setup CLI prompts for project-specific details, never echoes the database password and URL-encodes it. New role setup requires the owner connection, refuses to change an existing role's password, stages the runtime URL in root `.env`, and activation preserves the migration URL locally. Migrations use the owner connection; production uses the restricted runtime connection. RLS augments backend ownership checks. Keep `retail` outside exposed Data API schemas; do not grant anon/authenticated direct table access.

Custom controlled imports require meaningful names and an explicit owner or reviewed shared flag. They calculate their own dates/counts. Repeating a checksum import is idempotent; rebuilding an absent basket artifact preserves verified custom provenance. PostgreSQL metadata alone is insufficient for mining on a new host: retain or regenerate its matching checksum-named artifact.

## Render API

- Root `backend`; Python 3.12. Build `pip install -r requirements.lock && pip install --no-deps .`.
- Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log`.
- Provide runtime `DATABASE_URL`, `SUPABASE_URL`, public `SUPABASE_PUBLISHABLE_KEY`, exact HTTPS `CORS_ALLOWED_ORIGINS`, and persistent `DATA_DIR`. Never install the migration/owner URL on the web service.
- Defaults: six submissions/account/hour, one active mining job, 300-second mining watchdog, 2048 MiB address-space cap, five pool connections/zero overflow per process. Configure within hosting/Supabase limits; include the child process in connection budgeting.
- Full-data child RSS now measures about 307 MiB in fresh pipeline benchmarks and 323 MiB with isolated persistence; sampled backend+child about 389–396 MiB. These are local measurements, not a guarantee that a 512 MiB host can run safely. Import, OS, shared pages, simultaneous API traffic and address-space limits require target-host profiling.
- `render.yaml` declares settings without choosing a paid plan or provisioning storage. Persistent storage and hosting publication require owner authorization.
- Use one application instance/worker. Advisory locks prevent competing schedulers; use stop-before-start updates. Interrupted jobs remain Failed for explicit resubmission. Temporary DB loss triggers bounded lock-safe reconnect; it does not provide a durable queue or automatic job replay.
- Configure platform HTTPS, request/rate limits, monitoring and backups before public access. No public dataset upload endpoint exists.

## Vercel frontend

Root `frontend`; Node 22.12+; `npm ci`, `npm run build`, output `dist`. Provide public `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` through hosting environment settings (canonical unprefixed equivalents also work). Rebuild after changes; no private settings belong there. Add that exact HTTPS origin to backend CORS and Supabase Auth redirects.

`frontend/vercel.json` includes a SPA rewrite so `/reset-password` reaches the app, following [Vercel's Vite SPA documentation](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas). Hosting routing and HTTPS email callbacks are prepared, not deployed/verified.

## Verification, rollback and credentials

Use a disposable PostgreSQL database for both test DB URL variables. Tests create unique schemas/roles and roll back/remove only their own fixtures. Do not run destructive checks against application data. Live browser credentials come from `E2E_EMAIL` / `E2E_PASSWORD`; each workflow creates one private run and respects the account limit. `smoke.py --run-id UUID` performs authenticated read checks with `RETAIL_ACCESS_TOKEN`; `--create-run` explicitly creates one run. Output defaults to ignored evidence, preserving historical evaluation files.

Back up PostgreSQL and basket artifacts before migrations. Retain previous source/builds; never roll back by dropping application tables. CI presently has an external GitHub account billing block; fresh passing remote checks remain required. The owner has merged feature PRs, and a final integration PR reconciles missing follow-ups against main without rewriting history. No automatic deployment or merge is performed by this work.

Credentials disclosed in chat require owner-led rotation/revocation, including the privileged Supabase key and previously supplied database/GitHub credentials. The privileged API key and chat PAT were not used. Update root/hosting environment settings safely after rotation; do not publish credentials in screenshots, README or logs.
