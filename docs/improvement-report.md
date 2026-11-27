# Platform improvement report

Evidence collected 2026-11-26–27. This report supersedes the earlier public-read/operator-token workflow. The existing application, full UCI source, database records, FP-Growth algorithm and PRD were preserved. No public deployment was performed and production readiness is not certified.

## Executive summary

The initial app had six working analytics screens and correct full-data mining, but ordinary users shared an operator-token workflow, reads were public, names were technical, previous runs required UUIDs, navigation was inconsistent, and a full mining process used about 1.50 GiB RSS. Baseline source/docs/tests, migrations, the original 12-page PRD and all six real browser screens were inspected before changes.

Implemented account-based Supabase Auth, verified backend identity and ownership, restrictive RLS, accurate dataset provenance, named/searchable private run history, centralized GitHub Dark styling, responsive navigation, accessible overlays, filtered/paginated analytics and reports, bounded queries/resources, reconnect recovery and a single root environment source. Sign-in now works with the existing project and the owner's verified account; privileged keys were not used to bypass verification.

Locally verified: **39 backend tests, 35 frontend tests, 4 offline browser scenarios and all 4 live browser scenarios**. The live suite's three visual/responsive checks and the full workflow passed in separate invocations; an earlier full-suite attempt hit the correctly enforced HTTP 429 limit. Production build, dependency audits, startup/TLS and full-data mining persistence also pass. Remaining owner/external checks are listed explicitly below.

## UI/UX improvements

The exact requested dark palette is centralized in CSS variables and mapped to existing Tailwind/semantic tokens. Accessible text/hover variants preserve contrast without component-specific hex values. Shared buttons, inputs, status/metric cards, notices, pagination and empty/loading states retain clear responsibilities; Radix Popover/Dialog provide dismissal/focus behavior without repeated document click handlers. No TypeScript migration or graph-library replacement was introduced.

The desktop sidebar collapses, exposes icon tooltips and persists its browser preference; mobile uses a keyboard-accessible drawer that closes on navigation, outside interaction and Escape. The header/account menu uses real authenticated identity. Overview retains recent-run history and actual status/metrics; repeated header run controls appear only on Mining, Rules, Product Layout and Reports. Datasets has its own searchable catalog, and Account has no unrelated analysis controls.

Run history is debounced, paginated, scrollable and searchable by name/dataset/date/UUID, with status/dataset/date filters, selection state, retry/empty/loading states and authorized renaming. UUIDs remain internal identifiers, not primary labels. Rules have SQL product search, support/confidence/lift filtering and metric sorting. Reports share actual persisted adjacency evidence and export all authorized rows. SVG graph zoom/pan/reset/selection is preserved, names replace raw node-code labels, and spaced labels/legend/details explain conceptual adjacency.

A real wheel regression reproduced table containers trapping page scroll. Tables now release vertical scrolling to the page while preserving horizontal wheel/keyboard access. Inline Overview history also releases scrolling at its boundary; floating overlays retain deliberate containment. Automated checks cover 360/390/768/1024/1440/1920 px, an additional live 320 px, reduced motion, RTL overflow, 200% text zoom and axe checks on all six screens in both themes. Automated accessibility checks do not replace assistive-technology/user research.

### Before and after screenshots

These are actual browser captures, not design mockups. The after gallery uses actual exported UCI aggregates and an isolated offline identity; its displayed legacy run timing is that run's historical timing, not the new mining benchmark. Live account screenshots/tokens remain ignored. Captures use disabled animations to avoid mid-transition clipping.

| Screen | Before | After |
|---|---|---|
| Overview | [Original](images/before/overview.png) | [Current](images/after/overview.png) |
| Datasets | [Original](images/before/datasets.png) | [Current](images/after/datasets.png) |
| Mining | [Original](images/before/mining.png) | [Current](images/after/mining.png) |
| Association Rules | [Original](images/before/association-rules.png) | [Current](images/after/association-rules.png) |
| Product Layout | [Original](images/before/product-layout.png) | [Current](images/after/product-layout.png) |
| Reports | [Original](images/before/reports.png) | [Current](images/after/reports.png) |

