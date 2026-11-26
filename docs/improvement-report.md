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
