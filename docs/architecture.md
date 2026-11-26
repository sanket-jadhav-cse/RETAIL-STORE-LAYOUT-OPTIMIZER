# Architecture
The application is a modular monolith. Python performs every production metric calculation. The browser only formats evidence and draws the returned pairs.

## High-level design
```mermaid
flowchart LR
 U[Store planner / visual merchandiser] <--> F[React / Vite / Tailwind / Axios]
 F <-->|HTTPS REST| A[FastAPI single Uvicorn worker]
 A <--> D[(Supabase PostgreSQL: retail schema)]
 A --> S[Scheduler + PostgreSQL advisory lock]
 S --> P[Bounded spawned CPU process]
 P --> M[mlxtend FP-Growth]
 P <--> D
 B[(Persistent basket artifacts)] --> P
 I[Controlled import CLI] --> B
 I --> D
```

## Low-level design and data flow
```mermaid
flowchart TD
 X[UCI CSV / XLSX] --> V[Required-column validation]
 V --> C[Sequential exclusions and quality counts]
 C --> G[Invoice grouping / product deduplication]
 G --> B[Content-addressed JSON baskets without customer IDs]
 B --> E[Sparse Boolean encoding]
 E --> F[FP-Growth itemsets]
 F --> R[mlxtend association rules]
 R --> T[Confidence / lift qualification]
 T --> P[Canonical singleton pairs and deterministic rank]
 P --> W[Atomic result transaction]
 W --> API[Paginated API / CSV]
 API --> UI[Six dashboard screens]
```
Every eligible invoice contributes one denominator unit. Positive quantity signifies presence rather than a weight. Missing customer IDs do not exclude invoices. No random sampling or arbitrary product truncation occurs.

## Entity relationships
```mermaid
erDiagram
 DATASET ||--o{ PRODUCT : contains
 DATASET ||--o{ MINING_RUN : analyzed_by
 MINING_RUN ||--o{ ASSOCIATION_RULE : generates
 MINING_RUN ||--o{ ADJACENCY : generates
 PRODUCT ||--o{ ADJACENCY : endpoint
 DATASET {
 uuid dataset_id PK
 string checksum UK
 string source
 string version
 int basket_count
 jsonb summary
 timestamp imported_at
 }
 PRODUCT {
 uuid dataset_id PK,FK
 string product_code PK
 string description
 }
 MINING_RUN {
 uuid run_id PK
 uuid dataset_id FK
 float min_support
 float min_confidence
 float min_lift
 int max_itemset_size
 string status
 jsonb execution
 jsonb itemsets
 }
 ASSOCIATION_RULE {
 uuid rule_id PK
 uuid run_id FK
 jsonb antecedent
 jsonb consequent
 float support
 float confidence
 float lift
 }
 ADJACENCY {
 uuid adjacency_id PK
 uuid run_id FK
 uuid dataset_id FK
 string product_a FK
 string product_b FK
 float support
 float confidence_a_b
 float confidence_b_a
 float lift
 int rank
 string rationale
 }
```
Adjacency uses composite foreign keys to both product endpoints and the run's dataset. `product_a < product_b` and unique run/pair constraints prevent self-pairs and reverse duplicates. Timestamps are timezone-aware UTC. Results, metadata and status completion commit together. Itemsets are bounded to 100,000 records and stored as JSONB; raw source rows are not persisted.

## API and execution flow
POST `/api/v1/runs` validates the operator bearer token, dataset artifact and thresholds, takes a transaction advisory lock, checks active runs and commits Queued. The scheduler commits Running, spawns one child, and monitors a wall-clock limit. Child address-space limit defaults to 2 GiB. On success all results commit atomically with Completed; exceptions/timeouts become Failed with safe text. Reads return 409 until completed. Startup marks interrupted Queued/Running jobs Failed rather than claiming durable retry. A session advisory lock rejects a second application worker. Shutdown explicitly releases it before connection pooling.

Routes: health; datasets; dataset summary; create run; run status; rules; adjacencies; report; CSV export; paginated itemsets. Unknown UUIDs return 404, invalid input 422, unauthorized mining 401, busy/not-ready 409, database failures 503. Rule search matches names/codes; sort is allowlisted; page size is at most 100. Reports and graph consume the same persisted adjacency rows. CSV neutralizes formula prefixes.

## Responsibilities and boundaries
- `config.py`: environment settings, PostgreSQL engine/session; Supabase requires sslmode.
- `models.py`: integrity constraints and ORM only.
- `schemas.py`: request validation and response contracts.
- `mining/preprocessing.py`: deterministic cleaning, names and sparse presence matrix.
- `mining/pipeline.py`: FP-Growth, rule filtering and pair ranking, independent of HTTP/database.
- `worker.py`: single-process scheduling, restart recovery and atomic persistence.
- `main.py`: HTTP routing, auth, pagination, serialization and CORS.
- `scripts/`: owner-controlled acquisition, import, credentials, role setup and smoke verification.
- Frontend `api.js`: Axios configuration and CSV download; `App.jsx`: navigation/API state and polling; `Overview.jsx`: dashboard/quality; `Results.jsx`: dataset/mining/results screens; `Graph.jsx`: graph/evidence; `ui.jsx`: shared controls; `theme.js`: appearance; `Icon.jsx`: SVG icon set. See ui-refresh.md for theme/accessibility verification.

Private `retail` schema is outside default Supabase Data API schemas. Public and API roles get no grants; RLS policies grant the scoped runtime role. Do not add `retail` to exposed schemas. Runtime cannot create/drop tables or administer the database. Read endpoints expose product-level aggregates, never customer identifiers. Migration credentials are never needed by the web process on Render.