Additional captures: [sign-in](images/after/sign-in.png), [signup](images/after/sign-up.png), [verification](images/after/email-verification.png), [resend](images/after/resend-verification.png), [forgot password](images/after/forgot-password.png), [reset](images/after/reset-password.png), [account menu](images/after/account-menu.png), [profile](images/after/account-profile.png), [collapsed sidebar](images/after/sidebar-collapsed.png), [run selector](images/after/run-selector.png), [selected graph relationship](images/after/graph-detail.png), [mobile dashboard](images/after/mobile-dashboard.png), [mobile report](images/after/mobile-report.png), [light theme](images/after/light-theme.png). README embeds these with short explanations.

## Authentication and ownership

Supabase's SDK implements signup, email/password login, verification, resend, forgot/reset, session restoration/refresh, logout and profile updates. Forms validate inputs, expose password visibility controls and prevent duplicate submission. Responses avoid disclosing account existence. Expired email callback descriptions are not reflected; safe guidance and resend actions replace them. Valid public configuration enables sign-in without a developer setup banner.

FastAPI verifies ES256/RS256 signature using JWKS, issuer, audience, expiry, issued-at, UUID subject and required role/anonymous claims, then checks the current verified user with Supabase Auth. Identity comes exclusively from the verified token. Every private run/status/search/rename/itemset/rule/graph/report/CSV route is owner-scoped; unavailable and unauthorized UUIDs return 404. Auth failures use 401/403, service outages 503. No passwords are stored by the application and no privileged key is embedded in the frontend.

Shared UCI data is read-only to authenticated ordinary users. Custom datasets may be private or explicitly shared through controlled import. Three pre-existing runs retain NULL owners and maintenance-only access; none was assigned to a new signup. Their original 156 rules and 114 adjacency rows remain preserved. New authorized user/test runs add records without deleting legacy data.

RLS tests use two separate identities and a non-owner PostgreSQL role, checking direct UUID access, history/search/pagination, rules, graph/report/CSV and pooled transaction identity reset. Signed-token negative tests are separate from API dependency fixtures. **A second live verified Supabase account has not been exercised**; the two-account evidence is isolated API/database evidence. Supabase JWTs may remain valid until expiry after logout; immediate revocation of every issued JWT is not claimed.

Live signup/email verification, password login, backend account/catalog/history access, refresh restoration, full-data mining/results/export and logout/protected entry pass. The owner observed an expired verification redirect to localhost:3000, but the account subsequently verified and login succeeded. Future email/reset redirects still require owner confirmation of Site URL/allowlist at localhost:5173 (and the eventual HTTPS origin). A complete live password-reset email/code round trip is not certified; the SDK form/recovery flow is covered offline.

## Dataset correctness

Recomputed the complete checksum-verified source: **541,909 source rows; 526,054 cleaned rows; 20,728 eligible baskets; 3,829 products; 2010-12-01–2011-12-09**. Sequential exclusions: 9,288 cancelled, 1,336 invalid/non-positive quantity and 5,231 exact duplicates; missing invoice/product exclusions are zero. Repeated product lines collapsed to presence: 5,306. Missing customer identifiers do not remove invoices.

UCI identity is established by source SHA-256 `43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d`, not filename. Name, description, organization, URL, DOI, dates, import/version/status and counts come from backend/persisted metadata. New imports calculate their own metadata. Atomic artifacts, checksum locking and idempotence handle duplicate imports; a regression verifies missing-artifact repair preserves custom provenance and ownership.

## Database and API changes

| Migration | Additive change | Preservation evidence |
|---|---|---|
| 002 | Nullable owners, shared catalog flag, restrictive RLS and maintenance/busy identity | Legacy rows preserved; NULL owners remain restricted |
| 003 | Dataset name/provenance/date/status fields and verified backfill | Full workbook recalculation and custom-source tests |
| 004 | Persisted validated run names | Stable UUIDs and existing results retained |
| 005 | Partial owner/created/run history index | Measured owner-history plan; no duplicate search indexes added |

Migrations were tested in disposable schemas before application. Runtime role permissions were not broadened. SQLAlchemy sets identity transaction-locally and reapplies it at every transaction; pooled rollback/commit identity isolation is tested. The default pool is five connections/zero overflow per process, with configured connect/acquisition/recycle/statement/lock limits and health checks. The scheduler holds one parent connection; the spawned child has its own engine. Production connection budgeting must include both processes.

