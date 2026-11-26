# Deployment runbook
No frontend or backend has been deployed. Database setup, import and real mining were verified in the existing Supabase project. Public publication and any paid infrastructure require owner action/approval. `render.yaml` supplies build/start/env declarations without provisioning a disk or choosing a paid plan.

## Database and least privilege
1. New setup only: run `scripts/setup_env.py` from the root command shown in README. It creates a mode-0600 ignored `backend/.env` using getpass and SQLAlchemy URL encoding. Existing environment configuration can instead supply DATABASE_URL directly.
2. Run `scripts/check_db.py`: SELECT 1, client-to-session-pooler TLS and existing schema inventory. Supabase `pg_stat_ssl` describes the pooler-to-server hop; it is not proof of client TLS. psycopg `pgconn.ssl_in_use` was verified true.
3. `cd backend && ../.venv/bin/alembic upgrade head`. Migrations live in the private retail schema; they never reset public/unrelated schemas. Initial migration is immutable PostgreSQL DDL; destructive downgrade is disabled. Back up before subsequent schema changes.
4. New project database only: `scripts/configure_role.py` uses the owner credential to create `retail_app`, schema usage and SELECT/INSERT/UPDATE grants, excludes migration version access, and enables RLS for each application table with policies only for that role. It refuses to rotate an existing role's password. Do not expose `retail` in Supabase's Data API configuration. No grants are given to anon/authenticated.
5. `scripts/activate_runtime.py` selects the generated runtime URL and preserves the owner URL locally as MIGRATION_DATABASE_URL. Runtime pooler username uses `retail_app.<project-ref>`. This role, TLS and dataset reads were verified on the supplied project. The script is for the specified Supabase project, not a general role provisioning utility.
6. Only the runtime DATABASE_URL belongs on Render. Run migrations manually from a trusted machine using MIGRATION_DATABASE_URL. Never install the owner credential in frontend variables or the public web service.

## Render backend
- Root: backend; Python 3.12; build: `pip install -r requirements.lock && pip install --no-deps .`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log`
- Health: `/api/v1/health`; OpenAPI: `/docs`.
- Environment: DATABASE_URL (runtime SSL URI), OPERATOR_TOKEN (random private secret), CORS_ALLOWED_ORIGINS (comma-separated exact HTTPS origins, no wildcard), DATA_DIR (persistent mounted directory), MINING_MEMORY_MB=2048, MINING_TIMEOUT_SECONDS=300, OPENBLAS_NUM_THREADS=1.
- Full-data measured child RSS: ~1538 MiB, mining ~18.83 s in WSL. Allow additional parent/OS memory and import working space. 512 MiB is insufficient. Address-space and RSS limits differ; benchmark target host before enabling writes. Do not choose or pay for a hosting plan automatically.
- Attach persistent storage for DATA_DIR after owner approval, or operate as a read-only demonstration with OPERATOR_TOKEN unset. PostgreSQL metadata alone is insufficient for subsequent mining.
- Download and import UCI data on the backend host (or securely transfer the checksum-named basket JSON files). If the dataset metadata already exists, the local processed artifact still must exist on this host. Rerunning the controlled import repairs a missing artifact.
- Keep one running instance and one worker. Database advisory lock prevents a second scheduler. Deployments interrupt jobs; startup marks interrupted queued/running runs Failed and users submit a fresh run. There is no durable queue or automatic retry guarantee. Render rolling updates may temporarily reject a new worker while the previous instance holds the lock; use stop-before-start deployment for this single-instance project.
- Keep write access restricted to operators. API allows only one active job and caps child runtime/memory; configure platform TLS/proxy request size and request rate limits before opening a public demonstration. Client POST JSON is small; no public file upload exists.

## Vercel frontend
- Root: frontend; install `npm ci`; build `npm run build`; output dist; Node 22.12+.
- Set VITE_API_BASE_URL to the HTTPS Render origin, without `/api/v1`; the API client appends it.
- Add the exact Vercel origin to backend CORS_ALLOWED_ORIGINS, redeploy backend and frontend. No database secrets or OPERATOR_TOKEN go in Vite variables.
- Test health, dataset load, operator-authenticated run, polling, rules/search, graph selection and CSV export over HTTPS. Browser downloads use Axios so errors are visible and no token is placed in URLs.

## Rollback and publication
Keep previous frontend build and backend source versions, back up PostgreSQL, and retain matching basket artifacts. Do not downgrade by dropping tables. Stop backend before restoring data. No Git commit, remote, push, PR, hosting publication or paid service was performed in this workspace.

After reviewing ignored files and source, the owner may run `git add .`, inspect `git diff --cached`, commit locally, add their chosen GitHub remote and push. Do not stage .env files, raw workbooks, artifacts or environments. CI uses an isolated local PostgreSQL service; its password is a disposable fixture, not a project credential.
