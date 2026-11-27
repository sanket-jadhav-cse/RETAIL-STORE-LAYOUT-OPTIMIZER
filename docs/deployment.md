# Deployment and operations

No public deployment, paid resource provisioning, Git commit, push or PR was performed for this change.

## Existing installation

Preserve root `.env`, restricted runtime role, accounts, dataset metadata, source/basket files and mining history. Do not reset Supabase, recreate tables or rerun initial role provisioning.

```bash
cd backend
../.venv/bin/alembic current
../.venv/bin/alembic upgrade head
```

Migration 006 is additive: nullable mining submission identity and a partial unique index. Its migration/RLS preservation test runs transactionally in an isolated schema before application. Existing database was advanced to 006; record fingerprints were checked across a graceful local restart.

## Configuration

Use the root [.env.example](../.env.example). Keep the runtime `DATABASE_URL` restricted, TLS-enabled and compatible with the Supabase Session Pooler. Only trusted migration tooling receives `MIGRATION_DATABASE_URL`. Never install owner URLs or service-role keys in frontend settings.

Public frontend values: API origin, Supabase project URL and publishable/anon key. Vite exposes only that allowlist. Production requires rebuilding after configuration changes. Local development proxies the default localhost API through Vite, avoiding a separate browser-to-WSL API connection.

Server: one application worker/instance, 5 pool connections with zero overflow by default, pool pre-ping/recycle/timeouts, explicit transaction cleanup and bounded scheduler reconnect. Budget for connections held by the scheduler and mining child. Do not scale replicas while relying on this single scheduler design.

## Start locally

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

```bash
npm --prefix frontend run dev
```

Open `http://localhost:5173`. Health is available through `http://localhost:5173/api/v1/health`. A protected request without a session returns 401. If the backend stops, restart it and use the affected page's Retry action. Run the backend under a process supervisor in a deployed environment.

## Artifact durability and cleanup

Mount **private persistent `DATA_DIR`** for baskets and retained uploaded sources. Back up database and files together. The default repository path is suitable for local work; a disposable container directory is not a production storage plan.

No Supabase Storage bucket or paid volume was created. Private Supabase Storage is a viable alternative only after reviewing bucket RLS, authorized worker reads, lifecycle/cleanup and cost. Current deployment requires an operator-provided durable volume.

Review abandoned uploads:

```bash
.venv/bin/python backend/scripts/cleanup_uploads.py
```

The command is a dry run. Its explicit `--apply` removes only upload remnants older than 24 hours whose generated checksums are absent from dataset records. It preserves referenced data and ordinary UCI/import artifacts. Do not manually remove files referenced by mining runs. Archive datasets instead of deleting historical dependencies.

Upload defaults and resource limits are documented in README and architecture. Preview validates bounded sample rows; final processing validates the complete bounded input. CSV/XLSX are supported; formulas/macros, encrypted/multi-sheet workbooks and oversized content are rejected. Interrupted uploads can be retried with the same file/mapping without duplicate datasets.

## New installation only

These commands are **not** required for the existing project:

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

The setup tools prompt locally and refuse to overwrite an existing runtime role's password. The UCI importer recognizes verified content checksum, preserves provenance on repair and never requires replacing existing data. Retain matching basket artifacts when moving hosts.

## Prepared hosting configuration

The existing Render/Vercel configuration remains preparation only. Build the API with Python 3.12 and the pinned lockfile; build the frontend with `npm ci` and `npm run build`. Run one Uvicorn worker. Configure exact HTTPS CORS origins, Supabase Site URL and reset/verification redirect allowlists. Preserve the existing SPA rewrite for `/reset-password`.

The measured local combined backend/pipeline RSS is not a target-host memory guarantee. Import parsing, simultaneous requests, OS memory and shared pages require host-specific profiling. Select capacity and any paid storage only with owner authorization.

## Verification and rollback

Backend tests use a disposable PostgreSQL database; browser upload tests additionally require loopback database-creation permission. The test launcher creates only a random `retailatlas_e2e_*` database and removes its own data. It overrides authentication only in the test process and is never the production entry point.

Keep prior source/builds and database/file backups. Roll back application source without destructive schema downgrades; interrupted mining jobs remain Failed for explicit resubmission. No automatic replay occurs.

Remaining external verification: second live Supabase account, real verification/reset email round trips, hosted HTTPS/CORS/email routing, durable host storage, restart/load/capacity checks and public deployment. Existing historical remote CI billing limitations are outside this local verification.