Catalog latest-run retrieval is set-based (12 → 2 statements for a 10-dataset fixture, including identity setup). Status/history exclude potentially large itemset JSON. Product search uses SQL EXISTS and fetches only needed labels for returned pages. Bounded pagination and input validation remain compatible with `/api/v1`; added authorized GET runs, PATCH rename and GET account avoid unnecessary API version changes.

### Query measurements

[Tracked numeric evidence](verification/measurements.json) includes all repeated series and representative plans. Disposable local PostgreSQL fixture: 10 datasets, 10,001 runs (101 for target owner), 3,829 product labels, actual exported rule/pair metrics with synthetic itemset/product padding. Auth provider network is excluded. Each API series uses seven samples; three repeats showed host contention, so latency improvement is **not established consistently**.

| Read | Before median range, ms | After median range, ms | SQL statements before → after |
|---|---:|---:|---:|
| Catalog/dashboard selection | 12.53–37.39 | 10.73–24.61 | 12 → 2 |
| Dataset summary | 5.37–19.31 | 15.60–17.77 | 2 → 2 |
| Previous-run search | 8.59–32.13 | 15.08–25.47 | 3 → 3 |
| Run status | 5.56–43.67 | 11.16–21.14 | 2 → 2 |
| Rules | 13.26–69.61 | 18.90–29.40 | 5 → 5 |
| Report | 13.45–42.80 | 20.82–25.51 | 6 → 6 |

The owner-history plan changed from sequential scan/top-N sort (205 shared-hit blocks; 0.439 ms plan node total) to bitmap index/heap scan using `ix_runs_owner_created` (104 blocks; 0.209 ms). This is one representative fresh-fixture plan per version, not a throughput guarantee; estimates/statistics and production row distribution matter. Total run-index allocation in that after fixture was 1,810,432 bytes, including existing indexes. No production write-throughput improvement is claimed.

Original live public API medians: catalog 1,610.54 ms, dataset summary 1,276.31 ms, status 1,598.91 ms, rules 3,199.71 ms, report 4,165.99 ms (seven samples each). Original server-side read plans were under 0.2 ms; pooler/network round trips dominate those end-to-end values. New live authenticated timings include current-user verification and are reported separately, never as a security-free speed percentage. The current repeated HTTP evidence and frontend loading comparison are appended to the verification summary below.

## Mining memory and correctness

The old pinned mlxtend allocated unnecessary dense null-handling arrays for Boolean baskets. Reviewed upstream code/license and upgraded the released package to **mlxtend 0.25.0**, with required **NumPy 2.3.5 / pandas 2.3.3**. The algorithm, complete data, thresholds, denominator, ranking and metrics are unchanged; no source fork/monkey patch or pruning was added.

| Full-data measure | Before | After |
|---|---|---|
| Baskets/products | 20,728 / 3,829 | 20,728 / 3,829 |
| Itemsets/rules/recommendations | 358 / 52 / 38 | 358 / 52 / 38 |
| Fresh child peak RSS, three runs | 1,525.48–1,525.67 MiB | 306.55–306.75 MiB |
| Confirmed sampled backend + child RSS | 1,614.74 MiB, one validated sample | 389.05–395.94 MiB, three samples |
| Observed mining seconds | 90.52 / 108.23 / 128.25; separate baseline 29.69 | 2.82 / 2.34 / 2.54 |
| Full worker persistence after upgrade | — | 358/52/38; 322.65 MiB peak; 2.41 s mining; 3.71 s wall |

Full sorted itemset/rule/recommendation JSON has the identical digest `c548a51eae0b45cb9696eb3d8d216b1eabe6c4bc2dcaeacb7ece15a6d6c09f7e` across old/new versions. Leading support/lift were independently recounted from all baskets. A real owner-account browser run additionally reproduced 358/52/38 with about 315.68 MiB recorded child RSS and 2.51 s mining.

Earlier combined-memory repeats referenced an exited backend PID and are excluded; only the separately validated before sample supports the combined baseline. RSS sums can double-count shared pages. Timing contention varied substantially, so no controlled speed percentage or target-host memory reservation is claimed.

