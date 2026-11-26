# Final implementation report
Sanket Jadhav · Roll 240410700193 · Semester 5 · 2026-11-26

## Project status
The full local application is implemented. The complete 12-page PRD was reviewed from the supplied PDF without modifying it. PostgreSQL replaces SQLite throughout implementation. All eight required API endpoints, itemset retrieval, CSV export, controlled import, six React screens, conceptual adjacency graph, mining pipeline and persisted reports are present. Supabase connection, TLS, migration, real import, run execution and persistence are verified. Deployment preparation is complete; no public deployment or paid service has been performed. Target-host benchmarking and final store-planner validation remain pending. The real physical floor-plan overlay is intentionally outside mandatory scope because no dimensions were supplied.

## Architecture and files
Actual stack: Python 3.12; FastAPI/Pydantic/Uvicorn; SQLAlchemy 2/psycopg/Alembic; Supabase session-pooler PostgreSQL; pandas/NumPy/mlxtend FP-Growth; React 19/JavaScript/Vite/Tailwind/Axios/SVG; pytest/httpx, Vitest/Testing Library and Playwright. Matplotlib and scikit-learn are mlxtend dependencies, not additional application training systems.

```
backend/
  app/{config,models,schemas,main,worker}.py
  app/mining/{preprocessing,pipeline}.py
  migrations/env.py, migrations/versions/001_initial.py
  scripts/{setup_env,check_db,configure_role,activate_runtime,
           download_dataset,import_dataset,smoke}.py
  tests/{test_mining,test_api_postgres}.py
  pyproject.toml, requirements.lock, alembic.ini, .env.example
frontend/
  src/{App,Graph,main}.jsx, api.js, styles.css, App.test.jsx
  e2e/workflow.spec.js, playwright.config.js
  Vite/Tailwind/PostCSS config, package.json, package-lock.json, vercel.json
 data/README.md; ignored raw and processed artifacts
 docs/{architecture,wireframes,evaluation,deployment,demo,final-report}.md
 docs/evaluation-results.json
 PLAN.md, README.md, render.yaml, .github/workflows/ci.yml, .gitignore
```
`models` owns constraints; `preprocessing` owns cleaning/encoding; `pipeline` owns mining/metrics/ranking; `worker` owns scheduling/persistence; `main` owns HTTP/auth/pagination. `api.js` owns Axios; graph and report share persisted recommendation data. Architecture, ERD, data-flow and API-flow details are in architecture.md.

## Dataset and evaluation
Original authoritative source: UCI Online Retail, Chen (2015), DOI 10.24432/C5BW33, CC BY 4.0. Downloaded actual workbook, not synthetic production data. Full source 541,909 records; cleaned 526,054; eligible invoices 20,728; product codes 3,829. Sequential exclusions: cancelled 9,288; invalid quantities 1,336; exact duplicates 5,231; missing invoice/product 0. Repeated product lines collapse to presence (5,306), preserving the invoice denominator. Missing customer IDs do not exclude purchases.

Parameters: minimum support .02, confidence .50, lift 1.0, max itemset size 3. Three real runs reproduced **358 itemsets, 52 rules, 38 adjacency pairs**. First run mining 18.8316 s, peak RSS 1537.98 MiB; runtime-role rerun 42.9933 s / 1538.63 MiB; latest run 50.8164 s / 1538.92 MiB. These are separate WSL measurements with concurrent verification and encoding revisions, not a controlled speed comparison. No dataset subset was used. Address-space cap defaults to 2048 MiB and watchdog 300 s. Do not equate an address-space cap with a guaranteed target-host RSS allocation.

Actual leading pair Green/Pink Regency teacups: support .0305384022, confidence A→B .6236453202, reverse .8263707572, lift 16.8758749309. Gardeners kneeling pad variants: support .0263411810, confidences .7203166227 / .5980284775, lift 16.3534753068. These are plausible collection/category relationships, subject to space and operational constraints. See evaluation.md and the actual evidence snapshot for provenance, thresholds, run timestamps and results. No fabricated training accuracy or causal sales uplift is claimed.

Ranking is deterministic: lift, support, strongest qualifying confidence descending, then codes. Pair order is canonical; missing unqualified reverse confidence stays null. Product names use most frequent nonempty source description with deterministic ties. Administrative product codes remain in the dataset and require planner exclusion if not placeable. Original data came from an online retailer; physical-store applicability requires human validation.

