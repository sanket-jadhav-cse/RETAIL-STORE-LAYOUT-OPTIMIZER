# Retail Store Layout Optimizer (FP-Growth)

Account-based retail analytics: inspect transaction quality, mine product associations, explore conceptual product adjacency, and export evidence reports. React/JavaScript/Vite/Tailwind, FastAPI, SQLAlchemy/Alembic, Supabase Auth/PostgreSQL, and mlxtend FP-Growth. Recommendations support merchandising review; the graph is not a measured physical floor plan.

## Run locally

Requires Python 3.12, Node 22.12+, PostgreSQL and Linux/WSL. This workspace already has its real dataset and database migrations; do not reset or reimport them unnecessarily.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
.venv/bin/pip install --no-deps -e backend
npm --prefix frontend ci
# NEW installation only: copy .env.example to ROOT .env and fill it privately.
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

In another terminal, run `npm --prefix frontend run dev` and open **http://localhost:5173**. Sign up, verify your email, then sign in. Use Forgot password for recovery; there is no shared application password.

**One local settings file: root `.env`.** Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `API_BASE_URL` and `CORS_ALLOWED_ORIGINS`; see the [placeholder example](.env.example). The browser receives only public configuration. Keep owner migration credentials local. After editing settings, restart the backend and frontend. Old backend/frontend env files are no longer used. New database/role/import setup and Supabase email redirect configuration are in the [deployment runbook](docs/deployment.md).

The verified [UCI Online Retail Dataset](https://archive.ics.uci.edu/dataset/352/online+retail) spans 2010-12-01–2011-12-09: 541,909 source rows, 526,054 cleaned rows, 20,728 baskets and 3,829 products. Support 0.02, confidence 0.50, lift 1.0 and size 3 reproduce **358 itemsets / 52 rules / 38 recommendations**. Counts shown in the app come from persisted metadata/results. [Provenance](data/README.md).

## Screens and features

Screenshots use actual exported UCI aggregates with an isolated test identity, so account details and credentials remain private. Open an image for full-size detail. Live Supabase verification and limitations are recorded separately in the [improvement report](docs/improvement-report.md).

<details>
<summary>Overview — dataset availability, actual metrics and recent mining history</summary>

Select a dataset, inspect its quality and open a previous analysis. Run controls appear on the analysis pages where needed.

![Overview with actual UCI metrics](docs/images/after/overview.png)

</details>

<details>
<summary>Datasets — searchable catalog, dates, source and preprocessing evidence</summary>

Dataset names and counts come from PostgreSQL; unrelated imports retain their own provenance.

![Dataset catalog and preprocessing](docs/images/after/datasets.png)

</details>

<details>
<summary>Mining — named runs, validated thresholds and advanced settings</summary>

Use every eligible basket, follow actual execution status and prevent duplicate submissions.

![Mining configuration](docs/images/after/mining.png)

</details>

<details>
<summary>Association Rules — product search, sorting, metric filters and pagination</summary>

Compare directional confidence alongside support and lift. Tables support page scrolling, horizontal scrolling and keyboard access.

![Searchable association rules](docs/images/after/association-rules.png)

</details>

<details>
<summary>Product Layout — conceptual adjacency, zoom, pan and selected relationship details</summary>

Search and filter relationships, inspect product names and metric explanations, then reset the graph view.

![Product adjacency graph](docs/images/after/product-layout.png)
![Selected graph relationship](docs/images/after/graph-detail.png)

</details>

<details>
<summary>Reports — configuration, recommendation evidence and complete CSV export</summary>

Review the selected dataset/run and search paginated recommendations. CSV exports contain all authorized recommendations.

![Recommendation evidence report](docs/images/after/reports.png)

</details>

<details>
<summary>Accounts — sign-in, signup, email verification and password recovery</summary>

Supabase manages credentials and sessions. Expired links have clear guidance and a resend action.

![Sign in](docs/images/after/sign-in.png)
![Create account](docs/images/after/sign-up.png)
![Email verification](docs/images/after/email-verification.png)
![Resend verification](docs/images/after/resend-verification.png)
![Forgot password](docs/images/after/forgot-password.png)
![Reset password](docs/images/after/reset-password.png)

</details>

<details>
<summary>Account menu and profile — real identity, preferences and sign-out</summary>

View verification status, update your display name and request a password reset. Private results clear when accounts change.

![Account menu](docs/images/after/account-menu.png)
![Account profile](docs/images/after/account-profile.png)

</details>

<details>
<summary>Previous runs — searchable, scrollable history without pasting UUIDs</summary>

Filter authorized history by name, dataset, status or date; select using mouse or keyboard. Escape/outside interaction dismisses the menu.

![Previous run selector](docs/images/after/run-selector.png)

</details>

<details>
<summary>Responsive navigation and themes — compact sidebar and mobile reports</summary>

The sidebar remembers its browser preference. Mobile navigation uses an accessible drawer. GitHub Dark is the default; an optional light theme remains available.

![Collapsed sidebar](docs/images/after/sidebar-collapsed.png)
![Mobile dashboard](docs/images/after/mobile-dashboard.png)
![Mobile report](docs/images/after/mobile-report.png)
![Optional light theme](docs/images/after/light-theme.png)

</details>

## Verification

```bash
cd backend
../.venv/bin/pytest -q  # Use a DISPOSABLE PostgreSQL database for both DB URL variables.
cd ../frontend
npm test
npm run build
npm audit --audit-level=moderate
npx playwright install chromium
```

Live browser checks require both servers, a verified authorized test account supplied through `E2E_EMAIL` / `E2E_PASSWORD`, the full UCI dataset and an existing completed baseline run: `cd frontend && npx playwright test`. The workflow creates one private run and respects the six-per-hour limit. Never run destructive tests on application data. For deterministic offline browser checks, first run `.venv/bin/python backend/scripts/browser_fixture.py`, then `cd frontend && npx playwright test --config playwright.platform.config.js`.

[Current evidence and remaining owner actions](docs/improvement-report.md) · [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Final report](docs/final-report.md). No public deployment or production readiness certification is claimed.