## Backend reliability, security and frontend performance

Scheduler/child cleanup regressions cover failed startup, invalidated lock sessions, actual lock loss, four concurrent submissions (202/409/409/409), watchdog persistence, stubborn child termination/reaping and restart handling. A live disconnect exposed permanent unavailability; an actual disposable PostgreSQL backend-termination test failed before the reconnect fix and passes afterward. Recovery retries with bounded exponential backoff, respects competing locks and releases resources during shutdown. It does not automatically replay interrupted jobs.

Rate limits remain six submitted runs/account/hour by default and one active job globally. The live workflow hit HTTP 429 and was retried only after the window reopened. No tests or limits were disabled. CSV formula injection handling covers leading whitespace/control characters; React renders untrusted names as text. CORS stays exact-origin, Supabase DB client TLS is verified, secrets/errors are withheld, and owner privileges remain outside the frontend/web hosting configuration.

Private state and legacy cached run selections clear on account changes; stale requests abort, filters reset pagination atomically, polling stops on terminal states/off relevant screens, and hash back/forward is supported. A distinct catalog/result loading state fixes stuck loading after interrupted navigation. The private dashboard is lazy-loaded after authentication.

Configured-Auth JS before code splitting: 611.13 kB (183.75 kB gzip). Current initial JS: **492.70 kB (146.47 gzip)**; private App chunk **121.59 kB (38.54 gzip)**; CSS **41.47 kB (8.92 gzip)**. Total JS is slightly larger than the unsplit configured build; initial private code is deferred, and the build warning is resolved without raising its threshold. Original public/no-account build: 286.49 kB JS (92.93 gzip), CSS 39.87 (8.71 gzip). Added Auth/UI functionality has a real size/boot cost; it is not hidden by comparing unlike configurations.

## Confirmed edge cases and regressions

| Defect/edge | Before | Verification after |
|---|---|---|
| Cross-account UUID/history/result/export access | Shared ordinary-user workflow | Two identities, direct APIs and restrictive RLS/pooled identity tests |
| No-match JSONB product search | Invalid empty search-query construction | Empty search returns empty results without SQL error |
| Whitespace-prefixed CSV formula | Unsafe spreadsheet cell prefix | Apostrophe neutralization and regression |
| Dataset artifact repair | Custom attribution/name replaced | Provenance/ownership preservation regression |
| Filter/page and stale requests | Redundant/outdated loads, stuck loading | Atomic page reset, cancellation and navigation tests |
| Mining lock/startup/disconnect cleanup | Leaked connection/terminal scheduler | Real session termination, contention, watchdog and shutdown tests |
| Expired email callback | No clear link guidance | Failing-before DOM test, safe guidance/resend, browser check |
| Table hover/wheel | Page scroll trapped | Failing-before wheel test; three tables, outside scroll and mobile horizontal/keyboard pass |
| Previous runs on unrelated pages | Duplicate/irrelevant controls | Failing-before visibility test; history retained where needed |
| Missing or privileged public config | Unusable login / exposure risk | Fail-closed public UI, key classification and build projection tests |

Also covered: finite threshold bounds, empty results, invalid/missing UUIDs, unavailable artifacts, duplicate imports/submissions, failure statuses, very long/unsafe names, neutral Auth errors, refresh/account switching/logout, overlay outside/Escape/keyboard interactions, missing reverse confidence and responsive overflow. Exhaustive handling of every hypothetical network/provider/hosting failure is not claimed.

## Verification commands and evidence

Commands use repository root unless a working directory is explicitly shown; credentials are supplied privately. No command transcript embeds a real password/token.