## Testing evidence
Commands executed from repository root unless a working directory is shown:

| Command | Observed result |
|---|---|
|`.venv/bin/python backend/scripts/check_db.py`|SELECT 1 = 1, client TLS true, retail tables visible under restricted runtime|
|`cd backend && ../.venv/bin/alembic current && ../.venv/bin/alembic upgrade head`|001 at head; repeat upgrade succeeds|
|`.venv/bin/python backend/scripts/import_dataset.py 'data/raw/Online Retail.xlsx'`|Actual source imported; counts above|
|`.venv/bin/python backend/scripts/smoke.py`|Three real runs completed; health/rules/adjacencies/report/itemsets/CSV passed; latest snapshot saved|
|`cd backend && ../.venv/bin/pytest -q`|7 passed, including real PostgreSQL workflow, restart/lock and artifact repair tests|
|`cd frontend && npm test`|6 passed: dashboard/navigation, loading/empty/error, submission, rules/report, graph/reset, dataset/run consistency|
|`cd frontend && npm run build`|Production bundle built successfully|
|`cd frontend && npm audit --audit-level=moderate`|0 vulnerabilities|
|`.venv/bin/pip check`|No broken requirements|
|`.venv/bin/ruff check --isolated --select E4,E7,E9,F,I backend`|All checks passed|
|`uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log`|Startup and health passed using the runtime role|

PostgreSQL tests use a unique `retail_test_<uuid>` schema and real transactions/ORM persistence. Only that disposable schema is dropped; application data is untouched. They verify request errors/auth, Queued→Running→Completed, independent metrics, reports, search, pagination bounds, 404, canonical pair constraints, interrupted-run failure and scheduler exclusivity/lock release. Unit tests verify cleaning, Boolean encoding, independent 100-basket metrics, invalid inputs, threshold boundary, directional confidence, empty results and deterministic ranking. Integration needs an owner-capable migration URL solely to create its isolated schema. CI supplies a separate disposable PostgreSQL service.

One dependency deprecation warning remains in Starlette's test client concerning AnyIO BlockingPortal; it does not affect passing tests. Frontend tests need Node's experimental web-storage disabled in child workers (configured by npm test), because Node 26's global storage otherwise conflicts with jsdom.

Browser evidence is recorded in the final verification addendum below. No public HTTPS or Render/Vercel account deployment was tested. Production hosting capacity is not certified.

## Independent code review and corrections
Reviewed actual source, ORM DDL, API contracts, package audit and tracked/ignored candidates after implementation. Concrete fixes and regression evidence:
- PostgreSQL JSONB rule search originally bound the code list as JSONB; real integration failed, then passed after using an explicit PostgreSQL text array.
- Scheduler session advisory locks could survive connection pool return; explicit unlock added and restart/re-acquisition integration passed.
- Existing dataset metadata previously prevented rebuilding a missing local basket artifact; controlled re-import repair and idempotence regression passed.
- Dataset switching could show old run totals; reset and run/dataset alignment added; DOM regression passed.
- Screen navigation now clears stale result structures before switching rules/graph/report formats.
- Sparse Boolean encoding avoids pandas' fill-value deprecation and uses column-oriented extraction. Metrics remained unchanged across real runs.
- Initial migration freezes DDL rather than importing mutable ORM metadata. Its version table is isolated in retail; no unrelated existing tables were changed.
- npm audit findings in Axios, Vite, PostCSS, Vitest and transitive test dependencies were resolved; final audit reports zero vulnerabilities.
- CSV values are neutralized against spreadsheet formula injection; public errors omit stack traces and secrets; only operator-authenticated users can queue mining.

Secrets are mode-0600, ignored, and absent from source scans. `.env` uses a least-privilege runtime login; the owner connection is retained locally as MIGRATION_DATABASE_URL for migrations/tests and must not be installed on the public server. RLS is enabled and Data API roles lack schema grants. Runtime login/TLS and real mining writes were verified. Dataset/customer source rows and CustomerID never enter API/database results. No duplicate metric engine or frontend recommendation calculation exists.

## Deployment status and limitations
Supabase: configured, migrated and populated with real persisted results. Frontend/backend: local only, no public URLs. Render manifest and Vercel build configuration are prepared. Owner must approve adequate memory and persistent storage, set environment secrets/origins, import/transfer basket artifacts, and verify HTTPS before publication. A 512 MiB host is insufficient for the observed ~1.50 GiB child RSS. Single scheduler only; restarts fail interrupted jobs rather than guaranteeing retries. Stop-before-start rollout is required for the single advisory-lock owner. Bearer-token write access is simple operator authentication, not multi-user sessions.

