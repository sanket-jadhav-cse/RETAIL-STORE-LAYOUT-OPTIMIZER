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
