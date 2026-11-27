# Final implementation report

2026-11-27 · Retail Store Layout Optimizer (FP-Growth)

## Current outcome

The existing full-stack application has been improved without rebuilding it or changing its complete UCI dataset/FP-Growth semantics. All six screens, actual metadata, searchable private run history, GitHub Dark design system, responsive navigation, graph/report interactions, Supabase accounts, verified backend identity/ownership, additive migrations and resource/reconnect protections are implemented and locally verified.

The real account sign-in issue is resolved with public Supabase configuration kept only in ignored environment settings. Ordinary users use their own verified account credentials; database passwords and operator tokens are not login passwords. Root `.env` is the single active local settings source. The browser receives only an explicit public allowlist.

No public deployment or production readiness certification is claimed. See the [complete improvement report](improvement-report.md) for before/after screenshots, measurements, failure evidence, references, feature PRs and remaining owner actions.

## Data and mining correctness

Full original source: 541,909 rows; cleaned 526,054; eligible invoice baskets 20,728; products 3,829; transaction period 2010-12-01–2011-12-09. Baseline support .02, confidence .50, lift 1.0, maximum size 3 still produce **358 itemsets, 52 rules and 38 canonical adjacency recommendations**.

The complete sorted result digest is unchanged across the released mlxtend upgrade. Fresh child RSS decreased from 1,525.48–1,525.67 MiB to 306.55–306.75 MiB in three samples/version. Confirmed combined backend/child samples are documented separately; invalid exited-PID samples were excluded. Full worker persistence and independent support/lift recounts pass. Variable host contention prevents a controlled timing percentage claim.

Legacy records remain preserved and unassigned: three ownerless runs, their 156 rules and 114 adjacency rows. New authorized runs add records normally. No dataset reduction, threshold substitution, record deletion or Supabase reset occurred.

## Verification

| Area | Current evidence |
|---|---|
| Backend/PostgreSQL | 39 tests pass in a disposable database/schema; JWT, ownership, RLS, migrations, transaction identity, concurrency, watchdog and real disconnect recovery |
| Frontend | 35 tests pass across six files |
| Offline browser | Four workflows pass; six screens in both themes, requested widths, accessibility, overlays, graph/CSV, Auth forms/recovery and wheel/keyboard scrolling |
| Live browser | Three theme/responsive/zoom scenarios pass; full authenticated mining/six-screen/graph/CSV/session/logout workflow passes separately in 48.9 s |
| Rate limiting | HTTP 429 observed at six submissions/hour; successful workflow retry waited for the window, without weakening limits |
| Production build | Initial JS 492.70 kB / 146.47 gzip; lazy dashboard 121.59 / 38.54; CSS 41.47 / 8.92 |
| Dependencies | npm audit and pip-audit: no known advisories; pip check succeeds |
| Source checks | Root-scoped Python correctness/import lint and diff checks pass; no private env values in the browser bundle |
| Actual project | Restricted runtime database access, client TLS, migrations through 005, startup/health, account/catalog/history/result endpoints and full-data mining verified |
| Performance | Repeated memory, SQL/query-count, authenticated HTTP and controlled offline-browser evidence is tracked; mixed/no latency wins are reported honestly |

Commands and numeric samples are in [improvement-report.md](improvement-report.md) and [verification/measurements.json](verification/measurements.json). Historical [evaluation-results.json](evaluation-results.json) is preserved. The smoke script now writes ignored evidence and requires verified account access. Some early attempts failed or were interrupted; the report records them, rather than presenting every invocation as successful.

## Remaining external verification

- Owner confirmation of Supabase Site URL/redirect allowlist, a full live password-reset email/code round trip and a second live verified test account. Isolated two-identity API/RLS coverage is already passing.
- Owner-led rotation/revocation of credentials disclosed in chat; privileged Supabase keys and the chat PAT were not used.
- GitHub billing unblock and fresh remote CI/quality checks. The last inspected main verify check was billing-blocked; a neutral Sonar analysis is not a passing production certificate.
- Approved HTTPS hosting, persistent artifacts, email delivery, connection/capacity/load tests and store-planner validation.
- Explicit legacy owner identification before any reassignment. No owner was guessed.

Focused feature/fix PRs and one-line commits preserve review history. A final integration PR is needed against main because some owner-merged PRs targeted feature branches after those branches had already merged. The final reconciliation preserves main history and does not deploy or merge automatically.