## Handoff commands
New installations (existing workspace is already configured):
```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
.venv/bin/pip install --no-deps -e backend
(cd frontend && npm ci)
.venv/bin/python backend/scripts/setup_env.py
.venv/bin/python backend/scripts/check_db.py
(cd backend && ../.venv/bin/alembic upgrade head)
.venv/bin/python backend/scripts/configure_role.py
.venv/bin/python backend/scripts/activate_runtime.py
.venv/bin/python backend/scripts/download_dataset.py
.venv/bin/python backend/scripts/import_dataset.py 'data/raw/Online Retail.xlsx'
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
# Separate terminal:
(cd frontend && cp .env.example .env.local && npm run dev)
# Verification:
(cd backend && ../.venv/bin/pytest -q)
(cd frontend && npm test && npm run build && npm audit)
(cd frontend && npx playwright install chromium && npx playwright test)
```
Browser tests require backend/frontend servers and actual imported dataset/completed run. On fresh Linux, Playwright also needs OS browser libraries (`npx playwright install-deps chromium` requires administrator privileges). The current WSL browser verification used libraries extracted under /tmp rather than system installation.

Final Git state: newly initialized repository, project source untracked, no commits/remotes/push/PR. `.venv`, `.env`/`.env.runtime`, node_modules, build/test artifacts and full datasets are excluded. No source file over 2 MB was found. The owner should review `git status --short`, `git check-ignore backend/.env data/raw/'Online Retail.xlsx'`, then stage only reviewed source, inspect staged diff, commit and add/push their chosen remote manually. No publication authorization was assumed. Demonstration steps and slide outline are in demo.md.

## Final verification addendum
Browser workflow passed in Chromium with real Supabase responses: all six screens, actual dataset counts and persisted metrics, graph edge click/evidence, report CSV download, mobile-width report, and no browser page errors. Exact command: `cd frontend && LD_LIBRARY_PATH=/tmp/ojt-browser-libs/extracted/usr/lib/x86_64-linux-gnu npx playwright test`. This WSL environment lacked libnspr4/libnss3/libasound; downloaded Ubuntu packages were extracted under /tmp using apt-get download and dpkg-deb -x, without root/system package modification. A normal Linux developer machine can install these through Playwright's documented install-deps command.

Browser testing first reproduced graph click interception by node text; pointer capture was limited to background panning, and labels no longer intercept edges. The same unchanged edge-click assertion then passed. Browser assertions allow 30 seconds for remote database/network responses; the complete multi-screen workflow allows 120 seconds. This changes latency tolerance, not expected behavior. Production frontend build, frontend tests and the browser workflow were rerun after the fix.

Requirement completion: source review, traceability, data acquisition/cleaning, FP-Growth/metrics, persisted Supabase runs/results, all required APIs/screens, interactive graph, report/CSV, unit/integration/DOM/browser checks, qualitative engineering review, dependency/secret checks, deployment preparation, README, diagrams, demonstration and final report are complete. Public Vercel/Render deployment, public HTTPS checks, target-host benchmarking and a store planner's external validation remain unverified/pending. The application is not claimed production-certified or publicly deployed.

Final repeat verification: pytest **7 passed** (33.21 s); Vitest **6 passed**; Chromium **1 passed** (13.3 s); production build succeeded; npm audit **0 vulnerabilities**. A final cold Uvicorn startup on port 8001 verified health/mining availability, latest dataset and persisted completed report with 52 rules after the prior server shut down. Temporary servers were stopped. Final credential/large-file review passed across 52 source candidates; Git contains no commits or publication. To open the application, start the two servers using README.

## Subsequent UI refresh
The baseline was subsequently committed and pushed to the owner’s existing GitHub repository, preserving its license initialization; main baseline head is 4b5ebe7. The UI redesign is isolated on feat/ui-theme-refresh. Persistent light/dark themes, responsive navigation, all six restyled screens, actual recommendation previews, accessible graph controls and smoother filtering are documented in ui-refresh.md. This addendum supersedes the original report’s pre-publication Git status and original frontend module list. Backend/database/mining source remains unchanged.
