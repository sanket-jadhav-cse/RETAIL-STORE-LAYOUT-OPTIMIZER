# Account platform improvement report

Date: 2026-11-26. Work in progress; this report records observed evidence, not production certification.

## Initial condition
Existing six-screen React/JavaScript dashboard and FastAPI/PostgreSQL mining application. Baseline head `014f5b7` on `fix/ui-quality-checks`. Existing full UCI dataset and reports are preserved. Public read APIs, operator-only submissions, hardcoded user identity, UUID-only history retrieval, and generic imports incorrectly labeled as UCI were confirmed by source inspection. Dataset API performs one latest-run query per dataset. Run status queries load the large itemsets JSON unnecessarily.

## Baseline evidence
13 frontend tests pass. Production JavaScript 286.49 kB / 92.93 kB gzip; CSS 39.87 kB / 8.71 kB gzip. Both local servers started. Before screenshots and raw measurements are ignored under `test-results/improvements/before/`; screenshots must be reviewed before any completion claim.

## Delivery tracking
Each package has its own branch and single-line commit. PRs are opened only after the package's checks; dependent PRs state their base explicitly. No deployment is authorized.

| Package | Branch | One-line commit message | Before → After | PR / verification |
|---|---|---|---|---|
| Baseline/planning | `docs/platform-improvement-baseline` | `docs: record platform improvement baseline and acceptance plan` | Prior scope complete → new scope tracked explicitly | Pending |
| Secure accounts | `feat/account-authentication` | `feat(auth): verify Supabase sessions and isolate account data` | Public results / operator UI → verified account ownership | Pending |
| Dataset metadata | `fix/dataset-provenance` | `fix(data): persist verified dataset names and transaction dates` | All imports labeled UCI → source-specific persisted provenance | Pending |
| Run history | `feat/searchable-run-history` | `feat(runs): add named searchable account mining history` | UUID-only retrieval → paginated named selection | Pending |
| Dashboard shell | `feat/github-dark-dashboard` | `feat(ui): apply GitHub Dark theme and responsive account navigation` | Green theme / fake identity → central palette and real account shell | Pending |
| Performance / edge cases | `perf/bounded-analytics-queries` | `perf(api): bound analytics queries and remove redundant data loading` | N+1 / broad result loads → measured bounded reads | Pending |
| Final evidence | `docs/platform-verification` | `docs: record platform verification evidence and remaining blockers` | Historical evidence → current commands, screenshots and limitations | Pending |

## External verification blockers
Supabase URL/public key and authorized test-account email access are not in existing environment files. Owner requested existing project usage; no database password or service-role credential will be placed in frontend code. Live signup, email verification, reset and revocation checks require actual Auth configuration. Legacy runs remain restricted until an owner is explicitly designated; no automatic reassignment.

