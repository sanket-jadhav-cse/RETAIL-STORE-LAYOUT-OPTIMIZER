# Retail Store Layout Optimizer
Sanket Jadhav · 240410700193 · Semester 5

## Objective and source analysis
All 12 pages of the original PRD read on 2026-11-26, without modifying it. Implement explainable invoice-level FP-Growth adjacency decision support, not a physical optimizer or sales forecast. PostgreSQL/Supabase overrides every SQLite reference. Original paper: Han, Pei, Yin (SIGMOD 2000), DOI 10.1145/342009.335372. Original UCI Online Retail is the reproducible source corresponding to the PRD's broad Kaggle search.

## Architecture decisions
Modular FastAPI monolith, SQLAlchemy/psycopg, isolated `retail` PostgreSQL schema, Alembic. Sparse Boolean pandas baskets and mlxtend. One bounded child mining process; database advisory lock prevents competing workers; interrupted runs fail on restart. Local content-addressed basket artifacts must be persisted on Render. React/Vite/JavaScript/Tailwind/Axios with SVG adjacency graph. Bearer operator token for mining; public reads. No customer data persisted. No external AI APIs.

## Structure and database
backend/app: configuration, ORM models, schemas, API, worker, mining functions. backend/scripts: secure setup, import and evaluation. frontend/src: API, shared UI, six screens. docs: architecture, wireframes, evaluation, deployment, final report.
Dataset UUID → products (dataset/code composite PK), runs UUID → rules and adjacency. Adjacency has composite run/dataset and product foreign keys, canonical ordered unique pairs. JSONB holds itemsets, rule members and quality metadata. UTC timestamps. Raw input never stored in PostgreSQL.

## API contracts
/api/v1: GET health; GET datasets; GET datasets/{id}/summary; POST runs (dataset_id, support/confidence in (0,1], finite lift >=0, optional itemset size); GET runs/{id}; GET runs/{id}/rules; GET runs/{id}/adjacencies; GET runs/{id}/report; GET runs/{id}/report.csv. Paginated results, 404 unknown, 409 not ready/busy, 401 unauthorized. Itemsets available through run detail with bounded pagination endpoint if needed.

## Pipeline and frontend
Validate CSV/XLSX columns; sequential quality exclusions; normalize IDs; retain missing customers; remove cancellations/returns/invalid quantity, exact duplicates; set-valued invoice baskets. Sparse encoding retains every eligible basket. mlxtend produces metrics; singleton rules form canonical pairs retaining only qualifying directional confidence. Rank by lift, support, maximum qualifying confidence, codes. Six navigation screens: overview, quality, configuration/status, searchable rules, SVG graph, evidence report. Shared run selection and API client.

## Traceability and ordered phases
| Phase | Requirements (PRD sections / prompt additions) | Implementation | Verification | Status |
|---|---|---|---|---|
|1 Foundation|1–8,17–18; inspection, source, plan, ignore, setup|PLAN, config, data README|12-page extraction, tools, source download|Completed|
|2 Preprocessing|9,13–14; cleaning, denominator, sparse encoding|mining/preprocessing.py, import script|dirty fixtures, full dataset counts|Completed|
|3 Mining|4,9,13,16; FP-Growth, metrics, deterministic pairs|mining/pipeline.py|independent 100-basket metrics, boundaries, real evaluation|Completed|
|4 Backend|10–12,15; PostgreSQL override, constraints, APIs, bounded jobs, security|models, migration, main, worker|PostgreSQL integration, API tests, restart/concurrency tests|Completed|
|5 Frontend|7–9; six screens, graph, errors, pagination|React components, wireframes|Vitest, production build|Completed|
|6 Integration|16; persistence, reports, qualitative evaluation|integration tests, evaluation|actual dataset workflow, metrics and UI tests|Completed|
|7 Delivery|17–18; review, docs, deploy, demo|README, docs, CI, deployment config|final tests, build, Git secret review|Completed|