| Command/check | Result |
|---|---|
| `cd backend && DATABASE_URL=<disposable-url> MIGRATION_DATABASE_URL=<same-disposable-url> ../.venv/bin/pytest -q` | 39 passed, 7.55 s on final repeat; one HTTPX TestClient deprecation warning |
| `cd frontend && npm test` | 35 passed across 6 files |
| `cd frontend && npm run build` | Configured build succeeds; sizes above |
| `cd frontend && npm audit --audit-level=moderate` | 0 known vulnerabilities |
| `/tmp/ojt-audit/bin/pip-audit -r backend/requirements.lock --format json --output test-results/improvements/pip-audit-final.json` | No known vulnerabilities |
| `.venv/bin/pip check` | No broken requirements |
| `.venv/bin/ruff check --isolated --select E4,E7,E9,F,I backend` | Pass, executed from repository root |
| `.venv/bin/python backend/scripts/check_db.py` | SELECT 1, restricted tables and client TLS true |
| `cd backend && ../.venv/bin/alembic current && ../.venv/bin/alembic upgrade head` | 005 applied; isolated migration/RLS preservation tests pass |
| `.venv/bin/python backend/scripts/browser_fixture.py` | Actual aggregate-only fixture, no accounts/credentials |
| `cd frontend && LD_LIBRARY_PATH=<browser-libraries> npx playwright test --config playwright.platform.config.js` | 4 scenarios pass, 28.3 s; all six dark/light screens, widths, Auth fixtures, wheel/keyboard and screenshots |
| `cd frontend && E2E_EMAIL=<authorized-email> E2E_PASSWORD=<private> npx playwright test` | Three live visual/responsive/zoom scenarios pass; mining scenario initially 429 |
| `cd frontend && E2E_EMAIL=<authorized-email> E2E_PASSWORD=<private> npx playwright test workflow.spec.js` | Full live workflow passes, 48.9 s, after the rate window reopened |
| `RETAIL_ACCESS_TOKEN=<private> .venv/bin/python backend/scripts/smoke.py --run-id <owned-run> --expect-baseline` | Account/catalog/history and all five result routes pass; baseline counts verified |
| `PYTHONPATH=backend .venv/bin/python backend/scripts/benchmark_queries.py <output-json>` | Disposable scaled schema, seven samples/read, query counts and EXPLAIN evidence |
| `OJT_BENCH_SAMPLES=3 OJT_BACKEND_PID=<live-pid> .venv/bin/python backend/scripts/benchmark_mining.py <output-json>` | Full-data repeated before/after digest, time and RSS measurements |
| Uvicorn startup, health and graceful restart | Working with root environment and restricted runtime role; mining availability restored |
| Built-JS private-value scan | Actual database/owner URLs, passwords and historical operator token absent |

Raw screenshots/logs/session artifacts remain ignored; curated safe images and numeric evidence are tracked under `docs/images` and `docs/verification`. The historical `docs/evaluation-results.json` snapshot is preserved; smoke output now defaults to ignored evidence. Exact comparison build/browser commands and additional live HTTP measurements are in the verification addendum below.

Failed/invalid attempts were retained: remote PostgreSQL disconnect/hang; an early test run invalidated by concurrent source edits; wrong-working-directory migration/lint invocations (correct root/backend commands above pass); stale live test labels/selector locators; transient live CSV timeout; scheduler loss; rate-limit rejection; and invalid combined-PID samples. No failing assertions were removed to obtain success. The brief Vite conflict-marker error during integration was resolved; a browser load and production build verified zero overlay/parser errors. Later main reconciliation was inspected in an isolated worktree to avoid exposing merge markers to the running app.

## Repository references actually used

