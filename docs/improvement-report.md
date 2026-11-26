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