## Testing and acceptance
pytest independent synthetic metrics/cleaning, real isolated PostgreSQL integration (never production destructive tests), Vitest UI/API states, production frontend build and backend health smoke. Real dataset mining measured with elapsed time and peak RSS. Done only when all six screens can retrieve persisted actual results; blockers remain explicit.

## Deployment
Vercel static frontend; Render single Uvicorn worker with persisted DATA_DIR and bounded compute; Supabase SSL session pooler. Operator token never placed in Vite variables. Migrate with owner, runtime least-privilege role, private schema outside Data API. No paid service or publishing authorized.

## Risks / open questions
Supabase credentials supplied later in the session: hidden-input setup, TLS, migrations, runtime role and persistence verified. Credentials are ignored, not in source. Render memory/CPU capacity to be measured before plan selection. Dataset artifact storage required across restarts. No actual floor plan: conceptual graph only. Public deployment and owner qualitative review pending. Original optional tests/docs become mandatory per prompt.

## Verification update — 2026-11-26
Phases 1–5 implemented and verified: source acquired, full deterministic preprocessing, metric unit tests, real PostgreSQL/API integration, six React screens, production build. Phase 6: actual dataset completed and persisted (358 itemsets, 52 rules, 38 pairs); 7 backend tests and 6 frontend tests passed; browser verification completed. Phase 7: code review, documentation and deployment preparation completed; external publication remains pending. Publication, paid host selection and target-host benchmarks remain Pending, with public deployment Blocked on owner hosting configuration/approval. These external actions are not marked completed.

Review fixes: PostgreSQL JSONB search array typing, advisory lock release before pooling, missing artifact re-import repair, UI dataset/run consistency, immutable migration DDL, dependency audit upgrades, sparse Boolean encoding. Regression tests cover search, restart/lock re-acquisition, artifact repair and dataset switching. Original migration version table created during the first setup was moved into the isolated retail schema; no pre-existing version table or unrelated data was changed.

## Final acceptance evidence
- Completed: all PRD mandatory application functionality; actual Supabase dataset/import/run/results; all six screens; graph and CSV; PostgreSQL metric/persistence/constraint and restart tests; frontend state tests; real-browser six-screen workflow; production frontend build; local backend startup/TLS/health; dependencies/secret review; documentation/demo/presentation outline.
- Completed with scope limit: qualitative engineering evaluation (not an external planner study); deployment configuration and instructions (not public hosting).
- Pending: owner-selected Render capacity/persistent storage, Vercel/Render accounts/environment setup, target-host benchmarks and HTTPS smoke, external planner review, manual Git publication. Public deployment Blocked until hosting approval/configuration. No paid service, commit or publication performed.
- Browser regression: node labels intercepted edge clicks. Reproduced in Chromium, fixed pointer hit-testing/background panning, and verified the same edge-click and full workflow assertions pass.
- Final evidence: backend 7 tests, frontend 6 tests, browser 1 multi-screen test; 358 itemsets / 52 rules / 38 pairs from all 20,728 real baskets. Three runs reproduce counts; timing/RSS variation is documented in final-report.md.

## UI refresh — feat/ui-theme-refresh
Baseline pushed to the existing GitHub repository, preserving its initial license commit; baseline main head 4b5ebe7. UI work is isolated on feat/ui-theme-refresh. Completed: semantic light/dark themes, responsive shell, all six screens, accessible graph interaction, restrained CSS transitions and reduced-motion support. Verification passed: 10 component tests, 4 real-browser tests, all six screens in both themes with axe checks, 320px navigation/reflow, 200% text sizing on dashboard/configuration, RTL dashboard, actual Supabase results/CSV, production build and npm audit (0 vulnerabilities). Guidance: jakubkrehel/skills (better-ui, colors, motion, layout, typography, accessibility). Verification: existing DOM/browser flows, theme persistence, narrow layouts, keyboard controls, actual API results and production build. No backend metric or database changes planned.