- [shadcn/ui](https://github.com/shadcn-ui/ui): semantic tokens, small accessible components (MIT reviewed).
- [shadcn-admin](https://github.com/satnaing/shadcn-admin): compact sidebar/account layout practices (MIT reviewed).
- [FastAPI full-stack template](https://github.com/fastapi/full-stack-fastapi-template): identity dependencies and validation boundaries; no password implementation copied.
- [FastAPI best practices](https://github.com/zhanymkanov/fastapi-best-practices): dependency composition and CPU isolation.
- [Supabase agent-skills/Postgres practices](https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices): measure plans, remove N+1, bound pools and use ownership indexes/RLS deliberately.
- [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy) and [Alembic](https://github.com/sqlalchemy/alembic): explicit transactions, set-based reads, session cleanup and additive migrations.
- [mlxtend FP common](https://github.com/rasbt/mlxtend/blob/master/mlxtend/frequent_patterns/fpcommon.py), [FP-Growth](https://github.com/rasbt/mlxtend/blob/master/mlxtend/frequent_patterns/fpgrowth.py) and [BSD-3 license](https://github.com/rasbt/mlxtend/blob/master/LICENSE-BSD3.txt): upstream null-allocation investigation and released compatible dependency upgrade.
- [Supabase Auth](https://supabase.com/docs/guides/auth/jwts): supported JWT/SDK behavior; [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas): prepared deep-link rewrite.

Reference documentation/licenses were reviewed before implementation. No repository implementation source was copied or wholesale template substituted. Optional plugin-management discovery was used to look for Supabase access; the owner ultimately supplied public configuration, not a connected administrative integration.

## Final status

**Completed and locally verified:** six screens, design tokens/responsive sidebar, accessible selectors/overlays/tables/graph/report, source-specific metadata, private named history, live sign-in/session/logout, backend verified Auth/ownership, isolated two-identity/RLS tests, additive migrations, reconnect/worker cleanup, full-data correctness/memory reduction, root environment projection, tests/build/audits and curated screenshots.

**Implemented but not fully externally verified:** live reset/verification delivery and redirect round trip, second live Supabase account isolation, hosted SPA/HTTPS/CORS/email routing, target-host memory/concurrency/capacity and fresh remote quality checks. Original live signup/verification/login passed; those successes do not certify every email/provider failure path.

**Blocked/owner action:** confirm Supabase Site URL/redirect allowlist, provide/verify a second isolated live account if required, rotate/revoke disclosed credentials, resolve GitHub account billing so CI can start, and explicitly identify any legacy-record owner before assignment. The last inspected main verify check failed because the GitHub account was billing-locked; its Sonar analysis was neutral, not a production readiness signal.

**Pending owner review:** the final integration targets main with the verified code and evidence. Focused PRs were created with one-line commits; the owner merged them. Some targeted already-merged feature branches, so the final integration places all verified follow-ups on main when reviewed and merged. No merge/deployment is performed automatically.

**Optional future work:** target-store planner evaluation, measured hosting load tests after approved deployment, and additional source datasets with their own metadata. A physical floor-plan optimizer or sales forecast would require new requirements/data and is not represented by the current conceptual graph.

## Final verification addendum

Seven current authenticated HTTP samples per endpoint all returned 200. These include Supabase Auth and database network round trips; SQL server execution is a separate measurement.

| Read | Median successful HTTP latency, ms | Samples |
|---|---:|---:|
| Catalog | 2538.19 | 7/7 |
| Dataset summary | 2237.55 | 7/7 |
| Previous-run search | 2590.63 | 7/7 |
| Run status | 1946.34 | 7/7 |
| Rules | 2881.43 | 7/7 |
| Report | 3229.16 | 7/7 |

Controlled production-browser comparison: same Chromium, 1440×1000, local uncompressed assets, fresh contexts, identical actual aggregate fixtures and mocked Auth/API; warm-up excluded, seven alternating samples. Original public UI at commit `014f5b7` and the current account UI are different feature sets; the comparison exposes their cost, not an equivalent production-network speed percentage.

| Browser median | Original public UI | Current account UI |
|---|---:|---:|
| First contentful paint, ms | 108.00 | 76.00 |
| Baseline metric DOM ready, ms | 137.60 | 428.40 |
| Loaded script bytes | 286494.00 | 614249.00 |

The current shell paints promptly, but useful metric readiness is slower than the smaller public UI because of added account initialization and code loading. This cost is recorded rather than hidden; code splitting reduces the configured account app’s initial download. Playwright’s visibility-observation wall time is retained separately in the JSON and is not substituted for the MutationObserver DOM timestamp.

Reproduction commands (temporary builds do not alter application data):

```bash
git worktree add --detach /tmp/ojt-ui-before 014f5b7
ln -s /home/sanket/OJT/frontend/node_modules /tmp/ojt-ui-before/frontend/node_modules
npm --prefix /tmp/ojt-ui-before/frontend run build
VITE_SUPABASE_URL=https://retail-test.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=public-test-key npm --prefix frontend run build -- --outDir /tmp/ojt-ui-after
LD_LIBRARY_PATH=/tmp/ojt-browser-libs/extracted/usr/lib/x86_64-linux-gnu node frontend/scripts/benchmark-browser.mjs /tmp/ojt-ui-before/frontend/dist /tmp/ojt-ui-after test-results/improvements/after/browser-controlled.json
RETAIL_ACCESS_TOKEN=<private> .venv/bin/python backend/scripts/benchmark_http.py --output test-results/improvements/after/live-api-repeated.json
```

The temporary browser public key above is an offline fixture, not a live credential. Backend/worker full-data benchmarks and query suites are documented earlier.

## Feature branches and one-line change history

PR state below was inspected before final integration publication. The owner merged the focused PRs; review each PR for its original base and verification boundaries. Commit identifiers identify the recorded feature head, including any owner merges into that branch.

| PR | Branch | One-line change | Recorded head | State at inspection |
|---|---|---|---|---|
| [#3](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/3) | `docs/platform-improvement-baseline` | docs: record platform improvement baseline and acceptance plan | `cebaa19f` | Owner merged |
| [#4](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/4) | `feat/account-authentication` | feat(auth): verify Supabase sessions and isolate account data | `34ed57ea` | Owner merged |
| [#5](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/5) | `fix/dataset-provenance` | fix(data): persist verified dataset names and transaction dates | `a3dcccba` | Owner merged |
| [#6](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/6) | `feat/searchable-run-history` | feat(runs): add named searchable account mining history | `666797bd` | Owner merged |
| [#7](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/7) | `feat/github-dark-dashboard` | feat(ui): apply GitHub Dark theme and responsive account navigation | `4f921d44` | Owner merged |
| [#8](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/8) | `feat/analytics-result-filters` | feat(analytics): add metric filters and searchable evidence reports | `87010bf6` | Owner merged |
| [#9](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/9) | `fix/security-dependencies` | fix(security): upgrade audited backend and test dependencies | `95c62ffd` | Owner merged |
| [#10](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/10) | `fix/auth-availability-message` | fix(auth): keep deployment configuration off the sign-in screen | `bd31536d` | Owner merged |
| [#11](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/11) | `perf/bounded-analytics-queries` | perf(api): bound analytics queries and defer private dashboard code | `8f2637a0` | Owner merged |
| [#12](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/12) | `fix/mining-worker-recovery` | fix(worker): release mining resources after failures and lock loss | `3f29f0f7` | Owner merged |
| [#13](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/13) | `fix/dataset-import-repair` | fix(data): preserve dataset provenance during artifact repair | `77ea12c2` | Owner merged |
| [#15](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/15) | `perf/fpgrowth-memory` | perf(mining): eliminate upstream Boolean null-allocation overhead | `57b8366e` | Owner merged |
| [#16](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/16) | `fix/pr14-quality` | fix(quality): resolve PR review findings and consolidate dashboard styles | `8d4eacf4` | Owner merged |
| [#17](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/17) | `fix/platform-quality` | fix(quality): resolve PR review findings and consolidate dashboard styles | `9994ac9d` | Owner merged |
| [#18](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/18) | `fix/auth-email-callback` | fix(auth): handle expired email links and offer verification resend | `0176e35e` | Owner merged |
| [#20](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/20) | `test/authenticated-workflows` | test(auth): verify account workflows and protect evaluation evidence | `2416d149` | Owner merged |
| [#21](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/21) | `fix/scheduler-reconnect` | fix(worker): recover scheduler after database connection loss | `960a95a8` | Owner merged |
| [#22](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/22) | `fix/table-scroll` | fix(ui): allow page scrolling while hovering analytics tables | `61907cf0` | Owner merged |
| [#23](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/23) | `refactor/central-environment` | refactor(config): centralize environment settings and restrict browser exposure | `497696a5` | Owner merged |
| [#24](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/24) | `feat/contextual-run-selection` | feat(ui): show run selection only in analysis workflows | `c35e00b1` | Owner merged |
| [#27](https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/27) | `test/live-run-selection` | test(e2e): load authorized baseline runs in live account checks | `d1fe1b80` | Open; verified locally |

Owner aggregate PRs #14, #19, #25 and #26 are merged. PR #14's original checks did not justify a merge-ready verdict at review time; that historical finding is distinct from its later owner-controlled merge. Current main was reconciled in an isolated worktree: no unrelated source differences were introduced. The final integration applies all remaining verified follow-ups directly against main and leaves final merge/deployment to the owner.