## References reviewed
- [shadcn/ui](https://github.com/shadcn-ui/ui): semantic tokens and small accessible primitives (MIT).
- [shadcn-admin](https://github.com/satnaing/shadcn-admin): responsive sidebar/account navigation practices (MIT).
- [FastAPI full stack template](https://github.com/fastapi/full-stack-fastapi-template): dependency-based identity and layered validation (MIT); no password implementation copied.
- [FastAPI best practices](https://github.com/zhanymkanov/fastapi-best-practices): dependency composition and isolated CPU work.
- [Supabase Postgres best practices](https://github.com/supabase/agent-skills/tree/main/skills/supabase-postgres-best-practices): measure query plans, bound connections, index actual query patterns.
- [SQLAlchemy](https://github.com/sqlalchemy/sqlalchemy): explicit transactions, parameterized set-based reads (MIT).
- [Alembic](https://github.com/sqlalchemy/alembic): additive transactional migrations (MIT).
- [Supabase Auth JWT guidance](https://supabase.com/docs/guides/auth/jwts) and [password Auth guidance](https://supabase.com/docs/guides/auth/passwords): SDK sessions and verified bearer identity.

No external source code has been copied. License review is required before any later source reuse.

Baseline visual review: captured all six screens in Chromium at 1440px. Dashboard has a large decorative banner, date-only dataset label and fake account; graph uses raw codes for node labels. Baseline navigation is a sticky expanded mobile panel rather than an outside-dismissible drawer. Before artifacts: `test-results/improvements/before/1.png` through `6.png`.

## Authentication and account isolation implementation
Branch `feat/account-authentication` adds Supabase SDK signup/signin/recovery/reset/session restoration, account/profile controls and protected application entry. Backend verifies ES256/RS256 signature, issuer, audience, expiration, subject, role and current verified Auth user. No password or service-role storage is added. Every result/CSV/status route scopes UUID lookup to the verified owner; dataset reads require shared status or ownership. Mining has global bounded concurrency and six submissions per account/hour by default.

Migration `002` adds nullable owners and a shared-catalog flag without assigning legacy records. Restrictive RLS policies intersect existing runtime policies. Request identity uses transaction-local settings reapplied for each transaction; internal CLI/worker sessions explicitly opt into maintenance identity. A security-definer boolean busy check preserves global concurrency without exposing run details. A non-owner test role verified A/B RLS isolation and identity reset on rollback.

Verified: 15 JWT/current-account tests; full isolated PostgreSQL suite initially 22 passed, then migration/RLS test passed separately; frontend 18 tests pass including session restoration/account switch/logout. A subsequent remote DB repeat failed during connection loss (22 other checks passed); this is recorded as a failed run, not suppressed. Original baseline pytest was invalidated by concurrent source edits and is not presented as a clean baseline pass. Production build with configured public Auth settings is measured separately from an unconfigured build, which tree-shakes the SDK.

Applied `002` after isolated verification. Preserved live totals: 1 dataset, 3,829 products, 3 runs, 156 rules, 114 adjacencies. All 3 legacy run owners remain NULL. Runtime access to the Alembic version table was denied as intended; migration version was checked using Alembic's owner connection. Live Auth/email flows remain Blocked on public API-key/email configuration. No owner credentials entered frontend configuration.

Repeat using disposable local PostgreSQL 16.15: **24 backend tests pass (2.78 s)**, **18 frontend tests pass**, configured-Auth production build succeeds (JS 594.37 kB / 179.59 kB gzip; CSS 40.77 / 8.92 kB). This reveals a bundle warning to address in the performance package. Anonymous `/api/v1/datasets` returns 401 on the actual running backend. Dependency checks: npm audit zero vulnerabilities; pip check passes; Ruff passes. Local PostgreSQL binaries/libraries/data are under `/tmp/ojt-postgres`, not in the repository, and listen only on localhost.

## Dataset metadata correctness
Before: every import was called UCI and assigned its date-string version; the frontend displayed that version as the primary dataset label. After: checksum-verified UCI provenance, descriptive names and optional source links are persisted; other files receive their own names/provenance and calculated dates. No frontend metrics are hardcoded. Imports remain checksum-idempotent, use unique temporary artifacts and serialize duplicate persistence with a transaction advisory lock.

Complete workbook recalculation: 541,909 original / 526,054 cleaned rows, 20,728 baskets, 3,829 products, dates 2010-12-01–2011-12-09, zero invalid dates. The source checksum is 43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d. Migration 003 adds metadata fields and only designates that verified workbook shared/read-only; no legacy runs are shared. Synthetic unrelated imports verify independent dates, names, missing source links, invalid-date reporting, private ownership, repeat import and invalid metadata rejection. 25 backend tests / 18 frontend tests pass; migration 001→003 runs under rollback in an isolated schema.

Migration 003 was applied and the actual workbook re-import verified/backfilled metadata without duplicate records. Persisted dataset name/date/shared status and DatasetOut serialization pass. Searchable dataset catalog added with a selection regression. Frontend now 19 tests pass. Auth PR: https://github.com/sanket-jadhav-cse/RETAIL-STORE-LAYOUT-OPTIMIZER/pull/4 (draft due live external configuration).

## Named searchable mining history
Before: users had to find and paste UUIDs. After: persisted validated names, generated dataset/date/threshold labels, most-recent-first owner-only history, server pagination, literal-safe name/dataset/date/UUID search, status/dataset/day filters and owner-only rename. Run details expose UUID only as secondary metadata. The dashboard shows recent activity and the selector provides skeletons, retry, empty/no-match states, selected status, keyboard selection, Escape/outside dismissal and focus restoration through Radix primitives.

Migration 004 backfills display names without changing UUIDs or owners. Isolated migration test now preserves a pre-migration legacy run explicitly. Server tests cover duplicate names, filters, pagination bounds, literal percent search, invalid dates/names, and cross-account search/rename denial. DOM tests cover debounce, server page parameters, selection, focus, outside clicks, internal input interaction, errors/retry and same-run table retention. 26 backend / 24 frontend tests pass. The same-run selection bug was reproduced by removing its guard and rerunning the targeted assertion; the evidence file records failure before and success after restoration.

## GitHub Dark dashboard and visual verification
Central CSS tokens contain the requested exact palette and map into Tailwind semantic colors. Dark is the default; the existing optional light theme remains available. Compact headers/cards, consistent radii/borders, semantic buttons, source summary, real authenticated account controls, persisted desktop collapse and a Radix mobile dialog replace the earlier marketing banner/fake account/sticky mobile menu. Graph labels now use abbreviated product names on spaced label rows, with full names/evidence retained. Unused banner/old sidebar/UUID-dropdown CSS was removed.

Chromium: all six screens in both themes pass axe WCAG A/AA checks; widths 360, 390, 768, 1024, 1440 and 1920 have no page overflow or sidebar overlap. Mobile outside/Escape dismissal, navigation focus, collapse persistence, searchable history, account actions, graph selection/reset and CSV downloads pass. 25 frontend tests and 3 browser tests pass. Browser-discovered fixes: badge contrast on secondary surfaces and password field accessible naming. Snapshots disable active animations to capture stable final layout. Dashboard/graph screenshots were visually inspected for spacing and clipping.

Browser evidence uses an explicitly isolated mocked Auth service and exported actual product aggregates, with an offline test identity. It is not evidence of live Supabase login, email delivery or live end-to-end authorization. Backend isolation is separately tested against real disposable PostgreSQL. Screenshots contain no real account credentials. Before: `test-results/improvements/before/{1..6}.png`. After: `frontend/test-results/improvements/after/{dark,light}-{1..6}.png`, sidebar-collapsed, account-menu, run-selector, mobile-dashboard, mobile-report, sign-in and sign-up captures. These generated artifacts are ignored as requested.

## Analytics filters and report evidence
Rules now accept validated support/confidence/lift filters and metric-column sorting. Graph/recommendations/report support product search plus qualifying-direction confidence and lift filters. Reports use a paginated evidence table with full explanations, dates, dataset/run configuration and authorized complete CSV export. Advanced mining settings are grouped separately.

Confirmed regressions addressed: empty product search generated an untyped PostgreSQL empty array (reproduced failing before explicit text-array typing); CSV formula detection missed leading whitespace/newline prefixes. Targeted PostgreSQL tests cover empty searches, independent metric filters, missing reverse confidence, bounds and neutralized CSV cells. Tests use only an isolated schema.

Axe also caught the new sortable header buttons inheriting blue text on a secondary surface. They now use foreground text with the shared visible focus treatment. The existing palette is unchanged.

Analytics package verification: 27 backend tests, 25 frontend tests and all 3 Chromium workflows pass after metric-filter/report changes. Browser testing also verifies a confidence filter can empty and restore the graph. Before/after captures were refreshed for the final table layout. The provided database connection remains configured; password repetition does not supply Supabase's separate public API key. The verified project URL has been configured locally without exposing database secrets.

## Dependency security corrections
A real pip-audit scan reported 16 advisory entries (including duplicates) across Starlette 0.46.2 and test-only pytest 8.3.5. Upgraded compatible FastAPI/Starlette to 0.165.0/1.10.0 and pytest to 9.2.0; updated exact lock entries and the new annotated-doc dependency. Repeat pip-audit reports no known vulnerabilities. All 27 backend tests pass under the updated framework. Existing httpx TestClient support emits a deprecation warning; a second HTTP library was not introduced merely to silence it. Runtime pip check passes after refreshing editable project metadata.

## Public sign-in wording
Removed the requested developer-only “Account setup required” / configuration instructions from the public sign-in form. Missing configuration now produces a neutral temporary-unavailability message and prevents submission, rather than exposing deployment details or pretending account access works. A targeted DOM regression verifies the prohibited wording is absent and the form fails closed. Live enablement still needs the existing project's public publishable/anon key; a database password cannot replace it. Supabase integration discovery found an available but unconnected integration; connection is still owner-controlled.

## Query, pool and frontend performance
Dataset catalog lookup now uses one set-based statement with a correlated owner-specific latest-run expression (12→2 statements including transaction identity for 10 datasets). Status reads explicitly avoid itemsets JSON; only the itemsets endpoint loads it. Rule/pair searches execute in PostgreSQL with literal-safe parameters, and labels load only for returned products. A regression enforces the catalog query budget and protects status payloads from accidental itemset loading.

Migration 005 adds one partial owner/created/run-ID index for history and hourly rate queries. In a disposable 10,001-run fixture, history's read plan changed from sequential scan+sort to bitmap index/heap scan+sort; observed execution was 1.108→0.246 ms. Total run-index storage in the same fixture increased from 1,196,032 to 1,810,432 bytes, an explicit insert/storage tradeoff. Actual production has only 3 legacy NULL-owner runs: this is scale evidence, not a claim of a current production query bottleneck. Original live read plans were below 0.2 ms; network/round trips dominated their seconds-long API latency.

Seven repeated scoped-route samples under the same local PostgreSQL fixture are retained in before/after/scoped-queries-final.json. Medians (ms): catalog 37.39→24.61; summary 19.31→17.77; history 32.13→15.08; status 43.67→11.16; rules 69.61→29.40; report 42.80→20.82. Host scheduling varies substantially across repeats, so no percentage or production latency guarantee is claimed. These exclude Supabase Auth network verification. Raw initial Supabase API baselines are separately retained.

Pool remains bounded at 5 connections/zero overflow with 10-second acquisition/connect limits, 15-minute recycle, health checks, statement/lock limits and TCP keepalives. Migrations also have bounded connection/lock waits. No engine is created per request. Frontend filter/page updates are atomic, obsolete requests cancel, active polling pauses off monitoring screens and stops on terminal states, and private state/legacy run storage clears across account changes. Separate catalog/result loading state fixes stuck loading after rapid navigation. Hash navigation supports back/forward.

A configured-Auth build before lazy loading was 611.13 kB JS / 183.75 kB gzip. After splitting the private dashboard: initial JS 491.80 / 146.12 kB, dashboard chunk 121.32 / 38.53 kB. Total JS slightly increases; the private dashboard code is deferred until authenticated. The build warning is resolved without raising its threshold.

Additional client regressions now cover atomic page reset, pausing running-job polling, interrupted-request loading cleanup, and back/forward navigation. The viewport test helper now waits for the mobile navigation tree after resize, avoiding a test-only race between desktop and drawer controls; assertions remain unchanged. Latest component counts: 28 backend / 29 frontend. Browser repeat is required after the final client changes before this package is marked verified.

Final query/client package check: all 3 Chromium workflows pass (33.7 s), including the new back/forward and filtered-graph checks. The catalog/status regression suite, full 28-test backend suite, full 29-test frontend suite, configured production build and Ruff pass. Migration 005 is applied. No Supabase data records were deleted or reassigned.