## Remote quality follow-up
GitHub Actions is Blocked by the owner account billing lock (run 45842511323; no steps executed). SonarCloud PR #1 reported request-path injection and frontend code-quality findings. In Progress: validated/encoded run routes, explicit form types, native status/graph grouping markup and maintainability corrections. Local 13-test frontend suite/build/audit pass. Real-data browser repeat currently encounters intermittent Supabase/API timeouts and the pre-existing local worker reports unavailable; preserve these as verification limits until a stable repeat passes. No billing settings changed and no tests weakened.

Quality follow-up implementation Completed locally: strict UUID/resource validation and safe URL construction, native status/grouping markup, explicit form button types, consolidated theme tokens, and focused presentation simplifications. Latest evidence: 13 frontend tests, 4 actual Supabase browser tests, production build and npm audit (0 vulnerabilities) passed. The API was safely restarted after verifying zero active runs, restoring mining availability. Original PR #1 was merged by the owner; follow-up work is isolated on fix/ui-quality-checks based on d2358cf. Remote GitHub Actions remains Blocked by account billing; fresh SonarCloud reanalysis remains Pending. No test assertions were weakened or remote billing settings changed.

## Account platform improvement — 2026-11-26 (active plan)
This section supersedes earlier completion claims for the new scope. Existing records and FP-Growth are preserved. Publication authorized by the owner's follow-up; separate feature/fix branches, one-line commits, and focused PRs required. No deployment authorized. Baseline branch `fix/ui-quality-checks`, head `014f5b7`, clean working tree.

| Priority / work package | Status | Acceptance / affected files | Verification |
|---|---|---|---|
| P0 Baseline and reference review | Completed | Read existing source, docs, 12-page PRD; six browser captures; API/query/build baseline | Existing tests/build, Chromium screenshots, repeated read timings and EXPLAIN |
| P0 Authentication and ownership | In Progress | Supabase Auth SDK; JWT verification; owner-scoped every result route; legacy owner remains NULL/restricted; no password storage. `auth.py`, `main.py`, config, migration, Auth UI | Signed JWT negative tests; two identities/direct UUID routes; isolated PostgreSQL migration; live email flows separately |
| P1 Dataset metadata correctness | Completed | Meaningful names/date counts from source and DB; generic imports never labeled UCI; preserve checksum idempotence. importer, preprocessing, models, schemas, migration, screens | Actual workbook metadata recalculation; synthetic import regression; unchanged basket/product counts |
| P1 Named searchable mining history | Completed | Persist validated names; authenticated paginated search/filter/rename; dropdown keyboard/outside/Escape and loading/retry | API isolation/search/page/name tests; DOM and browser interactions |
| P1 GitHub Dark shell and account UI | Completed | Exact central palette; reusable controls; responsive collapse/drawer, real user menu and account page. CSS/Tailwind/App/UI | 360/390/768/1024/1440/1920px; axe; screenshots; keyboard and reduced motion |
| P1 Rules, graph and reports | Completed | Actual metadata, server filters/search/pagination; conceptual graph preserved, report export auth | Full browser workflow, filters, CSV injection and denial tests |
| P2 Query and resource performance | In Progress | Profile first; remove dataset N+1; avoid itemset/product overfetch; bounded pool; memory profiling without algorithm/data changes | Read plans/query counts and repeated comparable samples; full 358/52/38 regression and combined RSS |
| P2 Complete QA and independent review | Pending | All old/new suites, build, audits, startup; review actual screenshots/source | Exact commands/results in improvement report; no weakened assertions |
| P2 Documentation and clean PRs | Pending | Update README/architecture/deployment/final report; improvement report with before/after, branch/commit/PR matrix | Review staged diffs for secrets/artifacts; one-line commits; each PR describes validation/limits |

