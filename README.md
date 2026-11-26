# Retail Store Layout Optimizer (FP-Growth)
Sanket Jadhav 

Analyze invoice-level purchases and inspect explainable product-adjacency candidates. Six responsive screens cover data quality, mining, rules, an interactive conceptual graph and CSV evidence reports, with persistent light/dark themes and keyboard-accessible controls. Recommendations support merchandising judgment; no sales increase or optimal physical layout is claimed.

React/JavaScript/Vite/Tailwind/Axios frontend → FastAPI/Pydantic backend → Supabase PostgreSQL/SQLAlchemy/Alembic. pandas/NumPy/mlxtend perform CPU-based FP-Growth. A single bounded child process executes mining.

## Local setup (Linux / WSL)
Prerequisites: Python 3.12, Node 22.12+ (22 LTS recommended), npm, PostgreSQL credentials and internet for the UCI dataset. Native Windows is not supported by the Unix resource watchdog; use WSL.

From repository root:
```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock
.venv/bin/pip install --no-deps -e backend
cd frontend
npm ci
cd ..
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
Setup accepts the database password without echoing and URL-encodes special characters. It never overwrites an existing `.env`. **This workspace is already configured, migrated and imported**; the commands above describe a new installation. Do not recreate the existing role. See [deployment](docs/deployment.md) for role ownership and migration details. The original [UCI dataset](https://archive.ics.uci.edu/dataset/352/online+retail) is CC BY 4.0, Chen (2015); provenance and measured cleaning counts are in [data/README.md](data/README.md).

Start backend:
```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```
In another terminal:
```bash
cd frontend
cp .env.example .env.local
npm run dev
```
Open http://localhost:5173; API docs: http://localhost:8000/docs. The dashboard loads the latest persisted run automatically. Mining requires the `OPERATOR_TOKEN` from your local `backend/.env`; enter it in the password field. Never paste the database password into the browser. Keep all `.env` files private.

## Verification
```bash
cd backend
../.venv/bin/pytest -q
cd ../frontend
npm test
npm run build
npm audit
npx playwright install chromium
npx playwright test
```
PostgreSQL tests create a unique disposable `retail_test_*` schema using `MIGRATION_DATABASE_URL` (or DATABASE_URL for local CI), leaving application data intact. Browser verification requires both servers and the imported UCI dataset with a completed run. `backend/scripts/smoke.py` creates and verifies a new full-dataset run against localhost. Python's lock includes mlxtend's transitive scikit-learn/Matplotlib dependencies; no supervised training is performed.

## Deployment and evidence
Vercel: `frontend/` root, `npm ci`, `npm run build`, `dist/`; set `VITE_API_BASE_URL` to the HTTPS backend origin. Render: `backend/` root and single-worker Uvicorn; configure runtime database URL, operator token, exact frontend CORS origin and persistent basket storage. Supabase uses SSL and the isolated `retail` schema. See [deployment instructions](docs/deployment.md) before provisioning: measured full-data peak RSS was approximately 1.50 GiB, exceeding 512 MiB hosting. No paid plan has been selected and nothing is publicly deployed.

[Architecture](docs/architecture.md) · [wireframes](docs/wireframes.md) · [evaluation](docs/evaluation.md) · [final report](docs/final-report.md) · [demo](docs/demo.md) · [requirement traceability](PLAN.md)

The interface refresh and its verification are documented in [docs/ui-refresh.md](docs/ui-refresh.md).
