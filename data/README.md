# Dataset provenance and setup
Original source: [UCI Online Retail](https://archive.ics.uci.edu/dataset/352/online+retail). Chen, D. (2015), DOI [10.24432/C5BW33](https://doi.org/10.24432/C5BW33), CC BY 4.0. Retain this attribution when redistributing/adapting. Workbook covers 2010-12-01 through 2011-12-09 for a UK-based online retailer; it is evidence for product affinity, not an observed physical store.

Run from repository root:
```
.venv/bin/python backend/scripts/download_dataset.py
.venv/bin/python backend/scripts/import_dataset.py 'data/raw/Online Retail.xlsx'
```
The download uses the original UCI ZIP, requires no Kaggle account and extracts only the named workbook. CSV (UTF-8) and XLSX are supported. Required columns: InvoiceNo, StockCode, Description, Quantity. Column names ignore case/spaces/underscores. CustomerID, Country, UnitPrice and InvoiceDate are not required for Boolean invoice-level mining. File SHA-256 versions imports and basket artifact filenames. Exact duplicate imports reuse metadata. Product description is the most frequent nonempty description, with lexicographic ties.

Observed full source: 541,909 records. Excluded sequentially: missing invoice 0; missing product 0; cancellations 9,288; invalid/nonfinite/nonpositive quantities 1,336; exact duplicate source rows 5,231. Cleaned records: 526,054. Baskets: 20,728. Product codes: 3,829. A further 5,306 repeated invoice/product lines collapse to Boolean presence without discarding baskets. Returns never reduce positive purchases; they are excluded. No customer exclusion, country subset, price filter or arbitrary truncation. Administrative stock codes and zero-priced positive-quantity lines remain; review whether these are placeable products before merchandising action.

Raw files and processed basket artifacts are ignored by Git. No customer IDs are written into processed baskets or PostgreSQL. On Render, `DATA_DIR` must live on persistent storage; import on the backend host before enabling mining. Large source/processed files must not be committed. All synthetic test baskets live in test code and are never presented as real dataset results.