External configuration: backend `.env` currently contains DB/operator settings only; no Supabase URL/public Auth key. Owner instructed using existing configuration; database credentials do not substitute for a public Auth key. Investigate public project settings without exposing any secrets; keep live verification Blocked if unavailable. Existing runs must never be assigned to a new signup automatically.

Baseline: frontend 13 tests passed; production JS 286.49 kB (92.93 kB gzip), CSS 39.87 kB (8.71 kB gzip). Browser/API baseline collection in ignored `test-results/improvements/before/`. Public GitHub reference README review: shadcn/ui, shadcn-admin, FastAPI template/best practices, Supabase postgres skill, SQLAlchemy and Alembic. Reuse guidance only; no copied implementation source.

Authentication implementation: additive migration 002 verified in a disposable schema and applied; all 3 legacy owners remain NULL. Supabase live Auth verification Blocked on missing public key. 18 frontend tests pass. Remote test instability prompted disposable local PostgreSQL 16 verification. Baseline planning PR: https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/3.

Account PR #4 is draft: 24 local PostgreSQL/backend tests and 18 frontend tests pass; live email verification is Blocked on public Auth settings. Dataset metadata source verification reproduced all full-workbook counts and 2010-12-01–2011-12-09 dates; migration 003 passes isolated preservation/RLS verification.

Run history: owner-filtered GET /runs and PATCH /runs/{id}; migration 004 preserves legacy names/ownership; 26 backend and 24 frontend tests pass. Previous-run selection, debounce, pagination, outside/Escape dismissal and same-run result retention have regression coverage. Live browser/account tests remain separately tracked.

UI verification: 25 frontend tests and 3 isolated browser workflows pass. All six screens pass axe in dark/light themes; 360/390/768/1024/1440/1920 widths, mobile drawer outside/Escape, persistent collapse, graph selection/reset and CSV covered. These browser tests use offline Auth + actual aggregate fixtures and do not certify live Supabase email flows. Run-history PR #6 and dataset PR #5 are open as dependent focused PRs.

Analytics result filters: 27 backend tests pass, including no-match JSONB search and CSV whitespace injection; 25 frontend tests pass. Professional searchable evidence table and advanced settings implemented. Browser rerun underway after filter changes. GitHub Dark UI PR #7 is open.

Security audit follow-up: Completed locally — compatible FastAPI/Starlette/pytest upgrades; 27 backend tests pass, pip-audit reports no known vulnerabilities, pip check and Ruff pass. New owner request: after final visual checks, preserve curated page/feature screenshots in docs/images and add short illustrated README explanations. Generated raw artifacts remain ignored. Remove developer configuration wording from the public sign-in screen; live Auth still requires a distinct public API key or connected Supabase management access.

Query/pool/client optimization: 28 backend and 29 frontend tests pass; migration 005 applied after isolated migration/RLS verification. Catalog query count 12→2 for 10 datasets; one measured partial owner-history index; private status no longer loads itemsets. Live Auth latency remains unmeasured due external configuration. Mining resource work and final visual/documentation verification remain In Progress.

Mining memory work Completed locally: complete output digests identical across versions; 35 backend tests and full-source worker persistence pass. Child RSS ~1526→307 MiB, combined sampled backend/child ~1615→396 MiB. Local timing variation is explicitly documented; no dataset pruning or threshold changes. Fresh audit reports no known vulnerabilities.

PR #14 review: Not ready to merge. GitHub verification job did not start because the owner account is billing-locked; SonarCloud independently reports reliability C and concrete source findings. Owner billing action is external. A focused quality follow-up and final screenshot/documentation work remain In Progress.

2026-11-27 live Auth update: owner supplied the required public publishable key; configured only ignored backend/frontend environment files. Live signup/email confirmation, password sign-in, backend verified account/catalog/history, browser refresh restoration and a complete browser mining run now succeed. New private baseline run preserves 358 itemsets / 52 rules / 38 recommendations; legacy runs remain unassigned. Supabase's default email redirect still points to localhost:3000; owner URL-allowlist configuration and full reset/email-link round trip remain Pending. Exposed privileged credentials were not used or committed; rotation remains an owner action.

Expired email callback regression reproduced (missing error guidance). Fixed with safe, generic callback messaging and resend-verification UI; 31 frontend tests, production build and real-browser expired-link check pass. Public sign-in is enabled and has no configuration/unavailable banner when valid settings are present. Quality review fixes published in PR #16 (PR #14 head) and integrated separately in PR #17 (current improvement stack); 35 backend / 29 frontend tests passed before the callback additions. Actions billing and fresh Sonar analysis remain Blocked/Pending externally.

Live browser verification update: all three authenticated theme/responsive/zoom tests pass against Supabase. Full six-screen workflow reproduced a stale report-heading assertion (updated to the current Reports heading), then a transient CSV timeout and a scheduler becoming unavailable after connection interruption. These failures remain recorded; the workflow is not marked passed. Authenticated smoke verifies account, catalog, history, all five result routes and full baseline counts without overwriting historical evaluation data. New owner requests: one root environment file and fewer run controls; table wheel scrolling must be repaired with a browser regression.

Scheduler reconnect fix: Completed in isolated verification. Terminating the scheduler's actual disposable PostgreSQL session reproduced permanent mining unavailability. Recovery now stops/reaps any child, releases the failed connection, retries with bounded exponential backoff, and reacquires the exclusive advisory lock before resetting interrupted jobs or accepting new work. Contention and interruptible-shutdown regressions pass; full backend suite: 37 passed. This does not retry a failed mining run automatically. Table wheel regression separately reproduces the user's hover/scroll failure before its CSS fix.

Table scrolling: Completed and verified. The regression failed with the pointer over a dataset/rules/report table and passes after enabling vertical scroll chaining. Horizontal wheel and keyboard access remain verified on mobile. Inline Overview history also allows scrolling back to the surrounding page; modal/popover and drawer scroll boundaries retain appropriate containment.

Central environment: Completed and verified locally. Root `.env` is the only active local settings file; old files are archived in ignored private backups. Vite projects an exact public allowlist, rejects privileged keys and disables automatic prefix exposure; private database/owner/password/operator values were checked absent from the built JS. Backend, migration and role/setup scripts use the root settings; no project host/ID is embedded in setup code. Pool/reconnect bounds are configurable and validated. 39 backend / 34 frontend tests, build, live browser sign-in/dataset access and PostgreSQL client TLS check pass. Hosting Auth env declarations and documented Vercel SPA rewrite prepared; no deployment performed.

Contextual selection: Completed and verified. Overview retains inline recent history and its own metrics/status; the duplicated header selector/status strip appears only on Mining/Rules/Layout/Reports. Datasets uses its searchable catalog and Account has no analysis controls. Regression fails before and passes after; 35 frontend tests, configured build and all 4 offline Chromium workflows pass. Expanded screenshot evidence now includes profile, graph details, verification/resend, forgot/reset and mobile reports; all use an explicitly isolated test identity with actual exported dataset aggregates.

Live verification completed: all 3 authenticated theme/responsive/zoom browser checks pass; the full mining/rules/graph/report/CSV/session/logout workflow passes separately (48.9 s) after the hourly submission window reopened. The rate-limit rejection was retained as evidence and was not bypassed. Live history selection explicitly chooses a completed authorized baseline run rather than assuming the newest run uses baseline thresholds. Final test totals: 39 backend, 35 frontend, 4 offline browser and 4 live browser checks passed. npm audit/pip-audit report zero known advisories; pip check, root-scoped correctness/import lint and production build pass. Remaining work: finalize illustrated documentation and reconcile all verified follow-ups into a reviewable main integration PR; external email-redirect/reset/second-account/CI/hosting checks remain separately blocked/pending.
